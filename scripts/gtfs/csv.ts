export type Row = Record<string, string>

/** Parses RFC 4180 CSV (as used by GTFS) into rows keyed by header. */
export function parseCsv(text: string): Row[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') field += text[i++]
      else quoted = false
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      record.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  const [header = [], ...body] = records
  const keys = header.map((h) => h.trim())
  return body
    .filter((r) => r.length > 1 || r[0] !== '')
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}
