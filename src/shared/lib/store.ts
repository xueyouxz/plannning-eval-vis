import { create } from 'zustand'

// ─── App-wide store ──────────────────────────────────────────────────────────
// Add slices here as the app grows. For now this is the minimal shell that
// replaces the previous Redux store without breaking existing imports.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type AppState = {
  // placeholder — extend with real state as features are added
}

export const useAppStore = create<AppState>()(() => ({}))
