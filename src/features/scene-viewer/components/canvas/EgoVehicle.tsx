import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useSceneStore } from '../../store/sceneStore'
import { wxyzToXyzw } from '../../utils/coordTransform'

/**
 * Renders the ego vehicle from GLB model resource.
 *
 * Coordinate convention (nuScenes / nusviz, Z-up):
 *   World: X east, Y north, Z up
 *   Ego:   X forward, Y left, Z up
 */
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _offset = new THREE.Vector3()
const MODEL_TO_EGO_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, Math.PI, 'XYZ')
)

/**
 * Position correction (meters) along ego +X (forward).
 * Reason: nuScenes ego_pose origin and GLB mesh pivot are not the same physical point.
 */
const EGO_MODEL_FORWARD_OFFSET_M = 0.9

const EGO_MODEL_URL = '/ego.glb'

export function EgoVehicle() {
  const groupRef = useRef<THREE.Group>(null)
  const { scene } = useGLTF(EGO_MODEL_URL)

  useFrame(() => {
    const frameData = useSceneStore.getState().currentFrameData
    if (!frameData || !groupRef.current) return

    const { translation, rotation } = frameData.egoPose
    _pos.set(translation[0], translation[1], translation[2])

    // nusviz stores quaternion as [w, x, y, z]; Three.js needs (x, y, z, w)
    const [qx, qy, qz, qw] = wxyzToXyzw(rotation)
    _quat.set(qx, qy, qz, qw)

    _offset.set(EGO_MODEL_FORWARD_OFFSET_M, 0, 0).applyQuaternion(_quat)
    groupRef.current.position.copy(_pos).add(_offset)
    // Apply model-frame correction so GLB forward/up aligns with ego frame (+X forward, +Z up)
    groupRef.current.quaternion.copy(_quat).multiply(MODEL_TO_EGO_QUAT)
  })

  return (
    <group ref={groupRef}>
      <primitive object={scene.clone()} />
    </group>
  )
}

useGLTF.preload(EGO_MODEL_URL)
