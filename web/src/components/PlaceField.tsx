import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { usePlaceSearch } from '../hooks/usePlaceSearch'
import { inServiceArea, type Endpoint } from '../lib/trip'
import { CloseIcon, LocateIcon, PinIcon } from './icons'

type Props = {
  value: Endpoint | null
  onChange: (value: Endpoint | null) => void
  placeholder: string
  kind: 'origin' | 'destination'
}

export function PlaceField({ value, onChange, placeholder, kind }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const search = usePlaceSearch(focused ? query : '')

  const offerLocation = kind === 'origin'
  const hasQuery = query.trim().length >= 2
  const open = focused && (hasQuery || offerLocation)

  function choose(endpoint: Endpoint) {
    onChange(endpoint)
    setQuery('')
    inputRef.current?.blur()
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError('Browser ini tidak mendukung lokasi.')
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        if (!inServiceArea(coords.latitude, coords.longitude)) {
          setGeoError('Lokasimu di luar Jabodetabek.')
          return
        }
        choose({ name: 'Lokasi saya', lat: coords.latitude, lon: coords.longitude })
      },
      () => {
        setLocating(false)
        setGeoError('Izin lokasi ditolak atau lokasi tidak tersedia.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 transition-shadow focus-within:ring-2 focus-within:ring-brand">
        <span
          className={`size-2.5 shrink-0 rounded-full ${kind === 'origin' ? 'bg-brand ring-4 ring-brand-soft' : 'bg-accent'}`}
        />
        <input
          ref={inputRef}
          value={focused ? query : (value?.name ?? '')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true)
            setGeoError(null)
          }}
          onBlur={() => setFocused(false)}
          placeholder={focused && value ? value.name : placeholder}
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-slate-400"
        />
        {value && !focused && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Hapus"
            className="-m-1 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </label>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {offerLocation && (
              <Suggestion
                icon={<LocateIcon className="size-4 text-brand" />}
                title={locating ? 'Mencari lokasimu…' : 'Lokasi saya'}
                subtitle={geoError ?? 'Pakai GPS perangkat'}
                onSelect={useCurrentLocation}
              />
            )}
            {hasQuery && search.loading && search.places.length === 0 && <Note>Mencari…</Note>}
            {hasQuery && search.error && <Note>{search.error}</Note>}
            {hasQuery && !search.loading && !search.error && search.places.length === 0 && (
              <Note>Tempat tidak ditemukan. Coba nama lain, atau ketuk peta.</Note>
            )}
            {search.places.map((p) => (
              <Suggestion
                key={p.id}
                icon={<PinIcon className="size-4 text-slate-400" />}
                title={p.name}
                subtitle={p.address}
                onSelect={() => choose({ name: p.name, lat: p.lat, lon: p.lon })}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function Suggestion(props: { icon: ReactNode; title: string; subtitle: string; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        // Keep the input focused so the list does not close before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={props.onSelect}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100">{props.icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{props.title}</span>
          {props.subtitle && <span className="block truncate text-xs text-slate-500">{props.subtitle}</span>}
        </span>
      </button>
    </li>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <li className="px-3 py-3 text-sm text-slate-500">{children}</li>
}
