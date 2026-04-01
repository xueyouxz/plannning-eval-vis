import { useSceneStore } from '../../store/sceneStore'
import styles from './TimelineBar.module.css'

const SPEEDS = [0.5, 1, 2, 4] as const

/** Format a Unix timestamp offset (seconds) as mm:ss.s */
function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rem = s - m * 60
  return `${String(m).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`
}

interface TimelineBarProps {
  /** Timestamps of all frames, used to display absolute time offset */
  timestamps: number[]
}

export function TimelineBar({ timestamps }: TimelineBarProps) {
  const frameIndex = useSceneStore((s) => s.currentFrameIndex)
  const totalFrames = useSceneStore((s) => s.totalFrames)
  const isPlaying = useSceneStore((s) => s.isPlaying)
  const speed = useSceneStore((s) => s.playbackSpeed)
  const play = useSceneStore((s) => s.play)
  const pause = useSceneStore((s) => s.pause)
  const setSpeed = useSceneStore((s) => s.setSpeed)
  const setFrameIndex = useSceneStore((s) => s.setFrameIndex)

  const max = Math.max(0, totalFrames - 1)

  // Elapsed time relative to scene start
  const startTime = timestamps[0] ?? 0
  const currentTime = (timestamps[frameIndex] ?? startTime) - startTime
  const totalTime = (timestamps[max] ?? startTime) - startTime

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    pause()
    setFrameIndex(Number(e.target.value))
  }

  const togglePlay = () => {
    if (isPlaying) {
      pause()
    } else {
      // If we are at the end, restart from the beginning
      if (frameIndex >= max) setFrameIndex(0)
      play()
    }
  }

  return (
    <div className={styles.bar}>
      {/* Play / pause button */}
      <button
        className={styles.playBtn}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          /* Pause icon — two vertical bars */
          <svg viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          /* Play icon — right-pointing triangle */
          <svg viewBox="0 0 16 16" fill="currentColor">
            <polygon points="4,2 14,8 4,14" />
          </svg>
        )}
      </button>

      {/* Scrub slider */}
      <div className={styles.sliderWrap}>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={max}
          step={1}
          value={frameIndex}
          onChange={handleScrub}
        />
        {/* Progress fill overlay */}
        <div
          className={styles.sliderFill}
          style={{ width: max > 0 ? `${(frameIndex / max) * 100}%` : '0%' }}
        />
      </div>

      {/* Time display */}
      <span className={styles.timeDisplay}>
        {formatTime(currentTime)}
        <span className={styles.dimSlash}> / </span>
        {formatTime(totalTime)}
      </span>

      {/* Speed buttons */}
      <div className={styles.speedGroup}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`${styles.speedBtn} ${speed === s ? styles.activeSpeed : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
