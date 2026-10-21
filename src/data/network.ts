// Hand-authored road network for east Bengaluru (approximate real geometry).
// Waypoints are smoothed with centripetal Catmull-Rom and given a small, tapered
// organic wobble so the roads read like surveyed GPS traces rather than straight lines.

import { project, rng, hash } from './geo'

export type RoadClass = 'highway' | 'ring' | 'arterial' | 'local'

export interface Place {
  id: string
  name: string
  lat: number
  lon: number
  x: number
  y: number
  /** label side relative to the dot */
  side: 'r' | 'l' | 't' | 'b'
  /** hidden junctions still act as graph nodes */
  hidden?: boolean
}

export interface Road {
  id: string
  name: string
  cls: RoadClass
  from: string
  to: string
  xs: number[]
  ys: number[]
}

const P = (id: string, name: string, lat: number, lon: number, side: Place['side'] = 'r', hidden = false): Place => {
  const [x, y] = project(lat, lon)
  return { id, name, lat, lon, x, y, side, hidden }
}

export const PLACES: Place[] = [
  P('mgroad', 'MG Road', 12.9755, 77.607, 'r'),
  P('richmond', 'Richmond Rd', 12.9655, 77.6, 'r'),
  P('indiranagar', 'Indiranagar', 12.9784, 77.6408, 'r'),
  P('domlur', 'Domlur', 12.9608, 77.6385, 'r'),
  P('hal', 'HAL Airport Rd', 12.959, 77.661, 'r'),
  P('tinfactory', 'Tin Factory', 12.9978, 77.6685, 'r'),
  P('krpuram', 'KR Puram', 13.008, 77.6955, 't'),
  P('hoodi', 'Hoodi', 12.9925, 77.7155, 'r'),
  P('itpl', 'ITPL', 12.9855, 77.731, 'r'),
  P('whitefield', 'Whitefield', 12.9698, 77.7499, 'r'),
  P('kundalahalli', 'Kundalahalli', 12.9628, 77.716, 'r'),
  P('marathahalli', 'Marathahalli', 12.9567, 77.7008, 'r'),
  P('doddanekundi', 'Doddanekundi', 12.976, 77.6975, 'l'),
  P('kadubees', 'Kadubeesanahalli', 12.939, 77.705, 'r'),
  P('bellandur', 'Bellandur', 12.9285, 77.6765, 'r'),
  P('sarjapur', 'Sarjapur Rd', 12.91, 77.685, 'b'),
  P('agara', 'Agara', 12.9245, 77.6505, 't'),
  P('hsr', 'HSR Layout', 12.9118, 77.646, 'r'),
  P('silkboard', 'Silk Board', 12.9172, 77.6228, 'r'),
  P('btm', 'BTM Layout', 12.916, 77.608, 'b'),
  P('koramangala', 'Koramangala', 12.9352, 77.6245, 'r'),
  P('ejipura', 'Ejipura', 12.9445, 77.631, 'r'),
  P('hosur', 'Hosur Rd', 12.899, 77.638, 'r'),
]

export const PLACE: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]))

type E = [id: string, from: string, to: string, name: string, cls: RoadClass, via: [number, number][]]

const EDGES: E[] = [
  ['kor-silk', 'koramangala', 'silkboard', 'Hosur Rd', 'arterial', [[12.93, 77.6232], [12.924, 77.6218]]],
  ['rich-kor', 'richmond', 'koramangala', 'Hosur Rd', 'arterial', [[12.958, 77.604], [12.95, 77.611], [12.942, 77.619]]],
  ['mg-rich', 'mgroad', 'richmond', 'Richmond Rd', 'local', [[12.971, 77.603]]],
  ['silk-hsr', 'silkboard', 'hsr', '27th Main Rd', 'local', [[12.914, 77.629], [12.9105, 77.636], [12.91, 77.642]]],
  ['hsr-agara', 'hsr', 'agara', '14th Main Rd', 'local', [[12.915, 77.65], [12.918, 77.6472], [12.921, 77.6478], [12.923, 77.6495]]],
  ['silk-agara', 'silkboard', 'agara', 'Outer Ring Rd', 'ring', [[12.9195, 77.632], [12.922, 77.642]]],
  ['agara-bell', 'agara', 'bellandur', 'Outer Ring Rd', 'ring', [[12.925, 77.658], [12.9238, 77.665], [12.9262, 77.671]]],
  ['bell-mara', 'bellandur', 'marathahalli', 'Outer Ring Rd', 'ring', [[12.933, 77.685], [12.942, 77.692], [12.95, 77.6975]]],
  ['agara-sarj', 'agara', 'sarjapur', 'Sarjapur Rd', 'arterial', [[12.9205, 77.656], [12.916, 77.665], [12.9125, 77.675]]],
  ['sarj-kadu', 'sarjapur', 'kadubees', 'Panathur Rd', 'local', [[12.916, 77.69], [12.924, 77.696], [12.932, 77.702]]],
  ['kadu-mara', 'kadubees', 'marathahalli', 'Kadubeesanahalli Rd', 'local', [[12.945, 77.7055], [12.951, 77.7035]]],
  ['mara-kund', 'marathahalli', 'kundalahalli', 'ITPL Main Rd', 'arterial', [[12.9585, 77.708]]],
  ['kund-wf', 'kundalahalli', 'whitefield', 'ITPL Main Rd', 'arterial', [[12.9645, 77.725], [12.968, 77.735], [12.9692, 77.743]]],
  ['mg-dom', 'mgroad', 'domlur', 'Old Airport Rd', 'arterial', [[12.9715, 77.617], [12.966, 77.627]]],
  ['dom-hal', 'domlur', 'hal', 'Old Airport Rd', 'arterial', [[12.9598, 77.649]]],
  ['hal-mara', 'hal', 'marathahalli', 'Old Airport Rd', 'arterial', [[12.9575, 77.674], [12.958, 77.688]]],
  ['kor-eji', 'koramangala', 'ejipura', 'Intermediate Ring Rd', 'arterial', [[12.9395, 77.628]]],
  ['eji-dom', 'ejipura', 'domlur', 'Intermediate Ring Rd', 'arterial', [[12.951, 77.6345], [12.956, 77.637]]],
  ['dom-indi', 'domlur', 'indiranagar', '100 Feet Rd', 'arterial', [[12.969, 77.64]]],
  ['indi-tin', 'indiranagar', 'tinfactory', 'Old Madras Rd', 'arterial', [[12.985, 77.65], [12.992, 77.66]]],
  ['tin-kr', 'tinfactory', 'krpuram', 'Old Madras Rd', 'highway', [[13.002, 77.68]]],
  ['hal-tin', 'hal', 'tinfactory', 'Suranjan Das Rd', 'local', [[12.97, 77.664], [12.985, 77.666]]],
  ['mara-dodda', 'marathahalli', 'doddanekundi', 'Outer Ring Rd', 'ring', [[12.966, 77.699]]],
  ['dodda-kr', 'doddanekundi', 'krpuram', 'Outer Ring Rd', 'ring', [[12.988, 77.697]]],
  ['kr-hoodi', 'krpuram', 'hoodi', 'Whitefield Main Rd', 'arterial', [[13.001, 77.706]]],
  ['hoodi-itpl', 'hoodi', 'itpl', 'Whitefield Main Rd', 'arterial', [[12.989, 77.724]]],
  ['itpl-wf', 'itpl', 'whitefield', 'Whitefield Main Rd', 'arterial', [[12.979, 77.742]]],
  ['kund-hoodi', 'kundalahalli', 'hoodi', 'Brookefield Rd', 'local', [[12.972, 77.717], [12.983, 77.716]]],
  ['silk-btm', 'silkboard', 'btm', 'Outer Ring Rd', 'ring', [[12.916, 77.615]]],
  ['silk-hosur', 'silkboard', 'hosur', 'Hosur Rd', 'highway', [[12.908, 77.629]]],
  ['bell-sarj', 'bellandur', 'sarjapur', 'Bellandur Main Rd', 'local', [[12.92, 77.68]]],
]

// ---------- geometry helpers ----------

function catmullRom(px: number[], py: number[], step: number, closed = false): [number[], number[]] {
  const n = px.length
  const ox: number[] = []
  const oy: number[] = []
  const get = (i: number) => {
    const j = closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))
    return [px[j], py[j]] as const
  }
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    // centripetal parameterisation (alpha = 0.5) avoids cusps and loops
    const t0 = 0
    const t1 = t0 + Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1e-3, 0.5)
    const t2 = t1 + Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1e-3, 0.5)
    const t3 = t2 + Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || 1e-3, 0.5)
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const steps = Math.max(2, Math.ceil(segLen / step))
    for (let k = 0; k < steps; k++) {
      const t = t1 + ((t2 - t1) * k) / steps
      const c = [0, 1].map((d) => {
        const A1 = ((t1 - t) / (t1 - t0)) * p0[d] + ((t - t0) / (t1 - t0)) * p1[d]
        const A2 = ((t2 - t) / (t2 - t1)) * p1[d] + ((t - t1) / (t2 - t1)) * p2[d]
        const A3 = ((t3 - t) / (t3 - t2)) * p2[d] + ((t - t2) / (t3 - t2)) * p3[d]
        const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2
        const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3
        return ((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2
      })
      ox.push(c[0])
      oy.push(c[1])
    }
  }
  if (!closed) {
    ox.push(px[n - 1])
    oy.push(py[n - 1])
  }
  return [ox, oy]
}

const WOBBLE: Record<RoadClass, number> = { highway: 10, ring: 14, arterial: 22, local: 34 }

function wobble(xs: number[], ys: number[], amp: number, seed: number) {
  const r = rng(seed)
  const f1 = 1 / (380 + r() * 260)
  const f2 = 1 / (120 + r() * 90)
  const ph1 = r() * 6.28
  const ph2 = r() * 6.28
  const n = xs.length
  const s = [0]
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
  const L = s[n - 1]
  const ox = xs.slice()
  const oy = ys.slice()
  for (let i = 1; i < n - 1; i++) {
    const tx = xs[i + 1] - xs[i - 1]
    const ty = ys[i + 1] - ys[i - 1]
    const tl = Math.hypot(tx, ty) || 1
    const taper = Math.min(1, s[i] / 260, (L - s[i]) / 260)
    const d = amp * taper * (0.7 * Math.sin(s[i] * f1 + ph1) + 0.3 * Math.sin(s[i] * f2 + ph2))
    ox[i] += (-ty / tl) * d
    oy[i] += (tx / tl) * d
  }
  return [ox, oy] as const
}

export const ROADS: Road[] = EDGES.map(([id, from, to, name, cls, via]) => {
  const a = PLACE[from]
  const b = PLACE[to]
  const px = [a.x]
  const py = [a.y]
  for (const [lat, lon] of via) {
    const [x, y] = project(lat, lon)
    px.push(x)
    py.push(y)
  }
  px.push(b.x)
  py.push(b.y)
  const [cx, cy] = catmullRom(px, py, 14)
  const [xs, ys] = wobble(cx, cy, WOBBLE[cls], hash(id))
  return { id, name, cls, from, to, xs, ys }
})

export const ROAD_NAMES = Array.from(new Set(ROADS.map((r) => r.name)))

// ---------- lakes (polygons) ----------

export interface Lake {
  name: string
  xs: number[]
  ys: number[]
}

const lake = (name: string, ring: [number, number][]): Lake => {
  const px: number[] = []
  const py: number[] = []
  for (const [lat, lon] of ring) {
    const [x, y] = project(lat, lon)
    px.push(x)
    py.push(y)
  }
  const [xs, ys] = catmullRom(px, py, 40, true)
  return { name, xs, ys }
}

export const LAKES: Lake[] = [
  lake('Bellandur Lake', [
    [12.944, 77.653], [12.942, 77.66], [12.938, 77.668], [12.933, 77.673],
    [12.9295, 77.6715], [12.9305, 77.665], [12.934, 77.6585], [12.939, 77.6535],
  ]),
  lake('Agara Lake', [[12.9238, 77.6378], [12.9232, 77.6428], [12.9205, 77.6432], [12.9198, 77.6392]]),
  lake('Ulsoor Lake', [[12.9845, 77.6175], [12.9842, 77.6225], [12.9808, 77.6232], [12.9805, 77.619]]),
  lake('Varthur Lake', [
    [12.9475, 77.7335], [12.9455, 77.7425], [12.9395, 77.7468], [12.9352, 77.7432],
    [12.9372, 77.7362], [12.9425, 77.7322],
  ]),
  lake('Kaikondrahalli Lake', [[12.9142, 77.6695], [12.9135, 77.6732], [12.9108, 77.6728], [12.9112, 77.6692]]),
]

// ---------- route assembly ----------

export interface DensePath {
  x: Float64Array
  y: Float64Array
  s: Float64Array
  /** road index into ROAD_NAMES per point */
  road: Uint16Array
  cls: Uint8Array
  /** cumulative distance at each graph node visited, in order */
  nodeS: { id: string; s: number }[]
  length: number
}

const CLS_ID: Record<RoadClass, number> = { highway: 0, ring: 1, arterial: 2, local: 3 }
export const CLS_LIST: RoadClass[] = ['highway', 'ring', 'arterial', 'local']

function findEdge(a: string, b: string): { road: Road; reversed: boolean } {
  for (const road of ROADS) {
    if (road.from === a && road.to === b) return { road, reversed: false }
    if (road.from === b && road.to === a) return { road, reversed: true }
  }
  throw new Error(`No road between ${a} and ${b}`)
}

export const DS = 8 // metres between dense points

export function buildPath(nodes: string[]): DensePath {
  const rx: number[] = []
  const ry: number[] = []
  const rr: number[] = []
  const rc: number[] = []
  const nodeIdx: number[] = [0]
  for (let i = 0; i < nodes.length - 1; i++) {
    const { road, reversed } = findEdge(nodes[i], nodes[i + 1])
    const xs = reversed ? road.xs.slice().reverse() : road.xs
    const ys = reversed ? road.ys.slice().reverse() : road.ys
    const start = rx.length === 0 ? 0 : 1
    const ri = ROAD_NAMES.indexOf(road.name)
    for (let k = start; k < xs.length; k++) {
      rx.push(xs[k])
      ry.push(ys[k])
      rr.push(ri)
      rc.push(CLS_ID[road.cls])
    }
    nodeIdx.push(rx.length - 1)
  }
  // cumulative arc length of the raw polyline
  const rs = [0]
  for (let i = 1; i < rx.length; i++) rs.push(rs[i - 1] + Math.hypot(rx[i] - rx[i - 1], ry[i] - ry[i - 1]))
  const L = rs[rs.length - 1]
  const n = Math.floor(L / DS) + 1
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const s = new Float64Array(n)
  const road = new Uint16Array(n)
  const cls = new Uint8Array(n)
  let j = 0
  for (let i = 0; i < n; i++) {
    const si = i === n - 1 ? L : i * DS
    while (j < rs.length - 2 && rs[j + 1] < si) j++
    const seg = rs[j + 1] - rs[j] || 1
    const t = (si - rs[j]) / seg
    x[i] = rx[j] + (rx[j + 1] - rx[j]) * t
    y[i] = ry[j] + (ry[j + 1] - ry[j]) * t
    s[i] = si
    road[i] = rr[j + 1]
    cls[i] = rc[j + 1]
  }
  return { x, y, s, road, cls, nodeS: nodes.map((id, k) => ({ id, s: rs[nodeIdx[k]] })), length: L }
}

/** Nearest named place to a world point (for event captions). */
export function nearestPlace(x: number, y: number, maxDist = 1800): Place | null {
  let best: Place | null = null
  let bd = maxDist
  for (const p of PLACES) {
    if (p.hidden) continue
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}
