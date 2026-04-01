/**
 * trajectoryUtils.ts
 *
 * Pure geometric utilities for ego / planning trajectory analysis.
 * Extracted from MultiSceneTsneMap.tsx so they can be tested and reused
 * independently of D3 or React.
 */

export type Point = [number, number]

// ─── L2 error ────────────────────────────────────────────────────────────────

export type L2ErrorResult = {
  l2Errors: number[]
  avgError: number
  maxError: number
}

/**
 * Compute per-point L2 errors between a planning trajectory and the
 * corresponding ground-truth ego-pose segment.
 *
 * @param planningTrajectory  Predicted future waypoints for one planning frame.
 * @param groundTruthPoints   Full ego-pose trajectory in world space.
 * @param frameIndex          Index of the planning frame (used to align the
 *                            GT segment with the prediction horizon).
 */
export function calculateL2Errors(
  planningTrajectory: Point[],
  groundTruthPoints: Point[],
  frameIndex: number,
): L2ErrorResult {
  if (planningTrajectory.length === 0 || groundTruthPoints.length === 0) {
    return { l2Errors: [], avgError: 0, maxError: 0 }
  }

  const planLength = planningTrajectory.length
  const startIdx = Math.max(0, Math.min(frameIndex, groundTruthPoints.length - planLength))
  const endIdx = Math.min(startIdx + planLength, groundTruthPoints.length)
  const gtSegment = groundTruthPoints.slice(startIdx, endIdx)

  const l2Errors: number[] = []
  const minLength = Math.min(planLength, gtSegment.length)

  for (let i = 0; i < minLength; i += 1) {
    const dx = planningTrajectory[i][0] - gtSegment[i][0]
    const dy = planningTrajectory[i][1] - gtSegment[i][1]
    l2Errors.push(Math.sqrt(dx * dx + dy * dy))
  }

  const avgError = l2Errors.reduce((sum, v) => sum + v, 0) / (l2Errors.length || 1)
  const maxError = Math.max(...l2Errors, 0)

  return { l2Errors, avgError, maxError }
}

// ─── Normal vector ────────────────────────────────────────────────────────────

/**
 * Compute the unit normal to the polyline `points` at `index`.
 * Uses central differences for interior points and forward/backward
 * differences at the endpoints.
 *
 * @param side  'right' returns the right-hand normal (positive cross-product
 *              side), 'left' returns the opposite.
 */
export function calculateNormal(
  points: Point[],
  index: number,
  side: 'left' | 'right' = 'right',
): Point {
  let tangent: Point

  if (points.length === 1) {
    tangent = [1, 0]
  } else if (index === 0) {
    const dx = points[1][0] - points[0][0]
    const dy = points[1][1] - points[0][1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    tangent = [dx / len, dy / len]
  } else if (index === points.length - 1) {
    const dx = points[index][0] - points[index - 1][0]
    const dy = points[index][1] - points[index - 1][1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    tangent = [dx / len, dy / len]
  } else {
    const dx = points[index + 1][0] - points[index - 1][0]
    const dy = points[index + 1][1] - points[index - 1][1]
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    tangent = [dx / len, dy / len]
  }

  return side === 'right' ? [tangent[1], -tangent[0]] : [-tangent[1], tangent[0]]
}

// ─── Side determination ──────────────────────────────────────────────────────

/**
 * Determine whether a planning trajectory lies predominantly to the left or
 * right of the ego (ground-truth) trajectory by accumulating the cross-product
 * of the ego tangent and the vector toward each planning point.
 */
export function determineSide(planningPoints: Point[], egoPoints: Point[]): 'left' | 'right' {
  if (planningPoints.length === 0 || egoPoints.length === 0) return 'right'

  let crossProduct = 0
  const sampleCount = Math.min(5, planningPoints.length)

  for (let i = 0; i < sampleCount; i += 1) {
    const planPoint = planningPoints[i]
    let minDist = Number.POSITIVE_INFINITY
    let closestIdx = 0

    for (let j = 0; j < egoPoints.length; j += 1) {
      const dx = egoPoints[j][0] - planPoint[0]
      const dy = egoPoints[j][1] - planPoint[1]
      const dist = dx * dx + dy * dy
      if (dist < minDist) {
        minDist = dist
        closestIdx = j
      }
    }

    if (closestIdx < egoPoints.length - 1) {
      const egoTangent: Point = [
        egoPoints[closestIdx + 1][0] - egoPoints[closestIdx][0],
        egoPoints[closestIdx + 1][1] - egoPoints[closestIdx][1],
      ]
      const toPlan: Point = [
        planPoint[0] - egoPoints[closestIdx][0],
        planPoint[1] - egoPoints[closestIdx][1],
      ]
      crossProduct += egoTangent[0] * toPlan[1] - egoTangent[1] * toPlan[0]
    }
  }

  return crossProduct > 0 ? 'left' : 'right'
}

// ─── Planning frame → midrib attachment ──────────────────────────────────────

/**
 * Given a planning trajectory (in world space) and the arc-length parameter
 * array of the midrib spine (in pixel space after scale), find the best
 * attachment parameter `t` on the midrib for this leaf.
 *
 * Strategy: project the centroid of the planning trajectory onto the midrib
 * by finding the ego-pose point closest to the centroid, then map that index
 * to a `t` value.
 *
 * @param planningPoints  Planning waypoints in world space.
 * @param egoPoints       Ego-pose points in world space (same coordinate system).
 * @returns               Normalised arc-length parameter `t ∈ [0, 1]`.
 */
export function planningAttachmentT(planningPoints: Point[], egoPoints: Point[]): number {
  if (planningPoints.length === 0 || egoPoints.length === 0) return 0.5

  // Centroid of the planning frame.
  const cx = planningPoints.reduce((s, p) => s + p[0], 0) / planningPoints.length
  const cy = planningPoints.reduce((s, p) => s + p[1], 0) / planningPoints.length

  // Closest ego-pose index.
  let minDist = Number.POSITIVE_INFINITY
  let closestIdx = 0
  for (let j = 0; j < egoPoints.length; j += 1) {
    const dx = egoPoints[j][0] - cx
    const dy = egoPoints[j][1] - cy
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      closestIdx = j
    }
  }

  return closestIdx / Math.max(egoPoints.length - 1, 1)
}
