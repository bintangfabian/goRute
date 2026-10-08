// Labels for a trip option, shared by its card and its details.

import { daysBetween } from '../../shared/time.ts'
import type { Itinerary, Plan } from './api/client'
import { formatClock, formatDay, formatDuration } from './format'
import { PREFERENCES, type PickedTime } from './trip'

// A trip that starts this long after it was asked for says so, or it reads like one leaving now.
const LATE_START_SEC = 30 * 60

/** The preferences an option is the best at: "Tercepat", "Termurah". */
export const bestAt = (plan: Plan, id: string) => PREFERENCES.filter((p) => plan.ranking[p.id][0] === id).map((p) => p.label)

// From a picked time, "Berangkat 9 j 36 mnt lagi" would read as counting from now, and a
// bus on another day (the first one tomorrow) is easier to place by its day and clock, so
// those labels name them instead.
export function lateStart(it: Itinerary, departure: number, picked: PickedTime | null, minute: number) {
  const startMs = Date.parse(it.start)
  const sec = (startMs - departure) / 1000
  if (sec < LATE_START_SEC) return null
  const days = daysBetween(minute, startMs)
  if (!picked && days === 0) return `Berangkat ${formatDuration(sec)} lagi`
  return ['Berangkat', formatDay(startMs, days), formatClock(it.start)].filter(Boolean).join(' ')
}
