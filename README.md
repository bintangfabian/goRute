# goRute

PWA untuk mencari rute transportasi umum di Jabodetabek (TransJakarta, KRL, MRT, LRT, jalan kaki, motor/ojol) dengan opsi **tercepat**, **termurah**, dan **termudah**.

## Struktur

```
goRute/
├── web/                    # PWA: React + TypeScript + Vite
│   ├── src/components/     # MapView, PlannerSheet, StatusPill
│   ├── src/hooks/
│   └── src/lib/api/        # client + schema.d.ts (hasil generate dari OpenAPI)
├── backend/                # Go
│   ├── api/openapi.yaml    # kontrak API Go ↔ TypeScript
│   ├── cmd/api/            # HTTP API (:8080)
│   ├── cmd/pipeline/       # CLI pengolah data transit
│   └── internal/
│       ├── config/
│       ├── httpapi/        # router & handler
│       ├── otp/            # client GraphQL OpenTripPlanner
│       └── pipeline/       # unduh & olah sumber data
├── otp/                    # konfigurasi + input/graph OpenTripPlanner (di-mount ke Docker)
├── data/
│   ├── raw/                # hasil unduhan (tidak di-commit)
│   └── manual/             # GTFS buatan tangan: MRT, LRT, titik transfer
├── scripts/fetch-osm.sh
├── docker-compose.yml      # OTP + PostgreSQL/PostGIS
└── Makefile                # `make` untuk melihat semua perintah
```

## Stack

| Lapisan | Teknologi |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Motion, MapLibre GL (`react-map-gl`), vite-plugin-pwa |
| Peta dasar | [OpenFreeMap](https://openfreemap.org) (gratis, tanpa API key) |
| Backend | Go (`net/http`), kontrak OpenAPI → tipe TS via `openapi-typescript` + `openapi-fetch` |
| Routing engine | OpenTripPlanner 2.10 (GTFS + OSM) |
| Database | PostgreSQL 18 + PostGIS (disiapkan, belum dipakai API) |

## Mulai

Butuh: Go 1.25+, Node 22+, pnpm, Docker. Untuk data OSM juga butuh `osmium` (`brew install osmium-tool`).

```bash
cp .env.example .env
make install

# Jalankan di dua terminal
make api      # http://localhost:8080
make web      # http://localhost:5173
```

Tanpa OTP, app tetap jalan dan menampilkan status "Routing engine belum jalan".

### Menyalakan routing engine

```bash
make fetch-gtfs   # GTFS TransJakarta → data/raw
make fetch-osm    # OSM Jawa (~900 MB) → dipotong ke Jabodetabek
make otp-build    # build graph (butuh RAM Docker ≥ 8 GB)
make otp-up       # OTP di http://localhost:8081
```

### Mengubah API

1. Ubah `backend/api/openapi.yaml`.
2. `make gen-api` untuk memperbarui `web/src/lib/api/schema.d.ts`.
3. Implementasikan handler di `backend/internal/httpapi`.

## Sumber data

| Moda | Sumber | Status |
|---|---|---|
| TransJakarta (BRT, non-BRT, Mikrotrans, Transjabodetabek, Royaltrans) | [GTFS resmi](https://gtfs.transjakarta.co.id/files/file_gtfs.zip) | ✅ Di pipeline. Jadwal berbasis interval (`frequencies.txt`), lisensi belum jelas |
| KRL Commuter Line | Scrape jadwal per stasiun dari web KAI Commuter | ⏳ Belum. Endpoint tidak resmi dan butuh token |
| MRT Jakarta, LRT Jakarta, LRT Jabodebek | GTFS manual di `data/manual/` | ⏳ Belum |
| Jalan kaki / jalan raya | OpenStreetMap (Geofabrik) | ✅ `make fetch-osm` |
| Ojol / taksi | Estimasi dari jarak + regulasi tarif | ⏳ Belum |

## Roadmap

- [x] Struktur repo, API status, PWA shell dengan peta
- [ ] OTP jalan dengan GTFS TransJakarta + OSM
- [ ] Scraper KRL → GTFS
- [ ] GTFS manual MRT, LRT Jakarta, LRT Jabodebek + titik transfer antar moda
- [ ] Endpoint `/api/v1/plan` + modul tarif (KRL per km, JakLingko maks Rp10.000/180 menit, LRT Jabodebek)
- [ ] Pengurutan opsi tercepat / termurah / termudah
- [ ] UI hasil rute + animasi garis rute di peta
