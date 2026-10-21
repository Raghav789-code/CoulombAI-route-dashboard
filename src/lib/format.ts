const tz = 'Asia/Kolkata'

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
const longDayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

export const fmtClock = (ms: number) => clockFmt.format(ms)
export const fmtHM = (ms: number) => hmFmt.format(ms)
export const fmtDay = (ms: number) => dayFmt.format(ms)
export const fmtLongDay = (ms: number) => longDayFmt.format(ms)

export function fmtDur(sec: number, compact = false) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return compact ? `${h}h ${String(r).padStart(2, '0')}m` : `${h} h ${r} m`
}

export function fmtElapsed(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

export const fmtKm = (m: number, d = 2) => `${(m / 1000).toFixed(d)} km`
export const fmtInr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`

export function fmtDev(m: number) {
  if (m <= 250) return 'On route'
  return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(2)} km away`
}
