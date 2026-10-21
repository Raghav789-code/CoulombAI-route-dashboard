// Map labels for the 3D views: one plain DOM overlay positioned every frame by projecting
// anchors through the camera. Cheaper than a React root per label, and unmounts cleanly.
import { useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLACES } from '../../data/network'
import type { Trip } from '../../data/simulate'
import type { Tab } from '../../lib/scales'
import { fmtHM } from '../../lib/format'
import { toScene } from './world'

export interface SceneLabel {
  id: string
  at: [number, number, number]
  text: string
  kind: 'place' | 'pin' | 'alert'
  color?: string
}

export function sceneLabels(trip: Trip, tab: Tab, showPlaces = true): SceneLabel[] {
  const P = trip.path
  const n = P.x.length
  const out: SceneLabel[] = showPlaces
    ? PLACES.filter((p) => !p.hidden).map((p) => ({ id: p.id, at: toScene(p.x, p.y, 1.5), text: p.name, kind: 'place' as const }))
    : []
  out.push({ id: 'start', at: toScene(P.x[0], P.y[0], 2), text: `Start · ${fmtHM(trip.plan.start)}`, kind: 'pin' })
  if (Math.hypot(P.x[0] - P.x[n - 1], P.y[0] - P.y[n - 1]) > 50)
    out.push({ id: 'end', at: toScene(P.x[n - 1], P.y[n - 1], 2), text: `End · ${fmtHM(trip.plan.start + trip.duration * 1000)}`, kind: 'pin' })
  if (tab === 'deviation')
    for (const d of trip.deviations) {
      const mid = Math.round(d.i0 + (d.i1 - d.i0) * 0.5)
      out.push({ id: `dev-${d.i0}`, at: toScene(P.x[mid], P.y[mid], 30), text: `${d.km.toFixed(1)} km off route`, kind: 'alert' })
    }
  return out
}

type Refs = RefObject<Map<string, HTMLDivElement>>

/** DOM layer — render as a sibling of the <Canvas>. */
export function LabelLayer({ labels, refs, variant }: { labels: SceneLabel[]; refs: Refs; variant: 'light' | 'dark' | 'cinema' }) {
  return (
    <div className={`labels3d labels3d-${variant}`} aria-hidden>
      {labels.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) refs.current.set(l.id, el)
            else refs.current.delete(l.id)
          }}
          className={`l3d l3d-${l.kind}`}
        >
          {l.kind === 'place' && <i />}
          {l.text}
        </div>
      ))}
    </div>
  )
}

/** Inside the <Canvas>: moves the DOM labels to their projected positions each frame. */
export function LabelProjector({ labels, refs }: { labels: SceneLabel[]; refs: Refs }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const l of labels) {
      const el = refs.current.get(l.id)
      if (!el) continue
      v.set(l.at[0], l.at[1], l.at[2]).project(camera)
      const visible = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2
      if (!visible) {
        el.style.visibility = 'hidden'
        continue
      }
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.visibility = 'visible'
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      // labels further away sit behind closer ones
      el.style.zIndex = String(Math.round((1 - v.z) * 1e4))
    }
  })
  return null
}
