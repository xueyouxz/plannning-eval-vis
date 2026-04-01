import { useEffect, useRef, useState } from 'react'
import { SceneDataManager } from '../data/SceneDataManager'
import { CAMERA_CHANNELS } from '../utils/constants'
import type { MetadataResult, FrameData } from '../data/types'
import styles from './SceneViewerDebugPage.module.css'

const SCENE_URL = '/data/scene-viewer/scene-0916/'

interface VerifyResult {
  cameraCount: number
  mapLayerCount: number
  totalFrames: number
  frame0: FrameData | null
  frame1: FrameData | null
  prefetchHit: boolean
}

export default function SceneViewerDebugPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [metadata, setMetadata] = useState<MetadataResult | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const managerRef = useRef<SceneDataManager | null>(null)

  async function runVerification() {
    setStatus('loading')
    setErrorMsg(null)

    const manager = new SceneDataManager(SCENE_URL)
    managerRef.current = manager

    try {
      // ── Init ────────────────────────────────────────────────────────────
      const meta = await manager.init()
      setMetadata(meta)

      // ── Load frame 0 ────────────────────────────────────────────────────
      const frame0 = await manager.loadFrame(0)

      // ── Prefetch (loads 0-5 in background) ──────────────────────────────
      manager.prefetch(0, 5)

      // ── Load frame 1 ────────────────────────────────────────────────────
      const frame1 = await manager.loadFrame(1)

      // ── Check prefetch cache hit (frame 0 should already be cached) ──────
      const fetchSpy = window.fetch
      let fetchCalled = false
      window.fetch = (...args) => {
        fetchCalled = true
        return fetchSpy(...args)
      }
      await manager.loadFrame(0) // should hit cache, not call fetch
      const prefetchHit = !fetchCalled
      window.fetch = fetchSpy

      setVerify({
        cameraCount: Object.keys(meta.cameras).length,
        mapLayerCount: Object.keys(meta.mapLayers).length,
        totalFrames: meta.totalFrames,
        frame0,
        frame1,
        prefetchHit,
      })
      setStatus('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.destroy()
    }
  }, [])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Phase 1 — Data Layer Verification</h1>
      <p className={styles.subtitle}>Scene: {SCENE_URL}</p>

      <button className={styles.btn} onClick={() => void runVerification()} disabled={status === 'loading'}>
        {status === 'loading' ? 'Running…' : 'Run Verification'}
      </button>

      {status === 'error' && (
        <div className={styles.error}>
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {status === 'done' && verify && metadata && (
        <div className={styles.results}>
          {/* ── Metadata ── */}
          <section className={styles.section}>
            <h2>Metadata</h2>
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td>Cameras</td>
                  <td>
                    <Pass ok={verify.cameraCount === 6}>{verify.cameraCount} (expected 6)</Pass>
                  </td>
                </tr>
                <tr>
                  <td>Map layers</td>
                  <td>
                    <Pass ok={verify.mapLayerCount > 0}>
                      {verify.mapLayerCount} ({Object.keys(metadata.mapLayers).join(', ')})
                    </Pass>
                  </td>
                </tr>
                <tr>
                  <td>Total frames</td>
                  <td>
                    <Pass ok={verify.totalFrames > 0}>{verify.totalFrames}</Pass>
                  </td>
                </tr>
                <tr>
                  <td>Scene name</td>
                  <td>{metadata.sceneInfo.name}</td>
                </tr>
                <tr>
                  <td>Location</td>
                  <td>{metadata.sceneInfo.location}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ── Frame 0 ── */}
          {verify.frame0 && (
            <section className={styles.section}>
              <h2>Frame 0</h2>
              <FrameReport frame={verify.frame0} label="frame 0" />
            </section>
          )}

          {/* ── Frame 1 ── */}
          {verify.frame1 && (
            <section className={styles.section}>
              <h2>Frame 1</h2>
              <FrameReport frame={verify.frame1} label="frame 1" />
            </section>
          )}

          {/* ── Cache ── */}
          <section className={styles.section}>
            <h2>Prefetch Cache</h2>
            <p>
              <Pass ok={verify.prefetchHit}>
                {verify.prefetchHit
                  ? 'Cache HIT: second loadFrame(0) did not call fetch'
                  : 'Cache MISS: unexpectedly called fetch again'}
              </Pass>
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pass({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span style={{ color: ok ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
      {ok ? '✓ ' : '✗ '}
      {children}
    </span>
  )
}

function FrameReport({ frame, label }: { frame: FrameData; label: string }) {
  const posCount = frame.lidar.positions.length / 3
  const posOk = posCount > 0
  const classIdsOk =
    frame.objects.count === 0 ||
    Array.from(frame.objects.classIds).every((id) => id >= 0 && id <= 10)
  const camKeys = Object.keys(frame.cameraImages)

  return (
    <table className="debug-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td>Timestamp</td>
          <td>{frame.timestamp.toFixed(3)}</td>
        </tr>
        <tr>
          <td>Ego translation</td>
          <td>
            <Pass ok={frame.egoPose.translation.length === 3}>
              [{frame.egoPose.translation.map((v) => v.toFixed(3)).join(', ')}]
            </Pass>
          </td>
        </tr>
        <tr>
          <td>LiDAR points</td>
          <td>
            <Pass ok={posOk}>
              {posCount.toLocaleString()} pts (positions.length={frame.lidar.positions.length})
            </Pass>
          </td>
        </tr>
        <tr>
          <td>Objects count</td>
          <td>
            <Pass ok={frame.objects.count >= 0}>
              {frame.objects.count} objects
            </Pass>
          </td>
        </tr>
        <tr>
          <td>CLASS_IDs valid</td>
          <td>
            <Pass ok={classIdsOk}>
              {classIdsOk ? 'all in [0, 10]' : 'OUT OF RANGE values found!'}
            </Pass>
          </td>
        </tr>
        <tr>
          <td>Camera images</td>
          <td>
            <Pass ok={camKeys.length === CAMERA_CHANNELS.length}>
              {camKeys.length} / {CAMERA_CHANNELS.length} channels
            </Pass>
          </td>
        </tr>
      </tbody>
      {camKeys.length > 0 && (
        <tbody>
          <tr>
            <td colSpan={2} style={{ paddingTop: 12, fontWeight: 600 }}>
              Camera previews ({label})
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {CAMERA_CHANNELS.map((ch) =>
                  frame.cameraImages[ch] ? (
                    <div key={ch} style={{ textAlign: 'center' }}>
                      <img
                        src={frame.cameraImages[ch]}
                        alt={ch}
                        style={{ width: 240, height: 135, objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{ch}</span>
                    </div>
                  ) : null,
                )}
              </div>
            </td>
          </tr>
        </tbody>
      )}
    </table>
  )
}
