// Local equirectangular projection centred on east Bengaluru.
// x = metres east, y = metres north. Accurate to well under 0.5% across the ~25 km map.

export const ORIGIN = { lat: 12.95, lon: 77.67 }
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180)
const KY = 110574

export function project(lat: number, lon: number): [number, number] {
  return [(lon - ORIGIN.lon) * KX, (lat - ORIGIN.lat) * KY]
}

export function unproject(x: number, y: number): [number, number] {
  return [ORIGIN.lat + y / KY, ORIGIN.lon + x / KX]
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay)
}

/** Distance from point P to segment AB. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundsOf(xs: ArrayLike<number>, ys: ArrayLike<number>, into?: Bounds): Bounds {
  const b = into ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < b.minX) b.minX = xs[i]
    if (xs[i] > b.maxX) b.maxX = xs[i]
    if (ys[i] < b.minY) b.minY = ys[i]
    if (ys[i] > b.maxY) b.maxY = ys[i]
  }
  return b
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Index of the last element <= v in a sorted array (binary search). */
export function bisect(arr: ArrayLike<number>, v: number) {
  let lo = 0
  let hi = arr.length - 1
  if (v <= arr[0]) return 0
  if (v >= arr[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= v) lo = mid
    else hi = mid
  }
  return lo
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
