import type { ReactNode, SVGProps } from 'react'

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

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

/** The turn a walking step starts with, as an arrow. */
export function ManeuverIcon({ maneuver, ...p }: IconProps & { maneuver: string }) {
  const arrows: Record<string, ReactNode> = {
    depart: (
      <>
        <circle cx="12" cy="19" r="2" {...tint} />
        <path d="M12 16.5V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      </>
    ),
    straight: (
      <>
        <path d="M12 20V5" />
        <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      </>
    ),
    right: (
      <>
        <path d="M8 20v-6.5A4.5 4.5 0 0 1 12.5 9H19" />
        <path d="m15 5 4 4-4 4" />
      </>
    ),
    left: (
      <>
        <path d="M16 20v-6.5A4.5 4.5 0 0 0 11.5 9H5" />
        <path d="m9 5-4 4 4 4" />
      </>
    ),
    'slight-right': (
      <>
        <path d="M9 20v-6.5l7.5-7.5" />
        <path d="M11 6h5.5v5.5" />
      </>
    ),
    'slight-left': (
      <>
        <path d="M15 20v-6.5L7.5 6" />
        <path d="M13 6H7.5v5.5" />
      </>
    ),
    'sharp-right': (
      <>
        <path d="M7 20V8a3 3 0 0 1 5.2-2L18 12.5" />
        <path d="M18 7.5v5h-5" />
      </>
    ),
    'sharp-left': (
      <>
        <path d="M17 20V8a3 3 0 0 0-5.2-2L6 12.5" />
        <path d="M6 7.5v5h5" />
      </>
    ),
    uturn: (
      <>
        <path d="M8 20V9.5a4 4 0 0 1 8 0V17" />
        <path d="m12.5 13.5 3.5 3.5 3.5-3.5" />
      </>
    ),
  }
  return <Icon {...p}>{arrows[maneuver] ?? arrows.straight}</Icon>
}

/** A zebra crossing between the kerbs. */
export const CrossingIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6.5h17M3.5 17.5h17" />
    <path d="M7 9.5v5M10.5 9.5v5M14 9.5v5M17.5 9.5v5" strokeWidth={2.4} strokeLinecap="butt" />
  </Icon>
)

/** A footbridge (JPO): ramps up to a railed deck over the road. */
export const FootbridgeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 18 7 10.5h10l4.5 7.5" {...tint} />
    <path d="M7 10.5V7.5h10v3" />
    <path d="M2 21h20" />
  </Icon>
)

/** A small bridge over a ditch or a river: an arched deck above the water. */
export const BridgeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 14.5C6 9 18 9 21.5 14.5v2h-19Z" {...tint} />
    <path d="M2.5 20c1.6.9 3.1.9 4.7 0s3.1-.9 4.8 0 3.1.9 4.8 0 3.1-.9 4.7 0" />
  </Icon>
)

export const UnderpassIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 5.5h19" />
    <path d="M6 20v-6a6 6 0 0 1 12 0v6Z" {...tint} />
    <path d="M2.5 20h19" />
  </Icon>
)

export const StairsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4v-4h4v-4h4V8h4v12Z" {...tint} stroke="none" />
    <path d="M4 20h4v-4h4v-4h4V8h4" />
  </Icon>
)

/** The end of the trip. */
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 21V4" />
    <path d="M6 4.5h11l-2.5 4L17 12.5H6Z" {...tint} />
  </Icon>
)

/** A bus shelter: roof, posts and bench. */
export const HalteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5 12 4.5l8.5 4Z" {...tint} />
    <path d="M5.5 8.5V20M18.5 8.5V20" />
    <path d="M8.5 15h7" strokeWidth={2.4} />
    <path d="M9 15v3M15 15v3" />
  </Icon>
)

export const TicketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" {...tint} />
    <path d="M14.5 7.5v9" strokeDasharray="1.6 2.2" />
  </Icon>
)

export const BagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14l-1.2 12H6.2Z" {...tint} />
    <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
  </Icon>
)

export const HospitalIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4.5" {...tint} />
    <path d="M12 8.5v7M8.5 12h7" />
  </Icon>
)

export const SchoolIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2.5 9.5 9.5-5 9.5 5-9.5 5Z" {...tint} />
    <path d="M6.5 11.8V16c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.2M21.5 9.5V15" />
  </Icon>
)

/** A domed house of worship. */
export const WorshipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 20v-7.5a7 7 0 0 1 14 0V20Z" {...tint} />
    <path d="M12 5.5V2.5M3 20h18M10 20v-3a2 2 0 0 1 4 0v3" />
  </Icon>
)

export const RoadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8.5 3.5 5.5 20.5M15.5 3.5l3 17" />
    <path d="M12 5v2.5M12 10.75v2.5M12 16.5V19" />
  </Icon>
)

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 10v10h12V10" {...tint} />
    <path d="m3.5 11.5 8.5-7 8.5 7M10 20v-5h4v5" />
  </Icon>
)

export const FoodIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5V8a2 2 0 0 0 4 0V3.5M7 3.5v17" />
    <path d="M17 20.5v-17c-2.2 1.3-3.5 4-3.5 7.5v3H17" {...tint} />
  </Icon>
)

/** An obelisk, for landmarks and monuments. */
export const LandmarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.8 5h2.4l1.3 12h-5Z" {...tint} />
    <path d="M12 2.5V5M7 20.5h10M8.5 17h7" />
  </Icon>
)

export const BuildingIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" {...tint} />
    <path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M10.5 20.5v-4h3v4" />
  </Icon>
)
