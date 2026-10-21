import { elevation, ELEV_REF } from '../../data/terrain'
import { ROADS } from '../../data/network'
import { boundsOf, type Bounds } from '../../data/geo'

/** 1 scene unit = 10 m. Terrain relief is exaggerated so the plateau reads in 3D. */
export const UNIT = 10
export const EXAG = 3.2

export const heightAt = (x: number, y: number) => ((elevation(x, y) - ELEV_REF) * EXAG) / UNIT

/** map metres → scene [X, Y, Z] (north = −Z) */
export const toScene = (x: number, y: number, lift = 0): [number, number, number] => [x / UNIT, heightAt(x, y) + lift, -y / UNIT]

export const WORLD: Bounds = (() => {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const r of ROADS) boundsOf(r.xs, r.ys, b)
  const m = 3500
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m }
})()

export interface Palette3D {
  bg: string
  low: string
  high: string
  grid: string
  gridMajor: string
  contour: string
  road: string
  roadMajor: string
  lake: string
  fogNear: number
  fogFar: number
}

export const PAL3D: Record<'light' | 'dark' | 'cinema', Palette3D> = {
  light: {
    bg: '#e4eae8', low: '#d9e1de', high: '#f1f4f2', grid: '#cbd6d2', gridMajor: '#b9c7c3', contour: '#b2c1bc',
    road: '#a2acaf', roadMajor: '#87939a', lake: '#bfd8e2', fogNear: 900, fogFar: 3200,
  },
  dark: {
    bg: '#0c1114', low: '#0e1518', high: '#18232a', grid: '#1b262c', gridMajor: '#25343c', contour: '#1f2d35',
    road: '#3d4a51', roadMajor: '#55636b', lake: '#0f2c38', fogNear: 900, fogFar: 3200,
  },
  cinema: {
    bg: '#04070a', low: '#060b0f', high: '#0f1a21', grid: '#0f1e26', gridMajor: '#1a3b4b', contour: '#143746',
    road: '#2c4a59', roadMajor: '#3b6479', lake: '#0a2633', fogNear: 300, fogFar: 1900,
  },
}
