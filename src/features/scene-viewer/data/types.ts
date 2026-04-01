// ─── Message Index ───────────────────────────────────────────────────────────

export interface MessageEntry {
  index: number
  timestamp: number
  file: string
}

export interface MessageIndex {
  message_format: string
  metadata: string
  log_info: {
    start_time: number
    end_time: number
  }
  messages: MessageEntry[]
  extensions: {
    nuscenes: {
      scene_token: string
      scene_name: string
      mapId: string
    }
  }
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export interface CameraExtrinsic {
  translation: [number, number, number]
  rotation: [number, number, number, number] // wxyz
}

export interface CameraInfo {
  image_width: number
  image_height: number
  intrinsic: [[number, number, number], [number, number, number], [number, number, number]]
  extrinsic: CameraExtrinsic
}

// ─── Map ─────────────────────────────────────────────────────────────────────

/** A single map layer: flat vertex array (x,y,0 per point) + per-polygon counts */
export interface MapPolygon {
  // Use ArrayBufferLike so typed arrays sliced from a DataView.buffer are accepted
  vertices: Float32Array<ArrayBufferLike>
  counts: Uint32Array<ArrayBufferLike>
}

export interface MapLayerStyle {
  fill: string
  stroke: string
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export interface SceneInfo {
  scene_token: string
  name: string
  description: string
  location: string
}

export interface MetadataResult {
  cameras: Record<string, CameraInfo>
  mapLayers: Record<string, MapPolygon>
  categoryMap: Record<string, number>
  sceneInfo: SceneInfo
  totalFrames: number
  logInfo: {
    start_time: number
    end_time: number
  }
}

// ─── Frame ───────────────────────────────────────────────────────────────────

export interface EgoPose {
  translation: [number, number, number]
  rotation: [number, number, number, number] // wxyz
}

export interface LidarData {
  positions: Float32Array<ArrayBufferLike>
  intensity: Float32Array<ArrayBufferLike>
}

export interface ObjectsData {
  centers: Float32Array<ArrayBufferLike>
  sizes: Float32Array<ArrayBufferLike>
  rotations: Float32Array<ArrayBufferLike>
  classIds: Uint32Array<ArrayBufferLike>
  trackIds: Uint32Array<ArrayBufferLike>
  count: number
}

// ─── Future Trajectories ─────────────────────────────────────────────────────

/** Self-vehicle future trajectory from /ego/fut_trajectory stream. */
export interface EgoFutureTrajectory {
  /** Flat Float32Array of (M×3) world-frame positions [x,y,z] for future frames. */
  poses: Float32Array<ArrayBufferLike>
  /** Number of trajectory points (= M). */
  count: number
}

/** Per-object future trajectories from /objects/fut_trajectories stream (CSR format). */
export interface ObjectFutureTrajectories {
  /** Flat Float32Array of (T×3) world-frame positions, all objects concatenated. */
  points: Float32Array<ArrayBufferLike>
  /**
   * CSR offset array of length (M+1).
   * Object i's points are points[offsets[i]*3 .. offsets[i+1]*3].
   */
  offsets: Uint32Array<ArrayBufferLike>
  /** Number of objects in this frame (= M). Matches /objects/bounds count. */
  objCount: number
}

export interface FrameData {
  timestamp: number
  egoPose: EgoPose
  lidar: LidarData
  objects: ObjectsData
  cameraImages: Record<string, string>
  /** Future ego trajectory; null when the stream is absent in the GLB. */
  egoFutureTrajectory: EgoFutureTrajectory | null
  /** Future object trajectories in CSR format; null when the stream is absent. */
  objectFutureTrajectories: ObjectFutureTrajectories | null
}
