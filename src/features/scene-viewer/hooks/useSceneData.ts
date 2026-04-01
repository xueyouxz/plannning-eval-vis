import { useEffect, useRef, useState } from 'react'
import { SceneDataManager } from '../data/SceneDataManager'
import { useSceneStore } from '../store/sceneStore'
import type { MetadataResult } from '../data/types'

export interface UseSceneDataResult {
  metadata: MetadataResult | null
  dataManager: SceneDataManager | null
  loading: boolean
  error: string | null
}

/**
 * Initialises a SceneDataManager for the given scene URL.
 * Writes metadata into the Zustand store once available.
 * Returns the metadata directly so callers don't have to read from the store.
 */
export function useSceneData(sceneUrl: string): UseSceneDataResult {
  const setMetadata = useSceneStore((s) => s.setMetadata)

  const [metadata, setMetadataLocal] = useState<MetadataResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const managerRef = useRef<SceneDataManager | null>(null)

  useEffect(() => {
    let cancelled = false

    const manager = new SceneDataManager(sceneUrl)
    managerRef.current = manager

    setLoading(true)
    setError(null)

    manager
      .init()
      .then((meta) => {
        if (cancelled) return
        setMetadataLocal(meta)
        setMetadata(meta)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
      manager.destroy()
      managerRef.current = null
    }
  }, [sceneUrl, setMetadata])

  return {
    metadata,
    dataManager: managerRef.current,
    loading,
    error,
  }
}
