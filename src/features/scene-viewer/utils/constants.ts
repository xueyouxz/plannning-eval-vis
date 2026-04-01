import { MAP_LAYER_STYLE_MAP } from '@/features/scene-viewer/config/visualConfig'
import type { MapLayerStyle } from '../data/types'

// ── Camera channels (in display order) ────────────────────────────────────────
export const CAMERA_CHANNELS: string[] = [
  'CAM_FRONT',
  'CAM_FRONT_LEFT',
  'CAM_FRONT_RIGHT',
  'CAM_BACK',
  'CAM_BACK_LEFT',
  'CAM_BACK_RIGHT',
]

// ── Category names (CLASS_ID → human-readable) ─────────────────────────────────
export const CATEGORY_NAMES: Record<number, string> = {
  0: 'unknown',
  1: 'barrier',
  2: 'bicycle',
  3: 'bus',
  4: 'car',
  5: 'construction_vehicle',
  6: 'motorcycle',
  7: 'pedestrian',
  8: 'traffic_cone',
  9: 'trailer',
  10: 'truck',
}

export const MAP_LAYER_COLORS: Record<string, MapLayerStyle> = MAP_LAYER_STYLE_MAP

// ── Default scene URL (relative to public/) ────────────────────────────────────
export const DEFAULT_SCENE_URL = '/data/scene-viewer/scene-0916/'
