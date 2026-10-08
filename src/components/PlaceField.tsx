import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useExpand } from '../hooks/useExpand'
import { usePlaceSearch } from '../hooks/usePlaceSearch'
import type { PlaceResult } from '../lib/api/client'
import { inServiceArea, type Endpoint } from '../lib/trip'
import {
  BagIcon,
  BuildingIcon,
  BusIcon,
  CloseIcon,
  FoodIcon,
  HomeIcon,
  HospitalIcon,
  LandmarkIcon,
  LocateIcon,
  PinIcon,
  RoadIcon,
  SchoolIcon,
  TrainIcon,
  WorshipIcon,
} from './icons'

type Props = {
  value: Endpoint | null
  onChange: (value: Endpoint | null) => void
  placeholder: string
  kind: 'origin' | 'destination'
  /** Told when the rider starts and stops typing here. */
  onEditing?: (editing: boolean) => void
  /** The other end of the trip, if chosen: places near it are suggested first. */
  near?: Endpoint | null
}

// `place` is empty for the GPS option.
type Option = { id: string; icon: ReactNode; title: string; subtitle: string; place?: Endpoint }

// A combobox: type to search, arrow keys move through the suggestions, Enter
// takes the highlighted one (or the first place), Escape closes the list.
export function PlaceField({ value, onChange, placeholder, kind, onEditing, near = null }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  // Escape hides the list until the rider types again.
  const [dismissed, setDismissed] = useState(false)
  // The highlighted suggestion, by id: new answers move it with its place, not its position.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const search = usePlaceSearch(focused ? query : '', near)
  const expand = useExpand()

  const label = kind === 'origin' ? 'Asal' : 'Tujuan'
  const offerLocation = kind === 'origin'
  const hasQuery = query.trim().length >= 2
  const open = focused && !dismissed && (hasQuery || offerLocation)

  function choose(endpoint: Endpoint) {
    onChange(endpoint)
    setQuery('')
    setActiveId(null)
    inputRef.current?.blur()
  }

  function locateMe() {
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

  const options: Option[] = [
    ...(offerLocation
      ? [
          {
            id: 'gps',
            icon: <LocateIcon className="size-4 text-brand" />,
            title: locating ? 'Mencari lokasimu…' : 'Lokasi saya',
            subtitle: geoError ?? 'Pakai GPS perangkat',
          },
        ]
      : []),
    ...(hasQuery ? search.places : []).map((p) => ({
      id: p.id,
      icon: <PlaceIcon place={p} />,
      title: p.name,
      subtitle: p.address,
      place: { name: p.name, lat: p.lat, lon: p.lon },
    })),
  ]
  function pick(o: Option) {
    if (o.place) choose(o.place)
    else locateMe()
  }

  const current = activeId === null ? -1 : options.findIndex((o) => o.id === activeId)
  const optionId = (i: number) => `${listId}-${i}`
  const setActive = (i: number) => setActiveId(i >= 0 ? (options[i]?.id ?? null) : null)

  // Keep the highlighted suggestion in view when arrow keys move past the scrolled part.
  useEffect(() => {
    if (current >= 0) document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, listId])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return
      e.preventDefault()
      setDismissed(false)
      const n = options.length
      if (current === -1) setActive(e.key === 'ArrowDown' ? 0 : n - 1)
      else setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Enter') {
      if (!open) return
      if (current < 0 && search.loading && hasQuery) {
        // The list may still show places for what was typed before; the first of them is not what was asked for.
        e.preventDefault()
        return
      }
      const chosen = current >= 0 ? options[current] : options.find((o) => o.place)
      if (chosen) {
        e.preventDefault()
        pick(chosen)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (open) {
        setDismissed(true)
        setActiveId(null)
      } else inputRef.current?.blur()
    }
  }

  return (
    <div>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 transition-shadow focus-within:ring-2 focus-within:ring-brand">
        <span
          className={`size-2.5 shrink-0 rounded-full ${kind === 'origin' ? 'bg-brand ring-4 ring-brand-soft' : 'bg-accent'}`}
        />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && current >= 0 ? optionId(current) : undefined}
          // Place names are not dictionary words: no autocorrect ("blok m" → "Block M") or red underlines.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          value={focused ? query : (value?.name ?? '')}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveId(null)
            setDismissed(false)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true)
            setGeoError(null)
            onEditing?.(true)
          }}
          onBlur={() => {
            setFocused(false)
            setDismissed(false)
            setActive(-1)
            onEditing?.(false)
          }}
          placeholder={focused && value ? value.name : placeholder}
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-slate-400"
        />
        {value && !focused && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Hapus ${label.toLowerCase()}`}
            className="-m-1 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </label>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expand}
            className="overflow-hidden"
          >
            <div className="max-h-[min(26rem,55dvh)] overflow-y-auto overscroll-contain">
              <ul id={listId} role="listbox" aria-label={`Saran ${label.toLowerCase()}`}>
                {options.map((o, i) => (
                  <li key={o.id} role="none">
                    <button
                      type="button"
                      role="option"
                      id={optionId(i)}
                      aria-selected={i === current}
                      tabIndex={-1}
                      // Keep the input focused so the list does not close before the click lands.
                      onMouseDown={(e) => e.preventDefault()}
                      // Only a real mouse move highlights: a list opening under a resting pointer must not
                      // pick what Enter takes.
                      onMouseMove={(e) => (e.movementX || e.movementY) && setActive(i)}
                      onClick={() => pick(o)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-slate-100 ${
                        i === current ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100">{o.icon}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{o.title}</span>
                        {o.subtitle && <span className="block truncate text-xs text-slate-500">{o.subtitle}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {hasQuery && (
                <p role="status" className="px-3 py-3 text-sm text-slate-500 empty:hidden">
                  {search.loading && search.places.length === 0
                    ? 'Mencari…'
                    : search.error
                      ? search.error
                      : !search.loading && search.places.length === 0
                        ? 'Tempat tidak ditemukan. Coba nama lain, atau ketuk peta.'
                        : ''}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const CATEGORY_ICONS: Record<string, (p: { className?: string }) => ReactNode> = {
  Stasiun: TrainIcon,
  Bandara: TrainIcon,
  'Terminal bus': BusIcon,
  Mal: BagIcon,
  Supermarket: BagIcon,
  Minimarket: BagIcon,
  Toko: BagIcon,
  Pasar: BagIcon,
  'Rumah sakit': HospitalIcon,
  Klinik: HospitalIcon,
  Kampus: SchoolIcon,
  Sekolah: SchoolIcon,
  Masjid: WorshipIcon,
  Gereja: WorshipIcon,
  Vihara: WorshipIcon,
  Pura: WorshipIcon,
  Klenteng: WorshipIcon,
  'Tempat ibadah': WorshipIcon,
  Jalan: RoadIcon,
  Perumahan: HomeIcon,
  Kelurahan: HomeIcon,
  Kawasan: HomeIcon,
  Lingkungan: HomeIcon,
  Kota: HomeIcon,
  'Tempat makan': FoodIcon,
  Kafe: FoodIcon,
  'Tempat bersejarah': LandmarkIcon,
  'Tempat wisata': LandmarkIcon,
  Museum: LandmarkIcon,
  Stadion: LandmarkIcon,
  'Kantor pemerintahan': BuildingIcon,
  Kantor: BuildingIcon,
  Gedung: BuildingIcon,
  Apartemen: BuildingIcon,
  Hotel: BuildingIcon,
  Bank: BuildingIcon,
}

/** A halte in the brand colour; a place by what it is, so a list of names reads at a glance. */
function PlaceIcon({ place }: { place: PlaceResult }) {
  if (place.kind === 'stop') return <BusIcon className="size-4 text-brand" />
  const Icon = (place.category && CATEGORY_ICONS[place.category]) || PinIcon
  return <Icon className="size-4 text-slate-500" />
}
