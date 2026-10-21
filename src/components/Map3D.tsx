import { useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Trip } from '../data/simulate'
import type { Tab, Theme } from '../lib/scales'
import { CityScene, DashboardRig, type CameraHandle } from './three/Scene'
import type { MapHandle } from './Map2D'
import { LabelLayer, LabelProjector, sceneLabels } from './three/Labels'

interface Props {
  trip: Trip
  week: Trip[]
  tab: Tab
  theme: Theme
  ref?: Ref<MapHandle>
}

export default function Map3D({ trip, week, tab, theme, ref }: Props) {
  const cam = useRef<CameraHandle | null>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const labels = useMemo(() => sceneLabels(trip, tab), [trip, tab])
  useImperativeHandle(ref, () => ({ zoom: (f) => cam.current?.zoom(f), fit: () => cam.current?.fit() }), [])
  return (
    <div className="map3d">
      <Canvas flat dpr={[1, 2]} camera={{ fov: 40, near: 1, far: 9000, position: [0, 800, 900] }} gl={{ antialias: true }}>
        <CityScene trip={trip} week={week} tab={tab} mode={theme} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={1.42} minDistance={20} maxDistance={4200} screenSpacePanning={false} />
        <DashboardRig trip={trip} week={tab === 'week' ? week : null} handle={cam} />
        <LabelProjector labels={labels} refs={labelRefs} />
      </Canvas>
      <LabelLayer labels={labels} refs={labelRefs} variant={theme} />
      <div className="map3d-hint">Drag to orbit · right-drag to pan · scroll to zoom</div>
    </div>
  )
}
