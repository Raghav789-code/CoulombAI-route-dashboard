export type VehicleKind = 'sedan' | 'cargo3w' | 'shuttle'

export interface VehicleSpec {
  id: string
  kind: VehicleKind
  name: string
  plate: string
  model: string
  driver: string
  /** kerb + typical payload, kg */
  mass: number
  cda: number
  crr: number
  etaDrive: number
  etaRegen: number
  regenMaxKw: number
  /** auxiliary/HVAC load, kW */
  auxKw: number
  batteryKwh: number
  packVoltage: number
  packResistance: number
  /** pack thermal mass J/K */
  thermalMass: number
  vmaxKmh: number
  accel: number
  decel: number
  /** baseline grid-to-wheel cost ₹/kWh and ICE equivalent */
  iceKmpl: number
}

export const VEHICLES: VehicleSpec[] = [
  {
    id: 'ev-07',
    kind: 'sedan',
    name: 'EV-07',
    plate: 'KA 51 EV 0712',
    model: 'e-Sedan · 40.5 kWh',
    driver: 'R. Menon',
    mass: 1680,
    cda: 0.62,
    crr: 0.011,
    etaDrive: 0.88,
    etaRegen: 0.62,
    regenMaxKw: 40,
    auxKw: 0.85,
    batteryKwh: 40.5,
    packVoltage: 320,
    packResistance: 0.09,
    thermalMass: 260_000,
    vmaxKmh: 72,
    accel: 1.3,
    decel: 2.2,
    iceKmpl: 14,
  },
  {
    id: 'ev-22',
    kind: 'cargo3w',
    name: 'EV-22',
    plate: 'KA 01 EV 2219',
    model: 'e-Cargo 3W · 10.2 kWh',
    driver: 'S. Gowda',
    mass: 760,
    cda: 0.95,
    crr: 0.015,
    etaDrive: 0.85,
    etaRegen: 0.55,
    regenMaxKw: 4,
    auxKw: 0.06,
    batteryKwh: 10.2,
    packVoltage: 51.2,
    packResistance: 0.025,
    thermalMass: 70_000,
    vmaxKmh: 45,
    accel: 0.9,
    decel: 1.8,
    iceKmpl: 28,
  },
  {
    id: 'ev-90',
    kind: 'shuttle',
    name: 'EV-90',
    plate: 'KA 53 EV 9030',
    model: 'e-Shuttle 9 m · 210 kWh',
    driver: 'M. Khan',
    mass: 11_200,
    cda: 5.6,
    crr: 0.008,
    etaDrive: 0.87,
    etaRegen: 0.65,
    regenMaxKw: 110,
    auxKw: 4.2,
    batteryKwh: 210,
    packVoltage: 600,
    packResistance: 0.06,
    thermalMass: 1_300_000,
    vmaxKmh: 50,
    accel: 0.75,
    decel: 1.5,
    iceKmpl: 4.2,
  },
]

export const VEHICLE: Record<string, VehicleSpec> = Object.fromEntries(VEHICLES.map((v) => [v.id, v]))
