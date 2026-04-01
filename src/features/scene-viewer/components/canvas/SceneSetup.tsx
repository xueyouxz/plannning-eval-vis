import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Stats } from '@react-three/drei'

/**
 * SceneSetup — ambient/directional lights, a Z-up grid, and an axes helper.
 * The nusviz world coordinate system is Z-up (X east, Y north, Z up),
 * so we rotate everything into that convention on the Three.js scene.
 */
export function SceneSetup() {
  const { scene } = useThree()
  const gridRef = useRef<THREE.GridHelper>(null)

  // Three.js default is Y-up; nusviz is Z-up.
  // We set the scene's up vector and rotate the camera up in SceneViewer.
  // The GridHelper lies in the XZ plane by default — rotate it to XY so it
  // appears as the ground plane in our Z-up world.
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.rotation.x = Math.PI / 2
    }
  }, [])

  useEffect(() => {
    scene.up.set(0, 0, 1)
  }, [scene])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <gridHelper
        ref={gridRef}
        args={[400, 40, '#1e3a5f', '#0f2240']}
      />
      <axesHelper args={[10]} />
      {import.meta.env.DEV && <Stats />}
    </>
  )
}
