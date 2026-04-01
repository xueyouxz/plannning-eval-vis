import * as THREE from 'three'

const EPS = 1e-5
const DEFAULT_MITER_LIMIT = 2.8
const DEFAULT_CAP_SEGMENTS = 6
const MAX_LOCAL_POINTS = 4096

const acceptedPointOffsets = new Int32Array(MAX_LOCAL_POINTS)

export interface TrajectoryMeshBuffers {
  positions: Float32Array
  colors: Float32Array
  indices: Uint32Array
  vertexCount: number
  indexCount: number
}

export interface AppendThickPolylineOptions {
  points: Float32Array<ArrayBufferLike>
  startPointIndex: number
  pointCount: number
  halfWidth: number
  zOffset: number
  color: THREE.Color
  buffers: TrajectoryMeshBuffers
  miterLimit?: number
  capSegments?: number
}

function writeVertex(
  buffers: TrajectoryMeshBuffers,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
): number {
  const vertexIndex = buffers.vertexCount
  const posBase = vertexIndex * 3

  buffers.positions[posBase] = x
  buffers.positions[posBase + 1] = y
  buffers.positions[posBase + 2] = z

  buffers.colors[posBase] = color.r
  buffers.colors[posBase + 1] = color.g
  buffers.colors[posBase + 2] = color.b

  buffers.vertexCount++
  return vertexIndex
}

function writeTriangle(buffers: TrajectoryMeshBuffers, a: number, b: number, c: number) {
  const indexBase = buffers.indexCount
  buffers.indices[indexBase] = a
  buffers.indices[indexBase + 1] = b
  buffers.indices[indexBase + 2] = c
  buffers.indexCount += 3
}

function writeArcCap(
  buffers: TrajectoryMeshBuffers,
  centerX: number,
  centerY: number,
  centerZ: number,
  startAngle: number,
  endAngle: number,
  radius: number,
  capSegments: number,
  color: THREE.Color,
): void {
  const center = writeVertex(buffers, centerX, centerY, centerZ, color)

  let previous = -1
  for (let i = 0; i <= capSegments; i++) {
    const t = i / capSegments
    const angle = startAngle + (endAngle - startAngle) * t
    const vx = centerX + Math.cos(angle) * radius
    const vy = centerY + Math.sin(angle) * radius
    const current = writeVertex(buffers, vx, vy, centerZ, color)

    if (previous !== -1) {
      writeTriangle(buffers, center, previous, current)
    }

    previous = current
  }
}

function getPoint(points: Float32Array<ArrayBufferLike>, offset: number): [number, number, number] {
  return [points[offset], points[offset + 1], points[offset + 2]]
}

export function createTrajectoryMeshBuffers(maxVertices: number, maxIndices: number): TrajectoryMeshBuffers {
  return {
    positions: new Float32Array(maxVertices * 3),
    colors: new Float32Array(maxVertices * 3),
    indices: new Uint32Array(maxIndices),
    vertexCount: 0,
    indexCount: 0,
  }
}

export function resetTrajectoryMeshBuffers(buffers: TrajectoryMeshBuffers): void {
  buffers.vertexCount = 0
  buffers.indexCount = 0
}

/**
 * Append one 2D thick polyline ribbon mesh (with miter join + round caps) into shared buffers.
 * Returns false when capacity is insufficient.
 */
export function appendThickPolyline(options: AppendThickPolylineOptions): boolean {
  const {
    points,
    startPointIndex,
    pointCount,
    halfWidth,
    zOffset,
    color,
    buffers,
    miterLimit = DEFAULT_MITER_LIMIT,
    capSegments = DEFAULT_CAP_SEGMENTS,
  } = options

  if (pointCount < 2 || halfWidth <= 0) return true

  let acceptedCount = 0
  const firstOffset = startPointIndex * 3
  acceptedPointOffsets[acceptedCount++] = firstOffset

  let previousX = points[firstOffset]
  let previousY = points[firstOffset + 1]

  for (let i = 1; i < pointCount && acceptedCount < MAX_LOCAL_POINTS; i++) {
    const offset = (startPointIndex + i) * 3
    const x = points[offset]
    const y = points[offset + 1]

    if (Math.hypot(x - previousX, y - previousY) < EPS) {
      continue
    }

    acceptedPointOffsets[acceptedCount++] = offset
    previousX = x
    previousY = y
  }

  if (acceptedCount < 2) return true

  const mainVertexCount = acceptedCount * 2
  const mainIndexCount = (acceptedCount - 1) * 6
  const capVertexCount = (capSegments + 2) * 2
  const capIndexCount = capSegments * 3 * 2
  const requiredVertices = mainVertexCount + capVertexCount
  const requiredIndices = mainIndexCount + capIndexCount

  const remainingVertices = buffers.positions.length / 3 - buffers.vertexCount
  const remainingIndices = buffers.indices.length - buffers.indexCount

  if (remainingVertices < requiredVertices || remainingIndices < requiredIndices) {
    return false
  }

  const baseVertex = buffers.vertexCount

  for (let i = 0; i < acceptedCount; i++) {
    const currentOffset = acceptedPointOffsets[i]
    const [px, py, pzRaw] = getPoint(points, currentOffset)
    const pz = pzRaw + zOffset

    const previousOffset = i > 0 ? acceptedPointOffsets[i - 1] : currentOffset
    const nextOffset = i < acceptedCount - 1 ? acceptedPointOffsets[i + 1] : currentOffset

    let prevDx = px - points[previousOffset]
    let prevDy = py - points[previousOffset + 1]
    let nextDx = points[nextOffset] - px
    let nextDy = points[nextOffset + 1] - py

    let prevLength = Math.hypot(prevDx, prevDy)
    let nextLength = Math.hypot(nextDx, nextDy)

    if (prevLength < EPS && nextLength < EPS) {
      continue
    }

    if (prevLength < EPS) {
      prevDx = nextDx
      prevDy = nextDy
      prevLength = nextLength
    }

    if (nextLength < EPS) {
      nextDx = prevDx
      nextDy = prevDy
      nextLength = prevLength
    }

    const prevTx = prevDx / Math.max(prevLength, EPS)
    const prevTy = prevDy / Math.max(prevLength, EPS)
    const nextTx = nextDx / Math.max(nextLength, EPS)
    const nextTy = nextDy / Math.max(nextLength, EPS)

    const prevNx = -prevTy
    const prevNy = prevTx
    const nextNx = -nextTy
    const nextNy = nextTx

    let offsetX = 0
    let offsetY = 0

    if (i === 0) {
      offsetX = nextNx * halfWidth
      offsetY = nextNy * halfWidth
    } else if (i === acceptedCount - 1) {
      offsetX = prevNx * halfWidth
      offsetY = prevNy * halfWidth
    } else {
      let miterX = prevNx + nextNx
      let miterY = prevNy + nextNy
      const miterNorm = Math.hypot(miterX, miterY)

      if (miterNorm < EPS) {
        offsetX = nextNx * halfWidth
        offsetY = nextNy * halfWidth
      } else {
        miterX /= miterNorm
        miterY /= miterNorm

        const denom = miterX * nextNx + miterY * nextNy
        if (Math.abs(denom) < EPS || denom <= 0) {
          offsetX = nextNx * halfWidth
          offsetY = nextNy * halfWidth
        } else {
          const miterLength = Math.min(halfWidth / denom, halfWidth * miterLimit)
          offsetX = miterX * miterLength
          offsetY = miterY * miterLength
        }
      }
    }

    writeVertex(buffers, px + offsetX, py + offsetY, pz, color)
    writeVertex(buffers, px - offsetX, py - offsetY, pz, color)
  }

  for (let i = 0; i < acceptedCount - 1; i++) {
    const a = baseVertex + i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3

    writeTriangle(buffers, a, b, c)
    writeTriangle(buffers, b, d, c)
  }

  const startOffset = acceptedPointOffsets[0]
  const [startX, startY, startZRaw] = getPoint(points, startOffset)
  const startZ = startZRaw + zOffset

  const secondOffset = acceptedPointOffsets[1]
  const startTx = points[secondOffset] - startX
  const startTy = points[secondOffset + 1] - startY
  const startAngle = Math.atan2(startTy, startTx)

  // Start cap: right -> left through backward hemisphere
  writeArcCap(
    buffers,
    startX,
    startY,
    startZ,
    startAngle - Math.PI / 2,
    startAngle - (Math.PI / 2 + Math.PI),
    halfWidth,
    capSegments,
    color,
  )

  const endOffset = acceptedPointOffsets[acceptedCount - 1]
  const [endX, endY, endZRaw] = getPoint(points, endOffset)
  const endZ = endZRaw + zOffset

  const previousToEndOffset = acceptedPointOffsets[acceptedCount - 2]
  const endTx = endX - points[previousToEndOffset]
  const endTy = endY - points[previousToEndOffset + 1]
  const endAngle = Math.atan2(endTy, endTx)

  // End cap: left -> right through forward hemisphere
  writeArcCap(
    buffers,
    endX,
    endY,
    endZ,
    endAngle + Math.PI / 2,
    endAngle - Math.PI / 2,
    halfWidth,
    capSegments,
    color,
  )

  return true
}
