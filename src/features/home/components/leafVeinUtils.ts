/**
 * leafVeinUtils.ts
 *
 * Geometric and colour utilities for the leaf-vein trajectory visualisation.
 *
 * Mental model
 * ─────────────
 *   Leaf blade   → a single planning-frame trajectory
 *   Midrib       → the ego (ground-truth) trajectory
 *   Lateral vein → the planning trajectory centre-line drawn on top of the blade
 *
 * All geometry is expressed in the scene's local SVG pixel space
 * (after xScale / yScale have been applied).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Pt = { x: number; y: number }

/** One node sampled along the arc-length-parameterised midrib. */
export type MidribNode = {
  /** Pixel position on the midrib. */
  x: number
  y: number
  /** Arc-length parameter in [0, 1]. */
  t: number
  /** Tangent angle (radians, measured from positive-x axis). */
  angle: number
}

// ─── Colour palette (green → withered brown) ────────────────────────────────

/**
 * 11-stop colour ramp lifted verbatim from the reference leaf-vein demo.
 * Index 0 = fresh green, index 10 = withered brown.
 */
const COLOR_STOPS: [number, number, number][] = [
  [56, 142, 60],
  [76, 153, 48],
  [104, 159, 56],
  [139, 160, 46],
  [175, 155, 45],
  [200, 140, 42],
  [210, 120, 48],
  [195, 98, 44],
  [170, 78, 42],
  [142, 68, 48],
  [120, 72, 52],
]

/**
 * Interpolate the colour ramp at position `t ∈ [0, 1]`.
 * Returns an `[r, g, b]` triple.
 */
export function sampleColorRamp(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t))
  const n = COLOR_STOPS.length - 1
  const x = clamped * n
  const i = Math.min(Math.floor(x), n - 1)
  const f = x - i
  const a = COLOR_STOPS[i]
  const b = COLOR_STOPS[i + 1]
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

/** Darken an RGB triple by factor `f` (0 = black, 1 = original). */
export function darken(c: [number, number, number], f: number): [number, number, number] {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)]
}

/** Lighten an RGB triple toward white by factor `f` (0 = original, 1 = white). */
export function lighten(c: [number, number, number], f: number): [number, number, number] {
  return [
    Math.min(255, Math.round(c[0] + (255 - c[0]) * f)),
    Math.min(255, Math.round(c[1] + (255 - c[1]) * f)),
    Math.min(255, Math.round(c[2] + (255 - c[2]) * f)),
  ]
}

/** Format an RGB triple as a CSS rgba() string. */
export function toRgba(c: [number, number, number], alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}

/**
 * Map a planning average-L2 error to a colour-ramp position in [0, 1].
 *
 * @param avgError  Average L2 error in metres.
 * @param normMax   Error value that maps to `colorT = 1` (fully withered).
 */
export function errorToColorT(avgError: number, normMax: number): number {
  return Math.max(0, Math.min(1, avgError / Math.max(normMax, 1e-6)))
}

// ─── Teardrop SVG path ───────────────────────────────────────────────────────

/**
 * Leaf-shape constants (mirror the reference demo values).
 * Exposed so callers can override per-instance if needed.
 */
export const LEAF_SHAPE = {
  BULB: 0.2,   // relative half-width at the widest point
  TIP: 0.02,   // tip narrowing factor
  ROUND: 0.1,  // base rounding factor
  BPOS: 0.35,  // bulge position (fraction of half-length from base)
} as const

/**
 * Build a teardrop SVG path string in the leaf's **local coordinate system**.
 *
 * The leaf is centred at the origin:
 *   - tip   → (0, -ll/2)
 *   - base  → (0, +ll/2)
 *   - widest point at ±w = ±(lw * BULB) at y ≈ h * BPOS
 *
 * @param ll  Full length of the leaf (pixels).
 * @param lw  Full width of the leaf (pixels).
 */
export function teardropPath(ll: number, lw: number): string {
  const h = ll / 2
  const w = lw * LEAF_SHAPE.BULB
  const { TIP, BPOS, ROUND } = LEAF_SHAPE

  // SVG path using cubic Bézier segments (same geometry as the Canvas demo).
  return [
    `M 0 ${-h}`,
    `C ${w * TIP} ${-h * 0.55}, ${w} ${h * 0.15}, ${w} ${h * BPOS}`,
    `C ${w} ${h * 0.82}, ${w * ROUND} ${h}, 0 ${h}`,
    `C ${-w * ROUND} ${h}, ${-w} ${h * 0.82}, ${-w} ${h * BPOS}`,
    `C ${-w} ${h * 0.15}, ${-w * TIP} ${-h * 0.55}, 0 ${-h}`,
    'Z',
  ].join(' ')
}

// ─── Arc-length parameterisation ────────────────────────────────────────────

/**
 * Build an arc-length-parameterised spine from a polyline.
 *
 * Returns an array of `MidribNode` objects uniformly distributed by arc length,
 * each carrying its (x, y) position, parameter `t ∈ [0, 1]`, and tangent angle.
 *
 * @param pixelPoints  Points already projected to pixel space: [[px, py], …]
 * @param sampleCount  Number of uniformly-spaced nodes to emit.
 */
export function buildMidribNodes(
  pixelPoints: [number, number][],
  sampleCount: number,
): MidribNode[] {
  if (pixelPoints.length < 2) return []

  // 1. Compute cumulative arc lengths along the raw polyline.
  const cumLen: number[] = [0]
  for (let i = 1; i < pixelPoints.length; i++) {
    const dx = pixelPoints[i][0] - pixelPoints[i - 1][0]
    const dy = pixelPoints[i][1] - pixelPoints[i - 1][1]
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy))
  }
  const totalLen = cumLen[cumLen.length - 1]
  if (totalLen < 1e-6) return []

  // 2. Sample `sampleCount` evenly-spaced positions along the arc.
  const nodes: MidribNode[] = []
  for (let s = 0; s <= sampleCount; s++) {
    const targetLen = (s / sampleCount) * totalLen

    // Binary-search for the segment containing targetLen.
    let lo = 0
    let hi = cumLen.length - 2
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumLen[mid + 1] < targetLen) lo = mid + 1
      else hi = mid
    }

    const segLen = cumLen[lo + 1] - cumLen[lo]
    const frac = segLen < 1e-9 ? 0 : (targetLen - cumLen[lo]) / segLen
    const p0 = pixelPoints[lo]
    const p1 = pixelPoints[lo + 1] ?? pixelPoints[lo]

    const x = p0[0] + (p1[0] - p0[0]) * frac
    const y = p0[1] + (p1[1] - p0[1]) * frac
    const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0])

    nodes.push({ x, y, t: targetLen / totalLen, angle })
  }

  return nodes
}

// ─── Leaf geometry helpers ───────────────────────────────────────────────────

/**
 * Compute the SVG `transform` attribute string that places a leaf blade
 * at a midrib node, fanning out to the given side.
 *
 * Mirrors the Canvas demo sequence:
 *   translate(node.x, node.y) → rotate(rot) → translate(0, ll/2)
 *
 * @param node        Midrib node (attachment point).
 * @param ll          Leaf length in pixels.
 * @param side        +1 = right of travel direction, -1 = left.
 * @param spreadRad   Fan-out angle in radians.
 */
export function leafTransform(
  node: MidribNode,
  ll: number,
  side: 1 | -1,
  spreadRad: number,
): string {
  const outAngle = node.angle + side * (Math.PI / 2 - spreadRad)
  const rotDeg = ((outAngle - Math.PI / 2) * 180) / Math.PI
  return `translate(${node.x},${node.y}) rotate(${rotDeg}) translate(0,${ll / 2})`
}

/**
 * Compute leaf length using the same envelope function as the reference demo:
 *   env = sin(t·π) · (1 − 0.18·t)
 *
 * This makes leaves near the midrib ends smaller than those in the middle.
 *
 * @param t         Arc-length parameter of the attachment node ∈ [0, 1].
 * @param baseLen   Base leaf length in pixels (maps to `SIZE` in the demo).
 */
export function leafLength(t: number, baseLen: number): number {
  const env = Math.sin(t * Math.PI) * (1 - 0.18 * t)
  return Math.max(4, (0.26 + 0.74 * env) * baseLen)
}
