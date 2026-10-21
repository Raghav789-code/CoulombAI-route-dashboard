import type { Trip } from '../data/simulate'
import { DS } from '../data/network'

export interface Snap {
  t: number
  clock: number
  s: number
  x: number
  y: number
  /** km/h */
  v: number
  elev: number
  grade: number
  power: number
  /** kWh */
  energy: number
  regen: number
  soc: number
  temp: number
  current: number
  voltage: number
  cong: number
  dev: number
  heading: number
  /** dense-path index at the vehicle */
  i: number
}

export function sampleAt(trip: Trip, t: number): Snap {
  const S = trip.samples
  const tc = Math.max(0, Math.min(t, trip.duration))
  const k = Math.min(S.n - 2, Math.floor(tc))
  const f = tc - k
  const L = (a: Float32Array) => a[k] + (a[k + 1] - a[k]) * f
  const s = L(S.s)
  const P = trip.path
  const n = P.x.length
  const i = Math.min(n - 1, Math.max(0, Math.round(s / DS)))
  const a = Math.max(0, i - 3)
  const b = Math.min(n - 1, i + 3)
  return {
    t: tc,
    clock: trip.plan.start + tc * 1000,
    s,
    x: L(S.x),
    y: L(S.y),
    v: L(S.v) * 3.6,
    elev: L(S.elev),
    grade: L(S.grade),
    power: L(S.power),
    energy: L(S.energy) / 1000,
    regen: L(S.regen) / 1000,
    soc: L(S.soc),
    temp: L(S.temp),
    current: L(S.current),
    voltage: L(S.voltage),
    cong: L(S.cong),
    dev: L(S.dev),
    heading: Math.atan2(P.y[b] - P.y[a], P.x[b] - P.x[a]),
    i,
  }
}

export const TRAFFIC_LABELS = ['Free-flowing', 'Moderate', 'Heavy', 'Gridlock'] as const
export const trafficLevel = (cong: number) => (cong < 0.35 ? 0 : cong < 0.55 ? 1 : cong < 0.75 ? 2 : 3)

/** Time of the first sample at or after distance s. */
export function timeAtS(trip: Trip, s: number) {
  const P = trip.path
  const i = Math.min(P.x.length - 1, Math.max(0, Math.round(s / DS)))
  return trip.metrics.T[i]
}
