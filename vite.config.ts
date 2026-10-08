import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The headers Vercel sends with every page (vercel.json), so `vite preview` behaves like the deployment.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const productionHeaders: Record<string, string> = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]),
)
// The service worker keeps index.html with the headers it was fetched with, the CSP among
// them. Its revision follows the headers too, so a change to them alone reaches installed apps.
const headersRevision = createHash('sha256').update(JSON.stringify(vercel.headers)).digest('hex').slice(0, 10)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vercelFunctions(),
    cspHashes(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons & favicon links are generated from public/favicon.svg at build time (pwa-assets.config.ts).
      pwaAssets: { config: true },
      manifest: {
        id: '/',
        name: 'goRute',
        short_name: 'goRute',
        description: 'Cari rute transportasi umum tercepat, termurah, dan termudah di Jabodetabek.',
        lang: 'id',
        theme_color: '#0f766e',
        // Matches the splash in index.html, so the launch does not flash white.
        background_color: '#0f766e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        categories: ['travel', 'navigation'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only link previews need it, not an offline rider.
        globIgnores: ['**/og-image.png'],
        // maplibre-gl alone is larger than workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.map((e) => (e.url === 'index.html' ? { ...e, revision: `${e.revision}-${headersRevision}` } : e)),
            warnings: [],
          }),
        ],
        // Patterns are RegExps, not functions: workbox copies them into sw.js, where no outer constant exists.
        runtimeCaching: [
          {
            // The style and TileJSON name the weekly tile build (served with max-age=86400): network first.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles\/|planet$)/,
            handler: 'NetworkFirst',
            options: { cacheName: 'map-style', networkTimeoutSeconds: 4, expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  // Not for the dev server: it injects CSS as <style> tags, which the CSP would block.
  preview: { headers: productionHeaders },
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

/**
 * Fails the build when an inline <style> in index.html (the splash) is not allowed by
 * the Content-Security-Policy in vercel.json: editing the splash changes its hash.
 */
function cspHashes(): Plugin {
  return {
    name: 'gorute:csp-hashes',
    apply: 'build',
    writeBundle(options) {
      const html = readFileSync(path.join(options.dir!, 'index.html'), 'utf8')
      const csp = productionHeaders['Content-Security-Policy'] ?? ''
      for (const [, css] of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
        const hash = `'sha256-${createHash('sha256').update(css).digest('base64')}'`
        if (!csp.includes(hash)) this.error(`index.html: an inline <style> (${hash}) is not allowed by the Content-Security-Policy in vercel.json`)
      }
    },
  }
}
