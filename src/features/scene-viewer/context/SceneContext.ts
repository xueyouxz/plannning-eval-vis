import { createContext, useContext } from 'react'
import type { SceneDataManager } from '../data/SceneDataManager'
import type { MetadataResult } from '../data/types'

export interface SceneContextValue {
  metadata: MetadataResult
  dataManager: SceneDataManager
}

export const SceneContext = createContext<SceneContextValue | null>(null)

export function useSceneContext(): SceneContextValue {
  const ctx = useContext(SceneContext)
  if (!ctx) throw new Error('useSceneContext must be used inside SceneContext.Provider')
  return ctx
}
