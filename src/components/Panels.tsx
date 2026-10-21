import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useStore, useTrip, useWeekTrips } from '../state/store'
import { VEHICLES } from '../data/vehicles'
import { getTrips, DAY_NAMES, ROUTES } from '../data/fleet'
import type { EventKind } from '../data/simulate'
import { fmtDay, fmtDur, fmtHM, fmtInr, fmtLongDay } from '../lib/format'
import {
  IconAlert, IconBolt, IconBox, IconChevron, IconFlag, IconInfo, IconLeaf, IconMoon, IconPin, IconRegen,
  IconRoute, IconSun, IconTraffic, IconVideo, VehicleGlyph,
} from './Icons'

// ---------------------------------------------------------------------------------------------

export function TopBar() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setVideo = useStore((s) => s.setVideo)
  const trip = useTrip()
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">CoulombAI</div>
          <div className="brand-sub">Route Intelligence</div>
        </div>
      </div>
      <nav className="crumbs" aria-label="Breadcrumb">
        <span>Fleet · Bengaluru East</span>
        <IconChevron size={12} />
        <span>{trip.plan.vehicle.name}</span>
        <IconChevron size={12} />
        <b>
          {fmtDay(trip.plan.start)} · {fmtHM(trip.plan.start)}
        </b>
      </nav>
      <div className="topbar-right">
        <div className="week-chip">
          <span className="live-dot" /> Week of 12 – 18 Oct 2026
        </div>
        <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
          {theme === 'light' ? <IconMoon /> : <IconSun />}
        </button>
        <button className="primary-btn" onClick={() => setVideo(true)}>
          <IconVideo size={16} /> Video session
        </button>
      </div>
    </header>
  )
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3a54f" />
          <stop offset="1" stopColor="#e8662b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#bm)" />
      <path d="M18.5 6 10 18h6l-2.5 8L22 14h-6l2.5-8Z" fill="#fff" />
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------

export function FleetPanel() {
  const vehicleId = useStore((s) => s.vehicleId)
  const setVehicle = useStore((s) => s.setVehicle)
  return (
    <div className="card fleet">
      <div className="card-head">
        <h2>Fleet</h2>
        <span className="muted">{VEHICLES.length} EVs</span>
      </div>
      <div className="fleet-list">
        {VEHICLES.map((v) => {
          const trips = getTrips(v.id)
          const km = trips.reduce((a, t) => a + t.stats.distanceKm, 0)
          const soc = trips[trips.length - 1].stats.socEnd
          const dev = trips.filter((t) => t.deviations.length).length
          const on = v.id === vehicleId
          return (
            <button key={v.id} className={`vehicle-card ${on ? 'on' : ''}`} onClick={() => setVehicle(v.id)} aria-pressed={on}>
              <span className="vehicle-icon">
                <VehicleGlyph kind={v.kind} />
              </span>
              <span className="vehicle-meta">
                <b>
                  {v.name} <small>{v.plate}</small>
                </b>
                <span className="muted">{v.model}</span>
                <span className="vehicle-stats num">
                  {km.toFixed(0)} km · {trips.length} trips
                  {dev > 0 && <em> · {dev} off-route</em>}
                </span>
              </span>
              <span className="soc-pill" title="State of charge after last trip">
                <span className="soc-bar">
                  <span style={{ height: `${soc * 100}%` }} />
                </span>
                <span className="num">{Math.round(soc * 100)}%</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TripList() {
  const week = useWeekTrips()
  const tripId = useStore((s) => s.tripId)
  const setTrip = useStore((s) => s.setTrip)
  const listRef = useRef<HTMLDivElement>(null)
  // keep the selected trip visible by scrolling only the list, never the page
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('.trip-row.on')
    if (!list || !row) return
    const top = row.offsetTop
    if (top < list.scrollTop + 30 || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      // land on the day heading so the selected trip keeps its context
      const day = row.closest<HTMLElement>('.trip-day')
      list.scrollTo({ top: Math.min(day ? day.offsetTop : top, top - 40), behavior: 'smooth' })
    }
  }, [tripId])
  const byDay = DAY_NAMES.map((name, d) => ({ name, d, trips: week.filter((t) => t.plan.dayIndex === d) })).filter((g) => g.trips.length)
  return (
    <div className="card trips">
      <div className="card-head">
        <h2>Trips this week</h2>
        <span className="muted">{week.length}</span>
      </div>
      <div className="trip-scroll" ref={listRef}>
        {byDay.map((g) => (
          <div key={g.d} className="trip-day">
            <div className="trip-day-label">{fmtDay(g.trips[0].plan.start)}</div>
            {g.trips.map((t) => {
              const on = t.id === tripId
              const heavy = t.events.filter((e) => e.kind === 'traffic').length
              return (
                <button key={t.id} className={`trip-row ${on ? 'on' : ''}`} onClick={() => setTrip(t.id)} aria-pressed={on}>
                  {on && <motion.span layoutId="trip-sel" className="trip-sel" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="trip-time num">
                    {fmtHM(t.plan.start)}
                    <small>{fmtDur(t.duration, true)}</small>
                  </span>
                  <span className="trip-main">
                    <b>{t.label}</b>
                    <span className="num muted">
                      {t.stats.distanceKm.toFixed(1)} km · {t.stats.energyKwh.toFixed(t.stats.energyKwh < 10 ? 2 : 1)} kWh · {Math.round(t.stats.avgKmh)} km/h
                    </span>
                    <span className="badges">
                      {t.deviations.length > 0 && (
                        <span className="badge badge-red">
                          <IconAlert size={11} /> {t.stats.offRouteKm.toFixed(1)} km off route
                        </span>
                      )}
                      {heavy > 0 && (
                        <span className="badge">
                          <IconTraffic size={11} /> {heavy} jam{heavy > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function CountUp({ value, decimals = 0, prefix = '', suffix = '' }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 700)
      const e = 1 - Math.pow(1 - p, 3)
      const cur = start + (value - start) * e
      setV(cur)
      from.current = cur
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <>
      {prefix}
      {v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  )
}

function Kpi({ label, children, sub, tone, icon }: { label: string; children: ReactNode; sub?: ReactNode; tone?: 'red' | 'green'; icon?: ReactNode }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-label">
        {icon}
        {label}
      </div>
      <div className="kpi-value num">{children}</div>
      {sub && <div className="kpi-sub num">{sub}</div>}
    </div>
  )
}

export function RouteParams() {
  const trip = useTrip()
  const s = trip.stats
  const v = trip.plan.vehicle
  const off = s.offRouteKm > 0
  return (
    <div className="card params">
      <div className="params-head">
        <div className="params-kicker">
          <VehicleGlyph kind={v.kind} size={16} /> {v.name} · {v.plate} · {v.driver}
        </div>
        <h2 className="params-title">{trip.label}</h2>
        <div className="params-sub">
          {fmtLongDay(trip.plan.start)} · {fmtHM(trip.plan.start)}–{fmtHM(trip.plan.start + trip.duration * 1000)}
        </div>
        <div className="params-tags">
          <span className="tag">
            <IconRoute size={12} /> {trip.plan.routeId === trip.plan.usualId ? ROUTES[trip.plan.routeId].name : `${ROUTES[trip.plan.routeId].name} (usual: ${trip.plan.usualId})`}
          </span>
          <span className="tag">{trip.plan.purpose}</span>
        </div>
        {trip.plan.note && (
          <div className="note">
            <IconInfo size={14} />
            <span>{trip.plan.note}</span>
          </div>
        )}
      </div>
      <h3 className="section-label">Route parameters</h3>
      <div className="kpis">
        <Kpi label="Distance" sub={`${(s.elevGain).toFixed(0)} m climb · ${(s.elevLoss).toFixed(0)} m descent`}>
          <CountUp value={s.distanceKm} decimals={1} suffix=" km" />
        </Kpi>
        <Kpi label="Duration" sub={`${fmtDur(s.movingS)} moving · ${s.stops} stops`}>
          {fmtDur(s.durationS)}
        </Kpi>
        <Kpi label="Avg speed" sub={`${s.movingAvgKmh.toFixed(0)} moving avg · ${s.maxKmh.toFixed(0)} max`}>
          <CountUp value={s.avgKmh} decimals={1} suffix=" km/h" />
        </Kpi>
        <Kpi label="Energy used" icon={<IconBolt size={12} />} sub={`peak draw ${s.peakKw.toFixed(0)} kW`}>
          <CountUp value={s.energyKwh} decimals={2} suffix=" kWh" />
        </Kpi>
        <Kpi label="Efficiency" sub={`${(1000 / s.whPerKm).toFixed(1)} km per kWh`}>
          <CountUp value={s.whPerKm} suffix=" Wh/km" />
        </Kpi>
        <Kpi label="Regen recovered" icon={<IconRegen size={12} />} tone="green" sub={`${((s.regenKwh / (s.energyKwh + s.regenKwh)) * 100).toFixed(1)}% of draw · peak ${s.peakRegenKw.toFixed(0)} kW`}>
          <CountUp value={s.regenKwh} decimals={2} suffix=" kWh" />
        </Kpi>
        <Kpi label="State of charge" sub={`${((s.socStart - s.socEnd) * 100).toFixed(1)} pts used · ${v.batteryKwh} kWh pack`}>
          <CountUp value={s.socStart * 100} suffix="%" /> → <CountUp value={s.socEnd * 100} suffix="%" />
        </Kpi>
        <Kpi label="Peak pack temp" sub={`${s.hardBrakes} harsh brake${s.hardBrakes === 1 ? '' : 's'}`}>
          <CountUp value={s.maxTemp} decimals={1} suffix=" °C" />
        </Kpi>
        <Kpi label="Off usual route" tone={off ? 'red' : undefined} icon={off ? <IconAlert size={12} /> : undefined} sub={off ? `${((s.offRouteKm / s.distanceKm) * 100).toFixed(0)}% of trip · ${trip.deviations.length} detour` : 'Stayed within 250 m'}>
          {off ? <CountUp value={s.offRouteKm} decimals={1} suffix=" km" /> : 'On route'}
        </Kpi>
        <Kpi label="Cost & CO₂" icon={<IconLeaf size={12} />} tone="green" sub={`vs ${fmtInr(s.iceCostInr)} fuel · ${s.co2SavedKg.toFixed(1)} kg CO₂ avoided`}>
          <CountUp value={s.costInr} prefix="₹" />
        </Kpi>
      </div>
    </div>
  )
}

const EVENT_ICON: Record<EventKind, ReactNode> = {
  depart: <IconPin size={14} />,
  arrive: <IconFlag size={14} />,
  offroute: <IconAlert size={14} />,
  rejoin: <IconRoute size={14} />,
  traffic: <IconTraffic size={14} />,
  delivery: <IconBox size={14} />,
  regen: <IconRegen size={14} />,
  brake: <IconAlert size={14} />,
}

export function EventLog() {
  const trip = useTrip()
  const seek = useStore((s) => s.seek)
  const active = useStore((s) => {
    let k = -1
    for (let i = 0; i < trip.events.length; i++) if (trip.events[i].t <= s.t + 0.5) k = i
    return k
  })
  return (
    <div className="card events">
      <div className="card-head">
        <h2>Trip timeline</h2>
        <span className="muted">{trip.events.length} events</span>
      </div>
      <ol className="event-list">
        {trip.events.map((e, i) => (
          <li key={i}>
            <button className={`event ev-${e.kind} ${i === active ? 'on' : ''} ${i > active ? 'future' : ''}`} onClick={() => seek(e.t)}>
              <span className="event-icon">{EVENT_ICON[e.kind]}</span>
              <span className="event-body">
                <b>{e.title}</b>
                <span>{e.detail}</span>
              </span>
              <span className="event-time num">{fmtHM(trip.plan.start + e.t * 1000)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
