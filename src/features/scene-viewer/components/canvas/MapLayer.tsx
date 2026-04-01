import { useMemo, useEffect, memo } from 'react'
import * as THREE from 'three'
import { useSceneContext } from '../../context/SceneContext'
import { useSceneStore } from '../../store/sceneStore'
import { MAP_LAYER_VISUAL_MAP } from '@/features/scene-viewer/config/visualConfig'

/**
 * Renders all map polygon layers from metadata.
 * Each layer is a merged fill mesh + edge line segments.
 * Memoised — only recomputes when metadata changes.
 */
export const MapLayer = memo(function MapLayer() {
  const { metadata } = useSceneContext()
  const visibleLayers = useSceneStore((s) => s.visibleLayers)

  const layerGeometries = useMemo(() => {
    const result: Record<
      string,
      { fillGeo: THREE.BufferGeometry; edgeGeo: THREE.BufferGeometry }
    > = {}

    for (const [layerName, layerData] of Object.entries(metadata.mapLayers)) {
      const { vertices, counts } = layerData

      // Split flat vertex array into per-polygon arrays using counts
      const polygons: [number, number][][] = []
      let offset = 0
      for (let p = 0; p < counts.length; p++) {
        const n = counts[p]
        const poly: [number, number][] = []
        for (let i = 0; i < n; i++) {
          poly.push([vertices[(offset + i) * 3], vertices[(offset + i) * 3 + 1]])
        }
        polygons.push(poly)
        offset += n
      }

      if (polygons.length === 0) continue

      // ── Build fill geometry via ShapeGeometry per polygon ──────────────
      const fillGeoms: THREE.BufferGeometry[] = []
      const edgePositions: number[] = []

      for (const poly of polygons) {
        if (poly.length < 3) continue

        // Fill via ShapeGeometry (triangulated)
        const shape = new THREE.Shape()
        shape.moveTo(poly[0][0], poly[0][1])
        for (let i = 1; i < poly.length; i++) {
          shape.lineTo(poly[i][0], poly[i][1])
        }
        shape.closePath()

        const shapeGeo = new THREE.ShapeGeometry(shape)
        // ShapeGeometry is in XY; we want Z=0 in world space — keep as is
        fillGeoms.push(shapeGeo)

        // Edge: line loop around the polygon
        for (let i = 0; i < poly.length; i++) {
          const next = (i + 1) % poly.length
          edgePositions.push(poly[i][0], poly[i][1], 0.02) // slight Z offset
          edgePositions.push(poly[next][0], poly[next][1], 0.02)
        }
      }

      // Merge fill geometries
      let fillGeo: THREE.BufferGeometry
      if (fillGeoms.length === 0) {
        fillGeo = new THREE.BufferGeometry()
      } else if (fillGeoms.length === 1) {
        fillGeo = fillGeoms[0]
      } else {
        // Manual merge: concatenate position and index buffers
        fillGeo = mergeGeometries(fillGeoms)
        fillGeoms.forEach((g) => g.dispose())
      }

      // Edge geometry
      const edgeGeo = new THREE.BufferGeometry()
      edgeGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(edgePositions, 3),
      )

      result[layerName] = { fillGeo, edgeGeo }
    }

    return result
  }, [metadata])

  // Dispose geometries when metadata changes or component unmounts
  useEffect(() => {
    return () => {
      for (const { fillGeo, edgeGeo } of Object.values(layerGeometries)) {
        fillGeo.dispose()
        edgeGeo.dispose()
      }
    }
  }, [layerGeometries])

  return (
    <>
      {Object.entries(layerGeometries).map(([layerName, { fillGeo, edgeGeo }]) => {
        const visible = visibleLayers[layerName] ?? true
        const layerVisual = MAP_LAYER_VISUAL_MAP[layerName]
        const fillColor = new THREE.Color(layerVisual?.style.fill ?? '#888888')
        const strokeColor = new THREE.Color(layerVisual?.style.stroke ?? '#555555')
        const fillOpacity = layerVisual?.fillOpacity ?? 0.45
        const strokeOpacity = layerVisual?.strokeOpacity ?? 1

        return (
          <group key={layerName} visible={visible}>
            {/* Fill */}
            <mesh geometry={fillGeo}>
              <meshBasicMaterial
                color={fillColor}
                transparent
                opacity={fillOpacity}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Edges */}
            <lineSegments geometry={edgeGeo}>
              <lineBasicMaterial color={strokeColor} transparent opacity={strokeOpacity} />
            </lineSegments>
          </group>
        )
      })}
    </>
  )
})

// ── Minimal geometry merge (avoids drei/BufferGeometryUtils import issues) ────
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let indexOffset = 0

  for (const geo of geos) {
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
    const idx = geo.getIndex()
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices.push(idx.getX(i) + indexOffset)
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + indexOffset)
      }
    }
    indexOffset += pos.count
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setIndex(indices)
  return merged
}
