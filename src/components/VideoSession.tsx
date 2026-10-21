import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { AnimatePresence, motion } from 'motion/react'
import * as THREE from 'three'
import { useStore, useTrip, useWeekTrips } from '../state/store'
import type { Trip, TripEvent } from '../data/simulate'
import { sampleAt, trafficLevel, TRAFFIC_LABELS, type Snap } from '../lib/sample'
import { fmtClock, fmtDev, fmtDur, fmtHM, fmtLongDay } from '../lib/format'
import { PALETTE, STATUS, type Tab } from '../lib/scales'
import { CityScene } from './three/Scene'
import { LabelLayer, LabelProjector, sceneLabels } from './three/Labels'
import { toScene, UNIT } from './three/world'
import { PlaybackBar } from './PlaybackBar'
import { IconAlert, IconBox, IconClose, IconFlag, IconPin, IconRecord, IconRegen, IconRoute, IconStop, IconTraffic } from './Icons'

type CamMode = 'auto' | 'chase' | 'drone' | 'orbit' | 'top' | 'free'
const CAM_MODES: { id: CamMode; label: string }[] = [
  { id: 'auto', label: 'Director' },
  { id: 'chase', label: 'Chase' },
  { id: 'drone', label: 'Drone' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'top', label: 'Top' },
  { id: 'free', label: 'Free' },
]
const AUTO_SEQ: [Exclude<CamMode, 'auto' | 'free'>, number][] = [
  ['chase', 9],
  ['drone', 7],
  ['orbit', 7],
  ['top', 6],
]

export function VideoSession() {
  const trip = useTrip()
  const week = useWeekTrips()
  const tab = useStore((s) => s.tab)
  const setVideo = useStore((s) => s.setVideo)
  const [cam, setCam] = useState<CamMode>('auto')
  const glRef = useRef<HTMLCanvasElement | null>(null)
  const rec = useRecorder(trip, glRef)
  const vtab: Tab = tab === 'week' ? 'deviation' : tab
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const labels = useMemo(() => sceneLabels(trip, vtab), [trip, vtab])

  // start the session from the beginning at a cinematic pace; restore on close
  useEffect(() => {
    const st = useStore.getState()
    const prevRate = st.rate
    st.setRate(60)
    st.seek(0)
    const t = setTimeout(() => useStore.getState().setPlaying(true), 1400)
    return () => {
      clearTimeout(t)
      useStore.getState().setPlaying(false)
      useStore.getState().setRate(prevRate)
    }
  }, [trip.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideo(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setVideo])

  return (
    <motion.div
      className="vs"
      role="dialog"
      aria-modal="true"
      aria-label="Video session"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div className="vs-canvas" initial={{ scale: 1.08, filter: 'blur(8px)' }} animate={{ scale: 1, filter: 'blur(0px)' }} transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}>
        <Canvas
          flat
          dpr={[1, 1.75]}
          camera={{ fov: 42, near: 0.5, far: 6000, position: [0, 900, 900] }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => (glRef.current = gl.domElement)}
        >
          <CityScene trip={trip} week={week} tab={vtab} mode="cinema" />
          {cam === 'free' ? <FreeCam trip={trip} /> : <Director trip={trip} mode={cam} />}
          <LabelProjector labels={labels} refs={labelRefs} />
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.42} luminanceSmoothing={0.3} />
            <Vignette offset={0.25} darkness={0.75} />
          </EffectComposer>
        </Canvas>
        <LabelLayer labels={labels} refs={labelRefs} variant="cinema" />
      </motion.div>
      <div className="vs-letterbox top" />
      <div className="vs-letterbox bottom" />
      <Hud trip={trip} cam={cam} setCam={setCam} rec={rec} onClose={() => setVideo(false)} />
    </motion.div>
  )
}

// ---------------------------------------------------------------------------------------------
// Camera director

function overviewOf(trip: Trip) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < trip.path.x.length; i += 10) {
    minX = Math.min(minX, trip.path.x[i])
    maxX = Math.max(maxX, trip.path.x[i])
    minY = Math.min(minY, trip.path.y[i])
    maxY = Math.max(maxY, trip.path.y[i])
  }
  const span = Math.max(maxX - minX, (maxY - minY) * 1.5) / UNIT
  const target = new THREE.Vector3(...toScene((minX + maxX) / 2, (minY + maxY) / 2))
  const pos = target.clone().add(new THREE.Vector3(-span * 0.15, span * 0.55, span * 0.72))
  return { pos, target }
}

function Director({ trip, mode }: { trip: Trip; mode: CamMode }) {
  const camera = useThree((s) => s.camera)
  const look = useRef(new THREE.Vector3())
  const fwd = useRef(new THREE.Vector3(1, 0, 0))
  const t0 = useRef(0)
  const overview = useMemo(() => overviewOf(trip), [trip])
  const tmp = useMemo(() => ({ veh: new THREE.Vector3(), f: new THREE.Vector3(), side: new THREE.Vector3(), pos: new THREE.Vector3(), tgt: new THREE.Vector3() }), [])

  useEffect(() => {
    camera.position.copy(overview.pos)
    look.current.copy(overview.target)
    camera.lookAt(look.current)
    t0.current = performance.now()
  }, [overview, camera])

  useFrame((_, dt) => {
    const st = useStore.getState()
    const snap = sampleAt(trip, st.t)
    const { veh, f, side, pos, tgt } = tmp
    veh.set(...toScene(snap.x, snap.y))
    f.set(Math.cos(snap.heading), 0, -Math.sin(snap.heading))
    fwd.current.lerp(f, 1 - Math.exp(-dt * 1.6)).normalize()
    const F = fwd.current
    side.set(-F.z, 0, F.x)
    const el = (performance.now() - t0.current) / 1000
    let m = mode
    if (mode === 'auto') {
      const total = AUTO_SEQ.reduce((a, [, d]) => a + d, 0)
      let x = el % total
      for (const [id, d] of AUTO_SEQ) {
        if (x < d) {
          m = id
          break
        }
        x -= d
      }
    }
    const ended = st.t >= trip.duration - 0.5 && !st.playing
    if (ended || el < 1.2) {
      pos.copy(overview.pos)
      tgt.copy(overview.target)
    } else if (m === 'chase') {
      pos.copy(veh).addScaledVector(F, -30).add({ x: 0, y: 12, z: 0 } as THREE.Vector3)
      tgt.copy(veh).addScaledVector(F, 22).add({ x: 0, y: 2, z: 0 } as THREE.Vector3)
    } else if (m === 'drone') {
      pos.copy(veh).addScaledVector(side, 70).addScaledVector(F, -25).add({ x: 0, y: 55, z: 0 } as THREE.Vector3)
      tgt.copy(veh).addScaledVector(F, 30)
    } else if (m === 'orbit') {
      const a = el * 0.3
      pos.copy(veh).add({ x: Math.cos(a) * 42, y: 20, z: Math.sin(a) * 42 } as THREE.Vector3)
      tgt.copy(veh)
    } else {
      pos.copy(veh).addScaledVector(F, -35).add({ x: 0, y: 210, z: 0 } as THREE.Vector3)
      tgt.copy(veh)
    }
    const speed = el < 4.5 ? 1.1 : ended ? 0.9 : 2.4
    const k = 1 - Math.exp(-dt * speed)
    camera.position.lerp(pos, k)
    look.current.lerp(tgt, k)
    camera.lookAt(look.current)
  })
  return null
}

function FreeCam({ trip }: { trip: Trip }) {
  const target = useMemo(() => {
    const snap = sampleAt(trip, useStore.getState().t)
    return new THREE.Vector3(...toScene(snap.x, snap.y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip])
  return <OrbitControls makeDefault target={target} enableDamping maxPolarAngle={1.45} minDistance={10} maxDistance={3000} />
}

// ---------------------------------------------------------------------------------------------
// HUD

interface Toast {
  id: number
  e: TripEvent
}

const TOAST_ICON: Record<string, React.ReactNode> = {
  offroute: <IconAlert size={16} />,
  rejoin: <IconRoute size={16} />,
  traffic: <IconTraffic size={16} />,
  delivery: <IconBox size={16} />,
  regen: <IconRegen size={16} />,
  arrive: <IconFlag size={16} />,
  depart: <IconPin size={16} />,
}

function Hud({ trip, cam, setCam, rec, onClose }: { trip: Trip; cam: CamMode; setCam: (c: CamMode) => void; rec: Recorder; onClose: () => void }) {
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const snap = sampleAt(trip, t)
  const [toasts, setToasts] = useState<Toast[]>([])
  const ended = t >= trip.duration - 0.5 && !playing

  // raise a toast whenever playback crosses an event
  useEffect(() => {
    let last = useStore.getState().t
    let id = 0
    return useStore.subscribe((s) => {
      const now = s.t
      if (now > last && now - last < 600) {
        for (const e of trip.events) {
          if (e.t > last && e.t <= now && e.kind !== 'depart') {
            const toast = { id: ++id, e }
            setToasts((ts) => [...ts.slice(-2), toast])
            setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== toast.id)), 4200)
          }
        }
      }
      last = now
    })
  }, [trip])

  const off = snap.dev > 250
  const lvl = trafficLevel(snap.cong)
  const whkm = snap.s > 200 ? (snap.energy * 1000) / (snap.s / 1000) : 0
  const v = trip.plan.vehicle

  return (
    <div className="vs-hud">
      <div className="vs-top">
        <motion.div className="vs-title" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35, duration: 0.6 }}>
          <div className="vs-kicker">
            {rec.recording ? (
              <span className="rec-dot">
                <i /> REC {fmtRec(rec.elapsed)}
              </span>
            ) : (
              <span>Video session</span>
            )}
            <span>
              {v.name} · {v.plate}
            </span>
          </div>
          <h2>{trip.label}</h2>
          <div className="vs-meta">
            {fmtLongDay(trip.plan.start)} · {fmtHM(trip.plan.start)}–{fmtHM(trip.plan.start + trip.duration * 1000)} · {trip.stats.distanceKm.toFixed(1)} km
          </div>
        </motion.div>
        <motion.div className="vs-actions" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45, duration: 0.6 }}>
          <div className="vs-seg" role="group" aria-label="Camera">
            {CAM_MODES.map((m) => (
              <button key={m.id} className={cam === m.id ? 'on' : ''} onClick={() => setCam(m.id)} aria-pressed={cam === m.id}>
                {m.label}
              </button>
            ))}
          </div>
          {rec.supported && (
            <button className={`vs-btn ${rec.recording ? 'vs-btn-rec' : ''}`} onClick={rec.recording ? rec.stop : rec.start} title="Records the full trip replay with HUD as a video file">
              {rec.recording ? <IconStop size={14} /> : <IconRecord size={14} />}
              {rec.recording ? 'Stop & save' : 'Record clip'}
            </button>
          )}
          <button className="vs-btn vs-icon" onClick={onClose} aria-label="Close video session (Esc)">
            <IconClose size={16} />
          </button>
        </motion.div>
      </div>

      <div className="vs-toasts" aria-live="polite">
        <AnimatePresence>
          {off && (
            <motion.div key="off" className="vs-banner" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
              <IconAlert size={14} /> Off usual route · {fmtDev(snap.dev)}
            </motion.div>
          )}
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              layout
              className={`vs-toast vs-toast-${x.e.kind}`}
              initial={{ y: -14, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -8, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <span className="vs-toast-icon">{TOAST_ICON[x.e.kind]}</span>
              <span>
                <b>{x.e.title}</b>
                <small>{x.e.detail}</small>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.div className="vs-left" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.55, duration: 0.6 }}>
        <Speedo snap={snap} max={v.vmaxKmh + 10} />
        <PowerBar snap={snap} maxKw={Math.max(trip.stats.peakKw, 1)} maxRegen={Math.max(trip.stats.peakRegenKw, 1)} />
      </motion.div>

      <motion.div className="vs-right" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.55, duration: 0.6 }}>
        <MiniMap trip={trip} snap={snap} />
        <div className="vs-stats">
          <Stat k="Clock" v={fmtClock(snap.clock)} />
          <Stat k="Distance" v={`${(snap.s / 1000).toFixed(2)} km`} />
          <Stat k="Energy" v={`${snap.energy.toFixed(2)} kWh`} />
          <Stat k="Wh/km" v={whkm ? whkm.toFixed(0) : '—'} />
          <Stat k="Battery" v={`${(snap.soc * 100).toFixed(1)}%`} />
          <Stat k="Traffic" v={TRAFFIC_LABELS[lvl]} dot={STATUS[lvl]} />
        </div>
      </motion.div>

      <motion.div className="vs-bottom" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.65, duration: 0.6 }}>
        <PlaybackBar variant="hud" />
      </motion.div>

      <AnimatePresence>{ended && !rec.recording && <Summary trip={trip} />}</AnimatePresence>
    </div>
  )
}

const fmtRec = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Stat({ k, v, dot }: { k: string; v: string; dot?: string }) {
  return (
    <div className="vs-stat">
      <span>{k}</span>
      <b className="num">
        {dot && <i style={{ background: dot }} />}
        {v}
      </b>
    </div>
  )
}

function Speedo({ snap, max }: { snap: Snap; max: number }) {
  const R = 64
  const sweep = 240
  const start = 150
  const p = Math.min(1, snap.v / max)
  const arc = (from: number, to: number) => {
    const a0 = ((start + from * sweep) * Math.PI) / 180
    const a1 = ((start + to * sweep) * Math.PI) / 180
    const large = (to - from) * sweep > 180 ? 1 : 0
    return `M${80 + R * Math.cos(a0)} ${80 + R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${80 + R * Math.cos(a1)} ${80 + R * Math.sin(a1)}`
  }
  return (
    <div className="speedo">
      <svg width="160" height="140" viewBox="0 0 160 140" aria-hidden>
        <defs>
          <linearGradient id="spg" x1="0" x2="1">
            <stop offset="0" stopColor="#3987e5" />
            <stop offset="0.7" stopColor="#f29a3d" />
            <stop offset="1" stopColor="#e66767" />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} stroke="rgba(255,255,255,.1)" strokeWidth="8" fill="none" strokeLinecap="round" />
        {p > 0.005 && <path d={arc(0, p)} stroke="url(#spg)" strokeWidth="8" fill="none" strokeLinecap="round" className="speedo-arc" />}
        {Array.from({ length: 9 }, (_, i) => {
          const a = ((start + (i / 8) * sweep) * Math.PI) / 180
          return <line key={i} x1={80 + (R - 14) * Math.cos(a)} y1={80 + (R - 14) * Math.sin(a)} x2={80 + (R - 19) * Math.cos(a)} y2={80 + (R - 19) * Math.sin(a)} stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
        })}
      </svg>
      <div className="speedo-val">
        <b className="num">{snap.v.toFixed(0)}</b>
        <span>km/h</span>
      </div>
    </div>
  )
}

function PowerBar({ snap, maxKw, maxRegen }: { snap: Snap; maxKw: number; maxRegen: number }) {
  const regen = snap.power < 0
  const w = regen ? Math.min(1, -snap.power / maxRegen) : Math.min(1, snap.power / maxKw)
  return (
    <div className="powerbar">
      <div className="powerbar-head">
        <span>{regen ? 'Regenerating' : 'Power draw'}</span>
        <b className="num">
          {regen ? '−' : ''}
          {Math.abs(snap.power).toFixed(1)} kW
        </b>
      </div>
      <div className="powerbar-track">
        <div className="powerbar-mid" />
        <div className={`powerbar-fill ${regen ? 'regen' : ''}`} style={regen ? { right: '50%', width: `${w * 50}%` } : { left: '50%', width: `${w * 50}%` }} />
      </div>
      <div className="powerbar-scale">
        <span>regen</span>
        <span>draw</span>
      </div>
    </div>
  )
}

function MiniMap({ trip, snap }: { trip: Trip; snap: Snap }) {
  const W = 220
  const Hh = 150
  const geo = useMemo(() => {
    const P = trip.path
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < P.x.length; i++) {
      minX = Math.min(minX, P.x[i])
      maxX = Math.max(maxX, P.x[i])
      minY = Math.min(minY, P.y[i])
      maxY = Math.max(maxY, P.y[i])
    }
    const k = Math.min((W - 24) / (maxX - minX || 1), (Hh - 24) / (maxY - minY || 1))
    const ox = (W - (maxX - minX) * k) / 2
    const oy = (Hh - (maxY - minY) * k) / 2
    const map = (x: number, y: number) => [ox + (x - minX) * k, Hh - oy - (y - minY) * k] as const
    let d = ''
    const offRuns: string[] = []
    let cur = ''
    for (let i = 0; i < P.x.length; i += 4) {
      const [x, y] = map(P.x[i], P.y[i])
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      if (trip.metrics.dev[i] > 250) cur += `${cur ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      else if (cur) {
        offRuns.push(cur)
        cur = ''
      }
    }
    if (cur) offRuns.push(cur)
    return { d, offRuns, map }
  }, [trip])
  const [vx, vy] = geo.map(snap.x, snap.y)
  const pal = PALETTE.dark
  return (
    <div className="minimap">
      <svg width={W} height={Hh} aria-hidden>
        <path d={geo.d} stroke="rgba(255,255,255,.22)" strokeWidth="3" fill="none" strokeLinejoin="round" />
        <path d={geo.d} stroke={pal.onRoute} strokeWidth="2" fill="none" strokeLinejoin="round" pathLength={1} strokeDasharray={`${snap.s / trip.path.length} 1`} />
        {geo.offRuns.map((r, i) => (
          <path key={i} d={r} stroke={pal.offRoute} strokeWidth="2" fill="none" opacity="0.8" />
        ))}
        <circle cx={vx} cy={vy} r="9" fill="#f29a3d" opacity="0.25" className="mm-pulse" />
        <circle cx={vx} cy={vy} r="4.5" fill="#f29a3d" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

function Summary({ trip }: { trip: Trip }) {
  const s = trip.stats
  const setPlaying = useStore((st) => st.setPlaying)
  const items: [string, string][] = [
    ['Distance', `${s.distanceKm.toFixed(1)} km`],
    ['Duration', fmtDur(s.durationS)],
    ['Energy', `${s.energyKwh.toFixed(2)} kWh`],
    ['Efficiency', `${s.whPerKm.toFixed(0)} Wh/km`],
    ['Regen', `${s.regenKwh.toFixed(2)} kWh`],
    ['SoC', `${(s.socStart * 100).toFixed(0)}% → ${(s.socEnd * 100).toFixed(0)}%`],
    ['Off route', s.offRouteKm ? `${s.offRouteKm.toFixed(1)} km` : 'None'],
    ['CO₂ avoided', `${s.co2SavedKg.toFixed(1)} kg`],
  ]
  return (
    <motion.div className="vs-summary" initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ delay: 0.6, duration: 0.5 }}>
      <div className="vs-kicker">Trip complete</div>
      <h3>{trip.label}</h3>
      <div className="vs-summary-grid">
        {items.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.05 }}>
            <span>{k}</span>
            <b className="num">{v}</b>
          </motion.div>
        ))}
      </div>
      <button className="vs-btn vs-btn-primary" onClick={() => setPlaying(true)}>
        Replay trip
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------------------------
// Recorder: composites the WebGL frame + a burned-in HUD onto a 2D canvas and encodes it.

interface Recorder {
  supported: boolean
  recording: boolean
  elapsed: number
  start: () => void
  stop: () => void
}

function useRecorder(trip: Trip, glRef: React.RefObject<HTMLCanvasElement | null>): Recorder {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const stopRef = useRef<() => void>(() => {})
  const supported = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

  const start = () => {
    const gl = glRef.current
    if (!gl || recording) return
    const scale = Math.min(1, 1920 / gl.width)
    const W = Math.round((gl.width * scale) / 2) * 2
    const H = Math.round((gl.height * scale) / 2) * 2
    const comp = document.createElement('canvas')
    comp.width = W
    comp.height = H
    const ctx = comp.getContext('2d')!
    const stream = comp.captureStream(30)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10_000_000 } : undefined)
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${trip.plan.vehicle.name}-${trip.id}-replay.${(mr.mimeType || '').includes('mp4') ? 'mp4' : 'webm'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }
    const st = useStore.getState()
    st.seek(0)
    st.setPlaying(true)
    const t0 = performance.now()
    let endAt = 0
    let raf = 0
    const draw = () => {
      ctx.drawImage(gl, 0, 0, W, H)
      const s = useStore.getState()
      drawHud(ctx, W, H, trip, sampleAt(trip, s.t))
      setElapsed((performance.now() - t0) / 1000)
      if (s.t >= trip.duration - 0.01 && !endAt) endAt = performance.now() + 2500
      if (endAt && performance.now() > endAt) return stopRef.current()
      raf = requestAnimationFrame(draw)
    }
    stopRef.current = () => {
      cancelAnimationFrame(raf)
      if (mr.state !== 'inactive') mr.stop()
      setRecording(false)
    }
    mr.start(250)
    setRecording(true)
    raf = requestAnimationFrame(draw)
  }

  useEffect(() => () => stopRef.current(), [])
  return { supported, recording, elapsed, start, stop: () => stopRef.current() }
}

function drawHud(ctx: CanvasRenderingContext2D, W: number, H: number, trip: Trip, snap: Snap) {
  const u = H / 720
  ctx.save()
  // top gradient + title
  const g = ctx.createLinearGradient(0, 0, 0, 140 * u)
  g.addColorStop(0, 'rgba(0,0,0,.65)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, 140 * u)
  const b = ctx.createLinearGradient(0, H - 170 * u, 0, H)
  b.addColorStop(0, 'rgba(0,0,0,0)')
  b.addColorStop(1, 'rgba(0,0,0,.7)')
  ctx.fillStyle = b
  ctx.fillRect(0, H - 170 * u, W, 170 * u)

  const font = (w: number, px: number, mono = false) => `${w} ${px * u}px ${mono ? '"JetBrains Mono", monospace' : '"Inter Variable", system-ui, sans-serif'}`
  ctx.fillStyle = 'rgba(255,255,255,.6)'
  ctx.font = font(600, 12)
  ctx.fillText(`COULOMB · ROUTE INTELLIGENCE   ${trip.plan.vehicle.name} · ${trip.plan.vehicle.plate}`, 32 * u, 40 * u)
  ctx.fillStyle = '#fff'
  ctx.font = font(650, 28)
  ctx.fillText(trip.label, 32 * u, 76 * u)
  ctx.fillStyle = 'rgba(255,255,255,.7)'
  ctx.font = font(500, 14)
  ctx.fillText(`${fmtLongDay(trip.plan.start)}  ·  ${fmtClock(snap.clock)}`, 32 * u, 100 * u)

  // speed
  const speed = snap.v.toFixed(0)
  ctx.fillStyle = '#fff'
  ctx.font = font(700, 64, true)
  ctx.fillText(speed, 32 * u, H - 60 * u)
  const sw = ctx.measureText(speed).width
  ctx.font = font(500, 14)
  ctx.fillStyle = 'rgba(255,255,255,.65)'
  ctx.fillText('km/h', 32 * u + sw + 10 * u, H - 62 * u)

  // right stats
  const stats: [string, string][] = [
    ['DISTANCE', `${(snap.s / 1000).toFixed(2)} km`],
    ['ENERGY', `${snap.energy.toFixed(2)} kWh`],
    ['BATTERY', `${(snap.soc * 100).toFixed(1)} %`],
    ['POWER', `${snap.power.toFixed(1)} kW`],
  ]
  stats.forEach(([k, v], i) => {
    const x = W - (4 - i) * 150 * u - 16 * u
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.font = font(600, 11)
    ctx.fillText(k, x, H - 86 * u)
    ctx.fillStyle = '#fff'
    ctx.font = font(600, 20, true)
    ctx.fillText(v, x, H - 60 * u)
  })

  // progress bar
  const p = snap.t / trip.duration
  ctx.fillStyle = 'rgba(255,255,255,.18)'
  ctx.fillRect(32 * u, H - 30 * u, W - 64 * u, 4 * u)
  for (const d of trip.deviations) {
    ctx.fillStyle = 'rgba(230,103,103,.85)'
    ctx.fillRect(32 * u + (d.tStart / trip.duration) * (W - 64 * u), H - 30 * u, ((d.tEnd - d.tStart) / trip.duration) * (W - 64 * u), 4 * u)
  }
  ctx.fillStyle = '#f29a3d'
  ctx.fillRect(32 * u, H - 30 * u, p * (W - 64 * u), 4 * u)

  // off-route pill
  if (snap.dev > 250) {
    const txt = `OFF USUAL ROUTE · ${fmtDev(snap.dev).toUpperCase()}`
    ctx.font = font(700, 13)
    const tw = ctx.measureText(txt).width
    const x = W / 2 - tw / 2 - 16 * u
    ctx.fillStyle = 'rgba(208,59,59,.9)'
    ctx.beginPath()
    ctx.roundRect(x, 28 * u, tw + 32 * u, 30 * u, 15 * u)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(txt, x + 16 * u, 48 * u)
  }
  ctx.restore()
}
