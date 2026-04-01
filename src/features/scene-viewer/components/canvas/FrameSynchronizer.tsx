import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useSceneStore } from '../../store/sceneStore'

/**
 * Invisible R3F component that drives frame-by-frame playback.
 *
 * Design rationale:
 *   - Runs entirely inside useFrame to avoid React re-renders.
 *   - Reads store state via getState() (zero subscriptions).
 *   - nuScenes frame interval ≈ 0.5 s → advance when accumulator ≥ 0.5.
 *   - Auto-pauses when the last frame is reached.
 */
export function FrameSynchronizer({ totalFrames }: { totalFrames: number }) {
  const accRef = useRef(0)
  // Track the last frameIndex we started a load for, so seeks reset the accumulator
  const lastFrameRef = useRef(-1)

  useFrame((_state, delta) => {
    const store = useSceneStore.getState()
    const { isPlaying, playbackSpeed, currentFrameIndex } = store

    // Detect an external seek (slider or initial load) and reset accumulator
    if (currentFrameIndex !== lastFrameRef.current) {
      accRef.current = 0
      lastFrameRef.current = currentFrameIndex
    }

    if (!isPlaying) return
    if (totalFrames <= 0) return

    accRef.current += delta * playbackSpeed

    if (accRef.current >= 0.5) {
      accRef.current -= 0.5

      const next = currentFrameIndex + 1

      if (next >= totalFrames) {
        // Reached the end — stop playback and stay on the last frame
        store.pause()
        lastFrameRef.current = currentFrameIndex
        return
      }

      store.setFrameIndex(next)
      lastFrameRef.current = next
    }
  })

  // No visual output
  return null
}
