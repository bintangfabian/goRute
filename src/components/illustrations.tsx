import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'motion/react'
import type { ReactNode } from 'react'

// Small scenes for the planner's states, drawn in the brand colours and kept
// still when the rider asks the system for reduced motion.
const TEAL = '#0f766e'
const TEAL_DARK = '#115e59'
const TEAL_SOFT = '#ccfbf1'
const AMBER = '#fbbf24'
const INK = '#1e293b'
const LINE = '#e2e8f0'
const MUTED = '#cbd5e1'

const forever = (duration: number, extra: Transition = {}): Transition => ({
  duration,
  repeat: Infinity,
  ease: 'easeInOut',
  ...extra,
})

/** Loops `animate` unless reduced motion is on. */
function Loop(props: { children: ReactNode; animate: TargetAndTransition; transition: Transition; spin?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.g
      animate={reduce ? undefined : props.animate}
      transition={props.transition}
      style={props.spin ? { transformBox: 'fill-box', transformOrigin: 'center' } : undefined}
    >
      {props.children}
    </motion.g>
  )
}

function Scene({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 200 120" className="mx-auto h-24 w-auto [@media(max-height:700px)]:h-16" role="img" aria-label={label}>
      {children}
    </svg>
  )
}

function Road({ moving }: { moving: boolean }) {
  const reduce = useReducedMotion()
  return (
    <>
      <rect x="8" y="90" width="184" height="14" rx="7" fill={LINE} />
      <motion.path
        d="M16 97H184"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="9 9"
        animate={moving && !reduce ? { strokeDashoffset: [0, 18] } : undefined}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
      />
    </>
  )
}

function Wheel({ cx }: { cx: number }) {
  return (
    <Loop animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} spin>
      <circle cx={cx} cy="88" r="6.5" fill={INK} />
      <circle cx={cx} cy="88" r="2.4" fill={LINE} />
      <path d={`M${cx} 82.5v3M${cx} 90.5v3M${cx - 5.5} 88h3M${cx + 2.5} 88h3`} stroke={LINE} strokeWidth="1.2" />
    </Loop>
  )
}

function Bus({ x = 62 }: { x?: number }) {
  return (
    <g>
      <Loop animate={{ y: [0, -1.2, 0] }} transition={forever(0.45)}>
        <rect x={x} y="58" width="60" height="28" rx="8" fill={TEAL} />
        <rect x={x + 6} y="64" width="12" height="10" rx="2.5" fill={TEAL_SOFT} />
        <rect x={x + 21} y="64" width="12" height="10" rx="2.5" fill={TEAL_SOFT} />
        <rect x={x + 36} y="64" width="18" height="10" rx="2.5" fill={TEAL_SOFT} />
        <rect x={x} y="78" width="60" height="3.5" fill={TEAL_DARK} />
        <circle cx={x + 56} cy="83" r="2" fill={AMBER} />
      </Loop>
      <Wheel cx={x + 14} />
      <Wheel cx={x + 46} />
    </g>
  )
}

function Pin({ x, y, color = AMBER }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <path
        d={`M${x} ${y + 22}s-11-9.5-11-17.5a11 11 0 0 1 22 0c0 8-11 17.5-11 17.5Z`}
        fill={color}
        stroke="#fff"
        strokeWidth="2.5"
      />
      <circle cx={x} cy={y + 4.5} r="4" fill="#fff" />
    </g>
  )
}

/** Jakarta's skyline with Monas, the bus on its way, and a stop bobbing ahead. */
export function ReadyArt() {
  return (
    <Scene label="Bus goRute siap berangkat">
      <ellipse cx="100" cy="98" rx="96" ry="18" fill={TEAL_SOFT} opacity="0.6" />
      <g fill={MUTED} opacity="0.7">
        <rect x="18" y="54" width="16" height="36" rx="2" />
        <rect x="37" y="40" width="14" height="50" rx="2" />
        <rect x="124" y="46" width="15" height="44" rx="2" />
        <rect x="170" y="58" width="14" height="32" rx="2" />
      </g>
      {/* Monas */}
      <g>
        <path d="M152 30h4l3 46h-10z" fill={MUTED} />
        <rect x="143" y="76" width="22" height="6" rx="1.5" fill={MUTED} />
        <Loop animate={{ scale: [1, 1.18, 1] }} transition={forever(1.6)} spin>
          <path d="M154 18c3 4 4 7 1.5 10.5h-3C150 25 151 22 154 18Z" fill={AMBER} />
        </Loop>
      </g>
      <Road moving />
      <Bus />
      <Loop animate={{ y: [0, -5, 0] }} transition={forever(1.4)}>
        <Pin x={176} y={52} />
      </Loop>
    </Scene>
  )
}

/** A stop with nobody coming yet: no route at this time. */
export function NoTripArt() {
  return (
    <Scene label="Belum ada bus di halte">
      <ellipse cx="100" cy="100" rx="92" ry="14" fill={LINE} opacity="0.7" />
      <path d="M24 96H96" stroke={MUTED} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />
      {/* Halte */}
      <rect x="112" y="40" width="5" height="58" rx="2.5" fill={INK} />
      <rect x="98" y="26" width="34" height="22" rx="6" fill={TEAL} />
      <rect x="107" y="31" width="16" height="11" rx="3" fill={TEAL_SOFT} />
      <rect x="128" y="76" width="44" height="6" rx="3" fill={MUTED} />
      <rect x="132" y="82" width="4" height="14" rx="2" fill={MUTED} />
      <rect x="164" y="82" width="4" height="14" rx="2" fill={MUTED} />
      <Loop animate={{ y: [0, -4, 0], rotate: [-4, 4, -4] }} transition={forever(2.2)} spin>
        <circle cx="152" cy="34" r="13" fill={AMBER} />
        <path d="M148 30.5a4 4 0 1 1 5.6 3.7c-1 .5-1.6 1.3-1.6 2.3" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="152" cy="40.5" r="1.5" fill={INK} />
      </Loop>
    </Scene>
  )
}

/** A long dotted walk from the pin to a far stop: move the pin closer. */
export function FarArt() {
  const reduce = useReducedMotion()
  return (
    <Scene label="Halte terlalu jauh untuk jalan kaki">
      <ellipse cx="100" cy="100" rx="92" ry="14" fill={LINE} opacity="0.7" />
      <path d="M40 92C80 70 120 106 164 84" stroke={MUTED} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" fill="none" />
      <Pin x={34} y={62} color={TEAL} />
      <rect x="166" y="52" width="4" height="40" rx="2" fill={INK} />
      <rect x="156" y="42" width="24" height="16" rx="4" fill={TEAL} />
      <motion.g
        animate={reduce ? undefined : { x: [0, 104, 104, 0], opacity: [1, 1, 0, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.8, 0.9, 1] }}
      >
        <circle cx="52" cy="70" r="3.5" fill={INK} />
        <path d="M51 75l-2 9 4 3v6M50 79l-5 4M52 79l5 3M49 84l-4 9" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </motion.g>
    </Scene>
  )
}

/** An unplugged cable: the server cannot be reached. */
export function OfflineArt() {
  return (
    <Scene label="Server tidak terhubung">
      <ellipse cx="100" cy="100" rx="92" ry="14" fill={LINE} opacity="0.7" />
      <path d="M10 70h52" stroke={MUTED} strokeWidth="5" strokeLinecap="round" />
      <path d="M190 70h-52" stroke={MUTED} strokeWidth="5" strokeLinecap="round" />
      <Loop animate={{ x: [0, -4, 0] }} transition={forever(1.6)}>
        <rect x="60" y="58" width="26" height="24" rx="6" fill={TEAL} />
        <path d="M86 64h8M86 76h8" stroke={TEAL_DARK} strokeWidth="4" strokeLinecap="round" />
      </Loop>
      <Loop animate={{ x: [0, 4, 0] }} transition={forever(1.6)}>
        <rect x="114" y="58" width="26" height="24" rx="6" fill={INK} />
        <circle cx="120" cy="64" r="2.2" fill={LINE} />
        <circle cx="120" cy="76" r="2.2" fill={LINE} />
      </Loop>
      <Loop animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6] }} transition={forever(1.6)} spin>
        <path d="M104 42l-6 12h8l-6 12" stroke={AMBER} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Loop>
    </Scene>
  )
}

/** The stop pin lands on the start dot again and again: start and end are the same. */
export function SamePlaceArt() {
  return (
    <Scene label="Asal dan tujuan sama">
      <ellipse cx="100" cy="100" rx="92" ry="14" fill={LINE} opacity="0.7" />
      <ellipse cx="100" cy="92" rx="16" ry="5" fill={MUTED} />
      <circle cx="100" cy="88" r="9" fill={TEAL} stroke="#fff" strokeWidth="4" />
      <Loop animate={{ y: [-26, -6, -26] }} transition={forever(1.3)}>
        <Pin x={100} y={50} />
      </Loop>
    </Scene>
  )
}
