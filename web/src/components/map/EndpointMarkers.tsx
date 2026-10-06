import { motion } from 'motion/react'
import { Marker } from 'react-map-gl/maplibre'
import type { Endpoint } from '../../lib/trip'

const pop = {
  initial: { scale: 0, y: -12 },
  animate: { scale: 1, y: 0 },
  transition: { type: 'spring', stiffness: 500, damping: 22 },
} as const

export function EndpointMarkers({ origin, destination }: { origin: Endpoint | null; destination: Endpoint | null }) {
  return (
    <>
      {origin && (
        <Marker key={`o${origin.lat},${origin.lon}`} longitude={origin.lon} latitude={origin.lat} anchor="center">
          <motion.div {...pop} className="size-5 rounded-full border-4 border-white bg-brand shadow-lg" />
        </Marker>
      )}
      {destination && (
        <Marker
          key={`d${destination.lat},${destination.lon}`}
          longitude={destination.lon}
          latitude={destination.lat}
          anchor="bottom"
        >
          <motion.svg {...pop} viewBox="0 0 32 40" className="h-10 w-8 origin-bottom drop-shadow-lg">
            <path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23Z" fill="#fbbf24" stroke="#fff" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="5" fill="#fff" />
          </motion.svg>
        </Marker>
      )}
    </>
  )
}
