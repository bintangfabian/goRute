import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const MAP_TILES_ORIGIN = 'https://tiles.openfreemap.org'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons & favicon links are generated from public/favicon.svg at build time.
      pwaAssets: { image: 'public/favicon.svg' },
      manifest: {
        name: 'goRute',
        short_name: 'goRute',
        description: 'Cari rute transportasi umum tercepat, termurah, dan termudah di Jabodetabek.',
        lang: 'id',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // maplibre-gl alone is larger than workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === MAP_TILES_ORIGIN,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // MapLibre's worker is an ES module that imports a shared chunk.
  worker: { format: 'es' },
  build: {
    // maplibre-gl is ~1 MB by itself and already lands in its own chunk.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
