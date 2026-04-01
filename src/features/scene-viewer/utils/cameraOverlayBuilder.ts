import * as THREE from 'three'
import { CAMERA_CHANNELS } from '@/features/scene-viewer/utils/constants'
import {
  buildWorldToCameraMatrix,
  getBoxCornersInto,
  projectWorldToImageWithMatrix,
} from '@/features/scene-viewer/utils/cameraProjection'
import type { CameraInfo, FrameData } from '@/features/scene-viewer/data/types'
import type { ChannelProjectedBoxes, ProjectedBox3DWireframe } from '@/features/scene-viewer/types/cameraOverlay'

const EMPTY_CHANNEL_BOXES: ChannelProjectedBoxes = Object.fromEntries(
  CAMERA_CHANNELS.map((channel) => [channel, [] as ProjectedBox3DWireframe[]]),
) as ChannelProjectedBoxes

const _centerVec = new THREE.Vector3()
const _boxCorners = Array.from({ length: 8 }, () => new THREE.Vector3())
const _cameraMatrices = new Map<string, THREE.Matrix4>()
const _cornerProjectionBuffer: Array<ReturnType<typeof projectWorldToImageWithMatrix>> = new Array(8).fill(null)

export function buildCameraProjectedBoxes(
  frameData: FrameData,
  cameras: Record<string, CameraInfo>,
): ChannelProjectedBoxes {
  const channelBoxes: ChannelProjectedBoxes = Object.fromEntries(
    CAMERA_CHANNELS.map((channel) => [channel, [] as ProjectedBox3DWireframe[]]),
  ) as ChannelProjectedBoxes

  _cameraMatrices.clear()

  for (const channel of CAMERA_CHANNELS) {
    const camInfo = cameras[channel]
    if (!camInfo) continue
    _cameraMatrices.set(channel, buildWorldToCameraMatrix(frameData.egoPose, camInfo))
  }

  const { centers, sizes, rotations, classIds, trackIds, count } = frameData.objects

  for (let i = 0; i < count; i++) {
    const center: [number, number, number] = [
      centers[i * 3],
      centers[i * 3 + 1],
      centers[i * 3 + 2],
    ]
    const size: [number, number, number] = [
      sizes[i * 3],
      sizes[i * 3 + 1],
      sizes[i * 3 + 2],
    ]
    const rotation: [number, number, number, number] = [
      rotations[i * 4],
      rotations[i * 4 + 1],
      rotations[i * 4 + 2],
      rotations[i * 4 + 3],
    ]

    _centerVec.set(center[0], center[1], center[2])
    getBoxCornersInto(center, size, rotation, _boxCorners)

    for (const channel of CAMERA_CHANNELS) {
      const camInfo = cameras[channel]
      if (!camInfo) continue

      const worldToCamera = _cameraMatrices.get(channel)
      if (!worldToCamera) continue

      const centerProjected = projectWorldToImageWithMatrix(_centerVec, worldToCamera, camInfo)
      if (!centerProjected) continue

      let hasVisibleCorner = false
      for (let cornerIdx = 0; cornerIdx < 8; cornerIdx++) {
        const projectedCorner = projectWorldToImageWithMatrix(
          _boxCorners[cornerIdx],
          worldToCamera,
          camInfo,
        )
        _cornerProjectionBuffer[cornerIdx] = projectedCorner
        if (projectedCorner) hasVisibleCorner = true
      }

      if (!hasVisibleCorner) continue

      channelBoxes[channel].push({
        trackId: trackIds[i],
        classId: classIds[i],
        depth: centerProjected.depth,
        points: [..._cornerProjectionBuffer],
      })
    }
  }

  return channelBoxes
}

export function emptyChannelProjectedBoxes(): ChannelProjectedBoxes {
  return EMPTY_CHANNEL_BOXES
}
