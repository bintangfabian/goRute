// Route colours from the feed, with text that stays readable on them.

// Feed colours are kept, but some pair white text with a light route colour
// (9A, 9D: under 3:1). Below WCAG's 4.5:1, use whichever of white or ink reads better.
export function readableOn(background: string, text: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(background) || !/^#[0-9a-f]{6}$/i.test(text)) return text
  if (contrast(background, text) >= 4.5) return text
  return contrast(background, '#ffffff') >= contrast(background, '#0f172a') ? '#ffffff' : '#0f172a'
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
