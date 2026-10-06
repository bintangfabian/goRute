const clock = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
})

export const formatClock = (iso: string) => clock.format(new Date(iso))

export function formatDuration(sec: number) {
  const min = Math.max(1, Math.round(sec / 60))
  if (min < 60) return `${min} mnt`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} jam` : `${h} j ${m} mnt`
}

export function formatRupiah(amount: number) {
  return amount === 0 ? 'Gratis' : `Rp${amount.toLocaleString('id-ID')}`
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`
}
