import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'
import { getDataLayerConfig } from '@/features/scene-viewer/config/visualConfig'
import {
  isStationaryByPointDisplacement,
  resolveFuturePointCount,
} from '@/features/scene-viewer/utils/trajectoryRendering'
import { createRenderUpdateGate } from '@/features/scene-viewer/utils/renderUpdateGate'

const FUTURE_FILL_COLOR = '#60a5fa'
const EGO_FUTURE_WIDTH_M = 2.0
const OCCUPANCY_THICKNESS_M = 0.08
const MAX_SEGMENTS = 128
const MAX_JOINTS = MAX_SEGMENTS + 1

const _mid = new THREE.Vector3()
const _jointPos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _identityQuat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _jointScale = new THREE.Vector3()
const _mat = new THREE.Matrix4()
const _axisZ = new THREE.Vector3(0, 0, 1)

/**
 * Render ego future trajectory as occupancy-width strips with rounded joints.
 *
 * Rounded joints fill gaps on large turns so strips remain visually continuous.
 */
export function EgoFutureTrajectory() {
  const segmentMeshRef = useRef<THREE.InstancedMesh>(null)
  const jointMeshRef = useRef<THREE.InstancedMesh>(null)
  const updateGateRef = useRef(createRenderUpdateGate())
  const segmentGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const jointGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 8, 8), [])

  useFrame(() => {
    const state = useSceneStore.getState()
    const frameData = state.currentFrameData
    const metadata = state.metadata
    const visible = state.visibleLayers.ego_future_trajectory ?? true
    const futureSeconds = state.futureTrajectorySeconds

    const segmentMesh = segmentMeshRef.current
    const jointMesh = jointMeshRef.current
    if (!segmentMesh || !jointMesh) return

    segmentMesh.visible = visible
    jointMesh.visible = visible

    const shouldUpdate = updateGateRef.current.shouldUpdate({
      currentFrameData: frameData,
      layerVisible: visible,
      futureTrajectorySeconds: futureSeconds,
      cameraMode: state.cameraMode,
    })

    if (!shouldUpdate) return

    if (!visible || !frameData?.egoFutureTrajectory) {
      segmentMesh.count = 0
      jointMesh.count = 0
      return
    }

    const { poses, count } = frameData.egoFutureTrajectory
    const pointCount = resolveFuturePointCount(count, futureSeconds, metadata)

    if (pointCount < 2 || isStationaryByPointDisplacement(poses, 0, pointCount - 1)) {
      segmentMesh.count = 0
      jointMesh.count = 0
      return
    }

    let segmentWrite = 0
    let jointWrite = 0

    for (let i = 0; i < pointCount; i++) {
      if (jointWrite >= MAX_JOINTS) break

      const p = i * 3
      const px = poses[p]
      const py = poses[p + 1]
      const pz = poses[p + 2]

      _jointPos.set(px, py, pz)
      _jointScale.set(EGO_FUTURE_WIDTH_M, EGO_FUTURE_WIDTH_M, OCCUPANCY_THICKNESS_M)
      _mat.compose(_jointPos, _identityQuat, _jointScale)
      jointMesh.setMatrixAt(jointWrite, _mat)
      jointWrite++
    }

    for (let i = 0; i < pointCount - 1; i++) {
      if (segmentWrite >= MAX_SEGMENTS) break

      const a = i * 3
      const b = (i + 1) * 3

      const ax = poses[a]
      const ay = poses[a + 1]
      const az = poses[a + 2]
      const bx = poses[b]
      const by = poses[b + 1]
      const bz = poses[b + 2]

      const dx = bx - ax
      const dy = by - ay
      const segmentLength = Math.hypot(dx, dy)
      if (segmentLength < 1e-3) continue

      _mid.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5)
      _quat.setFromAxisAngle(_axisZ, Math.atan2(dy, dx))
      _scale.set(segmentLength, EGO_FUTURE_WIDTH_M, OCCUPANCY_THICKNESS_M)
      _mat.compose(_mid, _quat, _scale)
      segmentMesh.setMatrixAt(segmentWrite, _mat)

      segmentWrite++
    }

    segmentMesh.count = segmentWrite
    jointMesh.count = jointWrite
    segmentMesh.instanceMatrix.needsUpdate = true
    jointMesh.instanceMatrix.needsUpdate = true
  })

  const trajectoryOpacity = getDataLayerConfig('ego_future_trajectory')?.opacity ?? 1

  return (
    <group>
      <instancedMesh ref={segmentMeshRef} args={[segmentGeometry, undefined, MAX_SEGMENTS]}>
        <meshBasicMaterial color={FUTURE_FILL_COLOR} transparent opacity={trajectoryOpacity} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={jointMeshRef} args={[jointGeometry, undefined, MAX_JOINTS]}>
        <meshBasicMaterial color={FUTURE_FILL_COLOR} transparent opacity={trajectoryOpacity} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
