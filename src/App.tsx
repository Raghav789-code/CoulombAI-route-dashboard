import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore, tripById } from './state/store'
import { MapCard } from './components/MapCard'
import { TimelineChart } from './components/TimelineChart'
import { EventLog, FleetPanel, RouteParams, TopBar, TripList } from './components/Panels'
import './App.css'

const VideoSession = lazy(() => import('./components/VideoSession').then((m) => ({ default: m.VideoSession })))

/** Drives playback: advances trip time by wall-clock × rate. */
function usePlaybackLoop() {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = useStore.getState()
      if (s.playing) {
        const trip = tripById(s.vehicleId, s.tripId)
        const t = s.t + dt * s.rate
        if (t >= trip.duration) useStore.setState({ t: trip.duration, playing: false })
        else useStore.setState({ t })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea, [role="slider"]')) return
      const s = useStore.getState()
      if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault()
        s.toggle()
      } else if (e.key.toLowerCase() === 'v' && !e.metaKey && !e.ctrlKey) s.setVideo(!s.video)
      else if (e.key === '3' && !s.video) s.setView(s.view === '3d' ? '2d' : '3d')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.08 * i, duration: 0.55, ease: [0.2, 0.7, 0.2, 1] as const },
})

export default function App() {
  const theme = useStore((s) => s.theme)
  const video = useStore((s) => s.video)
  usePlaybackLoop()
  useShortcuts()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="app">
      <TopBar />
      <main className="layout">
        <motion.aside className="col-left" {...rise(1)}>
          <FleetPanel />
          <TripList />
        </motion.aside>
        <motion.section className="col-center" {...rise(0)}>
          <MapCard />
          <TimelineChart />
        </motion.section>
        <motion.aside className="col-right" {...rise(2)}>
          <RouteParams />
          <EventLog />
        </motion.aside>
      </main>
      <footer className="foot">
        Simulated telemetry for an assignment demo · Coordinates approximate east Bengaluru · Space play/pause · V video session · 3 toggle 3D
      </footer>
      <Suspense fallback={<div className="vs vs-loading">Loading video session…</div>}>
        <AnimatePresence>{video && <VideoSession key="vs" />}</AnimatePresence>
      </Suspense>
    </div>
  )
}
