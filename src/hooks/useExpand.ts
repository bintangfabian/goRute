import { useReducedMotion } from 'motion/react'

/**
 * How a panel or list opens and closes: a short ease, or at once for riders who
 * ask for less motion. MotionConfig only stills transforms; heights still animate.
 */
export function useExpand() {
  return useReducedMotion() ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const }
}
