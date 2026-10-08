// Transit feeds compiled into data/timetable.json. KRL (scraped) and the
// hand-made MRT/LRT feeds in data/manual/ will be added here.

export type Feed = {
  /** Prefix for IDs from this feed, e.g. route "TJ:1". */
  id: string
  name: string
  /** File name under data/raw/. */
  file: string
  url: string
}

export const FEEDS: Feed[] = [
  {
    id: 'TJ',
    name: 'TransJakarta',
    file: 'transjakarta-gtfs.zip',
    url: 'https://gtfs.transjakarta.co.id/files/file_gtfs.zip',
  },
]

/**
 * OpenStreetMap for walks and place search: Geofabrik's Java extract, cut to the
 * service area with osmium in pnpm data:fetch.
 */
export const OSM = {
  url: 'https://download.geofabrik.de/asia/indonesia/java-latest.osm.pbf',
  file: 'java-latest.osm.pbf',
  /** Ways people walk along, for data/walk.bin. */
  highways: 'jabodetabek-highways.osm.pbf',
  /** Named places and streets, for place search. */
  places: 'jabodetabek-places.osm.pbf',
}

export const RAW_DIR = new URL('../data/raw/', import.meta.url)
export const TIMETABLE_FILE = new URL('../data/timetable.json', import.meta.url)
export const WALK_FILE = new URL('../data/walk.bin', import.meta.url)
export const PLACES_FILE = new URL('../data/places.json.gz', import.meta.url)
