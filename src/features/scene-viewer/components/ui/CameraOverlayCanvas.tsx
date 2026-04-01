import { memo, useLayoutEffect, useRef, useState } from 'react'
import { drawPseudo3DWireframes } from '@/features/scene-viewer/utils/pseudo3DWireframe'
import type { OverlayFitMode, ProjectedBox3DWireframe, ProjectedPoint2D } from '@/features/scene-viewer/types/cameraOverlay'

interface CameraOverlayCanvasProps {
  boxes: ProjectedBox3DWireframe[]
  sourceWidth: number
  sourceHeight: number
  fitMode: OverlayFitMode
  selectedTrackId: number | null
  className?: string
}

interface ViewportTransform {
  scale: number
  offsetX: number
  offsetY: number
}

function getViewportTransform(
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fitMode: OverlayFitMode,
): ViewportTransform {
  if (containerWidth <= 0 || containerHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }

  const scale = fitMode === 'cover'
    ? Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight)
    : Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight)

  const renderWidth = sourceWidth * scale
  const renderHeight = sourceHeight * scale

  return {
    scale,
    offsetX: (containerWidth - renderWidth) / 2,
    offsetY: (containerHeight - renderHeight) / 2,
  }
}

function CameraOverlayCanvasComponent({
  boxes,
  sourceWidth,
  sourceHeight,
  fitMode,
  selectedTrackId,
  className,
}: CameraOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const scaledBoxesRef = useRef<ProjectedBox3DWireframe[]>([])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.parentElement) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nextWidth = Math.round(entry.contentRect.width)
      const nextHeight = Math.round(entry.contentRect.height)
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev
        return { width: nextWidth, height: nextHeight }
      })
    })

    observer.observe(canvas.parentElement)

    return () => {
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width <= 0 || size.height <= 0) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(size.width * dpr))
    canvas.height = Math.max(1, Math.floor(size.height * dpr))

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    const { scale, offsetX, offsetY } = getViewportTransform(
      size.width,
      size.height,
      sourceWidth,
      sourceHeight,
      fitMode,
    )

    const scaledBoxes = scaledBoxesRef.current
    scaledBoxes.length = boxes.length

    for (let boxIdx = 0; boxIdx < boxes.length; boxIdx++) {
      const sourceBox = boxes[boxIdx]
      const scaledBox = scaledBoxes[boxIdx] ?? {
        trackId: sourceBox.trackId,
        classId: sourceBox.classId,
        depth: sourceBox.depth,
        points: new Array<ProjectedPoint2D | null>(sourceBox.points.length).fill(null),
      }

      scaledBox.trackId = sourceBox.trackId
      scaledBox.classId = sourceBox.classId
      scaledBox.depth = sourceBox.depth

      if (scaledBox.points.length !== sourceBox.points.length) {
        scaledBox.points.length = sourceBox.points.length
      }

      for (let pointIdx = 0; pointIdx < sourceBox.points.length; pointIdx++) {
        const sourcePoint = sourceBox.points[pointIdx]

        if (!sourcePoint) {
          scaledBox.points[pointIdx] = null
          continue
        }

        const targetPoint = scaledBox.points[pointIdx]
        if (!targetPoint) {
          scaledBox.points[pointIdx] = {
            u: sourcePoint.u * scale + offsetX,
            v: sourcePoint.v * scale + offsetY,
            depth: sourcePoint.depth,
          }
          continue
        }

        targetPoint.u = sourcePoint.u * scale + offsetX
        targetPoint.v = sourcePoint.v * scale + offsetY
        targetPoint.depth = sourcePoint.depth
      }

      scaledBoxes[boxIdx] = scaledBox
    }

    drawPseudo3DWireframes(ctx, scaledBoxes, { selectedTrackId })
  }, [boxes, fitMode, selectedTrackId, size.height, size.width, sourceHeight, sourceWidth])

  return <canvas ref={canvasRef} className={className} />
}

export const CameraOverlayCanvas = memo(CameraOverlayCanvasComponent)
