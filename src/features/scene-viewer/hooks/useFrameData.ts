import { useEffect, useRef } from 'react'
import type { SceneDataManager } from '../data/SceneDataManager'
import { useSceneStore } from '../store/sceneStore'

/**
 * Watches currentFrameIndex in the store.
 * On change: loads the frame via dataManager and writes it back to the store.
 * Also triggers prefetch of upcoming frames.
 *
 * Phase-3 update:
 *   - Handles load failure gracefully (warn + pause, keep last frame).
 *   - Calls prefetch(index, 5) after each successful load.
 */
export function useFrameData(dataManager: SceneDataManager | null): void {
  const currentFrameIndex = useSceneStore((s) => s.currentFrameIndex)
  const setFrameData = useSceneStore((s) => s.setFrameData)
  const pause = useSceneStore((s) => s.pause)

  // Track the last loaded index to avoid duplicate loads on the same frame
  const lastLoadedRef = useRef<number>(-1)

  useEffect(() => {
    if (!dataManager) return
    if (lastLoadedRef.current === currentFrameIndex) return

    lastLoadedRef.current = currentFrameIndex

    dataManager
      .loadFrame(currentFrameIndex)
      .then((frame) => {
        setFrameData(frame)
        // Prefetch next 5 frames in the background
        dataManager.prefetch(currentFrameIndex, 5)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[useFrameData] Failed to load frame ${currentFrameIndex}:`,
          msg,
        )
        // Pause playback but preserve currentFrameData (keep last valid frame)
        pause()
      })
  }, [currentFrameIndex, dataManager, setFrameData, pause])
}
