import { create } from 'zustand'
import { buildDefaultVisibleLayers } from '@/features/scene-viewer/config/visualConfig'
import { DEFAULT_FUTURE_TRAJECTORY_SECONDS } from '@/features/scene-viewer/utils/trajectoryRendering'
import type { FrameData, MetadataResult } from '../data/types'

export type CameraMode = 'follow' | 'free' | 'bev'

const DEFAULT_VISIBLE_LAYERS = buildDefaultVisibleLayers()

export interface SceneState {
  currentFrameIndex: number
  isPlaying: boolean
  playbackSpeed: number
  totalFrames: number
  metadata: MetadataResult | null
  currentFrameData: FrameData | null
  cameraMode: CameraMode
  selectedTrackId: number | null
  visibleLayers: Record<string, boolean>
  futureTrajectorySeconds: number

  setFrameIndex: (i: number) => void
  setFrameData: (data: FrameData) => void
  setMetadata: (meta: MetadataResult) => void
  setTotalFrames: (n: number) => void
  play: () => void
  pause: () => void
  setSpeed: (s: number) => void
  setCameraMode: (m: CameraMode) => void
  setSelectedTrackId: (id: number | null) => void
  toggleLayer: (name: string) => void
  setFutureTrajectorySeconds: (seconds: number) => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  currentFrameIndex: 0,
  isPlaying: false,
  playbackSpeed: 1,
  totalFrames: 0,
  metadata: null,
  currentFrameData: null,
  cameraMode: 'follow',
  selectedTrackId: null,
  visibleLayers: { ...DEFAULT_VISIBLE_LAYERS },
  futureTrajectorySeconds: DEFAULT_FUTURE_TRAJECTORY_SECONDS,

  setFrameIndex: (i) => set({ currentFrameIndex: i }),
  setFrameData: (data) => set({ currentFrameData: data }),
  setMetadata: (meta) => set({ metadata: meta, totalFrames: meta.totalFrames }),
  setTotalFrames: (n) => set({ totalFrames: n }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSpeed: (s) => set({ playbackSpeed: s }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setSelectedTrackId: (id) => set({ selectedTrackId: id }),
  toggleLayer: (name) =>
    set({
      visibleLayers: {
        ...get().visibleLayers,
        [name]: !get().visibleLayers[name],
      },
    }),
  setFutureTrajectorySeconds: (seconds) => set({ futureTrajectorySeconds: seconds }),
}))
