import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import styles from './MultiSceneTsneMap.module.css'
import {
  buildMidribNodes,
  darken,
  errorToColorT,
  leafLength,
  leafTransform,
  lighten,
  sampleColorRamp,
  teardropPath,
  toRgba,
  type MidribNode,
} from './leafVeinUtils'
import {
  calculateL2Errors,
  determineSide,
  planningAttachmentT,
  type Point,
} from './trajectoryUtils'

// ─── Domain types ────────────────────────────────────────────────────────────

type DrivableArea = {
  coordinates?: Point[][]
}

type Polyline = {
  coordinates?: Point[]
}

type EgoPose = {
  translation?: number[]
}

type TsneScenePoint = {
  scene_name: string
  tsne_comp1: number
  tsne_comp2: number
}

type ProjectionPayload = {
  scenes: TsneScenePoint[]
}

type GtScenePayload = {
  gt_map?: {
    drivable_areas?: DrivableArea[]
    dividers?: Polyline[]
    boundaries?: Polyline[]
    ped_crossings?: Polyline[]
  }
  ego_poses?: EgoPose[]
}

type PredScenePayload = {
  final_plannings?: Point[][]
}

type ProcessedScene = {
  name: string
  drivable_areas: DrivableArea[]
  dividers: Polyline[]
  boundaries: Polyline[]
  ped_crossings: Polyline[]
  ego_poses: EgoPose[]
  ego_plannings: Point[][]
  isParking: boolean
}

type SceneScale = {
  xScale: d3.ScaleLinear<number, number>
  yScale: d3.ScaleLinear<number, number>
}

// ─── View configuration ──────────────────────────────────────────────────────

/**
 * All visual tunables in one place.
 * Add new fields here rather than scattering magic numbers across render fns.
 */
type ViewConfig = {
  // Layout
  margin: { top: number; right: number; bottom: number; left: number }
  sceneSize: number
  tsnePadding: number

  // Map layer
  dividerStrokeWidth: number

  // Midrib (ego-trajectory)
  midribStrokeWidth: number
  midribColor: string
  midribNodeCount: number

  // Leaf blade (planning) — shape is fixed, colour encodes error
  leafBaseLength: number   // base pixel length fed into the envelope function
  leafAspect: number       // fixed width/length ratio
  leafSpreadDeg: number    // fan-out angle from the midrib (degrees)
  leafOpacity: number      // fill opacity
  leafStrokeOpacity: number

  // Error → colour mapping
  errorNormMax: number     // avgError value that maps to colorT = 1 (most withered)
}

type LayerVisibility = {
  map: boolean
  egoTrajectory: boolean
  planning: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DATA_PATHS = {
  projection: '/data/projection/dimension_reduction_3channels.json',
  gtRoot: '/data/gt_scene_mini',
  predRoot: '/data/sparsedrive_pred_mini',
} as const

const DEFAULT_CONFIG: ViewConfig = {
  margin: { top: 12, right: 12, bottom: 12, left: 12 },
  sceneSize: 80,
  tsnePadding: 36,

  dividerStrokeWidth: 0.2,

  midribStrokeWidth: 1.5,
  midribColor: '#4a6a32',
  midribNodeCount: 30,

  leafBaseLength: 18,
  leafAspect: 0.35,
  leafSpreadDeg: 45,
  leafOpacity: 0.88,
  leafStrokeOpacity: 0.22,

  errorNormMax: 3.0,
}

// ─── Data-loading helpers ────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`请求失败: ${path} (${response.status})`)
  return (await response.json()) as T
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let current = 0
  async function worker() {
    while (current < items.length) {
      const index = current
      current += 1
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker()),
  )
  return results
}

function isParkingScene(egoPoses: EgoPose[]): boolean {
  if (egoPoses.length <= 3) return true
  const first = egoPoses[0]?.translation
  const last = egoPoses[egoPoses.length - 1]?.translation
  if (!first || !last || first.length < 2 || last.length < 2) return true
  const dx = last[0] - first[0]
  const dy = last[1] - first[1]
  return Math.sqrt(dx ** 2 + dy ** 2) < 1
}

// ─── Scale creation ──────────────────────────────────────────────────────────

function createScale(
  sceneData: ProcessedScene,
  containerWidth: number,
  containerHeight: number,
): SceneScale | null {
  const allPoints: Point[] = []

  sceneData.drivable_areas.forEach(area => {
    area.coordinates?.[0]?.forEach(point => {
      if (point.length >= 2) allPoints.push([point[0], point[1]])
    })
  })

  sceneData.ego_poses.forEach(pose => {
    if (pose.translation && pose.translation.length >= 2) {
      allPoints.push([pose.translation[0], pose.translation[1]])
    }
  })

  if (allPoints.length === 0) return null

  const minX = d3.min(allPoints, d => d[0])
  const maxX = d3.max(allPoints, d => d[0])
  const minY = d3.min(allPoints, d => d[1])
  const maxY = d3.max(allPoints, d => d[1])

  if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined) {
    return null
  }

  const padding = 20
  const dataWidth = Math.max(maxX - minX, 1)
  const dataHeight = Math.max(maxY - minY, 1)
  const scale = Math.min(
    containerWidth / (dataWidth + padding * 2),
    containerHeight / (dataHeight + padding * 2),
  )
  const usedWidth = (dataWidth + padding * 2) * scale
  const usedHeight = (dataHeight + padding * 2) * scale

  return {
    xScale: d3.scaleLinear().domain([minX - padding, maxX + padding]).range([0, usedWidth]),
    yScale: d3.scaleLinear().domain([minY - padding, maxY + padding]).range([usedHeight, 0]),
  }
}

// ─── Map layer ────────────────────────────────────────────────────────────────

function renderMaps(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  sceneData: ProcessedScene,
  scales: SceneScale,
  config: ViewConfig,
) {
  const { xScale, yScale } = scales

  group
    .selectAll<SVGPathElement, DrivableArea>('.drivable-area')
    .data(sceneData.drivable_areas)
    .join('path')
    .attr('class', 'drivable-area')
    .attr(
      'd',
      d =>
        d3
          .line<Point>()
          .x(p => xScale(p[0]))
          .y(p => yScale(p[1]))(d.coordinates?.[0] ?? []) ?? '',
    )
    .attr('fill', '#e5ecec')

  group
    .selectAll<SVGPathElement, Polyline>('.boundaries')
    .data(sceneData.boundaries)
    .join('path')
    .attr('class', 'boundaries')
    .attr(
      'd',
      d =>
        d3
          .line<Point>()
          .x(p => xScale(p[0]))
          .y(p => yScale(p[1]))(d.coordinates ?? []) ?? '',
    )
    .attr('fill', 'none')
    .attr('stroke', 'rgba(213,214,213,0.8)')
    .attr('stroke-width', 0.5)

  group
    .selectAll<SVGPathElement, Polyline>('.dividers')
    .data(sceneData.dividers)
    .join('path')
    .attr('class', 'dividers')
    .attr(
      'd',
      d =>
        d3
          .line<Point>()
          .x(p => xScale(p[0]))
          .y(p => yScale(p[1]))(d.coordinates ?? []) ?? '',
    )
    .attr('fill', 'none')
    .attr('stroke', 'rgb(10,169,253)')
    .attr('stroke-width', config.dividerStrokeWidth)

  group
    .selectAll<SVGPathElement, Polyline>('.ped-crossing')
    .data(sceneData.ped_crossings)
    .join('path')
    .attr('class', 'ped-crossing')
    .attr(
      'd',
      d =>
        d3
          .line<Point>()
          .x(p => xScale(p[0]))
          .y(p => yScale(p[1]))(d.coordinates ?? []) ?? '',
    )
    .attr('fill', '#fdab04')
    .attr('stroke', '#fdab04')
    .attr('stroke-width', config.dividerStrokeWidth)
}

// ─── Leaf-vein renderer ───────────────────────────────────────────────────────

/**
 * Intermediate data computed for one planning frame before SVG elements are
 * created. Keeping the computation separate makes the render loop easier to
 * follow and enables future optimisations (e.g. memoisation).
 */
type LeafBladeData = {
  frameIndex: number
  /** Arc-length parameter of the attachment node on the midrib ∈ [0, 1]. */
  attachT: number
  /** Closest midrib node index for the attachment point. */
  nodeIndex: number
  /** Which side of the midrib this blade fans out to. */
  side: 1 | -1
  /** Leaf length in pixels (from the envelope function). */
  ll: number
  /** Leaf width in pixels (ll * leafAspect). */
  lw: number
  /** Average L2 error of this planning frame (metres). */
  avgError: number
  /** Planning trajectory in world space (for the vein centre-line). */
  planPixels: [number, number][]
}

/**
 * Derive a leaf-blade colour triplet from a colour-ramp position and build
 * the gradient stops used by the SVG linearGradient.
 */
function buildLeafColors(colorT: number, opacity: number, strokeOpacity: number) {
  const col = sampleColorRamp(colorT)
  const dkCol = darken(col, 0.72)
  const ltCol = lighten(col, 0.22)
  return {
    tipColor: toRgba(dkCol, opacity),
    midColor: toRgba(col, opacity),
    baseColor: toRgba(ltCol, opacity),
    baseColorFade: toRgba(ltCol, opacity * 0.92),
    strokeColor: toRgba(darken(col, 0.5), strokeOpacity),
  }
}

/**
 * Render planning trajectories as leaf blades hanging off the ego midrib.
 *
 * Layer order within the returned group:
 *   1. Leaf blade fills (back → front by attachT, i.e. base leaves first)
 *   2. Leaf blade borders
 *   3. Planning vein centre-lines (on top of fills)
 */
function renderLeafVein(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  sceneData: ProcessedScene,
  scales: SceneScale,
  config: ViewConfig,
) {
  const { xScale, yScale } = scales

  // ── 1. Build ego pixel-space trajectory ───────────────────────────────────
  const egoWorldPoints: Point[] = sceneData.ego_poses
    .map(p => p.translation)
    .filter((t): t is number[] => Array.isArray(t) && t.length >= 2)
    .map(t => [t[0], t[1]])

  if (egoWorldPoints.length < 2) return

  const egoPixels: [number, number][] = egoWorldPoints.map(p => [
    xScale(p[0]),
    yScale(p[1]),
  ])

  // ── 2. Arc-length parameterise the midrib ─────────────────────────────────
  const midribNodes: MidribNode[] = buildMidribNodes(egoPixels, config.midribNodeCount)
  if (midribNodes.length === 0) return

  // ── 3. Pre-compute leaf geometry for every planning frame ─────────────────
  const spreadRad = (config.leafSpreadDeg * Math.PI) / 180
  const groundTruth = egoWorldPoints

  const blades: LeafBladeData[] = sceneData.ego_plannings
    .map((frameTraj, frameIndex) => {
      if (!frameTraj || frameTraj.length < 2) return null

      const attachT = planningAttachmentT(frameTraj, groundTruth)

      // Find the closest midrib node by t value.
      let nodeIndex = 0
      let minDt = Math.abs(midribNodes[0].t - attachT)
      for (let k = 1; k < midribNodes.length; k++) {
        const dt = Math.abs(midribNodes[k].t - attachT)
        if (dt < minDt) { minDt = dt; nodeIndex = k }
      }

      const node = midribNodes[nodeIndex]
      const { avgError } = calculateL2Errors(frameTraj, groundTruth, frameIndex)

      const sideStr = determineSide(frameTraj, groundTruth)
      const side: 1 | -1 = sideStr === 'right' ? 1 : -1
      const ll = leafLength(node.t, config.leafBaseLength)
      const lw = ll * config.leafAspect

      const planPixels: [number, number][] = frameTraj.map(p => [
        xScale(p[0]),
        yScale(p[1]),
      ])

      return {
        frameIndex,
        attachT,
        nodeIndex,
        side,
        ll,
        lw,
        avgError,
        planPixels,
      } satisfies LeafBladeData
    })
    .filter((b): b is LeafBladeData => b !== null)

  // Sort back-to-front: blades with smaller t (near base) render first.
  blades.sort((a, b) => a.attachT - b.attachT)

  // ── 4. Register per-leaf SVG linearGradients in <defs> ───────────────────
  const gradientIds: string[] = blades.map((blade, i) => {
    const gradId = `leaf-grad-${sceneData.name.replace(/[^a-zA-Z0-9]/g, '-')}-${i}`
    const colorT = errorToColorT(blade.avgError, config.errorNormMax)
    const colors = buildLeafColors(colorT, config.leafOpacity, config.leafStrokeOpacity)

    const grad = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1')
      .attr('gradientUnits', 'objectBoundingBox')

    grad.append('stop').attr('offset', '0%').attr('stop-color', colors.tipColor)
    grad.append('stop').attr('offset', '35%').attr('stop-color', colors.midColor)
    grad.append('stop').attr('offset', '75%').attr('stop-color', colors.baseColor)
    grad.append('stop').attr('offset', '100%').attr('stop-color', colors.baseColorFade)

    return gradId
  })

  // ── 5. Draw blade fills ───────────────────────────────────────────────────
  const fillLayer = group.append('g').attr('class', 'leaf-blade-fills')

  blades.forEach((blade, i) => {
    const node = midribNodes[blade.nodeIndex]
    const gradId = gradientIds[i]
    const colorT = errorToColorT(blade.avgError, config.errorNormMax)
    const colors = buildLeafColors(colorT, config.leafOpacity, config.leafStrokeOpacity)
    const transform = leafTransform(node, blade.ll, blade.side, spreadRad)

    fillLayer
      .append('g')
      .attr('class', `leaf-blade leaf-frame-${blade.frameIndex}`)
      .attr('transform', transform)
      .append('path')
      .attr('d', teardropPath(blade.ll, blade.lw))
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', colors.strokeColor)
      .attr('stroke-width', 0.5)
  })

  // ── 6. Draw planning vein centre-lines on top of fills ────────────────────
  const veinLayer = group.append('g').attr('class', 'leaf-vein-lines')
  const planLineGen = d3.line<[number, number]>().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom.alpha(0.5))

  blades.forEach(blade => {
    if (blade.planPixels.length < 2) return
    const colorT = errorToColorT(blade.avgError, config.errorNormMax)
    const col = sampleColorRamp(colorT)
    const strokeColor = toRgba(darken(col, 0.65), 0.75)

    veinLayer
      .append('path')
      .attr('class', `plan-vein plan-vein-${blade.frameIndex}`)
      .attr('d', planLineGen(blade.planPixels) ?? '')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 0.6)
      .attr('stroke-linecap', 'round')
  })
}

/**
 * Render the ego-trajectory midrib on top of all leaf blades.
 * Drawn last so it is always visible.
 */
function renderMidrib(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  sceneData: ProcessedScene,
  scales: SceneScale,
  config: ViewConfig,
) {
  const egoPixels: [number, number][] = sceneData.ego_poses
    .map(p => p.translation)
    .filter((t): t is number[] => Array.isArray(t) && t.length >= 2)
    .map(t => [scales.xScale(t[0]), scales.yScale(t[1])])

  if (egoPixels.length < 2) return

  const lineGen = d3
    .line<[number, number]>()
    .x(d => d[0])
    .y(d => d[1])
    .curve(d3.curveCatmullRom.alpha(0.5))

  // Shadow / highlight pair gives the midrib a slightly raised look.
  group
    .append('path')
    .attr('class', 'midrib-shadow')
    .attr('d', lineGen(egoPixels) ?? '')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(30,40,20,0.18)')
    .attr('stroke-width', config.midribStrokeWidth + 1)
    .attr('stroke-linecap', 'round')

  group
    .append('path')
    .attr('class', 'midrib')
    .attr('d', lineGen(egoPixels) ?? '')
    .attr('fill', 'none')
    .attr('stroke', config.midribColor)
    .attr('stroke-width', config.midribStrokeWidth)
    .attr('stroke-linecap', 'round')

  // Highlight stripe.
  group
    .append('path')
    .attr('class', 'midrib-highlight')
    .attr('d', lineGen(egoPixels) ?? '')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(255,255,255,0.14)')
    .attr('stroke-width', config.midribStrokeWidth * 0.35)
    .attr('stroke-linecap', 'round')

  // Start / end markers.
  const start = egoPixels[0]
  const end = egoPixels[egoPixels.length - 1]

  group.append('circle').attr('cx', start[0]).attr('cy', start[1]).attr('r', 1.4).attr('fill', '#7ac96a')
  group.append('circle').attr('cx', end[0]).attr('cy', end[1]).attr('r', 1.4).attr('fill', '#c96a6a')
}

// ─── Scene renderer ───────────────────────────────────────────────────────────

function renderScene(
  sceneData: ProcessedScene,
  sceneGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  config: ViewConfig,
  sceneSize: { width: number; height: number },
  layerVisibility: LayerVisibility,
) {
  if (sceneData.isParking) return   // skip near-stationary scenes

  const scales = createScale(sceneData, sceneSize.width, sceneSize.height)
  if (!scales) return

  const clipId = `clip-${sceneData.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  defs
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('width', sceneSize.width)
    .attr('height', sceneSize.height)

  const mainGroup = sceneGroup
    .append('g')
    .attr('clip-path', `url(#${clipId})`)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-miterlimit', 2)

  if (layerVisibility.map) {
    renderMaps(mainGroup, sceneData, scales, config)
  }

  // Leaf blades (planning) go between the map and the midrib.
  if (layerVisibility.planning) {
    renderLeafVein(mainGroup, defs, sceneData, scales, config)
  }

  // Midrib (ego-trajectory) rendered last — always on top.
  if (layerVisibility.egoTrajectory) {
    renderMidrib(mainGroup, sceneData, scales, config)
  }
}

// ─── React component ──────────────────────────────────────────────────────────

type MultiSceneTsneMapProps = {
  width?: number
  height?: number
  maxScenes?: number
}

export default function MultiSceneTsneMap({
  width,
  height,
  maxScenes = Number.POSITIVE_INFINITY,
}: MultiSceneTsneMapProps) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const zoomSvgRef = useRef<SVGSVGElement | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [sceneData, setSceneData] = useState<ProcessedScene[]>([])
  const [projectionPoints, setProjectionPoints] = useState<TsneScenePoint[]>([])
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    map: true,
    egoTrajectory: true,
    planning: true,
  })
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const config = DEFAULT_CONFIG

  // Container resize observer.
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setContainerSize({ width: rect.width, height: rect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Data loading.
  useEffect(() => {
    let canceled = false

    async function loadSceneData() {
      setIsLoading(true)
      setErrorText('')

      try {
        const projectionData = await fetchJson<ProjectionPayload>(DATA_PATHS.projection)
        const allPoints = projectionData.scenes.slice(0, maxScenes)

        const loadedScenes = await mapWithConcurrency(allPoints, 12, async item => {
          try {
            const [gtRes, predRes] = await Promise.all([
              fetch(`${DATA_PATHS.gtRoot}/${item.scene_name}.json`),
              fetch(`${DATA_PATHS.predRoot}/${item.scene_name}.json`),
            ])
            if (!gtRes.ok || !predRes.ok) return null

            const gtData = (await gtRes.json()) as GtScenePayload
            const predData = (await predRes.json()) as PredScenePayload

            const merged: ProcessedScene = {
              name: item.scene_name,
              drivable_areas: gtData.gt_map?.drivable_areas ?? [],
              dividers: gtData.gt_map?.dividers ?? [],
              boundaries: gtData.gt_map?.boundaries ?? [],
              ped_crossings: gtData.gt_map?.ped_crossings ?? [],
              ego_poses: gtData.ego_poses ?? [],
              ego_plannings: predData.final_plannings ?? [],
              isParking: isParkingScene(gtData.ego_poses ?? []),
            }
            return { merged, point: item }
          } catch {
            return null
          }
        })

        if (canceled) return

        const valid = loadedScenes.filter(
          (s): s is { merged: ProcessedScene; point: TsneScenePoint } => s !== null,
        )
        setSceneData(valid.map(s => s.merged))
        setProjectionPoints(valid.map(s => s.point))
      } catch (err) {
        if (!canceled) {
          setSceneData([])
          setProjectionPoints([])
          setErrorText(err instanceof Error ? err.message : '数据加载失败')
        }
      } finally {
        if (!canceled) setIsLoading(false)
      }
    }

    void loadSceneData()
    return () => { canceled = true }
  }, [maxScenes])

  const viewportWidth = width ?? containerSize.width
  const viewportHeight = height ?? containerSize.height

  function toggleLayer(key: keyof LayerVisibility) {
    setLayerVisibility(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function resetZoom() {
    if (!zoomSvgRef.current || !zoomBehaviorRef.current) return
    zoomTransformRef.current = d3.zoomIdentity
    d3.select(zoomSvgRef.current).call(zoomBehaviorRef.current.transform, d3.zoomIdentity)
  }

  const sceneSize = useMemo(() => {
    const titleHeight = 24
    return {
      width: config.sceneSize,
      height: config.sceneSize,
      availableWidth: Math.max(0, viewportWidth - config.margin.left - config.margin.right),
      availableHeight: Math.max(
        0,
        viewportHeight - config.margin.top - config.margin.bottom - titleHeight,
      ),
    }
  }, [
    config.margin.bottom,
    config.margin.left,
    config.margin.right,
    config.margin.top,
    config.sceneSize,
    viewportHeight,
    viewportWidth,
  ])

  // D3 render effect.
  useEffect(() => {
    if (!chartRef.current || sceneData.length === 0 || projectionPoints.length === 0) return
    if (sceneSize.availableWidth <= 0 || sceneSize.availableHeight <= 0) return

    const chartNode = chartRef.current
    d3.select(chartNode).selectAll('*').remove()

    const rootSvg = d3
      .select(chartNode)
      .append('svg')
      .style('width', '100%')
      .style('height', '100%')
      .style('display', 'block')

    const defs = rootSvg.append('defs')

    const viewport = rootSvg
      .append('g')
      .attr('transform', `translate(${config.margin.left},${config.margin.top})`)

    const sceneLayer = viewport.append('g').attr('class', 'scene-layer')

    const tsneXExtent = d3.extent(projectionPoints, d => d.tsne_comp1)
    const tsneYExtent = d3.extent(projectionPoints, d => d.tsne_comp2)

    if (
      tsneXExtent[0] === undefined || tsneXExtent[1] === undefined ||
      tsneYExtent[0] === undefined || tsneYExtent[1] === undefined
    ) return

    const tsneXScale = d3
      .scaleLinear()
      .domain([tsneXExtent[0] - 1, tsneXExtent[1] + 1])
      .range([config.tsnePadding, sceneSize.availableWidth - config.tsnePadding])

    const tsneYScale = d3
      .scaleLinear()
      .domain([tsneYExtent[0] - 1, tsneYExtent[1] + 1])
      .range([config.tsnePadding, sceneSize.availableHeight - config.tsnePadding])

    const pointMap = new Map(projectionPoints.map(item => [item.scene_name, item]))

    sceneData.forEach(scene => {
      const point = pointMap.get(scene.name)
      if (!point) return

      const x = tsneXScale(point.tsne_comp1)
      const y = tsneYScale(point.tsne_comp2)

      const sceneContainer = sceneLayer
        .append('g')
        .attr('transform', `translate(${x - sceneSize.width / 2},${y - sceneSize.height / 2})`)

      renderScene(
        scene,
        sceneContainer,
        defs,
        config,
        { width: sceneSize.width, height: sceneSize.height },
        layerVisibility,
      )
    })

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on('zoom', event => {
        zoomTransformRef.current = event.transform
        sceneLayer.attr('transform', event.transform.toString())
      })

    zoomSvgRef.current = rootSvg.node()
    zoomBehaviorRef.current = zoomBehavior
    rootSvg.call(zoomBehavior)
    rootSvg.call(zoomBehavior.transform, zoomTransformRef.current)

    return () => {
      rootSvg.on('.zoom', null)
      d3.select(chartNode).selectAll('*').remove()
    }
  }, [
    config,
    layerVisibility,
    projectionPoints,
    sceneData,
    sceneSize.availableHeight,
    sceneSize.availableWidth,
    sceneSize.height,
    sceneSize.width,
  ])

  return (
    <section className={styles.page}>
      <article className={styles.panel}>
        <h2 className={styles.title}>Performance Overview</h2>

        <div className={styles.toolbar}>
          <div className={styles.layerControls}>
            <label className={styles.checkboxItem}>
              <input
                type='checkbox'
                checked={layerVisibility.map}
                onChange={() => toggleLayer('map')}
              />
              <span>map</span>
            </label>
            <label className={styles.checkboxItem}>
              <input
                type='checkbox'
                checked={layerVisibility.egoTrajectory}
                onChange={() => toggleLayer('egoTrajectory')}
              />
              <span>ego-trajectory</span>
            </label>
            <label className={styles.checkboxItem}>
              <input
                type='checkbox'
                checked={layerVisibility.planning}
                onChange={() => toggleLayer('planning')}
              />
              <span>planning</span>
            </label>
          </div>
          <button
            type='button'
            className={styles.resetButton}
            onClick={resetZoom}
            disabled={isLoading || sceneData.length === 0}
          >
            重置缩放
          </button>
        </div>

        <div className={styles.chartContainer} ref={containerRef}>
          {isLoading ? <p className={styles.centerText}>加载中...</p> : null}
          {!isLoading && errorText ? (
            <p className={`${styles.centerText} ${styles.error}`}>{errorText}</p>
          ) : null}
          {!isLoading && !errorText && sceneData.length === 0 ? (
            <p className={styles.centerText}>暂无可渲染场景</p>
          ) : null}
          <div className={styles.chart} ref={chartRef} />
        </div>
      </article>
    </section>
  )
}
  