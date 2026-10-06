# goRute

PWA untuk mencari rute transportasi umum di Jabodetabek (TransJakarta, KRL, MRT, LRT, jalan kaki, motor/ojol) dengan opsi **tercepat**, **termurah**, dan **termudah**.

Seluruhnya TypeScript dan dirancang jalan gratis di Vercel (plan Hobby): web app disajikan sebagai file statis, API berjalan sebagai Vercel Functions, dan mesin rute (RAPTOR) membaca jadwal dari file JSON yang ikut di-bundle. Tidak ada server atau database yang harus selalu nyala.

## Struktur

```
goRute/
├── api/v1/                 # Vercel Functions: plan, places, status
├── server/                 # logika backend, tidak bergantung pada Vercel
│   ├── router/raptor.ts    # algoritma rute transit (RAPTOR)
│   ├── planner/            # menjalankan pencarian, membentuk opsi, ranking
│   ├── timetable/          # format & loader data/timetable.json
│   ├── fare.ts             # tarif (GTFS + aturan TransJakarta)
│   ├── stops.ts            # pencarian halte dari timetable (instan, plus alias seperti Monas, GBK)
│   └── geocode.ts          # pencarian tempat lewat Photon
├── shared/                 # tipe API & area layanan, dipakai web dan server
├── src/                    # PWA: React + Vite + Tailwind + Motion + MapLibre
├── scripts/                # pipeline data: unduh GTFS, build timetable
├── data/
│   ├── raw/                # hasil unduhan (tidak di-commit)
│   ├── manual/             # GTFS buatan tangan: MRT, LRT, titik transfer (belum ada)
│   └── timetable.json      # hasil `pnpm data:build`, di-commit
├── vite.config.ts          # termasuk plugin yang menjalankan api/ saat dev & preview
└── vercel.json             # region function: Singapura (sin1)
```

## Mulai

Butuh Node 22.18+ dan pnpm.

```bash
pnpm install
pnpm dev        # web + API di http://localhost:5173
```

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Web app + API (Vite menjalankan `api/` seperti Vercel) |
| `pnpm test` | Test backend & pipeline (`node --test`) |
| `pnpm check` | Lint + test + typecheck + build |
| `pnpm preview` | Coba hasil build produksi, termasuk service worker |
| `pnpm data:fetch` | Unduh GTFS ke `data/raw/` |
| `pnpm data:build` | Olah GTFS jadi `data/timetable.json` |

Untuk memperbarui jadwal: `pnpm data:fetch && pnpm data:build`, cek `pnpm test`, lalu commit `data/timetable.json`.

## Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new) dan import repo ini. Framework Vite terdeteksi otomatis; tidak perlu mengubah pengaturan build.
2. Selesai. Tidak ada environment variable yang wajib. `PHOTON_URL` opsional untuk memakai instance Photon sendiri.

Batas plan Hobby yang relevan: hanya untuk penggunaan non-komersial, 4 jam CPU aktif dan 1 juta request function per bulan. Satu pencarian rute memakai sekitar 0,1 detik CPU; hasil pencarian tempat di-cache CDN sehari sehingga tidak memakai jatah function.

## Cara kerja mesin rute

- **Data.** `scripts/gtfs/build.ts` mengelompokkan perjalanan GTFS menjadi *pola* (rute + urutan halte + waktu tempuh yang sama), mengekspansi `frequencies.txt` menjadi jam keberangkatan, dan menempelkan halte ke `shapes.txt` untuk garis di peta.
- **RAPTOR.** Putaran ke-*k* mencari waktu tiba paling awal di setiap halte dengan maksimal *k* kali naik, sehingga hasilnya himpunan Pareto antara waktu tiba dan jumlah transit.
- **Pencarian.** Tiap permintaan menjalankan pencarian normal (jalan ≤1,2 km, transfer ≤500 m), pencarian "mudah" (jalan ≤600 m, transfer ≤200 m, maks 3 kali naik), dan pencarian ulang tanpa tiap rute dari opsi tercepat untuk memunculkan alternatif. Hasil yang sama digabung, opsi yang jauh lebih lambat dari yang tercepat dibuang, begitu juga opsi yang kalah dari opsi lain di semua aspek (jam tiba, lama perjalanan, tarif, transit, jalan kaki).
- **Jalan kaki.** Masih estimasi: jarak garis lurus × 1,3 dengan kecepatan 4,5 km/jam, dan digambar sebagai garis lurus putus-putus.
- **Tarif.** Dari `fare_attributes`/`fare_rules` GTFS, ditambah aturan yang tidak bisa dinyatakan di GTFS (TransJakarta Rp2.000 pukul 05.00–07.00; satu tiket berlaku untuk transfer selama 3 jam).

### Endpoint API

| Endpoint | Fungsi |
|---|---|
| `GET /api/v1/status` | Feed yang dimuat dan waktu build data |
| `GET /api/v1/plan?fromLat&fromLon&toLat&toLon[&fromName&toName&time]` | Opsi perjalanan lengkap dengan tarif, garis rute, dan urutan untuk tiap preferensi |
| `GET /api/v1/stops?q=` | Cari halte dari timetable: instan, paham singkatan (St., Ps., Sbr.) dan alias (Monas, GBK) |
| `GET /api/v1/places?q=` | Cari tempat di Jabodetabek (diteruskan ke [Photon](https://photon.komoot.io)) |

Bentuk respons ada di `shared/api.ts`.

## Sumber data

| Moda | Sumber | Status |
|---|---|---|
| TransJakarta (BRT, non-BRT, Mikrotrans, Transjabodetabek, Royaltrans) | [GTFS resmi](https://gtfs.transjakarta.co.id/files/file_gtfs.zip) | ✅ Jadwal berbasis interval (`frequencies.txt`), lisensi belum jelas |
| KRL Commuter Line | Scrape jadwal per stasiun dari web KAI Commuter | ⏳ Belum. Endpoint tidak resmi dan butuh token |
| MRT Jakarta, LRT Jakarta, LRT Jabodebek | GTFS manual di `data/manual/` | ⏳ Belum |
| Jalan kaki | OpenStreetMap | ⏳ Masih estimasi garis lurus |
| Ojol / taksi | Estimasi dari jarak + regulasi tarif | ⏳ Belum |
| Pencarian tempat | Halte dari timetable (selalu jalan) + Photon publik (komoot) berbasis OSM | ✅ Photon publik untuk pengembangan; sering lambat (>8 detik) |

## Roadmap

- [x] PWA dengan peta, pencarian tempat, kartu opsi, animasi garis rute
- [x] Mesin rute RAPTOR di TypeScript + tarif TransJakarta, siap deploy ke Vercel
- [ ] Update GTFS otomatis (GitHub Actions) lalu deploy ulang
- [ ] Jalan kaki lewat jaringan jalan OSM
- [ ] Scraper KRL → GTFS
- [ ] GTFS manual MRT, LRT Jakarta, LRT Jabodebek + titik transfer antar moda
- [ ] Tarif KRL (per km), MRT, LRT, dan integrasi JakLingko (maks Rp10.000/180 menit)
- [ ] Supabase: akun, rute favorit, pencarian tempat sendiri (pengganti Photon publik)
