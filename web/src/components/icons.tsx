import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const WalkIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="13" cy="4" r="2" />
    <path d="m9 20 3-6 3 3v4M6 12l3-4 4 1 3 3h3" />
  </Icon>
)

export const BusIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="14" rx="3" />
    <path d="M4 11h16M8 21v-4M16 21v-4" />
    <circle cx="8" cy="14" r=".5" fill="currentColor" />
    <circle cx="16" cy="14" r=".5" fill="currentColor" />
  </Icon>
)

export const TrainIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="3" width="14" height="14" rx="3" />
    <path d="M5 10h14M9 21l-2 0 2-4M15 21h2l-2-4" />
  </Icon>
)

export const LocateIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
)

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
)

export const SwapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)
