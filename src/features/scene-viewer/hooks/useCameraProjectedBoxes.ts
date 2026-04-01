import { useMemo } from 'react'
import { useSceneStore } from '@/features/scene-viewer/store/sceneStore'
import { buildCameraProjectedBoxes, emptyChannelProjectedBoxes } from '@/features/scene-viewer/utils/cameraOverlayBuilder'
import type { ChannelProjectedBoxes } from '@/features/scene-viewer/types/cameraOverlay'

export function useCameraProjectedBoxes(): ChannelProjectedBoxes {
  const currentFrameData = useSceneStore((s) => s.currentFrameData)
  const metadata = useSceneStore((s) => s.metadata)
  const objectsVisible = useSceneStore((s) => s.visibleLayers.objects)

  return useMemo(() => {
    if (!objectsVisible || !currentFrameData || !metadata) {
      return emptyChannelProjectedBoxes()
    }

    return buildCameraProjectedBoxes(currentFrameData, metadata.cameras)
  }, [objectsVisible, currentFrameData, metadata])
}
