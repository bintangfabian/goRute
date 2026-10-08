import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

/** Shields for US networks only: nothing in Jabodetabek has one. */
const US_SHIELDS = new Set(['highway-shield-us-interstate', 'road_shield_us'])

/** Labels too faint on the light map (about 2:1), darkened to read like the others. */
const TEXT_COLORS: Record<string, string> = {
  // River names, in the blue of the other water names.
  waterway_line_label: '#495e91',
  // Footpath names, which walking directions mention, in the grey of minor streets.
  'highway-name-path': '#666666',
}

/**
 * OpenFreeMap's Positron, adjusted for this map. Its shield filters compare `ref_length`
 * with a number, and MapLibre warns about every road without one: a missing length counts
 * as too long instead. Shields for US networks go, and two faint label kinds get darker.
 */
export function tuneStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.flatMap((layer): LayerSpecification[] => {
    if (US_SHIELDS.has(layer.id)) return []
    if (layer.type !== 'symbol') return [layer]
    const color = TEXT_COLORS[layer.id]
    return [
      {
        ...layer,
        ...(layer.filter && { filter: lengthAsNumber(layer.filter) as FilterSpecification }),
        ...(color && { paint: { ...layer.paint, 'text-color': color } }),
      },
    ]
  })
  return { ...style, layers }
}

/** `["get", "ref_length"]` as a number, 99 when a road has none. */
function lengthAsNumber(expression: unknown): unknown {
  if (!Array.isArray(expression)) return expression
  if (expression[0] === 'get' && expression[1] === 'ref_length') return ['number', expression, 99]
  return expression.map(lengthAsNumber)
}
