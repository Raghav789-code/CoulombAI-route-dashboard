import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { Trip } from '../../data/simulate'
import { sampleAt } from '../../lib/sample'
import { useStore } from '../../state/store'
import { toScene } from './world'
import type { SceneMode } from './Scene'

/** Visual exaggeration so a 4 m car is legible on a 25 km map. */
const VS = 0.65

const beaconVert = /* glsl */ `
  varying float vY;
  void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const beaconFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uFade;
  varying float vY;
  void main() {
    float a = pow(1.0 - vY, 2.2) * (0.55 + 0.15 * sin(uTime * 3.0 - vY * 14.0)) * uFade;
    gl_FragColor = vec4(uColor * 1.6, a);
    #include <colorspace_fragment>
  }
`

export function VehicleModel({ trip, mode }: { trip: Trip; mode: SceneMode }) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const brake = useRef<THREE.MeshStandardMaterial>(null)
  const beacon = useRef<THREE.ShaderMaterial>(null)
  const heading = useRef<number | null>(null)
  const kind = trip.plan.vehicle.kind
  const accent = mode === 'light' ? '#e8892b' : '#f29a3d'
  const beaconU = useMemo(() => ({ uColor: { value: new THREE.Color(accent) }, uTime: { value: 0 }, uFade: { value: 1 } }), [accent])
  const regenCol = useMemo(() => new THREE.Color('#38bdf8'), [])
  const driveCol = useMemo(() => new THREE.Color(accent), [accent])

  useFrame(({ clock, camera }, dt) => {
    const st = useStore.getState()
    const snap = sampleAt(trip, st.t)
    const g = group.current
    if (!g) return
    const [X, Y, Z] = toScene(snap.x, snap.y)
    g.position.set(X, Y, Z)
    // keep the vehicle legible when the camera is far away (map overview), true-ish scale up close
    const dist = camera.position.distanceTo(g.position)
    g.scale.setScalar(THREE.MathUtils.clamp(dist / 160, 1, 9))
    // shortest-arc smoothing of heading
    if (heading.current === null) heading.current = snap.heading
    let d = snap.heading - heading.current
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    heading.current += d * Math.min(1, dt * 8)
    g.rotation.y = heading.current
    if (body.current) body.current.rotation.z = THREE.MathUtils.clamp(-snap.grade * 3, -0.12, 0.12)
    if (ring.current) {
      const p = (clock.elapsedTime * 0.8) % 1
      ring.current.scale.setScalar(0.6 + p * 1.6)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.55
    }
    if (glow.current) glow.current.color.copy(snap.power < 0 ? regenCol : driveCol)
    if (brake.current) brake.current.emissiveIntensity = snap.power < 0 || snap.v < 1 ? 4 : 1
    if (beacon.current) {
      beacon.current.uniforms.uTime.value = clock.elapsedTime
      beacon.current.uniforms.uColor.value.set(accent)
      // the beacon is a "find me" cue for overviews; fade it out in close-up shots
      beacon.current.uniforms.uFade.value = THREE.MathUtils.smoothstep(dist, 70, 260)
    }
  })

  const dims = kind === 'shuttle' ? { L: 9, W: 2.5, H: 3.1 } : kind === 'cargo3w' ? { L: 3.3, W: 1.5, H: 1.9 } : { L: 4.4, W: 1.85, H: 1.45 }
  const L = dims.L * VS
  const W = dims.W * VS
  const H = dims.H * VS
  const paint = mode === 'light' ? '#f5f6f7' : '#d9dee2'
  const glass = '#1b2733'
  const wheelR = (kind === 'shuttle' ? 0.5 : 0.36) * VS * 1.6

  return (
    <group ref={group}>
      {/* pulse ring + under-glow */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.4, 0]}>
        <ringGeometry args={[2.2, 2.6, 48]} />
        <meshBasicMaterial color={accent} transparent depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.35, 0]}>
        <circleGeometry args={[Math.max(L, 3) * 0.75, 40]} />
        <meshBasicMaterial ref={glow} color={accent} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      {/* beacon visible from far away */}
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[0.15, 0.5, 32, 16, 1, true]} />
        <shaderMaterial ref={beacon} vertexShader={beaconVert} fragmentShader={beaconFrag} uniforms={beaconU} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={body} position={[0, wheelR * 0.9, 0]}>
        {kind === 'shuttle' ? (
          <>
            <RoundedBox args={[L, H * 0.92, W]} radius={0.3} position={[0, H * 0.5, 0]}>
              <meshStandardMaterial color={paint} roughness={0.45} metalness={0.1} />
            </RoundedBox>
            <mesh position={[0.1, H * 0.66, 0]}>
              <boxGeometry args={[L * 0.9, H * 0.28, W * 1.01]} />
              <meshStandardMaterial color={glass} roughness={0.2} metalness={0.4} />
            </mesh>
            <mesh position={[0, H * 0.24, 0]}>
              <boxGeometry args={[L * 1.002, H * 0.08, W * 1.012]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} />
            </mesh>
          </>
        ) : kind === 'cargo3w' ? (
          <>
            <RoundedBox args={[L * 0.6, H * 0.85, W]} radius={0.12} position={[-L * 0.18, H * 0.52, 0]}>
              <meshStandardMaterial color={accent} roughness={0.5} />
            </RoundedBox>
            <RoundedBox args={[L * 0.38, H * 0.8, W * 0.86]} radius={0.15} position={[L * 0.3, H * 0.45, 0]}>
              <meshStandardMaterial color={paint} roughness={0.45} />
            </RoundedBox>
            <mesh position={[L * 0.45, H * 0.62, 0]}>
              <boxGeometry args={[0.05, H * 0.3, W * 0.7]} />
              <meshStandardMaterial color={glass} />
            </mesh>
          </>
        ) : (
          <>
            <RoundedBox args={[L, H * 0.5, W]} radius={0.18} position={[0, H * 0.3, 0]}>
              <meshStandardMaterial color={paint} roughness={0.35} metalness={0.25} />
            </RoundedBox>
            <RoundedBox args={[L * 0.55, H * 0.42, W * 0.9]} radius={0.2} position={[-L * 0.05, H * 0.68, 0]}>
              <meshStandardMaterial color={glass} roughness={0.15} metalness={0.5} />
            </RoundedBox>
            <mesh position={[0, H * 0.18, 0]}>
              <boxGeometry args={[L * 1.005, H * 0.06, W * 1.01]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} />
            </mesh>
          </>
        )}
        {/* head + tail lights */}
        <mesh position={[L / 2 + 0.01, H * 0.35, W * 0.32]}>
          <boxGeometry args={[0.05, 0.12, 0.35]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff6dd" emissiveIntensity={3} />
        </mesh>
        <mesh position={[L / 2 + 0.01, H * 0.35, -W * 0.32]}>
          <boxGeometry args={[0.05, 0.12, 0.35]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff6dd" emissiveIntensity={3} />
        </mesh>
        <mesh position={[-L / 2 - 0.01, H * 0.38, 0]}>
          <boxGeometry args={[0.05, 0.1, W * 0.8]} />
          <meshStandardMaterial ref={brake} color="#ff2b2b" emissive="#ff1f1f" emissiveIntensity={1} />
        </mesh>
      </group>
      <group>
        {(kind === 'cargo3w'
          ? [[L * 0.38, 0], [-L * 0.3, W * 0.45], [-L * 0.3, -W * 0.45]]
          : [[L * 0.32, W * 0.46], [L * 0.32, -W * 0.46], [-L * 0.32, W * 0.46], [-L * 0.32, -W * 0.46]]
        ).map(([x, z], i) => (
          <mesh key={i} position={[x, wheelR, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[wheelR, wheelR, 0.22 * VS * 1.6, 18]} />
            <meshStandardMaterial color="#15191d" roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
