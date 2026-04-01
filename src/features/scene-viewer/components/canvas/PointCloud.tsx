import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'
import { getDataLayerConfig } from '@/features/scene-viewer/config/visualConfig'
import { createRenderUpdateGate } from '@/features/scene-viewer/utils/renderUpdateGate'

const MAX_POINTS = 20000

// Pre-allocated buffers — module-level so they outlive component mounts/unmounts
const posBuffer = new Float32Array(MAX_POINTS * 3)
const colBuffer = new Float32Array(MAX_POINTS * 3)

// Persistent BufferAttributes wrapping the above buffers.
// Created once; the geometry just references them.
const posAttr = new THREE.BufferAttribute(posBuffer, 3)
const colAttr = new THREE.BufferAttribute(colBuffer, 3)

/** Height → colour: blue(low) → cyan → green → yellow → red(high) */
function heightToRgb(t: number, out: Float32Array, offset: number) {
  const stops = [
    [0, 0, 1], // blue
    [0, 1, 1], // cyan
    [0, 1, 0], // green
    [1, 1, 0], // yellow
    [1, 0, 0], // red
  ] as const
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const lo = Math.floor(scaled)
  const hi = Math.min(lo + 1, stops.length - 1)
  const f = scaled - lo
  out[offset]     = stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f
  out[offset + 1] = stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f
  out[offset + 2] = stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f
}

/**
 * Renders the LiDAR point cloud with height-based colouring.
 *
 * Fix: attributes are set directly on the geometry inside useFrame
 * (not via useEffect) to guarantee they exist before needsUpdate is called.
 */
export function PointCloud() {
  const geoRef = useRef<THREE.BufferGeometry>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const updateGateRef = useRef(createRenderUpdateGate())
  // Track whether we've set up attributes on the current geometry instance
  const initialised = useRef(false)

  // Dispose geometry and material on unmount
  useEffect(() => {
    const geo = geoRef.current
    const points = pointsRef.current
    const updateGate = updateGateRef.current
    return () => {
      geo?.dispose()
      if (points?.material) {
        const mat = points.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
      // Reset init flag so re-mounting re-attaches attributes
      initialised.current = false
      updateGate.reset()
    }
  }, [])

  useFrame(() => {
    const state = useSceneStore.getState()
    const frameData = state.currentFrameData
    const visible = state.visibleLayers['pointcloud'] ?? true

    if (pointsRef.current) pointsRef.current.visible = visible

    const geo = geoRef.current
    if (!geo) return

    const shouldUpdate = updateGateRef.current.shouldUpdate({
      currentFrameData: frameData,
      layerVisible: visible,
      futureTrajectorySeconds: state.futureTrajectorySeconds,
      cameraMode: state.cameraMode,
    })

    if (!shouldUpdate) return

    // Initialise attributes the first time we have a valid geometry reference
    if (!initialised.current) {
      geo.setAttribute('position', posAttr)
      geo.setAttribute('color', colAttr)
      geo.setDrawRange(0, 0)
      initialised.current = true
    }

    if (!visible || !frameData) {
      geo.setDrawRange(0, 0)
      return
    }

    const { positions } = frameData.lidar
    const count = Math.min(positions.length / 3, MAX_POINTS)

    if (count === 0) {
      geo.setDrawRange(0, 0)
      return
    }

    // Z range for colour normalisation
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i < count; i++) {
      const z = positions[i * 3 + 2]
      if (z < zMin) zMin = z
      if (z > zMax) zMax = z
    }
    const zRange = zMax - zMin || 1

    // Copy into pre-allocated buffers
    for (let i = 0; i < count; i++) {
      posBuffer[i * 3] = positions[i * 3]
      posBuffer[i * 3 + 1] = positions[i * 3 + 1]
      posBuffer[i * 3 + 2] = positions[i * 3 + 2]
      heightToRgb((positions[i * 3 + 2] - zMin) / zRange, colBuffer, i * 3)
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    geo.setDrawRange(0, count)
    geo.computeBoundingSphere()
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geoRef} />
      <pointsMaterial
        size={0.15}
        vertexColors
        sizeAttenuation
        transparent
        opacity={getDataLayerConfig('pointcloud')?.opacity ?? 1}
      />
    </points>
  )
}
