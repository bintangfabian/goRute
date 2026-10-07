import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// public/favicon.svg is the logo on its rounded teal tile. Maskable and Apple icons
// are full-bleed squares, so their corners take the same teal instead of the
// default white, and the tile is not shrunk into a frame.
const teal = { background: '#0f766e', fit: 'contain' as const }

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: teal },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: teal },
  },
  images: ['public/favicon.svg'],
})
