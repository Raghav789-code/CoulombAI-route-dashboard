import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 16, ...rest }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...rest,
})

export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.6-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8Z" fill="currentColor" stroke="none" />
  </svg>
)
export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
)
export const IconVideo = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5.5" width="13" height="13" rx="3" />
    <path d="m15.5 10 5-3v10l-5-3" />
  </svg>
)
export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
)
export const IconCube = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2.8 20 7.3v9.4l-8 4.5-8-4.5V7.3Z" />
    <path d="M4 7.3 12 12l8-4.7M12 12v9.2" />
  </svg>
)
export const IconMap = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
)
export const IconTarget = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
  </svg>
)
export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)
export const IconRecord = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
  </svg>
)
export const IconStop = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
  </svg>
)
export const IconBolt = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
  </svg>
)
export const IconLeaf = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" />
    <path d="M5 19c3-4 6-6 9-7.5" />
  </svg>
)
export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </svg>
)
export const IconFlag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
)
export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
)
export const IconRoute = (p: P) => (
  <svg {...base(p)}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" />
  </svg>
)
export const IconCalendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)
export const IconGauge = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.2 17.5a9 9 0 1 1 15.6 0" />
    <path d="m12 13.5 4.2-4.2" />
    <circle cx="12" cy="13.5" r="1.6" fill="currentColor" />
  </svg>
)
export const IconMountain = (p: P) => (
  <svg {...base(p)}>
    <path d="m2.5 19.5 6.5-11 4 6.5 2.5-3.5 6 8Z" />
    <path d="m7 11 2 1.5L11 11" />
  </svg>
)
export const IconTraffic = (p: P) => (
  <svg {...base(p)}>
    <rect x="7" y="2.5" width="10" height="19" rx="3" />
    <circle cx="12" cy="7.5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="16.5" r="1.4" fill="currentColor" />
  </svg>
)
export const IconBox = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
)
export const IconRegen = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
  </svg>
)
export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </svg>
)
export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
    <circle cx="12" cy="13" r="3.8" />
  </svg>
)

export const VehicleGlyph = ({ kind, size = 22 }: { kind: string; size?: number }) => {
  if (kind === 'shuttle')
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="3" y="7" width="26" height="15" rx="3.5" fill="currentColor" opacity=".18" />
        <rect x="3" y="7" width="26" height="15" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 11h5v5H6zM13 11h5v5h-5zM20 11h6v5h-6z" fill="currentColor" opacity=".55" />
        <circle cx="9" cy="23.5" r="2.5" fill="currentColor" />
        <circle cx="23" cy="23.5" r="2.5" fill="currentColor" />
      </svg>
    )
  if (kind === 'cargo3w')
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="12" y="8" width="16" height="13" rx="2" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 21H4.5v-4.5L8 11h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="7.5" cy="23" r="2.5" fill="currentColor" />
        <circle cx="23" cy="23" r="2.5" fill="currentColor" />
      </svg>
    )
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M4 19.5v-3.2c0-1 .6-1.8 1.5-2.1L9 13l3-4.2c.5-.6 1.2-1 2-1h5.5c.8 0 1.5.4 2 1L24.5 13l2.4.8c.9.3 1.6 1.1 1.6 2.1v3.6" fill="currentColor" opacity=".18" />
      <path d="M4 19.5v-3.2c0-1 .6-1.8 1.5-2.1L9 13l3-4.2c.5-.6 1.2-1 2-1h5.5c.8 0 1.5.4 2 1L24.5 13l2.4.8c.9.3 1.6 1.1 1.6 2.1v3.6H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="20.5" r="2.6" fill="currentColor" />
      <circle cx="22.5" cy="20.5" r="2.6" fill="currentColor" />
    </svg>
  )
}
