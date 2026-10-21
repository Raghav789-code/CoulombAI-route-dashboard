// Colour scales for every map mode. Each scale does one job:
//   deviation → categorical (on / off route), speed & elevation → sequential (one hue),
//   energy → diverging around the trip's own average, traffic → status.
import type { Trip } from '../data/simulate'
import { trafficLevel } from './sample'

export type Theme = 'light' | 'dark'
export type Tab = 'week' | 'deviation' | 'speed' | 'energy' | 'traffic' | 'elevation'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'week', label: 'Whole week' },
  { id: 'deviation', label: 'Deviation' },
  { id: 'speed', label: 'Speed' },
  { id: 'energy', label: 'Energy' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'elevation', label: 'Elevation' },
]

const BLUE_LIGHT = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']
const BLUE_DARK = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#cde2fb']
const EARTH_LIGHT = ['#ecd3a8', '#e2bd86', '#d6a666', '#c78f4b', '#b57936', '#9d6427', '#83501d', '#693e15']
const EARTH_DARK = ['#6e4318', '#85541f', '#9c6629', '#b27a36', '#c58f4b', '#d4a564', '#e0bc84', '#ebd2a8']
const DIV_LIGHT = { neg: ['#1c5cab', '#3987e5', '#86b6ef'], mid: '#9a9993', pos: ['#eb9a8f', '#e0605a', '#b8282b'] }
const DIV_DARK = { neg: ['#3987e5', '#6da7ec', '#9ec5f4'], mid: '#6b6a66', pos: ['#f0aea5', '#e66767', '#d03b3b'] }

export const STATUS = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'] as const

export const PALETTE = {
  light: { onRoute: '#2a78d6', offRoute: '#d03b3b', usual: '#3b4048', accent: '#e8892b', week: '#2a78d6' },
  dark: { onRoute: '#3987e5', offRoute: '#e66767', usual: '#c3c7cc', accent: '#f29a3d', week: '#3987e5' },
}

const pick = (ramp: string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))]

export interface ModeScale {
  /** colour for dense-path index i */
  color: (i: number) => string
  /** 0..1 value used for 3D curtain height */
  height: (i: number) => number
  legend: LegendSpec
}

export type LegendSpec =
  | { kind: 'deviation'; usualName: string; on: string; off: string; usual: string }
  | { kind: 'ramp'; title: string; stops: string[]; min: string; max: string; mid?: string }
  | { kind: 'status'; title: string; items: { label: string; color: string }[] }
  | { kind: 'week'; color: string; count: number }

const SPEED_MAX = 60

export function modeScale(trip: Trip, tab: Tab, theme: Theme): ModeScale {
  const m = trip.metrics
  const pal = PALETTE[theme]
  switch (tab) {
    case 'speed': {
      const ramp = theme === 'light' ? BLUE_LIGHT : BLUE_DARK
      return {
        color: (i) => pick(ramp, m.speed[i] / SPEED_MAX),
        height: (i) => Math.min(1, m.speed[i] / SPEED_MAX),
        legend: { kind: 'ramp', title: 'Average speed', stops: ramp, min: '0', max: `${SPEED_MAX}+ km/h` },
      }
    }
    case 'energy': {
      const vals = Array.from(m.whkm).sort((a, b) => a - b)
      const avg = trip.stats.whPerKm
      const lo = vals[Math.floor(vals.length * 0.04)]
      const hi = vals[Math.floor(vals.length * 0.96)]
      const span = Math.max(avg - lo, hi - avg, 1)
      const d = theme === 'light' ? DIV_LIGHT : DIV_DARK
      const color = (i: number) => {
        const z = (m.whkm[i] - avg) / span
        if (Math.abs(z) < 0.12) return d.mid
        if (z < 0) return d.neg[Math.min(2, Math.floor((1 + z) * 3))]
        return d.pos[Math.min(2, Math.floor(z * 3))]
      }
      return {
        color,
        height: (i) => Math.max(0, Math.min(1, (m.whkm[i] - lo) / (hi - lo || 1))),
        legend: {
          kind: 'ramp',
          title: 'Energy intensity vs trip average',
          stops: [...d.neg, d.mid, ...d.pos],
          min: `${Math.round(avg - span)} Wh/km`,
          mid: `avg ${Math.round(avg)}`,
          max: `${Math.round(avg + span)}`,
        },
      }
    }
    case 'traffic':
      return {
        color: (i) => STATUS[trafficLevel(m.cong[i])],
        height: (i) => m.cong[i],
        legend: {
          kind: 'status',
          title: 'Traffic',
          items: ['Free-flowing', 'Moderate', 'Heavy', 'Gridlock'].map((label, k) => ({ label, color: STATUS[k] })),
        },
      }
    case 'elevation': {
      let lo = Infinity
      let hi = -Infinity
      for (const e of m.elev) {
        if (e < lo) lo = e
        if (e > hi) hi = e
      }
      const ramp = theme === 'light' ? EARTH_LIGHT : EARTH_DARK
      return {
        color: (i) => pick(ramp, (m.elev[i] - lo) / (hi - lo || 1)),
        height: (i) => (m.elev[i] - lo) / (hi - lo || 1),
        legend: { kind: 'ramp', title: 'Elevation (m above sea level)', stops: ramp, min: `${Math.round(lo)} m`, max: `${Math.round(hi)} m` },
      }
    }
    case 'week':
      return {
        color: () => pal.week,
        height: () => 0.15,
        legend: { kind: 'week', color: pal.week, count: 0 },
      }
    default: {
      const maxDev = Math.max(400, ...trip.deviations.map((d) => d.maxDev))
      return {
        color: (i) => (m.dev[i] > 250 ? pal.offRoute : pal.onRoute),
        height: (i) => (m.dev[i] > 250 ? 0.25 + 0.75 * Math.min(1, m.dev[i] / maxDev) : 0.06),
        legend: { kind: 'deviation', usualName: trip.plan.usualId ?? 'usual', on: pal.onRoute, off: pal.offRoute, usual: pal.usual },
      }
    }
  }
}

/** Group consecutive dense-path points that share a colour. Each run overlaps the next by one point. */
export function colorRuns(n: number, color: (i: number) => string, step = 1) {
  const runs: { i0: number; i1: number; color: string }[] = []
  let start = 0
  let c = color(0)
  for (let i = step; i < n; i += step) {
    const ci = color(i)
    if (ci !== c) {
      runs.push({ i0: start, i1: i, color: c })
      start = i
      c = ci
    }
  }
  runs.push({ i0: start, i1: n - 1, color: c })
  return runs
}
