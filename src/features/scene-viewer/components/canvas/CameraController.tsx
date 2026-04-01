import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useSceneStore } from '../../store/sceneStore'
import { wxyzToXyzw } from '../../utils/coordTransform'

const _egoPos = new THREE.Vector3()
const _targetLerp = new THREE.Vector3()
const _camLerp = new THREE.Vector3()
// Third-person follow offset in ego-local space (X=forward, Y=left, Z=up):
// pull back 18 m behind the car and sit 7 m above it.
const _followOffset = new THREE.Vector3(-18, 0, 15)
const _q = new THREE.Quaternion()

export function CameraController() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null)
  // Snap instead of lerp on: first mount, or when re-entering follow mode
  const snapNextFollowFrameRef = useRef(true)
  const prevCameraModeRef = useRef<string>('')

  useFrame(() => {
    const state = useSceneStore.getState()
    const { cameraMode, currentFrameData } = state
    const controls = controlsRef.current
    if (!controls || !currentFrameData) return

    // Detect mode transitions → re-snap when entering follow
    if (cameraMode !== prevCameraModeRef.current) {
      if (cameraMode === 'follow') snapNextFollowFrameRef.current = true
      prevCameraModeRef.current = cameraMode
    }

    const { translation, rotation } = currentFrameData.egoPose
    _egoPos.set(translation[0], translation[1], translation[2])

    if (cameraMode === 'follow') {
      const [qx, qy, qz, qw] = wxyzToXyzw(rotation)
      _q.set(qx, qy, qz, qw)
      const offset = _followOffset.clone().applyQuaternion(_q)
      const desiredCamPos = _egoPos.clone().add(offset)

      if (snapNextFollowFrameRef.current) {
        // Snap immediately — no lerp zoom-in
        _targetLerp.copy(_egoPos)
        _camLerp.copy(desiredCamPos)
        snapNextFollowFrameRef.current = false
        // Reset camera up-vector to world Z-up; Free mode OrbitControls
        // rotation can dirty this, causing the scene to appear tilted.
        controls.object.up.set(0, 0, 1)
      } else {
        _targetLerp.lerp(_egoPos, 0.1)
        _camLerp.lerp(desiredCamPos, 0.08)
      }

      controls.target.copy(_targetLerp)
      controls.object.position.copy(_camLerp)
      controls.update()
    } else if (cameraMode === 'bev') {
      controls.object.position.set(_egoPos.x, _egoPos.y, 150)
      controls.target.set(_egoPos.x, _egoPos.y, 0)
      controls.object.up.set(0, 1, 0)
      controls.update()
    }
    // free mode: let OrbitControls handle everything
  })

  const cameraMode = useSceneStore((s) => s.cameraMode)
  const isBev = cameraMode === 'bev'

  return (
    <OrbitControls
      ref={controlsRef}
      enableRotate={!isBev}
      enableZoom
      enablePan={cameraMode === 'free'}
      makeDefault
    />
  )
}
