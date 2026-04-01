export interface RenderUpdateGateInput {
  currentFrameData: unknown
  layerVisible: boolean
  futureTrajectorySeconds?: number
  cameraMode?: string
  extraKey?: number | null
}

interface RenderUpdateGateSnapshot {
  currentFrameData: unknown
  layerVisible: boolean
  futureTrajectorySeconds?: number
  cameraMode?: string
  extraKey?: number | null
}

export interface RenderUpdateGate {
  shouldUpdate: (next: RenderUpdateGateInput) => boolean
  reset: () => void
}

export function createRenderUpdateGate(): RenderUpdateGate {
  let previous: RenderUpdateGateSnapshot | null = null

  return {
    shouldUpdate(next) {
      const changed =
        previous === null ||
        previous.currentFrameData !== next.currentFrameData ||
        previous.layerVisible !== next.layerVisible ||
        previous.futureTrajectorySeconds !== next.futureTrajectorySeconds ||
        previous.cameraMode !== next.cameraMode ||
        previous.extraKey !== next.extraKey

      previous = {
        currentFrameData: next.currentFrameData,
        layerVisible: next.layerVisible,
        futureTrajectorySeconds: next.futureTrajectorySeconds,
        cameraMode: next.cameraMode,
        extraKey: next.extraKey,
      }

      return changed
    },
    reset() {
      previous = null
    },
  }
}
