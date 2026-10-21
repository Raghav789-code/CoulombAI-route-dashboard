// Per-second EV trip simulator.
//
// 1. Traffic: a congestion field from time-of-day peaks, known choke points
//    (Silk Board, Marathahalli, KR Puram…) and correlated noise along the road.
// 2. Kinematics: target speed from road class × congestion, capped by curvature,
//    with signal / jam / delivery stops, then a forward–backward pass under
//    acceleration and braking limits. Integrated to time and resampled at 1 Hz.
// 3. Energy: road-load model (inertia + rolling + aero + grade) with drivetrain
//    and regen efficiencies, HVAC load, pack voltage sag, and lumped thermal model.
// 4. Deviation: distance of every point to the vehicle's usual route.

import { DS, PLACE, ROAD_NAMES, nearestPlace, type DensePath } from './network'
import { elevation } from './terrain'
import type { VehicleSpec } from './vehicles'
import { clamp, hash, rng, segDist } from './geo'

export interface TripPlan {
  id: string
  vehicle: VehicleSpec
  routeId: string
  route: string[]
  usualId: string | null
  usual: string[] | null
  /** epoch ms */
  start: number
  dayIndex: number
  purpose: string
  note?: string
  socStart: number
  deliveryStops?: string[]
  /** extra congestion bias (incidents, rain) */
  trafficBias?: number
}

export interface Samples {
  n: number
  s: Float32Array
  x: Float32Array
  y: Float32Array
  /** m/s */
  v: Float32Array
  a: Float32Array
  elev: Float32Array
  grade: Float32Array
  /** battery power kW, negative = regen */
  power: Float32Array
  /** cumulative net Wh */
  energy: Float32Array
  /** cumulative regen Wh (positive) */
  regen: Float32Array
  soc: Float32Array
  temp: Float32Array
  current: Float32Array
  voltage: Float32Array
  cong: Float32Array
  dev: Float32Array
  heading: Float32Array
}

export interface PathMetrics {
  /** first arrival time at each dense point (s) */
  T: Float32Array
  speed: Float32Array
  whkm: Float32Array
  cong: Float32Array
  dev: Float32Array
  elev: Float32Array
}

export interface Deviation {
  i0: number
  i1: number
  sStart: number
  sEnd: number
  km: number
  maxDev: number
  tStart: number
  tEnd: number
  from: string
  to: string
  extraKwh: number
}

export type StopKind = 'signal' | 'jam' | 'delivery' | 'passenger'
export interface Stop {
  i: number
  t: number
  dur: number
  kind: StopKind
}

export type EventKind = 'depart' | 'arrive' | 'offroute' | 'rejoin' | 'traffic' | 'delivery' | 'regen' | 'brake'
export interface TripEvent {
  t: number
  kind: EventKind
  title: string
  detail: string
}

export interface TripStats {
  distanceKm: number
  durationS: number
  movingS: number
  idleS: number
  avgKmh: number
  movingAvgKmh: number
  maxKmh: number
  energyKwh: number
  regenKwh: number
  whPerKm: number
  socStart: number
  socEnd: number
  maxTemp: number
  offRouteKm: number
  stops: number
  elevGain: number
  elevLoss: number
  hardBrakes: number
  costInr: number
  iceCostInr: number
  co2SavedKg: number
  peakKw: number
  peakRegenKw: number
}

export interface Trip {
  id: string
  plan: TripPlan
  label: string
  from: string
  to: string
  path: DensePath
  usualPath: DensePath | null
  metrics: PathMetrics
  samples: Samples
  duration: number
  deviations: Deviation[]
  stops: Stop[]
  events: TripEvent[]
  stats: TripStats
}

const G = 9.81
const RHO = 1.18

const HOTSPOTS: [string, number, number][] = [
  ['silkboard', 1.0, 1100],
  ['marathahalli', 0.75, 900],
  ['krpuram', 0.7, 1000],
  ['agara', 0.4, 700],
  ['tinfactory', 0.55, 800],
  ['domlur', 0.3, 700],
  ['kundalahalli', 0.45, 700],
  ['hal', 0.3, 800],
  ['hoodi', 0.35, 700],
  ['koramangala', 0.3, 900],
]

const CLS_V = [62, 56, 44, 30] // highway, ring, arterial, local (km/h)
const CLS_C = [0.05, 0.15, 0.08, -0.06]

/** IST hour-of-day for an epoch ms. */
export const istHour = (ms: number) => (((ms / 3_600_000 + 5.5) % 24) + 24) % 24

function todCongestion(h: number) {
  return clamp(
    0.12 +
      0.78 * Math.exp(-(((h - 9.6) / 1.15) ** 2)) +
      0.85 * Math.exp(-(((h - 18.7) / 1.35) ** 2)) +
      0.22 * Math.exp(-(((h - 13.5) / 1.6) ** 2)),
    0,
    1,
  )
}

const DAY_FACTOR = [1, 1, 1, 1, 1.05, 0.62, 0.42]

function hotspot(x: number, y: number) {
  let h = 0
  for (const [id, w, r] of HOTSPOTS) {
    const p = PLACE[id]
    h += w * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (r * r))
  }
  return h
}

/** Spatial hash over a polyline for fast distance queries. */
function polylineIndex(xs: ArrayLike<number>, ys: ArrayLike<number>, cell: number) {
  const grid = new Map<number, number[]>()
  const key = (cx: number, cy: number) => (cx + 2048) * 4096 + (cy + 2048)
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = Math.floor(Math.min(xs[i], xs[i + 1]) / cell)
    const x1 = Math.floor(Math.max(xs[i], xs[i + 1]) / cell)
    const y0 = Math.floor(Math.min(ys[i], ys[i + 1]) / cell)
    const y1 = Math.floor(Math.max(ys[i], ys[i + 1]) / cell)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy)
        const arr = grid.get(k)
        if (arr) arr.push(i)
        else grid.set(k, [i])
      }
  }
  return (px: number, py: number) => {
    const cx = Math.floor(px / cell)
    const cy = Math.floor(py / cell)
    let best = Infinity
    for (let r = 0; r < 60; r++) {
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const arr = grid.get(key(cx + dx, cy + dy))
          if (!arr) continue
          for (const i of arr) {
            const d = segDist(px, py, xs[i], ys[i], xs[i + 1], ys[i + 1])
            if (d < best) best = d
          }
        }
      if (best <= r * cell) break
    }
    return best
  }
}

export function simulate(plan: TripPlan, path: DensePath, usualPath: DensePath | null): Trip {
  const R = rng(hash(plan.id))
  const V = plan.vehicle
  const n = path.x.length
  const { x, y, s } = path
  const hour0 = istHour(plan.start)
  const dayF = DAY_FACTOR[plan.dayIndex] ?? 1
  const style = 0.93 + R() * 0.12 // driver style multiplier on target speed
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28]

  // ---- terrain ----
  const elev = new Float32Array(n)
  for (let i = 0; i < n; i++) elev[i] = elevation(x[i], y[i])
  const grade = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 6)
    const b = Math.min(n - 1, i + 6)
    grade[i] = b > a ? (elev[b] - elev[a]) / (s[b] - s[a]) : 0
  }

  // ---- heading & curvature ----
  const heading = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    heading[i] = Math.atan2(y[b] - y[a], x[b] - x[a])
  }
  const vCurve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 3)
    const b = Math.min(n - 1, i + 3)
    let d = heading[b] - heading[a]
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    const radius = (s[b] - s[a]) / Math.max(Math.abs(d), 1e-4)
    vCurve[i] = Math.sqrt(2.3 * radius)
  }

  // ---- congestion field (first pass assumes ~24 km/h to estimate clock time) ----
  const trafficBias = plan.trafficBias ?? 0
  const cong = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const h = hour0 + s[i] / 6.7 / 3600
    const tod = todCongestion(h) * dayF
    const noise =
      0.5 * Math.sin(s[i] / 700 + ph[0]) + 0.3 * Math.sin(s[i] / 260 + ph[1]) + 0.2 * Math.sin(s[i] / 1900 + ph[2])
    cong[i] = clamp(tod * (0.32 + 0.9 * hotspot(x[i], y[i]) + CLS_C[path.cls[i]]) + 0.2 * noise * tod + trafficBias, 0, 1)
  }

  // ---- target speed ----
  const vMax = new Float32Array(n)
  const vCap = V.vmaxKmh / 3.6
  for (let i = 0; i < n; i++) {
    const free = Math.min(CLS_V[path.cls[i]] / 3.6, vCap) * style * (1 + 0.07 * Math.sin(s[i] / 150 + ph[3]))
    const target = Math.max(1.1, free * (1 - 0.84 * cong[i]))
    vMax[i] = Math.min(target, vCurve[i], vCap * 1.05)
  }

  // ---- stops ----
  const stopAt = new Map<number, { dur: number; kind: StopKind }>()
  const addStop = (i: number, dur: number, kind: StopKind, force = false) => {
    if (i <= 2 || i >= n - 3) return
    if (!force) for (const k of stopAt.keys()) if (Math.abs(k - i) < 6) return
    stopAt.set(i, { dur, kind })
  }
  const idxOfS = (sv: number) => Math.min(n - 1, Math.max(0, Math.round(sv / DS)))
  for (const node of path.nodeS.slice(1, -1)) {
    const i = idxOfS(node.s)
    if (plan.deliveryStops?.includes(node.id)) addStop(i, 170 + R() * 260, 'delivery', true)
    else if (R() < 0.62 + 0.3 * cong[i]) addStop(i, 18 + R() * 55 * (1 + 1.4 * cong[i]), 'signal')
  }
  for (let sv = 500 + R() * 400; sv < path.length - 300; ) {
    const i = idxOfS(sv)
    const ring = path.cls[i] <= 1
    if (R() < (ring ? 0.35 : 0.55)) addStop(i, 10 + R() * 42 * (1 + cong[i]), 'signal')
    sv += ring ? 1700 + R() * 1200 : 650 + R() * 700
  }
  if (V.kind === 'shuttle') {
    for (let sv = 600; sv < path.length - 400; sv += 700 + R() * 350) addStop(idxOfS(sv), 18 + R() * 26, 'passenger')
  }
  for (let sv = 200; sv < path.length - 200; ) {
    const i = idxOfS(sv)
    if (cong[i] > 0.6 && R() < (cong[i] - 0.5) * 2.2) addStop(i, 4 + R() * 22 * cong[i], 'jam')
    sv += 170 + R() * 230
  }
  for (const i of stopAt.keys()) vMax[i] = 0
  vMax[0] = 0
  vMax[n - 1] = 0
  // a share of jam stops are sudden (cut-ins, pedestrians): the driver brakes well past the comfort limit
  const decelAt = new Float32Array(n).fill(V.decel)
  const sudden: number[] = []
  for (const [i, st] of stopAt) {
    if (st.kind !== 'jam' || R() > 0.22) continue
    sudden.push(i)
    for (let j = Math.max(0, i - 40); j <= i; j++) decelAt[j] = V.decel * 1.75
  }

  // ---- forward/backward speed profile ----
  const v = new Float32Array(n)
  for (let i = 1; i < n; i++) {
    const ds = s[i] - s[i - 1]
    v[i] = Math.min(vMax[i], Math.sqrt(v[i - 1] ** 2 + 2 * V.accel * ds))
  }
  for (let i = n - 2; i >= 0; i--) {
    const ds = s[i + 1] - s[i]
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * decelAt[i] * ds))
  }

  // ---- integrate time (knots include dwell plateaus) ----
  const kT: number[] = [0]
  const kS: number[] = [0]
  const arrive = new Float32Array(n)
  const stops: Stop[] = []
  let t = 0
  for (let i = 1; i < n; i++) {
    const ds = s[i] - s[i - 1]
    t += ds / Math.max((v[i - 1] + v[i]) / 2, 0.35)
    arrive[i] = t
    kT.push(t)
    kS.push(s[i])
    const st = stopAt.get(i)
    if (st) {
      stops.push({ i, t, dur: st.dur, kind: st.kind })
      t += st.dur
      kT.push(t)
      kS.push(s[i])
    }
  }
  const duration = t
  const N = Math.floor(duration) + 2

  // ---- resample at 1 Hz ----
  const mk = () => new Float32Array(N)
  const S: Samples = {
    n: N,
    s: mk(), x: mk(), y: mk(), v: mk(), a: mk(), elev: mk(), grade: mk(), power: mk(),
    energy: mk(), regen: mk(), soc: mk(), temp: mk(), current: mk(), voltage: mk(),
    cong: mk(), dev: mk(), heading: mk(),
  }
  let kp = 0
  for (let k = 0; k < N; k++) {
    const tk = Math.min(k, duration)
    while (kp < kT.length - 2 && kT[kp + 1] < tk) kp++
    const span = kT[kp + 1] - kT[kp]
    const f = span > 0 ? (tk - kT[kp]) / span : 0
    S.s[k] = kS[kp] + (kS[kp + 1] - kS[kp]) * clamp(f, 0, 1)
  }
  for (let k = 0; k < N; k++) {
    const a = Math.max(0, k - 1)
    const b = Math.min(N - 1, k + 1)
    S.v[k] = (S.s[b] - S.s[a]) / Math.max(1, b - a)
  }
  for (let k = 0; k < N; k++) {
    const a = Math.max(0, k - 1)
    const b = Math.min(N - 1, k + 1)
    S.a[k] = (S.v[b] - S.v[a]) / Math.max(1, b - a)
  }
  const atS = (arr: ArrayLike<number>, sv: number) => {
    const fi = sv / DS
    const i = Math.min(n - 2, Math.max(0, Math.floor(fi)))
    const f = clamp(fi - i, 0, 1)
    return arr[i] + (arr[i + 1] - arr[i]) * f
  }

  // ---- deviation from usual route (per dense point) ----
  const devDense = new Float32Array(n)
  if (usualPath) {
    const q = polylineIndex(usualPath.x, usualPath.y, 250)
    for (let i = 0; i < n; i++) devDense[i] = q(x[i], y[i])
  }

  // ---- energy, battery & thermal ----
  const ambient = 21 + 6 * Math.sin(((hour0 - 9) / 24) * 2 * Math.PI) + R() * 1.5
  const hvac = clamp((ambient - 22) / 8, 0.25, 1)
  let E = 0
  let Rg = 0
  let T = ambient + 1.5 + R() * 2
  let aux = V.auxKw * (0.6 + 0.6 * hvac)
  for (let k = 0; k < N; k++) {
    const sv = S.s[k]
    const fi = sv / DS
    const i = Math.min(n - 2, Math.floor(fi))
    const f = clamp(fi - i, 0, 1)
    S.x[k] = x[i] + (x[i + 1] - x[i]) * f
    S.y[k] = y[i] + (y[i + 1] - y[i]) * f
    S.elev[k] = atS(elev, sv)
    S.grade[k] = atS(grade, sv)
    S.cong[k] = atS(cong, sv)
    S.dev[k] = atS(devDense, sv)
    S.heading[k] = heading[Math.round(fi) < n ? Math.round(fi) : n - 1]
    const vel = S.v[k]
    const th = Math.atan(S.grade[k])
    const F = V.mass * S.a[k] + V.mass * G * V.crr * Math.cos(th) + 0.5 * RHO * V.cda * vel * vel + V.mass * G * Math.sin(th)
    const Pw = F * vel
    let Pb = Pw > 0 ? Pw / V.etaDrive : vel > 1.4 ? Math.max(Pw * V.etaRegen, -V.regenMaxKw * 1000) : 0
    aux = clamp(aux + (R() - 0.5) * 0.02 * V.auxKw, V.auxKw * 0.4, V.auxKw * 1.3)
    Pb += aux * 1000
    S.power[k] = Pb / 1000
    E += Pb / 3600
    if (Pb < 0) Rg += -Pb / 3600
    S.energy[k] = E
    S.regen[k] = Rg
    const soc = plan.socStart - E / 1000 / V.batteryKwh
    S.soc[k] = soc
    const ocv = V.packVoltage * (0.9 + 0.14 * soc)
    const I = Pb / ocv
    S.current[k] = I
    S.voltage[k] = ocv - I * V.packResistance
    T += (I * I * V.packResistance) / V.thermalMass - (T - (ambient + 3)) / 2600
    S.temp[k] = T
  }

  // ---- per-point metrics for map colouring ----
  const sampleAtT = (arr: Float32Array, tv: number) => {
    const k = Math.min(N - 2, Math.max(0, Math.floor(tv)))
    const f = clamp(tv - k, 0, 1)
    return arr[k] + (arr[k + 1] - arr[k]) * f
  }
  // departure time at each dense point (after any dwell)
  const depart = new Float32Array(n)
  for (let i = 0; i < n; i++) depart[i] = arrive[i] + (stopAt.get(i)?.dur ?? 0)
  const W = 12
  const metrics: PathMetrics = {
    T: arrive,
    speed: new Float32Array(n),
    whkm: new Float32Array(n),
    cong,
    dev: devDense,
    elev,
  }
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - W)
    const hi = Math.min(n - 1, i + W)
    const dt = arrive[hi] - depart[lo]
    const dsv = s[hi] - s[lo]
    metrics.speed[i] = dt > 0 ? (dsv / dt) * 3.6 : 0
    const de = sampleAtT(S.energy, arrive[hi]) - sampleAtT(S.energy, depart[lo])
    metrics.whkm[i] = dsv > 0 ? de / (dsv / 1000) : 0
  }

  // ---- deviation runs ----
  const deviations: Deviation[] = []
  if (usualPath) {
    let i = 0
    while (i < n) {
      if (devDense[i] > 250) {
        let j = i
        while (j < n - 1 && devDense[j + 1] > 250) j++
        if (s[j] - s[i] > 150) {
          // extend to where the trace actually leaves / rejoins (dev < 30 m)
          let a = i
          while (a > 0 && devDense[a - 1] > 30) a--
          let b = j
          while (b < n - 1 && devDense[b + 1] > 30) b++
          let maxDev = 0
          for (let k = a; k <= b; k++) maxDev = Math.max(maxDev, devDense[k])
          const tS = arrive[a]
          const tE = arrive[b]
          const fromP = nearestPlace(x[a], y[a])
          const toP = nearestPlace(x[b], y[b])
          const kmOff = (s[b] - s[a]) / 1000
          // energy spent on the detour vs. the trip's average intensity on the usual-route portion
          const eDet = sampleAtT(S.energy, tE) - sampleAtT(S.energy, tS)
          deviations.push({
            i0: a, i1: b, sStart: s[a], sEnd: s[b], km: kmOff, maxDev,
            tStart: tS, tEnd: tE, from: fromP?.name ?? 'route', to: toP?.name ?? 'route', extraKwh: eDet / 1000,
          })
        }
        i = j + 1
      } else i++
    }
  }

  // ---- stats ----
  let maxV = 0
  let moving = 0
  let maxT = 0
  let gain = 0
  let loss = 0
  // harsh brake: a sudden stop entered above 15 km/h (braking at ~1.75× the comfort limit)
  const hard = sudden.filter((i) => v[Math.max(0, i - 12)] > 15 / 3.6).length
  let peakKw = 0
  let peakRegen = 0
  let peakRegenK = 0
  for (let k = 0; k < N; k++) {
    if (S.v[k] > maxV) maxV = S.v[k]
    if (S.v[k] > 0.5) moving++
    if (S.temp[k] > maxT) maxT = S.temp[k]
    if (k > 0) {
      const de = S.elev[k] - S.elev[k - 1]
      if (de > 0) gain += de
      else loss -= de
    }
    if (S.power[k] > peakKw) peakKw = S.power[k]
    if (S.power[k] < peakRegen) {
      peakRegen = S.power[k]
      peakRegenK = k
    }
  }
  const distanceKm = path.length / 1000
  const energyKwh = S.energy[N - 1] / 1000
  const offRouteKm = deviations.reduce((a, d) => a + d.km, 0)
  const fuelPrice = V.kind === 'shuttle' ? 90 : 103
  const iceLitres = distanceKm / V.iceKmpl
  const stats: TripStats = {
    distanceKm,
    durationS: duration,
    movingS: moving,
    idleS: Math.max(0, duration - moving),
    avgKmh: distanceKm / (duration / 3600),
    movingAvgKmh: distanceKm / (Math.max(moving, 1) / 3600),
    maxKmh: maxV * 3.6,
    energyKwh,
    regenKwh: S.regen[N - 1] / 1000,
    whPerKm: (energyKwh * 1000) / distanceKm,
    socStart: plan.socStart,
    socEnd: S.soc[N - 1],
    maxTemp: maxT,
    offRouteKm,
    stops: stops.length,
    elevGain: gain,
    elevLoss: loss,
    hardBrakes: hard,
    costInr: energyKwh * 9.5,
    iceCostInr: iceLitres * fuelPrice,
    co2SavedKg: iceLitres * (V.kind === 'shuttle' ? 2.68 : 2.31) - energyKwh * 0.71,
    peakKw,
    peakRegenKw: -peakRegen,
  }

  // ---- events ----
  const from = plan.route[0]
  const to = plan.route[plan.route.length - 1]
  const events: TripEvent[] = []
  events.push({ t: 0, kind: 'depart', title: `Departed ${PLACE[from].name}`, detail: `SoC ${(plan.socStart * 100).toFixed(0)}% · ${plan.purpose}` })
  for (const d of deviations) {
    events.push({
      t: d.tStart,
      kind: 'offroute',
      title: `Left usual route near ${d.from}`,
      detail: `${d.km.toFixed(1)} km detour · up to ${(d.maxDev / 1000).toFixed(1)} km away`,
    })
    events.push({
      t: d.tEnd,
      kind: 'rejoin',
      title: `Rejoined usual route at ${d.to}`,
      detail: `Detour used ${d.extraKwh.toFixed(2)} kWh in ${Math.round((d.tEnd - d.tStart) / 60)} min`,
    })
  }
  // sustained heavy traffic segments
  {
    let i = 0
    while (i < n) {
      if (metrics.speed[i] < 14 && cong[i] > 0.55) {
        let j = i
        while (j < n - 1 && metrics.speed[j + 1] < 16) j++
        const mins = (arrive[j] - arrive[i]) / 60
        if (s[j] - s[i] > 350 && mins > 3) {
          const mid = (i + j) >> 1
          const p = nearestPlace(x[mid], y[mid])
          events.push({
            t: arrive[i],
            kind: 'traffic',
            title: `Heavy traffic${p ? ` near ${p.name}` : ''}`,
            detail: `${mins.toFixed(0)} min for ${((s[j] - s[i]) / 1000).toFixed(1)} km · ${ROAD_NAMES[path.road[mid]]}`,
          })
        }
        i = j + 1
      } else i++
    }
  }
  for (const st of stops) {
    if (st.kind !== 'delivery') continue
    const p = nearestPlace(x[st.i], y[st.i])
    events.push({ t: st.t, kind: 'delivery', title: `Delivery stop${p ? ` · ${p.name}` : ''}`, detail: `${Math.round(st.dur / 60)} min dwell` })
  }
  if (peakRegen < -1) {
    const p = nearestPlace(S.x[peakRegenK], S.y[peakRegenK])
    events.push({
      t: peakRegenK,
      kind: 'regen',
      title: `Peak regen ${(-peakRegen).toFixed(1)} kW`,
      detail: `Braking${p ? ` near ${p.name}` : ''} at ${(S.v[Math.max(0, peakRegenK - 3)] * 3.6).toFixed(0)} km/h`,
    })
  }
  events.push({
    t: duration,
    kind: 'arrive',
    title: `Arrived ${PLACE[to].name}`,
    detail: `${distanceKm.toFixed(1)} km · ${energyKwh.toFixed(2)} kWh · SoC ${(S.soc[N - 1] * 100).toFixed(0)}%`,
  })
  events.sort((a, b) => a.t - b.t)

  return {
    id: plan.id,
    plan,
    label: from === to ? `${PLACE[from].name} delivery loop` : `${PLACE[from].name} → ${PLACE[to].name}`,
    from,
    to,
    path,
    usualPath,
    metrics,
    samples: S,
    duration,
    deviations,
    stops,
    events,
    stats,
  }
}

