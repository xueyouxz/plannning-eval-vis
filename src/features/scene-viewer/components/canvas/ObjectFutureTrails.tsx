import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'
import { getDataLayerConfig, getObjectClassVisual } from '@/features/scene-viewer/config/visualConfig'
import {
  hasFiniteTrajectoryPoints,
  isStationaryByPointDisplacement,
  resolveFuturePointCount,
} from '@/features/scene-viewer/utils/trajectoryRendering'
import {
  appendThickPolyline,
  createTrajectoryMeshBuffers,
  resetTrajectoryMeshBuffers,
} from '@/features/scene-viewer/utils/trajectoryMesh'
import { createRenderUpdateGate } from '@/features/scene-viewer/utils/renderUpdateGate'

const MAX_TRAJECTORY_VERTICES = 131072
const MAX_TRAJECTORY_INDICES = 786432
const DEFAULT_OBJECT_WIDTH_M = 1.8
const DEFAULT_OBJECT_HEIGHT_M = 1.6
const MIN_OBJECT_WIDTH_M = 0.5
const OBJECT_Z_LIFT_M = 0.04

const trailMeshBuffers = createTrajectoryMeshBuffers(MAX_TRAJECTORY_VERTICES, MAX_TRAJECTORY_INDICES)
const objectTrailColor = new THREE.Color()

/**
 * Render object future trajectories as one batched thick-polyline mesh.
 * Geometry: miter-joined ribbon with round caps. No segment/joint patching.
 */
export function ObjectFutureTrails() {
  const trailGeoRef = useRef<THREE.BufferGeometry>(null)
  const attrInitialised = useRef(false)
  const updateGateRef = useRef(createRenderUpdateGate())

  useFrame(() => {
    const state = useSceneStore.getState()
    const frameData = state.currentFrameData
    const metadata = state.metadata
    const visible = state.visibleLayers.object_future_trails ?? true
    const futureSeconds = state.futureTrajectorySeconds

    const geo = trailGeoRef.current
    if (!geo) return

    const shouldUpdate = updateGateRef.current.shouldUpdate({
      currentFrameData: frameData,
      layerVisible: visible,
      futureTrajectorySeconds: futureSeconds,
      cameraMode: state.cameraMode,
    })

    if (!shouldUpdate) return

    if (!attrInitialised.current) {
      const posAttr = new THREE.BufferAttribute(trailMeshBuffers.positions, 3)
      posAttr.setUsage(THREE.DynamicDrawUsage)

      const colorAttr = new THREE.BufferAttribute(trailMeshBuffers.colors, 3)
      colorAttr.setUsage(THREE.DynamicDrawUsage)

      const indexAttr = new THREE.Uint32BufferAttribute(trailMeshBuffers.indices, 1)
      indexAttr.setUsage(THREE.DynamicDrawUsage)

      geo.setAttribute('position', posAttr)
      geo.setAttribute('color', colorAttr)
      geo.setIndex(indexAttr)
      geo.setDrawRange(0, 0)
      attrInitialised.current = true
    }

    if (!visible || !frameData?.objectFutureTrajectories) {
      resetTrajectoryMeshBuffers(trailMeshBuffers)
      geo.setDrawRange(0, 0)
      return
    }

    const { points, offsets, objCount } = frameData.objectFutureTrajectories
    const { sizes, classIds, count: objectCount } = frameData.objects

    resetTrajectoryMeshBuffers(trailMeshBuffers)

    const offsetLength = offsets.length
    const validObjCount = Math.min(objCount, Math.max(0, offsetLength - 1))
    const pointTotal = points.length / 3

    for (let i = 0; i < validObjCount; i++) {
      const start = offsets[i]
      const rawEnd = offsets[i + 1]
      const end = Math.min(rawEnd, pointTotal)
      if (start >= end || start < 0 || end > pointTotal) continue

      const totalPointCount = end - start
      if (totalPointCount < 2) continue

      const pointCount = resolveFuturePointCount(totalPointCount, futureSeconds, metadata)
      if (pointCount < 2) continue

      const safePointCount = Math.min(pointCount, totalPointCount)
      if (!hasFiniteTrajectoryPoints(points, start, safePointCount)) continue

      const lastPointIndex = start + safePointCount - 1
      if (isStationaryByPointDisplacement(points, start, lastPointIndex)) continue

      const objectWidth = i < objectCount ? sizes[i * 3] : DEFAULT_OBJECT_WIDTH_M
      const objectHeight = i < objectCount ? sizes[i * 3 + 2] : DEFAULT_OBJECT_HEIGHT_M
      const safeHalfWidth = Math.max(MIN_OBJECT_WIDTH_M, objectWidth) * 0.5
      const zOffset = OBJECT_Z_LIFT_M - objectHeight * 0.5

      const classVisual = getObjectClassVisual(classIds[i] ?? 0)
      objectTrailColor.set(classVisual.color)

      const ok = appendThickPolyline({
        points,
        startPointIndex: start,
        pointCount: safePointCount,
        halfWidth: safeHalfWidth,
        zOffset,
        color: objectTrailColor,
        buffers: trailMeshBuffers,
        miterLimit: 2.4,
        capSegments: 4,
      })

      if (!ok) break
    }

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute
    const indexAttr = geo.getIndex()

    posAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    if (indexAttr) indexAttr.needsUpdate = true

    geo.setDrawRange(0, trailMeshBuffers.indexCount)
    if (trailMeshBuffers.vertexCount > 0) geo.computeBoundingSphere()
  })

  const trailsOpacity = getDataLayerConfig('object_future_trails')?.opacity ?? 1

  return (
    <mesh>
      <bufferGeometry ref={trailGeoRef} />
      <meshBasicMaterial vertexColors transparent opacity={trailsOpacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
