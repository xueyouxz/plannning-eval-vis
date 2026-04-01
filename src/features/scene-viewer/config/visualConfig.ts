import type { MapLayerStyle } from '@/features/scene-viewer/data/types'

const OBJECT_CATEGORY_LABELS: Record<number, string> = {
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
  10: 'truck'
}

export interface DataLayerVisualConfig {
  key: string
  label: string
  color: string
  defaultVisible: boolean
  opacity: number
}

export interface MapLayerVisualConfig {
  key: string
  label: string
  style: MapLayerStyle
  defaultVisible: boolean
  fillOpacity: number
  strokeOpacity: number
}

export interface ObjectClassVisualConfig {
  id: number
  label: string
  color: string
  sceneFillOpacity: number
  cameraStrokeOpacity: number
}

export const DATA_LAYER_CONFIGS: DataLayerVisualConfig[] = [
  { key: 'pointcloud', label: 'Point Cloud', color: '#60a5fa', defaultVisible: true, opacity: 1 },
  { key: 'objects', label: 'Objects', color: '#3B82F6', defaultVisible: true, opacity: 0.66 },
  {
    key: 'ego_future_trajectory',
    label: 'Ego Future Trajectory',
    color: '#60a5fa',
    defaultVisible: true,
    opacity: 1
  },
  {
    key: 'object_future_trails',
    label: 'Object Future Trails',
    color: '#93c5fd',
    defaultVisible: true,
    opacity: 0.85
  }
]

export const MAP_LAYER_CONFIGS: MapLayerVisualConfig[] = [
  {
    key: 'drivable_area',
    label: 'Drivable Area',
    style: { fill: '#C8D8E8', stroke: '#7A9AB5' },
    defaultVisible: true,
    fillOpacity: 0.66,
    strokeOpacity: 0.9
  },
  {
    key: 'road_segment',
    label: 'Road Segment',
    style: { fill: '#D6D6D6', stroke: '#888888' },
    defaultVisible: true,
    fillOpacity: 0.42,
    strokeOpacity: 0.88
  },
  {
    key: 'lane',
    label: 'Lane',
    style: { fill: '#E8E0C8', stroke: '#B8A878' },
    defaultVisible: false,
    fillOpacity: 0.45,
    strokeOpacity: 0.9
  },
  {
    key: 'lane_connector',
    label: 'Lane Connector',
    style: { fill: '#F0D8A0', stroke: '#C8A840' },
    defaultVisible: false,
    fillOpacity: 0.5,
    strokeOpacity: 0.92
  },
  {
    key: 'ped_crossing',
    label: 'Ped Crossing',
    style: { fill: '#F0C8C8', stroke: '#D07070' },
    defaultVisible: true,
    fillOpacity: 0.5,
    strokeOpacity: 0.95
  },
  {
    key: 'walkway',
    label: 'Walkway',
    style: { fill: '#C8E8C8', stroke: '#70A870' },
    defaultVisible: true,
    fillOpacity: 0.42,
    strokeOpacity: 0.88
  },
  {
    key: 'stop_line',
    label: 'Stop Line',
    style: { fill: '#F08080', stroke: '#C83030' },
    defaultVisible: false,
    fillOpacity: 0.65,
    strokeOpacity: 1
  },
  {
    key: 'carpark_area',
    label: 'Carpark Area',
    style: { fill: '#E0C8F0', stroke: '#9060C0' },
    defaultVisible: true,
    fillOpacity: 0.45,
    strokeOpacity: 0.9
  }
]

export const MAP_LAYER_STYLE_MAP: Record<string, MapLayerStyle> = Object.fromEntries(
  MAP_LAYER_CONFIGS.map(layer => [layer.key, layer.style])
)

export const MAP_LAYER_VISUAL_MAP: Record<string, MapLayerVisualConfig> = Object.fromEntries(
  MAP_LAYER_CONFIGS.map(layer => [layer.key, layer])
)

const OBJECT_CLASS_CONFIGS: ObjectClassVisualConfig[] = [
  {
    id: 0,
    label: OBJECT_CATEGORY_LABELS[0],
    color: '#9CA3AF',
    sceneFillOpacity: 0.9,
    cameraStrokeOpacity: 0.64
  },
  {
    id: 1,
    label: OBJECT_CATEGORY_LABELS[1],
    color: '#6B7280',
    sceneFillOpacity: 0.92,
    cameraStrokeOpacity: 0.68
  },
  {
    id: 2,
    label: OBJECT_CATEGORY_LABELS[2],
    color: '#EAB308',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.76
  },
  {
    id: 3,
    label: OBJECT_CATEGORY_LABELS[3],
    color: '#A855F7',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.76
  },
  {
    id: 4,
    label: OBJECT_CATEGORY_LABELS[4],
    color: '#3B82F6',
    sceneFillOpacity: 0.96,
    cameraStrokeOpacity: 0.82
  },
  {
    id: 5,
    label: OBJECT_CATEGORY_LABELS[5],
    color: '#D97706',
    sceneFillOpacity: 0.95,
    cameraStrokeOpacity: 0.76
  },
  {
    id: 6,
    label: OBJECT_CATEGORY_LABELS[6],
    color: '#EC4899',
    sceneFillOpacity: 0.95,
    cameraStrokeOpacity: 0.76
  },
  {
    id: 7,
    label: OBJECT_CATEGORY_LABELS[7],
    color: '#22C55E',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.8
  },
  {
    id: 8,
    label: OBJECT_CATEGORY_LABELS[8],
    color: '#EF4444',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.82
  },
  {
    id: 9,
    label: OBJECT_CATEGORY_LABELS[9],
    color: '#8B5CF6',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.76
  },
  {
    id: 10,
    label: OBJECT_CATEGORY_LABELS[10],
    color: '#F97316',
    sceneFillOpacity: 0.94,
    cameraStrokeOpacity: 0.8
  }
]

const OBJECT_CLASS_VISUAL_MAP: Record<number, ObjectClassVisualConfig> = Object.fromEntries(
  OBJECT_CLASS_CONFIGS.map(item => [item.id, item])
)

const UNKNOWN_OBJECT_VISUAL: ObjectClassVisualConfig = {
  id: 0,
  label: OBJECT_CATEGORY_LABELS[0] ?? 'unknown',
  color: '#9CA3AF',
  sceneFillOpacity: 0.2,
  cameraStrokeOpacity: 0.64
}

export function getDataLayerConfig(key: string): DataLayerVisualConfig | null {
  return DATA_LAYER_CONFIGS.find(layer => layer.key === key) ?? null
}

export function getMapLayerConfig(key: string): MapLayerVisualConfig | null {
  return MAP_LAYER_VISUAL_MAP[key] ?? null
}

export function getObjectClassVisual(classId: number): ObjectClassVisualConfig {
  return OBJECT_CLASS_VISUAL_MAP[classId] ?? UNKNOWN_OBJECT_VISUAL
}

export function getObjectClassColor(classId: number): string {
  return getObjectClassVisual(classId).color
}

export function getObjectClassLabel(classId: number): string {
  return getObjectClassVisual(classId).label
}

export function buildDefaultVisibleLayers(): Record<string, boolean> {
  const visible = Object.fromEntries([
    ...DATA_LAYER_CONFIGS.map(layer => [layer.key, layer.defaultVisible]),
    ...MAP_LAYER_CONFIGS.map(layer => [layer.key, layer.defaultVisible])
  ]) as Record<string, boolean>

  return visible
}
