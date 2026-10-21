import { useMemo, useRef, useState } from 'react'
import { useStore, useTrip, useWeekTrips } from '../state/store'
import { useSize } from '../lib/useSize'
import { fmtHM, fmtDay } from '../lib/format'
import { PALETTE, STATUS, type Tab } from '../lib/scales'
import { trafficLevel, TRAFFIC_LABELS } from '../lib/sample'
import { DAY_NAMES, WEEK_START } from '../data/fleet'
import type { Trip } from '../data/simulate'

const H = 168
const M = { top: 14, right: 14, bottom: 24, left: 44 }

interface Series {
  title: string
  sub: string
  unit: string
  values: Float32Array
  fmt: (v: number) => string
  /** fixed y-domain (optional) */
  domain?: [number, number]
  kind: 'line' | 'diverging'
  threshold?: { v: number; label: string }
}

function seriesFor(trip: Trip, tab: Tab): Series {
  const S = trip.samples
  switch (tab) {
    case 'speed':
      return { title: 'Speed', sub: 'km/h, 1 Hz GPS', unit: 'km/h', values: S.v.map((v) => v * 3.6), fmt: (v) => v.toFixed(0), kind: 'line' }
    case 'energy':
      return { title: 'Battery power', sub: 'kW · below zero = regenerative braking', unit: 'kW', values: S.power, fmt: (v) => v.toFixed(1), kind: 'diverging' }
    case 'traffic':
      return { title: 'Speed vs traffic', sub: 'km/h · background = congestion level', unit: 'km/h', values: S.v.map((v) => v * 3.6), fmt: (v) => v.toFixed(0), kind: 'line' }
    case 'elevation':
      return { title: 'Elevation', sub: 'metres above sea level', unit: 'm', values: S.elev, fmt: (v) => v.toFixed(0), kind: 'line' }
    default:
      return {
        title: 'Distance from usual route',
        sub: `km · route ${trip.plan.usualId ?? '—'} · threshold 250 m`,
        unit: 'km',
        values: S.dev.map((d) => d / 1000),
        fmt: (v) => v.toFixed(2),
        domain: [0, Math.max(1, ...trip.deviations.map((d) => d.maxDev / 1000)) * 1.1],
        kind: 'line',
        threshold: { v: 0.25, label: '250 m' },
      }
  }
}

function niceTicks(lo: number, hi: number, count = 4) {
  const span = hi - lo || 1
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

export function TimelineChart() {
  const tab = useStore((s) => s.tab)
  return <div className="card chart-card">{tab === 'week' ? <WeekBars /> : <TripChart />}</div>
}

function TripChart() {
  const trip = useTrip()
  const tab = useStore((s) => s.tab)
  const theme = useStore((s) => s.theme)
  const seek = useStore((s) => s.seek)
  const t = useStore((s) => s.t)
  const wrap = useRef<HTMLDivElement>(null)
  const { w } = useSize(wrap)
  const [hx, setHx] = useState<number | null>(null)
  const series = useMemo(() => seriesFor(trip, tab), [trip, tab])
  const pal = PALETTE[theme]
  const iw = Math.max(10, w - M.left - M.right)
  const ih = H - M.top - M.bottom
  const D = trip.duration

  const geo = useMemo(() => {
    const v = series.values
    const bins = Math.max(2, Math.min(v.length, Math.floor(iw / 2)))
    const mean = new Float32Array(bins)
    for (let b = 0; b < bins; b++) {
      const a = Math.floor((b * v.length) / bins)
      const z = Math.max(a + 1, Math.floor(((b + 1) * v.length) / bins))
      let s = 0
      for (let k = a; k < z; k++) s += v[k]
      mean[b] = s / (z - a)
    }
    let lo = series.domain?.[0] ?? Infinity
    let hi = series.domain?.[1] ?? -Infinity
    if (!series.domain)
      for (const m of mean) {
        lo = Math.min(lo, m)
        hi = Math.max(hi, m)
      }
    if (series.kind === 'diverging') {
      lo = Math.min(lo, 0)
      hi = Math.max(hi, 0)
    } else if (tab !== 'elevation') lo = 0
    if (tab === 'elevation') {
      const pad = (hi - lo) * 0.15 + 2
      lo -= pad
      hi += pad
    }
    const ticks = niceTicks(lo, hi)
    lo = Math.min(lo, ticks[0])
    hi = Math.max(hi, ticks[ticks.length - 1])
    const y = (val: number) => M.top + ih - ((val - lo) / (hi - lo || 1)) * ih
    const x = (b: number) => M.left + (b / (bins - 1)) * iw
    let line = ''
    mean.forEach((m, b) => (line += `${b ? 'L' : 'M'}${x(b).toFixed(1)} ${y(m).toFixed(1)}`))
    const base = y(Math.max(lo, 0))
    const area = `${line}L${x(bins - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z`
    return { mean, bins, lo, hi, ticks, y, x, line, area, base }
  }, [series, iw, ih, tab])

  // x-axis clock ticks every 5/10/15/30 min depending on width
  const xticks = useMemo(() => {
    const per = [300, 600, 900, 1800, 3600].find((s) => (s / D) * iw > 70) ?? 3600
    const start = trip.plan.start / 1000
    const first = Math.ceil(start / per) * per
    const out: { x: number; label: string }[] = []
    for (let s = first; s <= start + D; s += per) out.push({ x: M.left + ((s - start) / D) * iw, label: fmtHM(s * 1000) })
    return out
  }, [trip, D, iw])

  const bandRects = useMemo(() => {
    if (tab !== 'traffic') return []
    const S = trip.samples
    const out: { x0: number; x1: number; lvl: number }[] = []
    let start = 0
    let lvl = trafficLevel(S.cong[0])
    for (let k = 1; k <= S.n; k++) {
      const l = k < S.n ? trafficLevel(S.cong[k]) : -1
      if (l !== lvl) {
        out.push({ x0: M.left + (start / D) * iw, x1: M.left + (Math.min(k, D) / D) * iw, lvl })
        start = k
        lvl = l
      }
    }
    return out
  }, [trip, tab, D, iw])

  const px = M.left + Math.min(1, t / D) * iw
  const hoverT = hx === null ? null : Math.max(0, Math.min(D, ((hx - M.left) / iw) * D))
  const hoverVal = hoverT === null ? null : series.values[Math.min(series.values.length - 1, Math.round(hoverT))]
  const lineColor = tab === 'elevation' ? (theme === 'light' ? '#9d6427' : '#d4a564') : pal.onRoute

  return (
    <div className="chart">
      <div className="chart-head">
        <div>
          <div className="chart-title">{series.title}</div>
          <div className="chart-sub">{series.sub}</div>
        </div>
        {tab === 'energy' && (
          <div className="chart-keys">
            <span>
              <i style={{ background: theme === 'light' ? '#e0605a' : '#e66767' }} /> Drawing power
            </span>
            <span>
              <i style={{ background: pal.onRoute }} /> Regenerating
            </span>
          </div>
        )}
        {tab === 'traffic' && (
          <div className="chart-keys">
            {TRAFFIC_LABELS.map((l, k) => (
              <span key={l}>
                <i style={{ background: STATUS[k] }} /> {l}
              </span>
            ))}
          </div>
        )}
      </div>
      <div ref={wrap} className="chart-body">
        {w > 0 && (
          <svg
            width={w}
            height={H}
            onPointerMove={(e) => setHx(e.clientX - e.currentTarget.getBoundingClientRect().left)}
            onPointerLeave={() => setHx(null)}
            onClick={() => hoverT !== null && seek(hoverT)}
            style={{ cursor: 'crosshair' }}
          >
            <defs>
              <linearGradient id={`fill-${tab}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={lineColor} stopOpacity="0.28" />
                <stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
              </linearGradient>
              <clipPath id="above-threshold">
                <rect x={M.left} y={0} width={iw} height={series.threshold ? geo.y(series.threshold.v) : 0} />
              </clipPath>
              <clipPath id="pos">
                <rect x={M.left} y={0} width={iw} height={geo.base} />
              </clipPath>
              <clipPath id="neg">
                <rect x={M.left} y={geo.base} width={iw} height={H} />
              </clipPath>
            </defs>
            {bandRects.map((b, i) => (
              <rect key={i} x={b.x0} y={M.top} width={Math.max(0.5, b.x1 - b.x0)} height={ih} fill={STATUS[b.lvl]} opacity={theme === 'light' ? 0.16 : 0.2} />
            ))}
            {geo.ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + iw} y1={geo.y(v)} y2={geo.y(v)} className={v === 0 ? 'axis-base' : 'axis-grid'} />
                <text x={M.left - 8} y={geo.y(v) + 4} textAnchor="end" className="axis-label num">
                  {Math.abs(v) < 1e-9 ? 0 : v}
                </text>
              </g>
            ))}
            {xticks.map((x) => (
              <text key={x.label} x={x.x} y={H - 6} textAnchor="middle" className="axis-label num">
                {x.label}
              </text>
            ))}
            {series.kind === 'diverging' ? (
              <>
                <path d={geo.area} fill={theme === 'light' ? '#e0605a' : '#e66767'} opacity={0.85} clipPath="url(#pos)" />
                <path d={geo.area} fill={pal.onRoute} opacity={0.9} clipPath="url(#neg)" />
              </>
            ) : (
              <>
                <path d={geo.area} fill={`url(#fill-${tab})`} />
                <path d={geo.line} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
                {series.threshold && (
                  <>
                    <path d={geo.area} fill={pal.offRoute} opacity={0.22} clipPath="url(#above-threshold)" />
                    <path d={geo.line} fill="none" stroke={pal.offRoute} strokeWidth={2} clipPath="url(#above-threshold)" />
                    <line x1={M.left} x2={M.left + iw} y1={geo.y(series.threshold.v)} y2={geo.y(series.threshold.v)} className="axis-threshold" />
                    <text x={M.left + iw - 4} y={geo.y(series.threshold.v) - 5} textAnchor="end" className="axis-label">
                      {series.threshold.label}
                    </text>
                  </>
                )}
              </>
            )}
            <line x1={px} x2={px} y1={M.top - 4} y2={M.top + ih} className="playhead" />
            <circle cx={px} cy={M.top - 4} r={4} className="playhead-dot" />
            {hx !== null && hoverT !== null && hoverVal !== null && hx >= M.left && hx <= M.left + iw && (
              <g pointerEvents="none">
                <line x1={hx} x2={hx} y1={M.top} y2={M.top + ih} className="crosshair" />
                <circle cx={hx} cy={geo.y(hoverVal)} r={4} fill={lineColor} className="crosshair-dot" />
              </g>
            )}
          </svg>
        )}
        {hx !== null && hoverT !== null && hoverVal !== null && hx >= M.left && hx <= M.left + iw && (
          <div className="chart-tip" style={{ left: Math.min(hx + 12, w - 150), top: 6 }}>
            <b className="num">
              {series.fmt(hoverVal)} {series.unit}
            </b>
            <span className="num">{fmtHM(trip.plan.start + hoverT * 1000)} · click to jump</span>
          </div>
        )}
      </div>
    </div>
  )
}

function WeekBars() {
  const week = useWeekTrips()
  const trip = useTrip()
  const setTrip = useStore((s) => s.setTrip)
  const theme = useStore((s) => s.theme)
  const wrap = useRef<HTMLDivElement>(null)
  const { w } = useSize(wrap)
  const [hover, setHover] = useState<number | null>(null)
  const pal = PALETTE[theme]
  const days = DAY_NAMES.map((name, d) => {
    const trips = week.filter((t) => t.plan.dayIndex === d)
    return { name, d, trips, km: trips.reduce((a, t) => a + t.stats.distanceKm, 0), kwh: trips.reduce((a, t) => a + t.stats.energyKwh, 0) }
  })
  const max = Math.max(...days.map((d) => d.km), 1)
  const ticks = niceTicks(0, max)
  const top = ticks[ticks.length - 1]
  const iw = Math.max(10, w - M.left - M.right)
  const ih = H - M.top - M.bottom
  const bw = iw / 7
  const y = (v: number) => M.top + ih - (v / top) * ih
  return (
    <div className="chart">
      <div className="chart-head">
        <div>
          <div className="chart-title">Distance per day</div>
          <div className="chart-sub">km · segments are individual trips · click a segment to open it</div>
        </div>
      </div>
      <div ref={wrap} className="chart-body">
        {w > 0 && (
          <svg width={w} height={H}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis-base' : 'axis-grid'} />
                <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="axis-label num">
                  {v}
                </text>
              </g>
            ))}
            {days.map((d) => {
              let acc = 0
              return (
                <g key={d.d}>
                  {d.trips.map((t) => {
                    const y0 = y(acc)
                    acc += t.stats.distanceKm
                    const y1 = y(acc)
                    const sel = t.id === trip.id
                    return (
                      <rect
                        key={t.id}
                        x={M.left + d.d * bw + bw * 0.22}
                        y={y1 + 1}
                        width={bw * 0.56}
                        height={Math.max(1, y0 - y1 - 2)}
                        rx={3}
                        fill={t.deviations.length ? pal.offRoute : pal.week}
                        opacity={sel ? 1 : hover === d.d ? 0.8 : 0.55}
                        stroke={sel ? 'var(--ink)' : 'none'}
                        strokeWidth={sel ? 1.5 : 0}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setTrip(t.id)}
                        onPointerEnter={() => setHover(d.d)}
                        onPointerLeave={() => setHover(null)}
                      >
                        <title>{`${fmtDay(t.plan.start)} ${fmtHM(t.plan.start)} · ${t.label} · ${t.stats.distanceKm.toFixed(1)} km${t.deviations.length ? ' · off route' : ''}`}</title>
                      </rect>
                    )
                  })}
                  <text x={M.left + d.d * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis-label">
                    {d.name} {new Date(WEEK_START + d.d * 86_400_000 + 6 * 3_600_000).getUTCDate()}
                  </text>
                  {d.km > 0 && (
                    <text x={M.left + d.d * bw + bw / 2} y={y(d.km) - 6} textAnchor="middle" className="axis-label num strong">
                      {d.km.toFixed(0)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <div className="chart-keys chart-keys-foot">
        <span>
          <i style={{ background: pal.week }} /> On usual route
        </span>
        <span>
          <i style={{ background: pal.offRoute }} /> Trip with a deviation
        </span>
      </div>
    </div>
  )
}
