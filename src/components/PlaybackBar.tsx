import { useRef } from 'react'
import { useStore, useTrip } from '../state/store'
import { fmtClock, fmtHM } from '../lib/format'
import { PALETTE } from '../lib/scales'
import { IconPause, IconPlay } from './Icons'

export const RATES = [1, 10, 30, 60, 120, 240, 480, 960]

export function PlaybackBar({ variant = 'card' }: { variant?: 'card' | 'hud' }) {
  const trip = useTrip()
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const toggle = useStore((s) => s.toggle)
  const seek = useStore((s) => s.seek)
  const setRate = useStore((s) => s.setRate)
  const setPlaying = useStore((s) => s.setPlaying)
  const theme = useStore((s) => s.theme)
  const track = useRef<HTMLDivElement>(null)
  const wasPlaying = useRef(false)
  const D = trip.duration
  const p = Math.min(1, t / D)

  const seekFromEvent = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    seek(((clientX - r.left) / r.width) * D)
  }

  const off = PALETTE[variant === 'hud' ? 'dark' : theme].offRoute

  return (
    <div className={`playback playback-${variant}`}>
      <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>
      <div className="pb-time num">{fmtClock(trip.plan.start + t * 1000)}</div>
      <div
        ref={track}
        className="scrub"
        role="slider"
        tabIndex={0}
        aria-label="Trip position"
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={fmtClock(trip.plan.start + t * 1000)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          wasPlaying.current = useStore.getState().playing
          setPlaying(false)
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e.clientX)
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          if (wasPlaying.current) setPlaying(true)
        }}
        onKeyDown={(e) => {
          const step = Math.max(10, D / 100)
          if (e.key === 'ArrowRight') seek(t + step)
          else if (e.key === 'ArrowLeft') seek(t - step)
          else if (e.key === 'Home') seek(0)
          else if (e.key === 'End') seek(D)
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="scrub-track">
          {trip.deviations.map((d) => (
            <div key={d.i0} className="scrub-dev" style={{ left: `${(d.tStart / D) * 100}%`, width: `${((d.tEnd - d.tStart) / D) * 100}%`, background: off }} />
          ))}
          <div className="scrub-fill" style={{ width: `${p * 100}%` }} />
          {trip.events
            .filter((e) => e.kind !== 'depart' && e.kind !== 'arrive')
            .map((e, i) => (
              <div key={i} className={`scrub-tick tick-${e.kind}`} style={{ left: `${(e.t / D) * 100}%` }} title={`${fmtHM(trip.plan.start + e.t * 1000)} · ${e.title}`} />
            ))}
        </div>
        <div className="scrub-thumb" style={{ left: `${p * 100}%` }} />
      </div>
      <div className="pb-time pb-end num">{fmtHM(trip.plan.start + D * 1000)}</div>
      <label className="rate">
        <span className="sr-only">Playback speed</span>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}× speed
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
