import { useState } from 'react'
import { useCameraProjectedBoxes } from '@/features/scene-viewer/hooks/useCameraProjectedBoxes'
import { useSceneStore } from '@/features/scene-viewer/store/sceneStore'
import { CameraOverlayCanvas } from '@/features/scene-viewer/components/ui/CameraOverlayCanvas'
import styles from './CameraPanel.module.css'

// Display labels shown below each camera thumbnail
const CHANNEL_LABELS: Record<string, string> = {
  CAM_FRONT: 'FRONT',
  CAM_FRONT_LEFT: 'FRONT LEFT',
  CAM_FRONT_RIGHT: 'FRONT RIGHT',
  CAM_BACK: 'BACK',
  CAM_BACK_LEFT: 'BACK LEFT',
  CAM_BACK_RIGHT: 'BACK RIGHT',
}

// Layout order: row 0 = front row, row 1 = back row
// Matches nuScenes spatial arrangement
const ROW_0 = ['CAM_FRONT_LEFT', 'CAM_FRONT', 'CAM_FRONT_RIGHT']
const ROW_1 = ['CAM_BACK_LEFT', 'CAM_BACK', 'CAM_BACK_RIGHT']

export function CameraPanel() {
  const frameData = useSceneStore((s) => s.currentFrameData)
  const metadata = useSceneStore((s) => s.metadata)
  const selectedTrackId = useSceneStore((s) => s.selectedTrackId)
  const projectedBoxesByChannel = useCameraProjectedBoxes()
  const [modalChannel, setModalChannel] = useState<string | null>(null)

  const images = frameData?.cameraImages ?? {}

  const openModal = (channel: string) => {
    if (images[channel]) setModalChannel(channel)
  }

  const closeModal = () => setModalChannel(null)

  return (
    <div className={styles.panel}>
      <div className={styles.grid}>
        {[ROW_0, ROW_1].map((row, rowIdx) => (
          <div key={rowIdx} className={styles.row}>
            {row.map((channel) => {
              const src = images[channel]
              const available = Boolean(src)
              const cameraInfo = metadata?.cameras[channel]
              const sourceWidth = cameraInfo?.image_width ?? 1600
              const sourceHeight = cameraInfo?.image_height ?? 900
              const channelBoxes = projectedBoxesByChannel[channel] ?? []

              return (
                <div
                  key={channel}
                  className={`${styles.cell} ${available ? styles.cellActive : ''}`}
                  onClick={() => openModal(channel)}
                  title={available ? `Click to enlarge ${CHANNEL_LABELS[channel]}` : channel}
                >
                  {src ? (
                    <div className={styles.mediaWrap}>
                      <img
                        src={src}
                        alt={CHANNEL_LABELS[channel] ?? channel}
                        className={styles.thumb}
                        draggable={false}
                      />
                      <CameraOverlayCanvas
                        boxes={channelBoxes}
                        sourceWidth={sourceWidth}
                        sourceHeight={sourceHeight}
                        fitMode="cover"
                        selectedTrackId={selectedTrackId}
                        className={styles.overlayCanvas}
                      />
                    </div>
                  ) : (
                    <div className={styles.placeholder}>
                      <span className={styles.placeholderIcon}>⬜</span>
                    </div>
                  )}
                  <span className={styles.label}>
                    {CHANNEL_LABELS[channel] ?? channel}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Modal overlay for full-resolution view */}
      {modalChannel && images[modalChannel] && (
        <div
          className={styles.modalOverlay}
          onClick={closeModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && closeModal()}
          aria-label="Close camera view"
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {CHANNEL_LABELS[modalChannel] ?? modalChannel}
              </span>
              <button
                className={styles.closeBtn}
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalImageWrap}>
              <img
                src={images[modalChannel]}
                alt={CHANNEL_LABELS[modalChannel] ?? modalChannel}
                className={styles.modalImage}
                draggable={false}
              />
              <CameraOverlayCanvas
                boxes={projectedBoxesByChannel[modalChannel] ?? []}
                sourceWidth={metadata?.cameras[modalChannel]?.image_width ?? 1600}
                sourceHeight={metadata?.cameras[modalChannel]?.image_height ?? 900}
                fitMode="contain"
                selectedTrackId={selectedTrackId}
                className={styles.modalOverlayCanvas}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
