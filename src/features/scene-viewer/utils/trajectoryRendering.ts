import type { MetadataResult } from '@/features/scene-viewer/data/types'

export const DEFAULT_FUTURE_TRAJECTORY_SECONDS = 3
export const MIN_FUTURE_TRAJECTORY_SECONDS = 1
export const MAX_FUTURE_TRAJECTORY_SECONDS = 8

export const TRAJECTORY_STATIONARY_DISPLACEMENT_M = 0.3

const FALLBACK_SAMPLE_RATE_HZ = 2

export function clampFutureTrajectorySeconds(seconds: number): number {
  return Math.min(
    MAX_FUTURE_TRAJECTORY_SECONDS,
    Math.max(MIN_FUTURE_TRAJECTORY_SECONDS, seconds),
  )
}

export function estimateFrameRateHz(metadata: MetadataResult | null): number {
  if (!metadata) return FALLBACK_SAMPLE_RATE_HZ

  const duration = metadata.logInfo.end_time - metadata.logInfo.start_time
  if (duration <= 0 || metadata.totalFrames <= 1) return FALLBACK_SAMPLE_RATE_HZ

  const hz = (metadata.totalFrames - 1) / duration
  if (!Number.isFinite(hz) || hz <= 0) return FALLBACK_SAMPLE_RATE_HZ

  return Math.min(30, Math.max(1, hz))
}

export function resolveFuturePointCount(
  totalPoints: number,
  seconds: number,
  metadata: MetadataResult | null,
): number {
  if (totalPoints <= 0) return 0

  const clampedSeconds = clampFutureTrajectorySeconds(seconds)
  const estimatedHz = estimateFrameRateHz(metadata)
  const pointsBySeconds = Math.floor(clampedSeconds * estimatedHz) + 1

  return Math.min(totalPoints, Math.max(1, pointsBySeconds))
}

export function isStationaryByPointDisplacement(
  points: Float32Array<ArrayBufferLike>,
  startPointIndex: number,
  endPointIndex: number,
  thresholdMeters = TRAJECTORY_STATIONARY_DISPLACEMENT_M,
): boolean {
  if (startPointIndex < 0 || endPointIndex < 0 || endPointIndex <= startPointIndex) {
    return true
  }

  const start = startPointIndex * 3
  const end = endPointIndex * 3
  const dx = points[end] - points[start]
  const dy = points[end + 1] - points[start + 1]
  const displacement = Math.hypot(dx, dy)

  return displacement < thresholdMeters
}

export function hasFiniteTrajectoryPoints(
  points: Float32Array<ArrayBufferLike>,
  startPointIndex: number,
  pointCount: number,
): boolean {
  if (pointCount < 2 || startPointIndex < 0) return false

  for (let i = 0; i < pointCount; i++) {
    const a = (startPointIndex + i) * 3
    const x = points[a]
    const y = points[a + 1]
    const z = points[a + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false
    }
  }

  return true
}
