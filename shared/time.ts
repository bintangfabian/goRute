// WIB date math for the planner and the web app's departure picker.
// Jakarta is UTC+7 all year (no daylight saving), so WIB math needs no tz data.
const WIB_OFFSET_MS = 7 * 3600_000
const DAY_MS = 86_400_000

export type WibDay = {
  /** YYYYMMDD */
  ymd: number
  /** 0 is Monday, 6 is Sunday. */
  weekday: number
  /** Epoch ms of 00:00 WIB on this day. */
  midnightMs: number
}

export function wibDay(ms: number): WibDay {
  const local = new Date(ms + WIB_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  const d = local.getUTCDate()
  return {
    ymd: y * 10_000 + (m + 1) * 100 + d,
    weekday: (local.getUTCDay() + 6) % 7,
    midnightMs: Date.UTC(y, m, d) - WIB_OFFSET_MS,
  }
}

/** The WIB day `delta` days after `day`. */
export function addDays(day: WibDay, delta: number): WibDay {
  // Noon avoids any doubt about which side of midnight the result lands on.
  return wibDay(day.midnightMs + delta * DAY_MS + DAY_MS / 2)
}

/** Whole WIB days from the day of `fromMs` to the day of `toMs`. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.round((wibDay(toMs).midnightMs - wibDay(fromMs).midnightMs) / DAY_MS)
}

/** "HH:MM" on the 24-hour WIB clock, the value format of <input type="time">. */
export function wibClock(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(11, 16)
}

/** Epoch ms of `clock` ("HH:MM" WIB) on the WIB day `delta` days after the day of `ms`. */
export function wibTime(ms: number, delta: number, clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return addDays(wibDay(ms), delta).midnightMs + (h * 60 + m) * 60_000
}
