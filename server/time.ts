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
