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

export const RAW_DIR = new URL('../data/raw/', import.meta.url)
export const TIMETABLE_FILE = new URL('../data/timetable.json', import.meta.url)
