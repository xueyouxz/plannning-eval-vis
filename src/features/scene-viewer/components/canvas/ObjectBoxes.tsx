import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'
import { getDataLayerConfig, getObjectClassVisual } from '@/features/scene-viewer/config/visualConfig'
import { wxyzToXyzw } from '../../utils/coordTransform'
import { createRenderUpdateGate } from '@/features/scene-viewer/utils/renderUpdateGate'

const MAX_INSTANCES = 128

const _mat = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scl = new THREE.Vector3()
const _fillColor = new THREE.Color()
const _v3 = new THREE.Vector3()

/**
 * Build a LineSegments geometry for a unit box (12 edges = 24 vertices).
 *
 * nuScenes SIZE = [width, length, height] (wlh order) mapped to Three.js as:
 *   length → X axis  (long axis, forward direction in object local frame)
 *   width  → Y axis  (lateral axis)
 *   height → Z axis  (vertical axis)
 *
 * Corner indices (unit box centred at origin):
 *   0:(-0.5,-0.5,-0.5) 1:(+0.5,-0.5,-0.5) 2:(+0.5,+0.5,-0.5) 3:(-0.5,+0.5,-0.5)
 *   4:(-0.5,-0.5,+0.5) 5:(+0.5,-0.5,+0.5) 6:(+0.5,+0.5,+0.5) 7:(-0.5,+0.5,+0.5)
 *
 * 12 edges: bottom 4 + top 4 + vertical 4
 */
function makeBoxEdgesGeometry(): THREE.BufferGeometry {
  const corners = [
    [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5],
    [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5],
    [-0.5, -0.5, +0.5], [+0.5, -0.5, +0.5],
    [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],
  ]
  const edges = [
    [0,1],[1,2],[2,3],[3,0], // bottom face
    [4,5],[5,6],[6,7],[7,4], // top face
    [0,4],[1,5],[2,6],[3,7], // verticals
  ]
  const verts: number[] = []
  for (const [a, b] of edges) {
    verts.push(...corners[a], ...corners[b])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  return geo
}

/**
 * Renders 3D bounding boxes as instanced semi-transparent fills
 * plus a LineSegments overlay that mirrors each box's transform.
 *
 * Coordinate notes (nuScenes Z-up, world frame):
 *   - CENTER is world-frame position (x east, y north, z up)
 *   - ROTATION is world-frame orientation quaternion [w,x,y,z]
 *   - SIZE is [width, length, height] (wlh); mapped as X←length, Y←width, Z←height
 *   Both fill and edge meshes are unit boxes scaled by SIZE.
 */
export function ObjectBoxes() {
  const fillRef = useRef<THREE.InstancedMesh>(null)
  const updateGateRef = useRef(createRenderUpdateGate())
  // LineSegments for edges — one segment set, transforms applied via matrix
  const edgePosRef = useRef<THREE.BufferAttribute | null>(null)
  const edgeGeoRef = useRef<THREE.BufferGeometry | null>(null)
  const edgesRef = useRef<THREE.LineSegments>(null)

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  // Build a merged edge geometry for up to MAX_INSTANCES boxes
  // Each box contributes 24 vertices (12 edges × 2 endpoints)
  const mergedEdgeGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    // Allocate max capacity; drawRange controls actual count
    const buf = new THREE.BufferAttribute(
      new Float32Array(MAX_INSTANCES * 24 * 3), 3,
    )
    buf.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', buf)
    geo.setDrawRange(0, 0)
    edgePosRef.current = buf
    edgeGeoRef.current = geo
    return geo
  }, [])

  // Unit-box edge template (24 vertices)
  const unitEdgeTemplate = useMemo(() => makeBoxEdgesGeometry(), [])

  // Dispose geometries and materials on unmount
  useEffect(() => {
    const fill = fillRef.current
    const edges = edgesRef.current
    const updateGate = updateGateRef.current
    return () => {
      boxGeo.dispose()
      mergedEdgeGeo.dispose()
      unitEdgeTemplate.dispose()
      // Dispose fill material
      if (fill?.material) {
        const mat = fill.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
      // Dispose edge material
      if (edges?.material) {
        const mat = edges.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
      updateGate.reset()
    }
  }, [boxGeo, mergedEdgeGeo, unitEdgeTemplate])

  useFrame(() => {
    const state = useSceneStore.getState()
    const frameData = state.currentFrameData
    const visible = state.visibleLayers.objects ?? true
    const selectedTrackId = state.selectedTrackId

    if (fillRef.current) fillRef.current.visible = visible
    if (edgesRef.current) edgesRef.current.visible = visible

    const fill = fillRef.current
    if (!fill) return

    const shouldUpdate = updateGateRef.current.shouldUpdate({
      currentFrameData: frameData,
      layerVisible: visible,
      futureTrajectorySeconds: state.futureTrajectorySeconds,
      cameraMode: state.cameraMode,
      extraKey: selectedTrackId,
    })

    if (!shouldUpdate) return

    if (!visible || !frameData) {
      fill.count = 0
      const edgeGeo = edgeGeoRef.current
      if (edgeGeo) edgeGeo.setDrawRange(0, 0)
      return
    }

    const { centers, sizes, rotations, classIds, trackIds, count } = frameData.objects
    const actual = Math.min(count, MAX_INSTANCES)

    fill.count = actual

    const edgeBuf = edgePosRef.current
    const edgeGeo = edgeGeoRef.current
    const templatePos = unitEdgeTemplate.getAttribute('position') as THREE.BufferAttribute
    const vertsPerBox = templatePos.count // 24

    for (let i = 0; i < actual; i++) {
      _pos.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2])

      // [w,x,y,z] → Three.js (x,y,z,w)
      const [qx, qy, qz, qw] = wxyzToXyzw([
        rotations[i * 4],
        rotations[i * 4 + 1],
        rotations[i * 4 + 2],
        rotations[i * 4 + 3],
      ])
      _quat.set(qx, qy, qz, qw)

      // nuScenes SIZE = [width, length, height] (wlh order).
      // In the world frame the annotation rotation points the length axis
      // along the object's forward (+X in its local frame), so:
      //   X ← length (sizes[1])  — long axis / forward
      //   Y ← width  (sizes[0])  — lateral axis
      //   Z ← height (sizes[2])  — vertical axis
      _scl.set(sizes[i * 3 + 1], sizes[i * 3], sizes[i * 3 + 2])

      _mat.compose(_pos, _quat, _scl)
      fill.setMatrixAt(i, _mat)

      const classVisual = getObjectClassVisual(classIds[i])
      const isSelected = selectedTrackId !== null && trackIds[i] === selectedTrackId
      _fillColor.set(isSelected ? '#ffffff' : classVisual.color)
      fill.setColorAt(i, _fillColor)

      // Transform each unit-edge vertex through the already-composed matrix
      if (edgeBuf) {
        const base = i * vertsPerBox
        for (let v = 0; v < vertsPerBox; v++) {
          _v3.set(templatePos.getX(v), templatePos.getY(v), templatePos.getZ(v))
          _v3.applyMatrix4(_mat)
          edgeBuf.setXYZ(base + v, _v3.x, _v3.y, _v3.z)
        }
      }
    }

    fill.instanceMatrix.needsUpdate = true
    if (fill.instanceColor) fill.instanceColor.needsUpdate = true

    if (edgeBuf && edgeGeo) {
      edgeBuf.needsUpdate = true
      edgeGeo.setDrawRange(0, actual * vertsPerBox)
      edgeGeo.computeBoundingSphere()
    }
  })

  const handlePointerDown = (e: { instanceId?: number; stopPropagation?: () => void }) => {
    if (e.instanceId === undefined) return
    e.stopPropagation?.()
    const fd = useSceneStore.getState().currentFrameData
    if (!fd) return
    const trackId = fd.objects.trackIds[e.instanceId]
    if (trackId !== undefined) useSceneStore.getState().setSelectedTrackId(trackId)
  }

  return (
    <group>
      <instancedMesh
        ref={fillRef}
        args={[boxGeo, undefined, MAX_INSTANCES]}
        onPointerDown={handlePointerDown}
      >
        <meshBasicMaterial
          transparent
          opacity={getDataLayerConfig('objects')?.opacity ?? 0.25}
          depthWrite={false}
        />
      </instancedMesh>

      <lineSegments ref={edgesRef} geometry={mergedEdgeGeo}>
        <lineBasicMaterial vertexColors={false} />
      </lineSegments>
    </group>
  )
}
