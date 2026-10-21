import { create } from 'zustand'
import { DEFAULT_TRIP, getTrips } from '../data/fleet'
import type { Trip } from '../data/simulate'
import type { Tab, Theme } from '../lib/scales'

export type View = '2d' | '3d'

interface State {
  vehicleId: string
  tripId: string
  tab: Tab
  view: View
  theme: Theme
  /** seconds since trip start */
  t: number
  playing: boolean
  rate: number
  video: boolean
  follow: boolean
  setVehicle: (id: string) => void
  setTrip: (id: string) => void
  setTab: (tab: Tab) => void
  setView: (v: View) => void
  setTheme: (t: Theme) => void
  seek: (t: number) => void
  setPlaying: (p: boolean) => void
  toggle: () => void
  setRate: (r: number) => void
  setVideo: (open: boolean) => void
  setFollow: (f: boolean) => void
}

const storedTheme = (): Theme => {
  try {
    const v = localStorage.getItem('coulomb-theme')
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* storage unavailable */
  }
  return 'light'
}

export const tripById = (vehicleId: string, tripId: string): Trip =>
  getTrips(vehicleId).find((t) => t.id === tripId) ?? getTrips(vehicleId)[0]

/** Open the reference trip just after the vehicle rejoins its usual route, like the brief's screenshot. */
const initialT = () => {
  const trip = tripById('ev-07', DEFAULT_TRIP)
  const d = trip.deviations[0]
  if (!d) return 0
  const S = trip.samples
  for (let k = Math.ceil(d.tEnd); k < S.n; k++) if (S.v[k] > 5.5 && S.cong[k] < 0.35) return k
  return d.tEnd + 45
}

export const useStore = create<State>((set, get) => ({
  vehicleId: 'ev-07',
  tripId: DEFAULT_TRIP,
  tab: 'deviation',
  view: '2d',
  theme: storedTheme(),
  t: initialT(),
  playing: false,
  rate: 240,
  video: false,
  follow: false,
  setVehicle: (id) => {
    if (id === get().vehicleId) return
    const trips = getTrips(id)
    const pick = trips.find((t) => t.deviations.length > 0) ?? trips[0]
    set({ vehicleId: id, tripId: pick.id, t: 0, playing: false })
  },
  setTrip: (id) => set({ tripId: id, t: 0, playing: false }),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('coulomb-theme', theme)
    } catch {
      /* storage unavailable */
    }
    set({ theme })
  },
  seek: (t) => {
    const trip = tripById(get().vehicleId, get().tripId)
    set({ t: Math.max(0, Math.min(trip.duration, t)) })
  },
  setPlaying: (playing) => {
    const s = get()
    const trip = tripById(s.vehicleId, s.tripId)
    // pressing play at the end restarts the trip
    if (playing && s.t >= trip.duration - 0.5) set({ t: 0 })
    set({ playing })
  },
  toggle: () => get().setPlaying(!get().playing),
  setRate: (rate) => set({ rate }),
  setVideo: (video) => set({ video }),
  setFollow: (follow) => set({ follow }),
}))

export const useTrip = () => {
  const vehicleId = useStore((s) => s.vehicleId)
  const tripId = useStore((s) => s.tripId)
  return tripById(vehicleId, tripId)
}

export const useWeekTrips = () => getTrips(useStore((s) => s.vehicleId))
