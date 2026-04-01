import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'
import { getDataLayerConfig } from '@/features/scene-viewer/config/visualConfig'
import { useSceneContext } from '../../context/SceneContext'
import {
  appendThickPolyline,
  createTrajectoryMeshBuffers,
  resetTrajectoryMeshBuffers,
} from '@/features/scene-viewer/utils/trajectoryMesh'
import { createRenderUpdateGate } from '@/features/scene-viewer/utils/renderUpdateGate'

const MAX_FRAMES = 512
const EGO_HALF_WIDTH_M = 0.38
const EGO_Z_LIFT_M = 0.04

const egoPointsBuffer = new Float32Array(MAX_FRAMES * 3)
const egoMeshBuffers = createTrajectoryMeshBuffers(4096, 16384)
const egoColor = new THREE.Color('#FF6B35')

export function EgoTrajectory() {
  const { dataManager } = useSceneContext()
  const meshGeoRef = useRef<THREE.BufferGeometry>(null)
  const attrInitialised = useRef(false)
  const updateGateRef = useRef(createRenderUpdateGate())

  useFrame(() => {
    const store = useSceneStore.getState()
    const frameData = store.currentFrameData
    const frameIndex = store.currentFrameIndex
    const visible = store.visibleLayers.ego_future_trajectory ?? true

    const geo = meshGeoRef.current
    if (!geo) return

    const shouldUpdate = updateGateRef.current.shouldUpdate({
      currentFrameData: frameData,
      layerVisible: visible,
      futureTrajectorySeconds: store.futureTrajectorySeconds,
      cameraMode: store.cameraMode,
      extraKey: frameIndex,
    })

    if (!shouldUpdate) return

    if (!attrInitialised.current) {
      const posAttr = new THREE.BufferAttribute(egoMeshBuffers.positions, 3)
      posAttr.setUsage(THREE.DynamicDrawUsage)

      const colorAttr = new THREE.BufferAttribute(egoMeshBuffers.colors, 3)
      colorAttr.setUsage(THREE.DynamicDrawUsage)

      const indexAttr = new THREE.Uint32BufferAttribute(egoMeshBuffers.indices, 1)
      indexAttr.setUsage(THREE.DynamicDrawUsage)

      geo.setAttribute('position', posAttr)
      geo.setAttribute('color', colorAttr)
      geo.setIndex(indexAttr)
      geo.setDrawRange(0, 0)
      attrInitialised.current = true
    }

    if (!visible || !frameData) {
      resetTrajectoryMeshBuffers(egoMeshBuffers)
      geo.setDrawRange(0, 0)
      return
    }

    let pointCount = 0
    for (let i = 0; i <= frameIndex && i < MAX_FRAMES; i++) {
      const t = dataManager.getCachedTranslation(i)
      if (!t) break

      egoPointsBuffer[pointCount * 3] = t[0]
      egoPointsBuffer[pointCount * 3 + 1] = t[1]
      egoPointsBuffer[pointCount * 3 + 2] = t[2]
      pointCount++
    }

    resetTrajectoryMeshBuffers(egoMeshBuffers)

    if (pointCount >= 2) {
      appendThickPolyline({
        points: egoPointsBuffer,
        startPointIndex: 0,
        pointCount,
        halfWidth: EGO_HALF_WIDTH_M,
        zOffset: EGO_Z_LIFT_M,
        color: egoColor,
        buffers: egoMeshBuffers,
      })
    }

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute
    const indexAttr = geo.getIndex()

    posAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    if (indexAttr) indexAttr.needsUpdate = true

    geo.setDrawRange(0, egoMeshBuffers.indexCount)
    if (egoMeshBuffers.vertexCount > 0) geo.computeBoundingSphere()
  })

  const layerConfig = getDataLayerConfig('ego_future_trajectory')
  const trajectoryOpacity = layerConfig?.opacity ?? 1
  const trajectoryColor = layerConfig?.color ?? '#FF6B35'

  egoColor.set(trajectoryColor)

  return (
    <mesh>
      <bufferGeometry ref={meshGeoRef} />
      <meshBasicMaterial vertexColors transparent opacity={trajectoryOpacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
