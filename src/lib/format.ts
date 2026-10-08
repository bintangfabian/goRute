const clock = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
})

const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' })

// Two days on is named by its weekday: "Senin" reads the same on the button that picks it, in
// the picker and on the cards, where "lusa" would be a third word for the same day.
const DAY_WORDS: Record<number, string> = { [-1]: 'kemarin', 0: '', 1: 'besok' }

export const formatClock = (iso: string) => clock.format(new Date(iso))

/** The WIB weekday of `ms`, e.g. "Sabtu". */
export const formatWeekday = (ms: number) => weekday.format(ms)

/** The day of `ms`, `days` days after today: '' (today), kemarin, besok, or the weekday. */
export function formatDay(ms: number, days: number) {
  return DAY_WORDS[days] ?? weekday.format(ms)
}

export function formatDuration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60))
  if (min < 60) return `${min} mnt`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} jam` : `${h} jam ${m} mnt`
}

export function formatRupiah(amount: number) {
  return amount === 0 ? 'Gratis' : `Rp${amount.toLocaleString('id-ID')}`
}

/** Tens of meters, a few single meters when that is all ("3 m" of stairs, not "0 m"), kilometers past 1 km. */
export function formatDistance(m: number) {
  if (m < 10) return `${Math.max(1, Math.round(m))} m`
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`
}
