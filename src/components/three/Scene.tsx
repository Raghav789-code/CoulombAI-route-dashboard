import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { LAKES, ROADS } from '../../data/network'
import { elevation } from '../../data/terrain'
import type { Trip } from '../../data/simulate'
import { modeScale, PALETTE, type Tab, type Theme } from '../../lib/scales'
import { sampleAt } from '../../lib/sample'
import { useStore } from '../../state/store'
import { heightAt, PAL3D, toScene, UNIT, WORLD, type Palette3D } from './world'
import { VehicleModel } from './Vehicle'

export type SceneMode = Theme | 'cinema'

interface SceneProps {
  trip: Trip
  week: Trip[]
  tab: Tab
  mode: SceneMode
}

export function CityScene({ trip, week, tab, mode }: SceneProps) {
  const pal = PAL3D[mode]
  const theme: Theme = mode === 'light' ? 'light' : 'dark'
  return (
    <>
      <color attach="background" args={[pal.bg]} />
      <fog attach="fog" args={[pal.bg, pal.fogNear, pal.fogFar]} />
      <hemisphereLight args={['#ffffff', mode === 'light' ? '#c9d3d0' : '#1a2228', mode === 'light' ? 1.6 : 0.9]} />
      <directionalLight position={[-300, 500, 200]} intensity={mode === 'light' ? 1.8 : 1.1} />
      <Terrain pal={pal} />
      <Lakes pal={pal} />
      <Roads pal={pal} />
      {tab === 'week' ? (
        <WeekRoutes week={week} selected={trip} theme={theme} />
      ) : (
        <>
          <RouteRibbon trip={trip} tab={tab} theme={theme} mode={mode} />
          {tab === 'deviation' && trip.usualPath && trip.deviations.length > 0 && <UsualRoute trip={trip} theme={theme} />}
          {tab === 'deviation' && <DeviationPins trip={trip} theme={theme} />}
        </>
      )}
      <Endpoints trip={trip} mode={mode} />
      <VehicleModel trip={trip} mode={mode} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Terrain: displaced plane with procedural grid, contour lines, hill-shading and distance fog.

const terrainVert = /* glsl */ `
  attribute float aElev;
  varying float vElev;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vElev = aElev;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const terrainFrag = /* glsl */ `
  uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uGrid; uniform vec3 uGridMajor; uniform vec3 uContour; uniform vec3 uFog;
  uniform float uFogNear; uniform float uFogFar;
  varying float vElev;
  varying vec3 vWorld;
  float gridLine(vec2 c) {
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float e = clamp((vElev - 878.0) / 58.0, 0.0, 1.0);
    vec3 col = mix(uLow, uHigh, smoothstep(0.0, 1.0, e));
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    float shade = clamp(dot(n, normalize(vec3(-0.45, 0.75, 0.35))), 0.0, 1.0);
    col *= 0.8 + 0.28 * shade;
    col = mix(col, uGrid, gridLine(vWorld.xz / 25.0) * 0.55);
    col = mix(col, uGridMajor, gridLine(vWorld.xz / 100.0) * 0.8);
    float c = vElev / 4.0;
    float cl = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    col = mix(col, uContour, (1.0 - min(cl, 1.0)) * 0.45);
    float d = distance(vWorld, cameraPosition);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function Terrain({ pal }: { pal: Palette3D }) {
  const geom = useMemo(() => {
    const w = (WORLD.maxX - WORLD.minX) / UNIT
    const h = (WORLD.maxY - WORLD.minY) / UNIT
    const g = new THREE.PlaneGeometry(w, h, Math.round(w / 12), Math.round(h / 12))
    g.rotateX(-Math.PI / 2)
    const cx = (WORLD.minX + WORLD.maxX) / 2 / UNIT
    const cz = -(WORLD.minY + WORLD.maxY) / 2 / UNIT
    g.translate(cx, 0, cz)
    const pos = g.attributes.position as THREE.BufferAttribute
    const elev = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * UNIT
      const y = -pos.getZ(i) * UNIT
      elev[i] = elevation(x, y)
      pos.setY(i, heightAt(x, y) - 0.05)
    }
    g.setAttribute('aElev', new THREE.BufferAttribute(elev, 1))
    g.computeBoundingSphere()
    return g
  }, [])
  const uniforms = useMemo(
    () => ({
      uLow: { value: new THREE.Color() },
      uHigh: { value: new THREE.Color() },
      uGrid: { value: new THREE.Color() },
      uGridMajor: { value: new THREE.Color() },
      uContour: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uFogNear: { value: 0 },
      uFogFar: { value: 0 },
    }),
    [],
  )
  const mat = useRef<THREE.ShaderMaterial>(null)
  // R3F hands the material its own uniforms object, so always write through the material
  useLayoutEffect(() => {
    const u = mat.current?.uniforms
    if (!u) return
    u.uLow.value.set(pal.low)
    u.uHigh.value.set(pal.high)
    u.uGrid.value.set(pal.grid)
    u.uGridMajor.value.set(pal.gridMajor)
    u.uContour.value.set(pal.contour)
    u.uFog.value.set(pal.bg)
    u.uFogNear.value = pal.fogNear
    u.uFogFar.value = pal.fogFar
  }, [pal])
  return (
    <mesh geometry={geom} renderOrder={-1}>
      <shaderMaterial ref={mat} vertexShader={terrainVert} fragmentShader={terrainFrag} uniforms={uniforms} />
    </mesh>
  )
}

function Lakes({ pal }: { pal: Palette3D }) {
  const lakes = useMemo(
    () =>
      LAKES.map((l) => {
        const shape = new THREE.Shape(l.xs.map((x, i) => new THREE.Vector2(x / UNIT, l.ys[i] / UNIT)))
        const g = new THREE.ShapeGeometry(shape)
        g.rotateX(-Math.PI / 2)
        let level = -Infinity
        for (let i = 0; i < l.xs.length; i++) level = Math.max(level, heightAt(l.xs[i], l.ys[i]))
        return { name: l.name, g, level: level + 0.15 }
      }),
    [],
  )
  return (
    <>
      {lakes.map((l) => (
        <mesh key={l.name} geometry={l.g} position={[0, l.level, 0]}>
          <meshBasicMaterial color={pal.lake} />
        </mesh>
      ))}
    </>
  )
}

function Roads({ pal }: { pal: Palette3D }) {
  const roads = useMemo(
    () =>
      ROADS.map((r) => {
        const pts: [number, number, number][] = []
        for (let i = 0; i < r.xs.length; i += 2) pts.push(toScene(r.xs[i], r.ys[i], 0.35))
        pts.push(toScene(r.xs[r.xs.length - 1], r.ys[r.ys.length - 1], 0.35))
        return { id: r.id, pts, major: r.cls === 'ring' || r.cls === 'highway' }
      }),
    [],
  )
  return (
    <>
      {roads.map((r) => (
        <Line key={r.id} points={r.pts} color={r.major ? pal.roadMajor : pal.road} lineWidth={r.major ? 2.2 : 1.4} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Route: coloured ground line + vertical "curtain" whose height encodes the active metric.

const curtainVert = /* glsl */ `
  attribute vec3 aColor;
  attribute float aS;
  attribute float aTop;
  attribute float aH;
  uniform float uGrow;
  uniform float uMaxH;
  varying vec3 vColor;
  varying float vS;
  varying float vTop;
  void main() {
    float g = smoothstep(aS * 0.65, aS * 0.65 + 0.35, uGrow);
    vec3 p = position;
    p.y += aTop * (0.6 + aH * uMaxH) * g;
    vColor = aColor;
    vS = aS;
    vTop = aTop;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`
const curtainFrag = /* glsl */ `
  uniform float uProg;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vS;
  varying float vTop;
  void main() {
    float played = step(vS, uProg);
    float a = mix(0.04, 0.78, pow(vTop, 1.6)) + smoothstep(0.9, 1.0, vTop) * 0.2;
    a *= mix(0.3, 1.0, played);
    float head = smoothstep(0.018, 0.0, uProg - vS) * step(vS, uProg);
    float scan = 0.5 + 0.5 * sin((vS * 900.0) - uTime * 6.0);
    vec3 c = vColor * (1.0 + head * 0.9) + head * 0.15;
    a += head * 0.35 * scan;
    gl_FragColor = vec4(c, a * uOpacity);
    #include <colorspace_fragment>
  }
`

function RouteRibbon({ trip, tab, theme, mode }: { trip: Trip; tab: Tab; theme: Theme; mode: SceneMode }) {
  const scale = useMemo(() => modeScale(trip, tab, theme), [trip, tab, theme])
  const STEP = 2
  const { geom, linePts, lineCols } = useMemo(() => {
    const P = trip.path
    const idx: number[] = []
    for (let i = 0; i < P.x.length; i += STEP) idx.push(i)
    if (idx[idx.length - 1] !== P.x.length - 1) idx.push(P.x.length - 1)
    const m = idx.length
    const pos = new Float32Array(m * 2 * 3)
    const col = new Float32Array(m * 2 * 3)
    const aS = new Float32Array(m * 2)
    const aTop = new Float32Array(m * 2)
    const aH = new Float32Array(m * 2)
    const c = new THREE.Color()
    const linePts: [number, number, number][] = []
    const lineCols: [number, number, number][] = []
    idx.forEach((i, k) => {
      const [X, Y, Z] = toScene(P.x[i], P.y[i], 0.6)
      c.set(scale.color(i))
      for (let v = 0; v < 2; v++) {
        const o = k * 2 + v
        pos.set([X, Y, Z], o * 3)
        col.set([c.r, c.g, c.b], o * 3)
        aS[o] = P.s[i] / P.length
        aTop[o] = v
        aH[o] = scale.height(i)
      }
      linePts.push([X, Y + 0.2, Z])
      lineCols.push([c.r, c.g, c.b])
    })
    const index: number[] = []
    for (let k = 0; k < m - 1; k++) {
      const a = k * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1))
    g.setAttribute('aTop', new THREE.BufferAttribute(aTop, 1))
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1))
    g.setIndex(index)
    g.computeBoundingSphere()
    return { geom: g, linePts, lineCols }
  }, [trip, scale])

  const uniforms = useMemo(
    () => ({ uGrow: { value: 0 }, uProg: { value: 0 }, uTime: { value: 0 }, uMaxH: { value: 42 }, uOpacity: { value: 1 } }),
    [],
  )
  const mat = useRef<THREE.ShaderMaterial>(null)
  const growStart = useRef(0)
  useEffect(() => {
    growStart.current = performance.now()
  }, [geom])

  useFrame(({ clock }) => {
    const u = mat.current?.uniforms
    if (!u) return
    const snap = sampleAt(trip, useStore.getState().t)
    u.uProg.value = snap.s / trip.path.length
    u.uTime.value = clock.elapsedTime
    u.uOpacity.value = mode === 'light' ? 0.85 : 1
    const p = Math.min(1, (performance.now() - growStart.current) / 1600)
    u.uGrow.value = 1 - Math.pow(1 - p, 3)
  })

  return (
    <group>
      <mesh geometry={geom} renderOrder={2}>
        <shaderMaterial
          ref={mat}
          vertexShader={curtainVert}
          fragmentShader={curtainFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={mode === 'cinema' ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </mesh>
      <Line points={linePts} vertexColors={lineCols} lineWidth={mode === 'cinema' ? 4 : 3.5} />
    </group>
  )
}

function UsualRoute({ trip, theme }: { trip: Trip; theme: Theme }) {
  const pts = useMemo(() => {
    const U = trip.usualPath!
    const out: [number, number, number][] = []
    for (let i = 0; i < U.x.length; i += 3) out.push(toScene(U.x[i], U.y[i], 0.8))
    return out
  }, [trip])
  return <Line points={pts} color={PALETTE[theme].usual} lineWidth={1.6} dashed dashSize={3} gapSize={3} />
}

function WeekRoutes({ week, selected, theme }: { week: Trip[]; selected: Trip; theme: Theme }) {
  const routes = useMemo(() => {
    const seen = new Map<string, { pts: [number, number, number][]; n: number }>()
    for (const t of week) {
      const r = seen.get(t.plan.routeId)
      if (r) {
        r.n++
        continue
      }
      const pts: [number, number, number][] = []
      for (let i = 0; i < t.path.x.length; i += 3) pts.push(toScene(t.path.x[i], t.path.y[i], 0.6))
      seen.set(t.plan.routeId, { pts, n: 1 })
    }
    return [...seen.entries()]
  }, [week])
  const max = Math.max(...routes.map(([, r]) => r.n))
  const sel = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let i = 0; i < selected.path.x.length; i += 2) pts.push(toScene(selected.path.x[i], selected.path.y[i], 1))
    return pts
  }, [selected])
  const col = PALETTE[theme].week
  return (
    <>
      {routes.map(([id, r]) => (
        <Line key={id} points={r.pts} color={col} lineWidth={1.5 + (3 * r.n) / max} transparent opacity={0.25 + (0.3 * r.n) / max} />
      ))}
      <Line points={sel} color={col} lineWidth={5} />
    </>
  )
}

/** Scales children with camera distance so markers stay readable from the overview. */
function DistanceScale({ at, children, base = 220, max = 6 }: { at: [number, number, number]; children: React.ReactNode; base?: number; max?: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    if (g.current) g.current.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(g.current.position) / base, 1, max))
  })
  return (
    <group ref={g} position={at}>
      {children}
    </group>
  )
}

function Pillar({ at, color, height = 18 }: { at: [number, number, number]; color: string; height?: number }) {
  return (
    <DistanceScale at={at}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.18, 0.18, height, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, height, 0]}>
        <sphereGeometry args={[1.3, 20, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </DistanceScale>
  )
}

function DeviationPins({ trip, theme }: { trip: Trip; theme: Theme }) {
  const P = trip.path
  return (
    <>
      {trip.deviations.map((d) => (
        <Pillar key={d.i0} at={toScene(P.x[d.i0], P.y[d.i0])} color={PALETTE[theme].offRoute} height={14} />
      ))}
    </>
  )
}

function Endpoints({ trip, mode }: { trip: Trip; mode: SceneMode }) {
  const P = trip.path
  const n = P.x.length
  const loop = Math.hypot(P.x[0] - P.x[n - 1], P.y[0] - P.y[n - 1]) < 50
  const start = mode === 'light' ? '#1c5cab' : '#5598e7'
  const end = mode === 'light' ? '#1d2329' : '#e9eef2'
  return (
    <>
      <Pillar at={toScene(P.x[0], P.y[0])} color={start} height={20} />
      {!loop && <Pillar at={toScene(P.x[n - 1], P.y[n - 1])} color={end} height={20} />}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Camera helpers for the dashboard's 3D view

export interface CameraHandle {
  zoom: (f: number) => void
  fit: () => void
}

export function fitCamera(camera: THREE.Camera, target: THREE.Vector3, trip: Trip, week: Trip[] | null) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const t of week ?? [trip]) {
    for (let i = 0; i < t.path.x.length; i += 10) {
      minX = Math.min(minX, t.path.x[i])
      maxX = Math.max(maxX, t.path.x[i])
      minY = Math.min(minY, t.path.y[i])
      maxY = Math.max(maxY, t.path.y[i])
    }
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const span = Math.max(maxX - minX, (maxY - minY) * 1.4) / UNIT
  const [X, Y, Z] = toScene(cx, cy)
  target.set(X, Y, Z)
  camera.position.set(X - span * 0.1, Y + span * 0.62, Z + span * 0.78)
  camera.lookAt(target)
}

export function DashboardRig({
  trip,
  week,
  handle,
}: {
  trip: Trip
  week: Trip[] | null
  handle: React.RefObject<CameraHandle | null>
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const isWeek = !!week
  useEffect(() => {
    if (!controls) return
    fitCamera(camera, controls.target, trip, week)
    controls.update()
    handle.current = {
      fit: () => {
        fitCamera(camera, controls.target, trip, week)
        controls.update()
      },
      zoom: (f) => {
        const off = camera.position.clone().sub(controls.target).multiplyScalar(1 / f)
        camera.position.copy(controls.target).add(off)
        controls.update()
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, controls, isWeek])

  const prev = useRef<THREE.Vector3 | null>(null)
  useFrame(() => {
    const st = useStore.getState()
    if (!st.follow || !controls) {
      prev.current = null
      return
    }
    const snap = sampleAt(trip, st.t)
    const v = new THREE.Vector3(...toScene(snap.x, snap.y))
    const d = v.sub(controls.target).multiplyScalar(prev.current ? 0.12 : 0.06)
    controls.target.add(d)
    camera.position.add(d)
    prev.current = controls.target
    controls.update()
  })
  return null
}
