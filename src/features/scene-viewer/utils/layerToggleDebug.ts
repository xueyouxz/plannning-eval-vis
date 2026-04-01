import { DATA_LAYER_CONFIGS } from '@/features/scene-viewer/config/visualConfig'

export function getLayerToggleDebugUpdateImpact(
  previousVisibleLayers: Record<string, boolean>,
  nextVisibleLayers: Record<string, boolean>,
): string[] {
  const changedKeys = new Set<string>()

  for (const key of Object.keys({ ...previousVisibleLayers, ...nextVisibleLayers })) {
    if ((previousVisibleLayers[key] ?? false) !== (nextVisibleLayers[key] ?? false)) {
      changedKeys.add(key)
    }
  }

  return DATA_LAYER_CONFIGS.filter((layer) => changedKeys.has(layer.key)).map((layer) => layer.key)
}
