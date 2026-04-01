import { parseGlb, readAccessor, readImageBlobUrl } from './GlbParser'
import type {
  MessageIndex,
  MetadataResult,
  FrameData,
  EgoPose,
  MapPolygon,
  CameraInfo,
  EgoFutureTrajectory,
  ObjectFutureTrajectories,
} from './types'
import { CAMERA_CHANNELS } from '../utils/constants'

const MAX_LIDAR_POINTS = 20000

/** Down-sample flat XYZ Float32Array + paired intensity to at most maxPts points. */
function downsampleLidar(
  positions: Float32Array<ArrayBufferLike>,
  intensity: Float32Array<ArrayBufferLike>,
  maxPts: number,
): { positions: Float32Array<ArrayBuffer>; intensity: Float32Array<ArrayBuffer> } {
  const totalPoints = positions.length / 3
  if (totalPoints <= maxPts) {
    return { positions: positions.slice(), intensity: intensity.slice() }
  }
  const step = Math.ceil(totalPoints / maxPts)
  const outCount = Math.floor(totalPoints / step)
  const outPos = new Float32Array(outCount * 3)
  const outInt = new Float32Array(outCount)
  for (let i = 0; i < outCount; i++) {
    const src = i * step
    outPos[i * 3] = positions[src * 3]
    outPos[i * 3 + 1] = positions[src * 3 + 1]
    outPos[i * 3 + 2] = positions[src * 3 + 2]
    outInt[i] = intensity[src]
  }
  return { positions: outPos, intensity: outInt }
}

export class SceneDataManager {
  private baseUrl: string
  private messageIndex: MessageIndex | null = null
  private metadata: MetadataResult | null = null
  private frameCache = new Map<number, FrameData>()

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  async init(): Promise<MetadataResult> {
    // 1. Fetch message_index.json
    const idxRes = await fetch(this.baseUrl + 'message_index.json')
    if (!idxRes.ok) throw new Error(`Failed to fetch message_index.json: ${idxRes.status}`)
    this.messageIndex = (await idxRes.json()) as MessageIndex

    // 2. Fetch and parse metadata.glb
    const metaRes = await fetch(this.baseUrl + 'metadata.glb')
    if (!metaRes.ok) throw new Error(`Failed to fetch metadata.glb: ${metaRes.status}`)
    const metaBuf = await metaRes.arrayBuffer()
    const { json, bin } = parseGlb(metaBuf)

     
    const nuvizData = json.nuviz.data as {
      cameras: Record<string, CameraInfo>
      map: { layers: Record<string, { vertices: string; counts: string }> }
      extensions: {
        nuscenes: {
          scene: {
            scene_token: string
            name: string
            description: string
            location: string
          }
          mapping: { classes: { nameToId: Record<string, number> } }
        }
      }
    }

    // ── Cameras ──────────────────────────────────────────────────────────
    const cameras = nuvizData.cameras

    // ── Map layers ───────────────────────────────────────────────────────
    const mapLayers: Record<string, MapPolygon> = {}
    const rawLayers = nuvizData.map?.layers ?? {}
    for (const [layerName, layerRefs] of Object.entries(rawLayers)) {
      const vertices = readAccessor(json, bin, layerRefs.vertices) as Float32Array
      const counts = readAccessor(json, bin, layerRefs.counts) as Uint32Array
      mapLayers[layerName] = { vertices: vertices.slice(), counts: counts.slice() }
    }

    // ── Category map ─────────────────────────────────────────────────────
    const categoryMap = nuvizData.extensions?.nuscenes?.mapping?.classes?.nameToId ?? {}

    // ── Scene info ───────────────────────────────────────────────────────
    const sceneRaw = nuvizData.extensions?.nuscenes?.scene
    const sceneInfo = {
      scene_token: sceneRaw?.scene_token ?? '',
      name: sceneRaw?.name ?? '',
      description: sceneRaw?.description ?? '',
      location: sceneRaw?.location ?? '',
    }

    this.metadata = {
      cameras,
      mapLayers,
      categoryMap,
      sceneInfo,
      totalFrames: this.messageIndex.messages.length,
      logInfo: this.messageIndex.log_info,
    }

    return this.metadata
  }

  /**
   * Returns the cached ego-pose translation for a frame index, or null if not loaded.
   * Used by EgoTrajectory to build the growing trajectory line without re-fetching.
   */
  getCachedTranslation(frameIndex: number): [number, number, number] | null {
    const frame = this.frameCache.get(frameIndex)
    if (!frame) return null
    return frame.egoPose.translation
  }

  get metadataResult(): MetadataResult | null {
    return this.metadata
  }

  get index(): MessageIndex | null {
    return this.messageIndex
  }

  // ── Frame loading ──────────────────────────────────────────────────────────

  async loadFrame(frameIndex: number): Promise<FrameData> {
    const cached = this.frameCache.get(frameIndex)
    if (cached) return cached

    if (!this.messageIndex) throw new Error('SceneDataManager not initialised')

    const entry = this.messageIndex.messages[frameIndex]
    if (!entry) throw new Error(`Frame ${frameIndex} not found in message index`)

    const res = await fetch(this.baseUrl + entry.file)
    if (!res.ok) throw new Error(`Failed to fetch frame ${frameIndex}: ${res.status}`)
    const buf = await res.arrayBuffer()
    const { json, bin } = parseGlb(buf)

     
    const update = json.nuviz.data.updates[0] as {
      timestamp: number
      poses: { '/ego_pose': EgoPose }
      primitives: Record<
        string,
        {
          points?: Array<{
            points: string
            extensions: { nuscenes: { INTENSITY: string } }
          }>
          cuboids?: Array<{
            count: number
            CENTER: string
            SIZE: string
            ROTATION: string
            CLASS_ID: string
            TRACK_ID: string
          }>
          images?: Array<{ data: string }>
        }
      >
    }

    // ── Ego pose ─────────────────────────────────────────────────────────
    const egoPose = update.poses['/ego_pose']

    // ── LiDAR ────────────────────────────────────────────────────────────
    const lidarPrim = update.primitives['/lidar']
    const pointPrim = lidarPrim?.points?.[0]
    let lidar = { positions: new Float32Array(0), intensity: new Float32Array(0) }
    if (pointPrim) {
      const rawPositions = readAccessor(json, bin, pointPrim.points) as Float32Array
      const rawIntensity = readAccessor(
        json,
        bin,
        pointPrim.extensions.nuscenes.INTENSITY,
      ) as Float32Array
      lidar = downsampleLidar(rawPositions, rawIntensity, MAX_LIDAR_POINTS)
    }

    // ── Objects ───────────────────────────────────────────────────────────
    const boundsPrim = update.primitives['/objects/bounds']
    const cuboid = boundsPrim?.cuboids?.[0]
    let objects = {
      centers: new Float32Array(0),
      sizes: new Float32Array(0),
      rotations: new Float32Array(0),
      classIds: new Uint32Array(0),
      trackIds: new Uint32Array(0),
      count: 0,
    }
    if (cuboid) {
      objects = {
        centers: (readAccessor(json, bin, cuboid.CENTER) as Float32Array).slice(),
        sizes: (readAccessor(json, bin, cuboid.SIZE) as Float32Array).slice(),
        rotations: (readAccessor(json, bin, cuboid.ROTATION) as Float32Array).slice(),
        classIds: (readAccessor(json, bin, cuboid.CLASS_ID) as Uint32Array).slice(),
        trackIds: (readAccessor(json, bin, cuboid.TRACK_ID) as Uint32Array).slice(),
        count: cuboid.count,
      }
    }

    // ── Camera images ─────────────────────────────────────────────────────
    const cameraImages: Record<string, string> = {}
    for (const channel of CAMERA_CHANNELS) {
      const camPrim = update.primitives[`/camera/${channel}`]
      const imgRef = camPrim?.images?.[0]?.data
      if (imgRef) {
        cameraImages[channel] = readImageBlobUrl(json, bin, imgRef)
      }
    }

    // ── Ego future trajectory ─────────────────────────────────────────────
    const egoFutPrim = update.primitives['/ego/fut_trajectory'] as
      | { trajectory?: Array<{ poses: string; count: number }> }
      | undefined
    const egoFutEntry = egoFutPrim?.trajectory?.[0]
    let egoFutureTrajectory: EgoFutureTrajectory | null = null
    if (egoFutEntry) {
      egoFutureTrajectory = {
        poses: (readAccessor(json, bin, egoFutEntry.poses) as Float32Array).slice(),
        count: egoFutEntry.count,
      }
    }

    // ── Object future trajectories (CSR) ──────────────────────────────────
    const objFutPrim = update.primitives['/objects/fut_trajectories'] as
      | { trajectories?: Array<{ points: string; offsets: string; obj_count: number }> }
      | undefined
    const objFutEntry = objFutPrim?.trajectories?.[0]
    let objectFutureTrajectories: ObjectFutureTrajectories | null = null
    if (objFutEntry) {
      objectFutureTrajectories = {
        points:   (readAccessor(json, bin, objFutEntry.points)  as Float32Array).slice(),
        offsets:  (readAccessor(json, bin, objFutEntry.offsets) as Uint32Array).slice(),
        objCount: objFutEntry.obj_count,
      }
    }

    const frameData: FrameData = {
      timestamp: update.timestamp,
      egoPose,
      lidar,
      objects,
      cameraImages,
      egoFutureTrajectory,
      objectFutureTrajectories,
    }

    this.frameCache.set(frameIndex, frameData)
    return frameData
  }

  // ── Prefetch ───────────────────────────────────────────────────────────────

  prefetch(centerIndex: number, windowSize = 5): void {
    if (!this.messageIndex) return
    const total = this.messageIndex.messages.length
    const start = centerIndex
    const end = Math.min(centerIndex + windowSize, total - 1)

    // Release frames outside the window
    for (const [idx, frame] of this.frameCache.entries()) {
      if (idx < centerIndex - 2 || idx > end) {
        for (const url of Object.values(frame.cameraImages)) {
          URL.revokeObjectURL(url)
        }
        this.frameCache.delete(idx)
      }
    }

    // Trigger loads for frames not yet cached
    for (let i = start; i <= end; i++) {
      if (!this.frameCache.has(i)) {
        void this.loadFrame(i)
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy(): void {
    for (const frame of this.frameCache.values()) {
      for (const url of Object.values(frame.cameraImages)) {
        URL.revokeObjectURL(url)
      }
    }
    this.frameCache.clear()
  }
}
