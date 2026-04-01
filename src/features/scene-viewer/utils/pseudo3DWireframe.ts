import { getObjectClassVisual } from '@/features/scene-viewer/config/visualConfig'
import type {
  ProjectedBox3DWireframe,
  ProjectedPoint2D
} from '@/features/scene-viewer/types/cameraOverlay'

type FaceIndices = [number, number, number, number]
type EdgePair = [number, number]

const BOX_FACE_INDICES: FaceIndices[] = [
  [0, 1, 2, 3],
  [4, 7, 6, 5],
  [0, 4, 5, 1],
  [2, 6, 7, 3],
  [3, 7, 4, 0],
  [1, 5, 6, 2]
]

const BOX_EDGE_PAIRS: EdgePair[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
]

interface WireframeDrawOptions {
  selectedTrackId?: number | null
  near?: number
  far?: number
}

function isFaceVisible(points: Array<ProjectedPoint2D | null>, faceIdx: FaceIndices): boolean {
  const [a, b, c, d] = faceIdx
  const pa = points[a]
  const pb = points[b]
  const pc = points[c]
  const pd = points[d]
  if (!pa || !pb || !pc || !pd) return false

  const cross =
    (pb.u - pa.u) * (pc.v - pa.v) -
    (pb.v - pa.v) * (pc.u - pa.u) +
    (pd.u - pc.u) * (pa.v - pc.v) -
    (pd.v - pc.v) * (pa.u - pc.u)

  return cross > 0
}

function computeLineWidth(
  depth: number,
  near: number,
  far: number,
  maxW: number,
  minW: number
): number {
  const t = Math.min(Math.max((depth - near) / (far - near), 0), 1)
  return maxW - t * (maxW - minW)
}

function drawSinglePseudo3DBox(
  ctx: CanvasRenderingContext2D,
  box: ProjectedBox3DWireframe,
  near: number,
  far: number,
  selectedTrackId: number | null
): void {
  const classVisual = getObjectClassVisual(box.classId)
  const color = classVisual.color
  const isSelected = selectedTrackId !== null && box.trackId === selectedTrackId
  const lineW = computeLineWidth(box.depth, near, far, isSelected ? 4.5 : 3.5, isSelected ? 1 : 0.6)
  const visibleEdgeSet = new Set<string>()

  for (const face of BOX_FACE_INDICES) {
    if (!isFaceVisible(box.points, face)) continue
    const faceEdges: EdgePair[] = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[3]],
      [face[3], face[0]]
    ]
    for (const [a, b] of faceEdges) {
      visibleEdgeSet.add(`${Math.min(a, b)}-${Math.max(a, b)}`)
    }
  }

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = lineW

  for (const [a, b] of BOX_EDGE_PAIRS) {
    const pa = box.points[a]
    const pb = box.points[b]
    if (!pa || !pb) continue

    const edgeKey = `${Math.min(a, b)}-${Math.max(a, b)}`
    const bothVisible = visibleEdgeSet.has(edgeKey)

    ctx.beginPath()
    ctx.moveTo(pa.u, pa.v)
    ctx.lineTo(pb.u, pb.v)

    if (bothVisible) {
      ctx.strokeStyle = isSelected
        ? '#ffffff'
        : `${color}${Math.round(classVisual.cameraStrokeOpacity * 255)
            .toString(16)
            .padStart(2, '0')}`
      ctx.setLineDash([])
    } else {
      const hiddenOpacity = Math.max(classVisual.cameraStrokeOpacity * 0.55, 0.2)
      ctx.strokeStyle = isSelected
        ? '#ffffffaa'
        : `${color}${Math.round(hiddenOpacity * 255)
            .toString(16)
            .padStart(2, '0')}`
      ctx.setLineDash([6, 4])
    }

    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.restore()
}

export function drawPseudo3DWireframes(
  ctx: CanvasRenderingContext2D,
  boxes: ProjectedBox3DWireframe[],
  options: WireframeDrawOptions = {}
): void {
  const near = options.near ?? 1
  const far = options.far ?? 80
  const selectedTrackId = options.selectedTrackId ?? null

  for (const box of boxes) {
    drawSinglePseudo3DBox(ctx, box, near, far, selectedTrackId)
  }
}
