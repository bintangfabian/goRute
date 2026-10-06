import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const MAP_TILES_ORIGIN = 'https://tiles.openfreemap.org'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vercelFunctions(),
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
})

type Module = Record<string, unknown>
type Handler = (request: Request) => Response | Promise<Response>

/**
 * Serves the functions in api/ the way Vercel does, so `pnpm dev` and `pnpm preview`
 * run the web app and its API from one process.
 */
function vercelFunctions(): Plugin {
  const middleware =
    (root: string, load: (file: string) => Promise<Module>) =>
    async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (!url.pathname.startsWith('/api/')) return next()

      const file = path.join(root, `${url.pathname}.ts`)
      if (!existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan.' }))
      }
      try {
        const handler = (await load(file))[req.method ?? 'GET'] as Handler | undefined
        if (!handler) {
          res.writeHead(405)
          return res.end()
        }
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(key, value)
        }
        const response = await handler(new Request(url, { method: req.method, headers }))
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (err) {
        next(err)
      }
    }

  return {
    name: 'gorute:vercel-functions',
    configureServer(server) {
      server.middlewares.use(middleware(server.config.root, (file) => server.ssrLoadModule(file)))
    },
    configurePreviewServer(server) {
      // Node runs the TypeScript sources directly (type stripping).
      server.middlewares.use(middleware(server.config.root, (file) => import(pathToFileURL(file).href)))
    },
  }
}
