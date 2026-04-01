import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useSceneData } from '../hooks/useSceneData'
import { useFrameData } from '../hooks/useFrameData'
import { useSceneStore } from '../store/sceneStore'
import { SceneContext } from '../context/SceneContext'
import { SceneSetup } from './canvas/SceneSetup'
import { MapLayer } from './canvas/MapLayer'
import { EgoVehicle } from './canvas/EgoVehicle'
import { PointCloud } from './canvas/PointCloud'
import { ObjectBoxes } from './canvas/ObjectBoxes'
import { CameraController } from './canvas/CameraController'
import { FrameSynchronizer } from './canvas/FrameSynchronizer'
import { EgoTrajectory } from './canvas/EgoTrajectory'
import { EgoFutureTrajectory } from './canvas/EgoFutureTrajectory'
import { ObjectFutureTrails } from './canvas/ObjectFutureTrails'
import { TimelineBar } from './ui/TimelineBar'
import { CameraPanel } from './ui/CameraPanel'
import { LayerToggle } from './ui/LayerToggle'
import type { CameraMode } from '../store/sceneStore'
import styles from './SceneViewer.module.css'

const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  follow: 'Follow',
  free: 'Free',
  bev: 'BEV',
}

interface SceneViewerProps {
  sceneUrl: string
}

export default function SceneViewer({ sceneUrl }: SceneViewerProps) {
  const { metadata, dataManager, loading, error } = useSceneData(sceneUrl)
  const [activeOverlayPanel, setActiveOverlayPanel] = useState<'legend' | 'camera' | 'perf' | null>(null)
  const [isCameraPanelOpen, setIsCameraPanelOpen] = useState(false)

  // Load frame data reactively whenever frameIndex changes
  useFrameData(dataManager)

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <span className={styles.loadingText}>Loading scene data…</span>
      </div>
    )
  }

  if (error || !metadata || !dataManager) {
    return (
      <div className={styles.error}>
        ⚠ Failed to load scene: {error ?? 'Unknown error'}
      </div>
    )
  }

  // Build timestamps array from the message index for the timeline bar
  const timestamps = (dataManager.index?.messages ?? []).map((m) => m.timestamp)

  return (
    <SceneContext.Provider value={{ metadata, dataManager }}>
      <div className={styles.container}>
        <div className={styles.mainContent}>
          <div className={styles.canvasColumn}>
            <div className={styles.canvasWrap}>
              <Canvas
                camera={{ position: [0, -50, 80], up: [0, 0, 1], fov: 60 }}
                gl={{ antialias: true }}
                onPointerMissed={() =>
                  useSceneStore.getState().setSelectedTrackId(null)
                }
              >
                <Suspense fallback={null}>
                  <SceneSetup />
                  <MapLayer />
                  <EgoVehicle />
                  <PointCloud />
                  <ObjectBoxes />
                  <CameraController />
                  <EgoTrajectory />
                  <EgoFutureTrajectory />
                  <ObjectFutureTrails />
                  {/* Drive the playback accumulator from inside the render loop */}
                  <FrameSynchronizer totalFrames={metadata.totalFrames} />
                </Suspense>
              </Canvas>

              <OverlayDock
                activePanel={activeOverlayPanel}
                onToggle={setActiveOverlayPanel}
              />

              <div className={styles.cameraPanelToggleWrap}>
                <button
                  type="button"
                  className={`${styles.cameraPanelToggleBtn} ${isCameraPanelOpen ? styles.cameraPanelToggleActive : ''}`}
                  onClick={() => setIsCameraPanelOpen((prev) => !prev)}
                  aria-label={isCameraPanelOpen ? '隐藏相机视图' : '显示相机视图'}
                  title={isCameraPanelOpen ? '隐藏相机视图' : '显示相机视图'}
                >
                  📸
                </button>
              </div>
            </div>

            <TimelineBar timestamps={timestamps} />

            {isCameraPanelOpen && (
              <div className={styles.cameraStrip}>
                <CameraPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </SceneContext.Provider>
  )
}

// ─── Camera Mode Buttons ──────────────────────────────────────────────────────

function CameraModeButtons() {
  const cameraMode = useSceneStore((s) => s.cameraMode)
  const setCameraMode = useSceneStore((s) => s.setCameraMode)

  return (
    <div className={styles.cameraModes}>
      {(Object.keys(CAMERA_MODE_LABELS) as CameraMode[]).map((mode) => (
        <button
          key={mode}
          className={`${styles.modeBtn} ${cameraMode === mode ? styles.active : ''}`}
          onClick={() => setCameraMode(mode)}
        >
          {CAMERA_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  )
}

interface OverlayDockProps {
  activePanel: 'legend' | 'camera' | 'perf' | null
  onToggle: (panel: 'legend' | 'camera' | 'perf' | null) => void
}

function OverlayDock({ activePanel, onToggle }: OverlayDockProps) {
  const togglePanel = (panel: 'legend' | 'camera' | 'perf') => {
    onToggle(activePanel === panel ? null : panel)
  }

  return (
    <div className={styles.overlayDock}>
      {activePanel && (
        <div className={styles.overlayPanel}>
          {activePanel === 'legend' && <LayerToggle />}
          {activePanel === 'camera' && <CameraModeButtons />}
          {activePanel === 'perf' && <PerformanceDebugPanel />}
        </div>
      )}

      <div className={styles.overlayIcons}>
        <button
          type="button"
          className={`${styles.overlayIconBtn} ${activePanel === 'legend' ? styles.overlayIconActive : ''}`}
          onClick={() => togglePanel('legend')}
          title="图例"
          aria-label="切换图例面板"
        >
          🗺
        </button>
        <button
          type="button"
          className={`${styles.overlayIconBtn} ${activePanel === 'camera' ? styles.overlayIconActive : ''}`}
          onClick={() => togglePanel('camera')}
          title="相机视角"
          aria-label="切换相机视角面板"
        >
          📷
        </button>
        <button
          type="button"
          className={`${styles.overlayIconBtn} ${activePanel === 'perf' ? styles.overlayIconActive : ''}`}
          onClick={() => togglePanel('perf')}
          title="性能调试"
          aria-label="切换性能调试面板"
        >
          ⚡
        </button>
      </div>
    </div>
  )
}

function PerformanceDebugPanel() {
  const currentFrameIndex = useSceneStore((s) => s.currentFrameIndex)
  const totalFrames = useSceneStore((s) => s.totalFrames)
  const isPlaying = useSceneStore((s) => s.isPlaying)
  const playbackSpeed = useSceneStore((s) => s.playbackSpeed)
  const visibleLayers = useSceneStore((s) => s.visibleLayers)

  const enabledLayerCount = Object.values(visibleLayers).filter(Boolean).length

  return (
    <div className={styles.perfPanel}>
      <div className={styles.perfTitle}>PERFORMANCE</div>
      <div className={styles.perfRow}>
        <span className={styles.perfLabel}>Playback</span>
        <span className={styles.perfValue}>{isPlaying ? 'RUNNING' : 'PAUSED'}</span>
      </div>
      <div className={styles.perfRow}>
        <span className={styles.perfLabel}>Speed</span>
        <span className={styles.perfValue}>{playbackSpeed.toFixed(1)}x</span>
      </div>
      <div className={styles.perfRow}>
        <span className={styles.perfLabel}>Frame</span>
        <span className={styles.perfValue}>{currentFrameIndex + 1} / {Math.max(totalFrames, 1)}</span>
      </div>
      <div className={styles.perfRow}>
        <span className={styles.perfLabel}>Visible Layers</span>
        <span className={styles.perfValue}>{enabledLayerCount}</span>
      </div>
    </div>
  )
}

