/**
 * Coordinate transform utilities for nusviz data.
 *
 * ## nuScenes/nusviz 坐标系方向约定
 *
 * | 数据来源 | 矩阵方向（正向存储） | 含义 | 投影时动作 |
 * |---|---|---|---|
 * | `ego_pose.rotation` | T_ego_world: Ego → World | 自车在地图中的朝向 | 取逆 → World → Ego |
 * | `calibrated_sensor.rotation` | T_cam_ego: Sensor → Ego | 相机在车体中的朝向 | 取逆 → Ego → Sensor |
 *
 * 投影链（世界 → 图像）：
 *   T_world_ego = (T_ego_world)⁻¹
 *   T_ego_cam   = (T_cam_ego)⁻¹
 *   T_world_cam = T_ego_cam × T_world_ego
 *   p_image ~ K × T_world_cam × p_world
 *
 * 对于正交旋转矩阵，矩阵的逆 = 其转置。
 * 对于单位四元数，四元数的逆 = [−w, x, y, z]（Three.js Quaternion.invert()）。
 */

import { CATEGORY_NAMES } from './constants'
import { getObjectClassColor } from '@/features/scene-viewer/config/visualConfig'

/**
 * Convert nusviz/nuScenes quaternion [w, x, y, z] to Three.js order [x, y, z, w].
 * Three.js Quaternion.set() signature: (x, y, z, w)
 */
export function wxyzToXyzw(
  q: [number, number, number, number],
): [number, number, number, number] {
  const [w, x, y, z] = q
  return [x, y, z, w]
}

/**
 * Map a CLASS_ID to a hex colour string for rendering.
 */
export function categoryColor(classId: number): string {
  return getObjectClassColor(classId)
}

/**
 * Return the human-readable category name for a CLASS_ID.
 */
export function categoryName(classId: number): string {
  return CATEGORY_NAMES[classId] ?? 'unknown'
}


