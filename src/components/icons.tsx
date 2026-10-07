import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

// One family: 24 grid, 1.8 strokes with round ends, and a light tint of the
// same colour inside the main shape so icons read as small illustrations.
function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

const tint = { fill: 'currentColor', fillOpacity: 0.16 } as const
const dot = { fill: 'currentColor', stroke: 'none' } as const

export const WalkIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="13.5" cy="4.5" r="2" {...dot} />
    <path d="M9.5 21 12 15.5l2.5 2.5V21" />
    <path d="m6.5 12.5 3-3.5 3.5 1 2 3h2.5" />
    <path d="m13 10-1 5.5" />
  </Icon>
)

export const BusIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="3" width="15" height="15" rx="3.5" {...tint} />
    <path d="M4.5 11h15M9.5 6h5M7.5 18v2.5M16.5 18v2.5" />
    <circle cx="8.25" cy="14.5" r="1.1" {...dot} />
    <circle cx="15.75" cy="14.5" r="1.1" {...dot} />
  </Icon>
)

export const TrainIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="3" width="14" height="14" rx="4" {...tint} />
    <rect x="7.75" y="6" width="8.5" height="4.5" rx="1.5" />
    <path d="M8.5 17 6.5 21M15.5 17l2 4" />
    <circle cx="9" cy="13.75" r="1.1" {...dot} />
    <circle cx="15" cy="13.75" r="1.1" {...dot} />
  </Icon>
)

export const LocateIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7" {...tint} />
    <circle cx="12" cy="12" r="2.6" {...dot} />
    <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5" />
  </Icon>
)

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21.5s-7-6.1-7-11.3a7 7 0 0 1 14 0c0 5.2-7 11.3-7 11.3Z" {...tint} />
    <circle cx="12" cy="10.2" r="2.6" />
  </Icon>
)

export const SwapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6.5 6.5 11 11m0-11-11 11" />
  </Icon>
)

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" {...tint} />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" {...tint} />
    <path d="m15 15 5 5" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9" />
    <path d="M19.5 4.5V9H15" />
  </Icon>
)

export const MapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5Z" {...tint} />
    <path d="M9 4v13.5M15 6.5V20" />
  </Icon>
)
