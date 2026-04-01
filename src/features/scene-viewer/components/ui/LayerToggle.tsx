import { useSceneStore } from '../../store/sceneStore'
import {
  DATA_LAYER_CONFIGS,
  MAP_LAYER_CONFIGS,
  getObjectClassVisual,
} from '@/features/scene-viewer/config/visualConfig'
import {
  MAX_FUTURE_TRAJECTORY_SECONDS,
  MIN_FUTURE_TRAJECTORY_SECONDS,
  clampFutureTrajectorySeconds,
} from '@/features/scene-viewer/utils/trajectoryRendering'

import styles from './LayerToggle.module.css'

interface LegendRow {
  key: string
  label: string
  color: string
}

const OBJECT_LEGEND_ROWS: LegendRow[] = Array.from({ length: 11 }, (_, id) => {
  const visual = getObjectClassVisual(id)
  return {
    key: `object-class-${id}`,
    label: visual.label,
    color: visual.color,
  }
})

interface ToggleRowProps {
  label: string
  color: string
  checked: boolean
  detail?: string
  onChange: () => void
}

function ToggleRow({ label, color, checked, detail, onChange }: ToggleRowProps) {
  return (
    <label className={styles.row}>
      <span
        className={styles.swatch}
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className={`${styles.rowLabel} ${!checked ? styles.dimmed : ''}`}>
        {label}
      </span>
      {detail ? <span className={styles.rowDetail}>{detail}</span> : null}
      <span className={styles.toggle}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className={styles.checkbox}
        />
        <span className={`${styles.slider} ${checked ? styles.sliderOn : ''}`} />
      </span>
    </label>
  )
}

export function LayerToggle() {
  const visibleLayers = useSceneStore((s) => s.visibleLayers)
  const toggleLayer = useSceneStore((s) => s.toggleLayer)
  const futureTrajectorySeconds = useSceneStore((s) => s.futureTrajectorySeconds)
  const setFutureTrajectorySeconds = useSceneStore((s) => s.setFutureTrajectorySeconds)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>LAYERS</span>
      </div>

      {/* Data modalities */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Data</span>
        {DATA_LAYER_CONFIGS.map((layer) => (
          <ToggleRow
            key={layer.key}
            label={layer.label}
            color={layer.color}
            checked={visibleLayers[layer.key] ?? layer.defaultVisible}
            detail={`α ${layer.opacity.toFixed(2)}`}
            onChange={() => toggleLayer(layer.key)}
          />
        ))}

        <div className={styles.sliderGroup}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>未来轨迹时长</span>
            <span className={styles.sliderValue}>{futureTrajectorySeconds}s</span>
          </div>
          <input
            type="range"
            min={MIN_FUTURE_TRAJECTORY_SECONDS}
            max={MAX_FUTURE_TRAJECTORY_SECONDS}
            step={1}
            value={futureTrajectorySeconds}
            className={styles.secondsSlider}
            onChange={(event) => {
              const nextValue = clampFutureTrajectorySeconds(Number(event.target.value))
              setFutureTrajectorySeconds(nextValue)
            }}
          />
        </div>
      </div>

      {/* Map layers */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Map</span>
        {MAP_LAYER_CONFIGS.map((layer) => (
          <ToggleRow
            key={layer.key}
            label={layer.label}
            color={layer.style.fill}
            checked={visibleLayers[layer.key] ?? layer.defaultVisible}
            detail={`α ${layer.fillOpacity.toFixed(2)}`}
            onChange={() => toggleLayer(layer.key)}
          />
        ))}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Objects (Class)</span>
        {OBJECT_LEGEND_ROWS.map((row) => (
          <div key={row.key} className={styles.legendRow}>
            <span className={styles.swatch} style={{ background: row.color }} aria-hidden="true" />
            <span className={styles.rowLabel}>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
