import { motion } from 'motion/react'
import { Marker } from 'react-map-gl/maplibre'
import type { Endpoint } from '../../lib/trip'
import { FlagIcon } from '../icons'

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
      {/* The trip's end as the details draw it, a flag on the accent colour. Centred on the spot
          rather than a pin standing over it, so the halte the rider gets off at, often just
          north of the destination, is not hidden under it. */}
      {destination && (
        <Marker key={`d${destination.lat},${destination.lon}`} longitude={destination.lon} latitude={destination.lat} anchor="center">
          <motion.div
            {...pop}
            className="grid size-7 place-items-center rounded-full border-[3px] border-white bg-accent text-slate-900 shadow-lg"
          >
            <FlagIcon className="size-3.5" />
          </motion.div>
        </Marker>
      )}
    </>
  )
}
