// A week of operations (Mon 12 – Sun 18 Oct 2026) for three EVs in east Bengaluru.
// Trips chain state-of-charge through the day; overnight / depot charging tops up.

import { buildPath, type DensePath } from './network'
import { simulate, type Trip, type TripPlan } from './simulate'
import { VEHICLE, type VehicleSpec } from './vehicles'
import { hash, rng } from './geo'

export const WEEK_START = Date.UTC(2026, 9, 12) - 5.5 * 3_600_000 // Mon 12 Oct 2026 00:00 IST
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface RouteDef {
  id: string
  name: string
  nodes: string[]
}

const r = (id: string, name: string, nodes: string[]): RouteDef => ({ id, name, nodes })

export const ROUTES: Record<string, RouteDef> = Object.fromEntries(
  [
    r('A1', 'A1 · Koramangala → Whitefield via ORR', ['koramangala', 'silkboard', 'hsr', 'agara', 'bellandur', 'marathahalli', 'kundalahalli', 'whitefield']),
    r('D1', 'Detour via Sarjapur Rd', ['koramangala', 'silkboard', 'hsr', 'agara', 'sarjapur', 'kadubees', 'marathahalli', 'kundalahalli', 'whitefield']),
    r('A2', 'A2 · Whitefield → Koramangala via Old Airport Rd', ['whitefield', 'kundalahalli', 'marathahalli', 'hal', 'domlur', 'ejipura', 'koramangala']),
    r('D2', 'Return via ORR', ['whitefield', 'kundalahalli', 'marathahalli', 'bellandur', 'agara', 'hsr', 'silkboard', 'koramangala']),
    r('W1', 'W1 · Koramangala → Indiranagar', ['koramangala', 'ejipura', 'domlur', 'indiranagar']),
    r('L1', 'L1 · Domlur north loop', ['domlur', 'indiranagar', 'tinfactory', 'hal', 'domlur']),
    r('L2', 'L2 · Domlur south loop', ['domlur', 'ejipura', 'koramangala', 'silkboard', 'hsr', 'agara', 'bellandur', 'marathahalli', 'hal', 'domlur']),
    r('L2D', 'South loop via Sarjapur Rd', ['domlur', 'ejipura', 'koramangala', 'silkboard', 'hsr', 'agara', 'sarjapur', 'kadubees', 'marathahalli', 'hal', 'domlur']),
    r('S1', 'S1 · Silk Board → KR Puram (ORR shuttle)', ['silkboard', 'agara', 'bellandur', 'marathahalli', 'doddanekundi', 'krpuram']),
    r('S1R', 'S1R · KR Puram → Silk Board (ORR shuttle)', ['krpuram', 'doddanekundi', 'marathahalli', 'bellandur', 'agara', 'silkboard']),
    r('S1D', 'Shuttle diverted via Sarjapur Rd', ['silkboard', 'agara', 'sarjapur', 'kadubees', 'marathahalli', 'doddanekundi', 'krpuram']),
  ].map((x) => [x.id, x]),
)

interface Leg {
  day: number
  hh: number
  mm: number
  route: string
  usual: string
  purpose: string
  note?: string
  deliveries?: string[]
  bias?: number
  /** charge added before this leg (fraction of pack) */
  charge?: number
}

function schedule(v: VehicleSpec): Leg[] {
  const R = rng(hash(v.id))
  const legs: Leg[] = []
  const jitter = (base: number, span: number) => base + Math.floor(R() * span)
  if (v.kind === 'sedan') {
    for (let d = 0; d < 5; d++) {
      const am = d === 3
        ? { hh: 9, mm: 12 }
        : { hh: 8, mm: jitter(38, 40) }
      legs.push({
        day: d, ...am,
        route: d === 3 ? 'D1' : 'A1',
        usual: 'A1',
        purpose: 'Morning commute',
        note: d === 3 ? 'Waterlogging reported on ORR at Bellandur — driver re-routed via Sarjapur Rd & Panathur Rd.' : undefined,
        charge: 1,
      })
      legs.push({
        day: d, hh: 18, mm: jitter(5, 50),
        route: d === 4 ? 'D2' : 'A2',
        usual: 'A2',
        purpose: 'Evening commute',
        note: d === 4 ? 'Took ORR home instead of Old Airport Rd (Friday evening errand at HSR).' : undefined,
      })
    }
    legs.push({ day: 5, hh: 11, mm: 25, route: 'W1', usual: 'W1', purpose: 'Weekend errand', charge: 1 })
    legs.push({ day: 6, hh: 17, mm: 40, route: 'W1', usual: 'W1', purpose: 'Weekend errand', charge: 1 })
  } else if (v.kind === 'cargo3w') {
    for (let d = 0; d < 6; d++) {
      legs.push({ day: d, hh: 7, mm: jitter(20, 25), route: 'L1', usual: 'L1', purpose: 'Morning deliveries', deliveries: ['indiranagar', 'tinfactory', 'hal'], charge: 1 })
      legs.push({
        day: d, hh: 13, mm: jitter(35, 30),
        route: d === 2 ? 'L2D' : 'L2', usual: 'L2', purpose: 'Afternoon deliveries',
        deliveries: d === 2 ? ['koramangala', 'hsr', 'sarjapur', 'marathahalli'] : ['koramangala', 'hsr', 'bellandur', 'marathahalli'],
        note: d === 2 ? 'Customer at Sarjapur Rd added mid-route — dispatcher re-routed off the usual loop.' : undefined,
        charge: 0.55,
      })
    }
  } else {
    const times: [number, number, string, string][] = [
      [7, 50, 'S1', 'S1'],
      [9, 15, 'S1R', 'S1R'],
      [17, 25, 'S1', 'S1'],
      [18, 50, 'S1R', 'S1R'],
    ]
    for (let d = 0; d < 5; d++) {
      times.forEach(([hh, mm, route, usual], k) => {
        const divert = d === 3 && k === 0
        legs.push({
          day: d, hh, mm: mm + Math.floor(R() * 8), route: divert ? 'S1D' : route, usual,
          purpose: k % 2 === 0 ? 'Staff shuttle · outbound' : 'Staff shuttle · return',
          note: divert ? 'ORR closed at Bellandur for waterlogging — operations diverted via Sarjapur Rd.' : undefined,
          charge: k === 0 ? 1 : 0.22,
          bias: divert ? 0.05 : 0,
        })
      })
    }
  }
  return legs
}

const pathCache = new Map<string, DensePath>()
const getPath = (id: string) => {
  let p = pathCache.get(id)
  if (!p) {
    p = buildPath(ROUTES[id].nodes)
    pathCache.set(id, p)
  }
  return p
}

const tripCache = new Map<string, Trip[]>()

export function getTrips(vehicleId: string): Trip[] {
  const cached = tripCache.get(vehicleId)
  if (cached) return cached
  const v = VEHICLE[vehicleId]
  const R = rng(hash(vehicleId + 'soc'))
  let soc = 0.9
  const trips: Trip[] = []
  for (const [k, leg] of schedule(v).entries()) {
    if (leg.charge === 1) soc = 0.88 + R() * 0.1
    else if (leg.charge) soc = Math.min(0.97, soc + leg.charge * (0.6 + R() * 0.4))
    const plan: TripPlan = {
      id: `${vehicleId}-${k}`,
      vehicle: v,
      routeId: leg.route,
      route: ROUTES[leg.route].nodes,
      usualId: leg.usual,
      usual: ROUTES[leg.usual].nodes,
      start: WEEK_START + leg.day * 86_400_000 + (leg.hh * 60 + leg.mm) * 60_000 + Math.floor(R() * 50) * 1000,
      dayIndex: leg.day,
      purpose: leg.purpose,
      note: leg.note,
      socStart: soc,
      deliveryStops: leg.deliveries,
      trafficBias: leg.bias,
    }
    const trip = simulate(plan, getPath(leg.route), getPath(leg.usual))
    trips.push(trip)
    soc = trip.stats.socEnd
  }
  tripCache.set(vehicleId, trips)
  return trips
}

/** The trip that mirrors the assignment's reference screenshot. */
export const DEFAULT_TRIP = 'ev-07-6'
