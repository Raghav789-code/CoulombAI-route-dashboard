// Smooth synthetic terrain resembling the Bengaluru plateau: ~880–935 m ASL,
// falling gently towards the east, with valleys under the lake chain.

import { LAKES, PLACE } from './network'

const lakeBasins = LAKES.map((l) => {
  let cx = 0
  let cy = 0
  for (let i = 0; i < l.xs.length; i++) {
    cx += l.xs[i]
    cy += l.ys[i]
  }
  cx /= l.xs.length
  cy /= l.ys.length
  let r = 0
  for (let i = 0; i < l.xs.length; i++) r = Math.max(r, Math.hypot(l.xs[i] - cx, l.ys[i] - cy))
  return { cx, cy, r: r * 1.9 }
})

const hal = PLACE.hal

export function elevation(x: number, y: number): number {
  let e = 905 - 0.0011 * x + 0.0006 * y
  e += 13 * Math.sin(x / 2600 + 0.8) * Math.cos(y / 2100 - 0.4)
  e += 5 * Math.sin(x / 900 + 1.3) * Math.sin(y / 1100 + 2.1)
  e += 9 * Math.exp(-((x - hal.x) ** 2 + (y - hal.y) ** 2) / (2600 * 2600))
  for (const b of lakeBasins) {
    const d2 = (x - b.cx) ** 2 + (y - b.cy) ** 2
    e -= 11 * Math.exp(-d2 / (b.r * b.r))
  }
  return e
}

export const ELEV_REF = 895
