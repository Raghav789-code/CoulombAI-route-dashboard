import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { LAKES, PLACES, ROADS, ROAD_NAMES, type DensePath } from '../data/network'
import type { Trip } from '../data/simulate'
import { boundsOf, type Bounds } from '../data/geo'
import { colorRuns, modeScale, PALETTE, type Tab, type Theme } from '../lib/scales'
import { sampleAt, trafficLevel, TRAFFIC_LABELS } from '../lib/sample'
import { fmtDay, fmtHM, fmtClock, fmtDev } from '../lib/format'
import { useStore } from '../state/store'
import { useSize } from '../lib/useSize'

export interface MapHandle {
  zoom: (f: number) => void
  fit: () => void
}

interface View {
  cx: number
  cy: number
  k: number
}

export interface MapPadding {
  top: number
  right: number
  bottom: number
  left: number
}

interface Props {
  trip: Trip
  week: Trip[]
  tab: Tab
  theme: Theme
  padding: MapPadding
  ref?: Ref<MapHandle>
}

const pathD = (P: { x: ArrayLike<number>; y: ArrayLike<number> }, i0 = 0, i1 = P.x.length - 1, step = 1) => {
  let d = `M${P.x[i0].toFixed(1)} ${P.y[i0].toFixed(1)}`
  for (let i = i0 + step; i < i1; i += step) d += `L${P.x[i].toFixed(1)} ${P.y[i].toFixed(1)}`
  d += `L${P.x[i1].toFixed(1)} ${P.y[i1].toFixed(1)}`
  return d
}

const roadD = ROADS.map((r) => ({ id: r.id, cls: r.cls, d: pathD({ x: r.xs, y: r.ys }, 0, r.xs.length - 1, 2) }))
const lakeD = LAKES.map((l) => ({ name: l.name, d: pathD({ x: l.xs, y: l.ys }) + 'Z' }))

function tripBounds(trip: Trip, tab: Tab, week: Trip[]): Bounds {
  const b = boundsOf(trip.path.x, trip.path.y)
  if (tab === 'deviation' && trip.usualPath) boundsOf(trip.usualPath.x, trip.usualPath.y, b)
  if (tab === 'week') for (const t of week) boundsOf(t.path.x, t.path.y, b)
  return b
}

// ---------------------------------------------------------------------------------------------

export function Map2D({ trip, week, tab, theme, padding, ref }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const [view, setView] = useState<View | null>(null)
  const seek = useStore((s) => s.seek)
  const setTrip = useStore((s) => s.setTrip)

  const fitTo = useCallback(
    (b: Bounds) => {
      if (!w || !h) return
      // on narrow maps the overlays stack above/below the route instead of beside it
      const pad = w < 640 ? { top: 150, right: 16, bottom: 150, left: 16 } : padding
      const aw = Math.max(80, w - pad.left - pad.right)
      const ah = Math.max(80, h - pad.top - pad.bottom)
      const k = Math.min(aw / (b.maxX - b.minX || 1), ah / (b.maxY - b.minY || 1)) * 0.94
      const cx = (b.minX + b.maxX) / 2 - (pad.left - pad.right) / 2 / k
      const cy = (b.minY + b.maxY) / 2 + (pad.top - pad.bottom) / 2 / k
      setView({ cx, cy, k })
    },
    [w, h, padding],
  )

  const fit = useCallback(() => fitTo(tripBounds(trip, tab, week)), [fitTo, trip, tab, week])
  // refit when the trip, container size or week/trip mode changes
  const isWeek = tab === 'week'
  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, w, h, isWeek])

  const zoomAt = useCallback(
    (f: number, sx?: number, sy?: number) => {
      setView((v) => {
        if (!v) return v
        const px = sx ?? w / 2
        const py = sy ?? h / 2
        const wx = v.cx + (px - w / 2) / v.k
        const wy = v.cy - (py - h / 2) / v.k
        const k = Math.max(0.006, Math.min(1.2, v.k * f))
        return { k, cx: wx - (px - w / 2) / k, cy: wy + (py - h / 2) / k }
      })
    },
    [w, h],
  )

  useImperativeHandle(ref, () => ({ zoom: (f) => zoomAt(f), fit }), [zoomAt, fit])

  // ---- interaction: pan, wheel zoom, hover, click ----
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number } | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const scale = useMemo(() => modeScale(trip, tab, theme), [trip, tab, theme])

  if (!view || !w) {
    return <div ref={wrapRef} className="map2d" />
  }

  const toScreen = (x: number, y: number): [number, number] => [(x - view.cx) * view.k + w / 2, h / 2 - (y - view.cy) * view.k]
  const toWorld = (sx: number, sy: number): [number, number] => [view.cx + (sx - w / 2) / view.k, view.cy - (sy - h / 2) / view.k]

  const findHover = (sx: number, sy: number): HoverInfo | null => {
    const [wx, wy] = toWorld(sx, sy)
    const tol = 14 / view.k
    if (tab === 'week') {
      let best: HoverInfo | null = null
      let bd = tol
      for (const t of week) {
        // the selected trip wins where traces overlap
        const bias = t.id === trip.id ? 0.5 : 1
        const P = t.path
        for (let i = 0; i < P.x.length; i += 3) {
          const d = Math.hypot(P.x[i] - wx, P.y[i] - wy) * bias
          if (d < bd) {
            bd = d
            best = { trip: t, i, sx, sy }
          }
        }
      }
      return best
    }
    const P = trip.path
    let bi = -1
    let bd = tol
    for (let i = 0; i < P.x.length; i += 2) {
      const d = Math.hypot(P.x[i] - wx, P.y[i] - wy)
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    return bi >= 0 ? { trip, i: bi, sx, sy } : null
  }

  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const [x, y] = local(e)
    pointers.current.set(e.pointerId, { x, y })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) }
      drag.current = null
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    drag.current = { x, y, cx: view.cx, cy: view.cy, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = local(e)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(d / pinch.current.d, (a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch.current.d = d
      return
    }
    const dr = drag.current
    if (dr && dr.id === e.pointerId) {
      const dx = x - dr.x
      const dy = y - dr.y
      if (Math.abs(dx) + Math.abs(dy) > 4) dr.moved = true
      if (dr.moved) {
        setView({ k: view.k, cx: dr.cx - dx / view.k, cy: dr.cy + dy / view.k })
        setHover(null)
        return
      }
    }
    if (e.pointerType === 'mouse') setHover(findHover(x, y))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const dr = drag.current
    drag.current = null
    if (!dr || dr.moved) return
    const [x, y] = local(e)
    const hit = findHover(x, y)
    if (!hit) return
    if (hit.trip.id !== trip.id) setTrip(hit.trip.id)
    else seek(hit.trip.metrics.T[hit.i])
  }

  // ---- grid ----
  const grid = gridLines(view, w, h)

  return (
    <div ref={wrapRef} className="map2d" data-cursor={hover ? 'pointer' : 'grab'}>
      <svg
        ref={svgRef}
        width={w}
        height={h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Map of ${trip.label}`}
      >
        <g className="grid">
          {grid.minor.map((d, i) => (
            <path key={'g' + i} d={d} className="grid-minor" />
          ))}
          {grid.major.map((d, i) => (
            <path key={'G' + i} d={d} className="grid-major" />
          ))}
        </g>
        <g transform={`matrix(${view.k},0,0,${-view.k},${w / 2 - view.cx * view.k},${h / 2 + view.cy * view.k})`}>
          <BaseLayer />
          {tab === 'week' ? (
            <WeekLayer week={week} selected={trip.id} theme={theme} />
          ) : (
            <RouteLayer trip={trip} tab={tab} theme={theme} colorAt={scale.color} />
          )}
          {hover && tab === 'week' && hover.trip.id !== trip.id && <path d={pathD(hover.trip.path, 0, hover.trip.path.x.length - 1, 2)} className="week-hover" />}
        </g>
        <PlaceLabels toScreen={toScreen} />
        <Annotations trip={trip} tab={tab} theme={theme} toScreen={toScreen} />
        <VehicleMarker trip={trip} toScreen={toScreen} />
        {hover && <HoverMark hover={hover} toScreen={toScreen} />}
      </svg>
      {hover && <HoverTip hover={hover} tab={tab} w={w} />}
      <ScaleBar k={view.k} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function gridLines(view: View, w: number, h: number) {
  // pick a world spacing that lands between 18 and 40 px on screen
  let step = 250
  while (step * view.k < 18) step *= 2
  while (step * view.k > 40 && step > 31.25) step /= 2
  const [x0, y1] = [view.cx - w / 2 / view.k, view.cy + h / 2 / view.k]
  const [x1, y0] = [view.cx + w / 2 / view.k, view.cy - h / 2 / view.k]
  const minor: string[] = []
  const major: string[] = []
  let dm = ''
  let dM = ''
  for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
    const sx = ((gx - view.cx) * view.k + w / 2).toFixed(1)
    const seg = `M${sx} 0V${h}`
    if (Math.round(gx / step) % 4 === 0) dM += seg
    else dm += seg
  }
  for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) {
    const sy = (h / 2 - (gy - view.cy) * view.k).toFixed(1)
    const seg = `M0 ${sy}H${w}`
    if (Math.round(gy / step) % 4 === 0) dM += seg
    else dm += seg
  }
  minor.push(dm)
  major.push(dM)
  return { minor, major }
}

const BaseLayer = memo(function BaseLayer() {
  return (
    <g>
      {lakeD.map((l) => (
        <path key={l.name} d={l.d} className="lake" vectorEffect="non-scaling-stroke" />
      ))}
      {roadD.map((r) => (
        <path key={r.id} d={r.d} className={`road road-${r.cls}`} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  )
})

const RouteLayer = memo(function RouteLayer({
  trip,
  tab,
  theme,
  colorAt,
}: {
  trip: Trip
  tab: Tab
  theme: Theme
  colorAt: (i: number) => string
}) {
  const runs = useMemo(() => colorRuns(trip.path.x.length, colorAt, 2), [trip, colorAt])
  const full = useMemo(() => pathD(trip.path, 0, trip.path.x.length - 1, 2), [trip])
  const usual = useMemo(() => (trip.usualPath ? pathD(trip.usualPath, 0, trip.usualPath.x.length - 1, 2) : ''), [trip])
  // draw-on animation whenever the trip or mode changes
  const [reveal, setReveal] = useState(1)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 1100)
      setReveal(1 - Math.pow(1 - p, 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trip.id, tab])
  const nMax = Math.floor(reveal * (trip.path.x.length - 1))
  const showUsual = tab === 'deviation' && trip.deviations.length > 0 && trip.usualPath
  return (
    <g>
      {showUsual && <path d={usual} className="usual-route" style={{ stroke: PALETTE[theme].usual }} vectorEffect="non-scaling-stroke" />}
      <path d={full} className="route-casing" vectorEffect="non-scaling-stroke" style={{ opacity: reveal }} />
      {runs.map((r) =>
        r.i0 > nMax ? null : (
          <path
            key={`${r.i0}-${r.color}`}
            d={pathD(trip.path, r.i0, Math.min(r.i1, Math.max(nMax, r.i0 + 1)))}
            className="route-run"
            style={{ stroke: r.color }}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </g>
  )
})

const WeekLayer = memo(function WeekLayer({ week, selected, theme }: { week: Trip[]; selected: string; theme: Theme }) {
  const col = PALETTE[theme].week
  // unique routes drawn once with opacity scaled by how often they were driven
  const counts = new Map<string, { path: DensePath; n: number }>()
  for (const t of week) {
    const c = counts.get(t.plan.routeId)
    if (c) c.n++
    else counts.set(t.plan.routeId, { path: t.path, n: 1 })
  }
  const max = Math.max(...[...counts.values()].map((c) => c.n))
  const sel = week.find((t) => t.id === selected)
  return (
    <g>
      {[...counts.entries()].map(([id, c]) => (
        <path
          key={id}
          d={pathD(c.path, 0, c.path.x.length - 1, 2)}
          className="week-trace"
          style={{ stroke: col, strokeWidth: 2 + (4 * c.n) / max, opacity: 0.22 + (0.3 * c.n) / max }}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {sel && (
        <>
          <path d={pathD(sel.path, 0, sel.path.x.length - 1, 2)} className="route-casing" vectorEffect="non-scaling-stroke" />
          <path d={pathD(sel.path, 0, sel.path.x.length - 1, 2)} className="route-run" style={{ stroke: col }} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </g>
  )
})

type ToScreen = (x: number, y: number) => [number, number]

function PlaceLabels({ toScreen }: { toScreen: ToScreen }) {
  return (
    <g className="places">
      {PLACES.filter((p) => !p.hidden).map((p) => {
        const [sx, sy] = toScreen(p.x, p.y)
        const off = { r: [6, 4, 'start'], l: [-6, 4, 'end'], t: [0, -7, 'middle'], b: [0, 14, 'middle'] }[p.side] as [number, number, 'start' | 'end' | 'middle']
        return (
          <g key={p.id} transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`}>
            <circle r={2.4} className="place-dot" />
            <text x={off[0]} y={off[1]} textAnchor={off[2]} className="place-label">
              {p.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Annotations({ trip, tab, theme, toScreen }: { trip: Trip; tab: Tab; theme: Theme; toScreen: ToScreen }) {
  const P = trip.path
  const n = P.x.length
  const [sx0, sy0] = toScreen(P.x[0], P.y[0])
  const [sx1, sy1] = toScreen(P.x[n - 1], P.y[n - 1])
  const pal = PALETTE[theme]
  const loop = Math.hypot(P.x[0] - P.x[n - 1], P.y[0] - P.y[n - 1]) < 50
  return (
    <g>
      {tab === 'deviation' &&
        trip.deviations.map((d) => {
          const [ax, ay] = toScreen(P.x[d.i0], P.y[d.i0])
          const mid = Math.round(d.i0 + (d.i1 - d.i0) * 0.55)
          const [mx, my] = toScreen(P.x[mid], P.y[mid])
          return (
            <g key={d.i0}>
              <circle cx={ax} cy={ay} r={5} className="marker-ring" style={{ fill: pal.offRoute }} />
              <text x={mx + 10} y={my + 4} className="offroute-label" style={{ fill: pal.offRoute }}>
                {d.km.toFixed(1)} km off route
              </text>
            </g>
          )
        })}
      <circle cx={sx0} cy={sy0} r={6.5} className="marker-ring marker-start" />
      {!loop && <circle cx={sx1} cy={sy1} r={6.5} className="marker-ring marker-end" />}
    </g>
  )
}

function VehicleMarker({ trip, toScreen }: { trip: Trip; toScreen: ToScreen }) {
  const t = useStore((s) => s.t)
  const snap = sampleAt(trip, t)
  const [sx, sy] = toScreen(snap.x, snap.y)
  const deg = (-snap.heading * 180) / Math.PI
  return (
    <g transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`} className="vehicle">
      <circle r={16} className="vehicle-halo" />
      <g transform={`rotate(${deg.toFixed(1)})`}>
        <path d="M11 0 L5 -4.2 L5 4.2 Z" className="vehicle-arrow" />
      </g>
      <circle r={6.5} className="vehicle-dot" />
    </g>
  )
}

interface HoverInfo {
  trip: Trip
  i: number
  sx: number
  sy: number
}

function HoverMark({ hover, toScreen }: { hover: HoverInfo; toScreen: ToScreen }) {
  const [x, y] = toScreen(hover.trip.path.x[hover.i], hover.trip.path.y[hover.i])
  return <circle cx={x} cy={y} r={5} className="hover-mark" />
}

function HoverTip({ hover, tab, w }: { hover: HoverInfo; tab: Tab; w: number }) {
  const { trip, i } = hover
  const m = trip.metrics
  const T = m.T[i]
  const snap = sampleAt(trip, T)
  const rows: [string, string][] =
    tab === 'week'
      ? [
          ['Trip', `${fmtDay(trip.plan.start)} · ${fmtHM(trip.plan.start)}`],
          ['Distance', `${trip.stats.distanceKm.toFixed(1)} km`],
          ['Energy', `${trip.stats.energyKwh.toFixed(2)} kWh`],
          ['Off route', trip.stats.offRouteKm > 0 ? `${trip.stats.offRouteKm.toFixed(1)} km` : '—'],
        ]
      : [
          ['Time', fmtClock(trip.plan.start + T * 1000)],
          ['Distance', `${(trip.path.s[i] / 1000).toFixed(2)} km`],
          ['Avg speed here', `${m.speed[i].toFixed(0)} km/h`],
          ['Energy here', `${m.whkm[i].toFixed(0)} Wh/km`],
          ['Traffic', TRAFFIC_LABELS[trafficLevel(m.cong[i])]],
          ['Elevation', `${m.elev[i].toFixed(0)} m`],
          ['From usual route', fmtDev(m.dev[i])],
          ['SoC', `${(snap.soc * 100).toFixed(1)}%`],
        ]
  const left = hover.sx + 16 + 210 > w ? hover.sx - 16 - 210 : hover.sx + 16
  return (
    <div className="hover-tip" style={{ left, top: Math.max(8, hover.sy - 20) }}>
      <div className="hover-tip-title">{tab === 'week' ? trip.label : roadName(trip, i)}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="hover-row">
          <span>{k}</span>
          <b className="num">{v}</b>
        </div>
      ))}
      <div className="hover-hint">{tab === 'week' ? 'Click to open trip' : 'Click to jump here'}</div>
    </div>
  )
}

const roadName = (trip: Trip, i: number) => ROAD_NAMES[trip.path.road[i]]

function ScaleBar({ k }: { k: number }) {
  const opts = [100, 200, 500, 1000, 2000, 5000, 10000]
  const L = opts.find((o) => o * k >= 56) ?? 10000
  const px = L * k
  return (
    <div className="scalebar">
      <div className="scalebar-line" style={{ width: px }} />
      <span className="num">{L >= 1000 ? `${L / 1000} km` : `${L} m`}</span>
    </div>
  )
}
