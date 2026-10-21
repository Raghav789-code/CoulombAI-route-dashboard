import { lazy, Suspense, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Map2D, type MapHandle } from './Map2D'
import { useStore, useTrip, useWeekTrips } from '../state/store'
import { modeScale, TABS, type LegendSpec, type Tab } from '../lib/scales'
import { sampleAt, trafficLevel, TRAFFIC_LABELS } from '../lib/sample'
import { fmtClock, fmtDev, fmtDur } from '../lib/format'
import { PlaybackBar } from './PlaybackBar'
import { IconBolt, IconCalendar, IconCube, IconGauge, IconMap, IconMountain, IconRoute, IconTarget, IconTraffic, IconVideo } from './Icons'

const Map3D = lazy(() => import('./Map3D'))

const TAB_ICONS: Record<Tab, typeof IconMap> = {
  week: IconCalendar,
  deviation: IconRoute,
  speed: IconGauge,
  energy: IconBolt,
  traffic: IconTraffic,
  elevation: IconMountain,
}

export function MapCard() {
  const trip = useTrip()
  const week = useWeekTrips()
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const theme = useStore((s) => s.theme)
  const follow = useStore((s) => s.follow)
  const setFollow = useStore((s) => s.setFollow)
  const setVideo = useStore((s) => s.setVideo)
  const mapRef = useRef<MapHandle>(null)
  const legend = useMemo(() => {
    const l = modeScale(trip, tab, theme).legend
    return l.kind === 'week' ? { ...l, count: week.length } : l
  }, [trip, tab, theme, week.length])
  const padding = useMemo(() => ({ top: 64, right: 40, bottom: 40, left: 230 }), [])
  const tabsRef = useRef<HTMLDivElement>(null)

  // Keep the active tab visible when the bar scrolls on narrow maps.
  useEffect(() => {
    const bar = tabsRef.current
    const btn = bar?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (!bar || !btn || bar.scrollWidth <= bar.clientWidth) return
    bar.scrollTo({ left: btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' })
  }, [tab])

  // Roving arrow-key navigation across the tablist (WAI-ARIA tabs pattern).
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${TABS[next].id}"]`)?.focus()
  }

  return (
    <section className="map-card" aria-label="Route map">
      <div className="map-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="map-layer"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {view === '2d' ? (
              <Map2D ref={mapRef} trip={trip} week={week} tab={tab} theme={theme} padding={padding} />
            ) : (
              <Suspense fallback={<div className="map-loading">Building 3D city…</div>}>
                <Map3D ref={mapRef} trip={trip} week={week} tab={tab} theme={theme} />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="map-top">
          <div className="seg tabs" role="tablist" aria-label="Map layer" ref={tabsRef} onKeyDown={onTabKey}>
            {TABS.map((t) => {
              const Icon = TAB_ICONS[t.id]
              const on = tab === t.id
              return (
                <button key={t.id} role="tab" aria-selected={on} tabIndex={on ? 0 : -1} data-tab={t.id} className={on ? 'on' : ''} onClick={() => setTab(t.id)} title={t.label}>
                  {on && <motion.span layoutId="tab-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="seg-label">
                    <Icon size={14} className="tab-icon" />
                    <span className="tab-text">{t.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="map-tools">
            <div className="seg" role="group" aria-label="Map view">
              <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')} aria-pressed={view === '2d'} title="2D map">
                {view === '2d' && <motion.span layoutId="view-pill" className="seg-pill" />}
                <span className="seg-label">
                  <IconMap size={14} /> 2D
                </span>
              </button>
              <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')} aria-pressed={view === '3d'} title="3D terrain view">
                {view === '3d' && <motion.span layoutId="view-pill" className="seg-pill" />}
                <span className="seg-label">
                  <IconCube size={14} /> 3D
                </span>
              </button>
            </div>
            <div className="seg zoom" role="group" aria-label="Zoom">
              <button onClick={() => mapRef.current?.zoom(1 / 1.4)} aria-label="Zoom out">
                −
              </button>
              <button onClick={() => mapRef.current?.zoom(1.4)} aria-label="Zoom in">
                +
              </button>
              <button onClick={() => mapRef.current?.fit()}>Fit</button>
            </div>
          </div>
        </div>

        {tab === 'week' ? <WeekCard /> : <InfoCard />}
        <Legend spec={legend} />
        {view === '3d' && (
          <button className={`chip-btn follow-chip ${follow ? 'active' : ''}`} onClick={() => setFollow(!follow)} aria-pressed={follow} title="Camera follows the vehicle">
            <IconTarget size={14} /> {follow ? 'Following vehicle' : 'Follow vehicle'}
          </button>
        )}
      </div>
      <div className="playback-row">
        <PlaybackBar />
        <button className="video-fab" onClick={() => setVideo(true)}>
          <span className="video-fab-icon">
            <IconVideo size={15} />
          </span>
          <span>
            <b>Video session</b>
            <small>Cinematic 3D replay</small>
          </span>
        </button>
      </div>
    </section>
  )
}

function InfoCard() {
  const trip = useTrip()
  const t = useStore((s) => s.t)
  const tab = useStore((s) => s.tab)
  const snap = sampleAt(trip, t)
  const lvl = trafficLevel(snap.cong)
  const off = snap.dev > 250
  const rows: { k: string; v: string; hi?: boolean; tone?: 'red' | 'green' }[] = [
    { k: 'Time', v: fmtClock(snap.clock) },
    { k: 'Distance', v: `${(snap.s / 1000).toFixed(2)} km` },
    { k: 'Speed', v: `${snap.v.toFixed(0)} km/h`, hi: tab === 'speed' },
    { k: 'Traffic', v: TRAFFIC_LABELS[lvl], hi: tab === 'traffic' },
    { k: 'Energy so far', v: `${snap.energy.toFixed(2)} kWh`, hi: tab === 'energy' },
    { k: 'Battery', v: `${(snap.soc * 100).toFixed(1)}% · ${snap.power >= 0 ? '' : '−'}${Math.abs(snap.power).toFixed(1)} kW`, hi: tab === 'energy', tone: snap.power < 0 ? 'green' : undefined },
    { k: 'Elevation', v: `${snap.elev.toFixed(0)} m · ${(snap.grade * 100).toFixed(1)}%`, hi: tab === 'elevation' },
    { k: 'From usual route', v: fmtDev(snap.dev), hi: tab === 'deviation', tone: off ? 'red' : undefined },
  ]
  return (
    <div className="info-card" aria-live="off">
      {rows.map((r) => (
        <div key={r.k} className={`info-row ${r.hi ? 'hi' : ''}`}>
          <span>{r.k}</span>
          <b className={`num ${r.tone ?? ''}`}>{r.v}</b>
        </div>
      ))}
    </div>
  )
}

function WeekCard() {
  const week = useWeekTrips()
  const km = week.reduce((a, t) => a + t.stats.distanceKm, 0)
  const kwh = week.reduce((a, t) => a + t.stats.energyKwh, 0)
  const dur = week.reduce((a, t) => a + t.stats.durationS, 0)
  const off = week.filter((t) => t.deviations.length > 0)
  const rows: [string, string][] = [
    ['Week', '12 – 18 Oct 2026'],
    ['Trips', `${week.length}`],
    ['Distance', `${km.toFixed(1)} km`],
    ['Driving time', fmtDur(dur)],
    ['Energy', `${kwh.toFixed(1)} kWh`],
    ['Efficiency', `${((kwh * 1000) / km).toFixed(0)} Wh/km`],
    ['Off-route trips', off.length ? `${off.length} · ${off.reduce((a, t) => a + t.stats.offRouteKm, 0).toFixed(1)} km` : 'None'],
  ]
  return (
    <div className="info-card">
      {rows.map(([k, v]) => (
        <div key={k} className="info-row">
          <span>{k}</span>
          <b className={`num ${k === 'Off-route trips' && off.length ? 'red' : ''}`}>{v}</b>
        </div>
      ))}
    </div>
  )
}

function Legend({ spec }: { spec: LegendSpec }) {
  return (
    <div className="legend">
      {spec.kind === 'deviation' && (
        <>
          <div className="legend-title">Deviation</div>
          <div className="legend-item">
            <svg width="22" height="6">
              <path d="M1 3H21" stroke={spec.usual} strokeWidth="2" strokeDasharray="1.5 3" strokeLinecap="round" />
            </svg>
            Usual route ({spec.usualName})
          </div>
          <div className="legend-item">
            <svg width="22" height="6">
              <path d="M1 3H21" stroke={spec.on} strokeWidth="4" strokeLinecap="round" />
            </svg>
            This trip, on route
          </div>
          <div className="legend-item">
            <svg width="22" height="6">
              <path d="M1 3H21" stroke={spec.off} strokeWidth="4" strokeLinecap="round" />
            </svg>
            Off route (over 250 m away)
          </div>
        </>
      )}
      {spec.kind === 'ramp' && (
        <>
          <div className="legend-title">{spec.title}</div>
          <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${spec.stops.join(',')})` }} />
          <div className="legend-ticks num">
            <span>{spec.min}</span>
            {spec.mid && <span>{spec.mid}</span>}
            <span>{spec.max}</span>
          </div>
        </>
      )}
      {spec.kind === 'status' && (
        <>
          <div className="legend-title">{spec.title}</div>
          {spec.items.map((it) => (
            <div key={it.label} className="legend-item">
              <svg width="22" height="6">
                <path d="M1 3H21" stroke={it.color} strokeWidth="4" strokeLinecap="round" />
              </svg>
              {it.label}
            </div>
          ))}
        </>
      )}
      {spec.kind === 'week' && (
        <>
          <div className="legend-title">Whole week · {spec.count} trips</div>
          <div className="legend-item">
            <svg width="22" height="6">
              <path d="M1 3H21" stroke={spec.color} strokeWidth="4" strokeLinecap="round" />
            </svg>
            Selected trip
          </div>
          <div className="legend-item">
            <svg width="22" height="8">
              <path d="M1 4H21" stroke={spec.color} strokeWidth="6" strokeLinecap="round" opacity="0.4" />
            </svg>
            Other routes · thicker = driven more
          </div>
        </>
      )}
    </div>
  )
}
