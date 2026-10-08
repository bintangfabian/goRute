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
│   ├── walk/               # jaringan jalan pejalan kaki (OSM): snap titik ke jalan, Dijkstra, petunjuk belok
│   ├── stops.ts            # pencarian halte dari timetable (instan, plus alias seperti Monas, GBK)
│   ├── places.ts           # pencarian tempat dari indeks OSM sendiri (instan)
│   └── geocode.ts          # Photon publik, cadangan pencarian tempat
├── shared/                 # tipe API, area layanan, hitungan jam WIB & teks petunjuk arah, dipakai web dan server
├── src/                    # PWA: React + Vite + Tailwind + Motion + MapLibre
│   └── components/         # termasuk logo, ikon, dan ilustrasi beranimasi (illustrations.tsx)
├── public/favicon.svg      # master logo; ikon PWA & Apple dibuat dari sini (pwa-assets.config.ts)
├── scripts/                # pipeline data: unduh GTFS & OSM, build timetable, jaringan jalan kaki, indeks tempat
│   └── osm/                # pembaca PBF OpenStreetMap (tanpa dependensi) dan pembangun data OSM
├── data/
│   ├── raw/                # hasil unduhan (tidak di-commit)
│   ├── manual/             # GTFS buatan tangan: MRT, LRT, titik transfer (belum ada)
│   ├── timetable.json      # hasil `pnpm data:build`, di-commit
│   ├── walk.bin            # jalan pejalan kaki di sekitar halte (~6 MB), di-commit
│   └── places.json.gz      # indeks ~150 ribu tempat dan jalan bernama beserta kelurahan, kecamatan, dan kotanya (~2,8 MB), di-commit
├── vite.config.ts          # termasuk plugin yang menjalankan api/ saat dev & preview
└── vercel.json             # region function (Singapura, sin1) dan header keamanan
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
| `pnpm test` | Test backend, `shared/` & pipeline (`node --test`) |
| `pnpm check` | Lint + test + typecheck + build |
| `pnpm preview` | Coba hasil build produksi, termasuk service worker |
| `pnpm data:fetch` | Unduh GTFS dan OpenStreetMap Jawa (Geofabrik, ~900 MB, diunduh ulang paling cepat seminggu sekali) ke `data/raw/`, lalu potong area Jabodetabek dengan `osmium` |
| `pnpm data:build` | Olah GTFS jadi `data/timetable.json`, lalu OSM jadi `data/walk.bin` dan `data/places.json.gz` |

`pnpm data:fetch` butuh [osmium-tool](https://osmcode.org/osmium-tool/) (`brew install osmium-tool` / `apt install osmium-tool`). Untuk memperbarui data: `pnpm data:fetch && pnpm data:build`, cek `pnpm test`, lalu commit ketiga file di `data/`. Selalu build ulang `walk.bin` setelah `timetable.json` berubah: transfer antarhalte disimpan per urutan halte di timetable.

## Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new) dan import repo ini. Framework Vite terdeteksi otomatis; tidak perlu mengubah pengaturan build.
2. Selesai. Tidak ada environment variable yang wajib. `PHOTON_URL` opsional untuk memakai instance Photon sendiri.

Batas plan Hobby yang relevan: hanya untuk penggunaan non-komersial, 4 jam CPU aktif dan 1 juta request function per bulan. Satu pencarian rute memakai sekitar 0,1 detik CPU; hasil pencarian tempat di-cache CDN sehari sehingga tidak memakai jatah function.

**Keamanan.** `vercel.json` mengirim Content-Security-Policy (skrip hanya dari goRute sendiri, `<style>` splash lewat hash, peta hanya dari OpenFreeMap, tidak bisa di-*embed*), `X-Frame-Options`, `nosniff`, Referrer-Policy, dan Permissions-Policy yang hanya mengizinkan lokasi untuk goRute. `pnpm preview` memakai header yang sama, dan build gagal kalau `<style>` di `index.html` berubah tanpa hash-nya diperbarui di CSP. Service worker memperbarui `index.html` yang tersimpan setiap kali header berubah. API membatasi input (nama 120 karakter, jam berangkat kemarin sampai sepekan ke depan, koreksi salah ketik maks 3 kata) dan koordinat dari app dibulatkan ke ~11 m. Opsional: aturan *rate limit* untuk `/api/` di Vercel Firewall (dashboard proyek → Firewall), karena kueri yang selalu berbeda melewati cache CDN. Toolbar Vercel di *preview deployment* diblokir CSP; itu tidak memengaruhi app.

## Cara kerja mesin rute

- **Data.** `scripts/gtfs/build.ts` mengelompokkan perjalanan GTFS menjadi *pola* (rute + urutan halte + waktu tempuh yang sama), mengekspansi `frequencies.txt` menjadi jam keberangkatan, dan menempelkan halte ke `shapes.txt` untuk garis di peta.
- **RAPTOR.** Putaran ke-*k* mencari waktu tiba paling awal di setiap halte dengan maksimal *k* kali naik, sehingga hasilnya himpunan Pareto antara waktu tiba dan jumlah transit.
- **Pencarian.** Tiap permintaan menjalankan pencarian normal (jalan ≤1,2 km, transfer ≤500 m; sampai 2,5 km kalau dalam 1,2 km tidak ada halte yang dilewati bus hari itu, misalnya cuma halte Royaltrans yang hanya beroperasi Senin–Jumat), pencarian "mudah" (jalan ≤600 m, transfer ≤200 m, maks 3 kali naik), dan pencarian ulang tanpa tiap rute dari opsi tercepat untuk memunculkan alternatif. Kalau ada opsi yang naik bus premium (misal Royaltrans), pencarian diulang tanpa semua bus premium supaya opsi tarif reguler ikut muncul: RAPTOR hanya membandingkan jam tiba dan jumlah naik, bukan tarif. Hasil yang sama digabung dan opsi yang jauh lebih lambat dari yang tercepat dibuang (opsi yang lebih murah boleh lebih lama 1 menit per Rp250 yang dihemat), begitu juga opsi yang kalah dari opsi lain di semua aspek (jam tiba, lama perjalanan, tarif, transit, jalan kaki). Opsi yang hampir kembar juga dibuang: selisih waktu sampai 5 menit (atau 10% dari perjalanan yang lebih pendek) dan jalan kaki sampai 200 m dianggap seri, karena jadwal berbasis interval dan jalan kaki masih estimasi. Opsi hanya dibuang kalau ada opsi lain yang tetap tampil dan mengalahkannya, jadi hasilnya sama apa pun urutan pencariannya.
- **Jalan kaki.** Mengikuti jalan sungguhan dari OpenStreetMap (`data/walk.bin`): titik asal/tujuan dan tiap halte di-*snap* ke jalan terdekat, lalu Dijkstra mencari jalur terpendek ke halte-halte di sekitarnya (kecepatan 4,5 km/jam). Tol, busway, flyover, dan jalan bertanda `foot=no` tidak dilewati; tangga dihitung lebih lambat; jalan privat (perumahan, kampus) dipakai untuk keluar-masuk tapi tidak jadi jalan pintas. Transfer antarhalte juga dihitung lewat jalan (termasuk JPO) saat `pnpm data:build`. Tiap jalan kaki punya petunjuk belok ("Belok kiri ke Jalan …", "Naik jembatan penyeberangan") dan digambar mengikuti jalan. Titik yang lebih dari 400 m dari jalan mana pun kembali ke estimasi garis lurus × 1,3.
- **Tarif.** Dari `fare_attributes`/`fare_rules` GTFS, ditambah aturan yang tidak bisa dinyatakan di GTFS (TransJakarta Rp2.000 pukul 05.00–07.00; satu tiket berlaku untuk transfer selama 3 jam).

### Endpoint API

| Endpoint | Fungsi |
|---|---|
| `GET /api/v1/status` | Feed yang dimuat dan waktu build data |
| `GET /api/v1/plan?fromLat&fromLon&toLat&toLon[&fromName&toName&time]` | Opsi perjalanan lengkap dengan tarif, garis rute, dan urutan untuk tiap preferensi. Leg jalan kaki membawa `steps` (petunjuk belok); leg bus membawa `headsign` (arah) dan `stops` (halte yang dilewati). `time` (RFC 3339) adalah jam berangkat; tanpa `time` dipakai jam server. Web app selalu mengirim `time`: jam HP, atau jam berangkat yang dipilih user, jadi label di kartu dihitung dari jam yang sama dengan rutenya. Kalau tidak ada opsi, `reason` menjelaskan sebabnya: `far-from-origin`/`far-from-destination` (tidak ada halte dalam 2,5 km), `no-service-near-origin`/`no-service-near-destination` (tidak ada bus yang beroperasi di sekitarnya pada hari itu; `nextServiceDate` berisi tanggal berikutnya, dalam sepekan, saat ada bus di sekitar asal dan tujuan), atau `no-trip` |
| `GET /api/v1/stops?q=` | Cari halte dari timetable: instan, paham singkatan (St., Ps., Sbr.) dan alias (Monas, GBK); halte yang namanya dipakai di beberapa tempat diberi petunjuk "Dekat Halte X" |
| `GET /api/v1/places?q=[&lat&lon]` | Cari tempat di Jabodetabek dari indeks OSM sendiri (`data/places.json.gz`): instan, dengan kategori ("Mal", "Stasiun", "Jalan") dan wilayahnya ("Pondok Cina, Depok", dari batas administrasi OSM). Paham nama wilayah dan jenis tempat di kueri ("ui depok", "rs fatmawati"), singkatan (UNJ, RSCM, PIM, GBK, Untar), spasi yang beda ("atma jaya" = Atmajaya), dan cabang dekat landmark ("kfc blok m", "mcd sarinah": cabang dalam 800 m dari tempat yang disebut); `lat`/`lon` (ujung perjalanan yang lain) mendahulukan tempat yang dekat. Selalu langsung dijawab; kalau hasilnya kurang dari 3, jawabannya membawa `more: true` |
| `GET /api/v1/geocode?q=[&lat&lon]` | Cari tempat lewat [Photon](https://photon.komoot.io) publik (lambat, 2–9 detik), dipanggil app hanya kalau `/places` bilang `more`. Hasilnya tampil menyusul di bawah hasil indeks; kalau Photon gagal, jawabannya tidak di-cache |

Bentuk respons ada di `shared/api.ts`.

## Tampilan & aset

- **Logo** (`public/favicon.svg`): huruf *g* yang mangkuknya titik asal dan ekornya rute ke halte tujuan (cincin amber). Dibuat dengan [logo-design-skill](https://github.com/kaankiziltug/logo-design-skill) dan lolos uji 16 px, satu warna, dan latar gelap. `pnpm build` menurunkan favicon, ikon PWA, ikon *maskable*, dan ikon Apple dari file ini.
- **Splash** ada di `index.html` (logo digambar seperti rute) supaya tampil sebelum JavaScript dimuat; `src/main.tsx` melepasnya setelah app tampil. Kalau app tidak pernah tampil (koneksi putus saat pertama buka, atau browser terlalu lama), splash mundur sendiri lewat CSS setelah 10 detik dan memperlihatkan pesan dengan tombol Muat ulang di `#root`, yang diganti app begitu tampil. Tanpa JavaScript, pesan itu langsung tampil.
- **Ilustrasi & animasi**: tiap keadaan panel (siap cari, belum ada bus, bus di sekitar libur hari itu, halte terlalu jauh, server gagal, asal = tujuan) punya ilustrasi SVG beranimasi. Di layar pendek, keadaan yang punya tombol (Coba lagi, Cari untuk Senin, Pilih jam lain) mengecilkan atau menyembunyikan ilustrasinya dan boleh memakai panel lebih tinggi supaya tombolnya tetap terlihat. Panel masuk saat splash memudar, detail rute masuk dari kanan dan daftar dari kiri, dan garis rute tidak digambar ulang kalau jawaban baru (jam lain) memakai garis yang sama. Semua animasi mengikuti setelan *reduce motion*: garis rute langsung utuh, panel dan daftar langsung terbuka.
- **Gambar share** `public/og-image.png` (1200×630) dipakai tag Open Graph. Ganti `og:image` di `index.html` ke URL absolut setelah domain produksi ada.
- **Tata letak**: *bottom sheet* di HP (ketuk pegangannya, atau tarik: panel mengikuti jari) dan panel kiri di layar ≥1024 px. Di HP yang pendek (tinggi ≤760 px: iPhone SE, kebanyakan HP di browser, HP yang dimiringkan), setelah asal dan tujuan terisi, dua kolom dilipat jadi satu baris "A → B" supaya opsi rute dapat tempat; ketuk salah satu nama untuk mengubahnya. Peta menyesuaikan lagi saat jendela diubah ukurannya atau HP diputar.
- **Pencarian tempat**: saat kolom masih kosong, tempat yang terakhir dipilih (maks 5) muncul di bawah "Terakhir dicari". Riwayat hanya disimpan di perangkat (`localStorage`) dan bisa dihapus dari daftar itu. Enter mengambil saran pertama lalu pindah ke kolom yang belum diisi, atau ke daftar rute. Kalau indeks sendiri tidak menemukan apa-apa, daftar bilang "Mencari lebih luas…" selama Photon dicari, maksimal 4 detik.
- **Peta**: style Positron OpenFreeMap disesuaikan di `src/components/map/mapStyle.ts` (nama sungai dan jalan setapak lebih kontras, *shield* jalan AS dibuang, tanpa peringatan di console). Garis rute digambar di bawah label, jadi nama jalan yang disebut petunjuk tetap terbaca; tujuan ditandai bendera di titiknya, sehingga halte tempat turun tidak tertutup.
- **Aksesibilitas**: teks dan placeholder memenuhi kontras WCAG AA, fokus keyboard terlihat di semua tombol (termasuk tab dan chip yang sedang terpilih), dan area sentuh tombol kecil (hapus, petunjuk, jam) 44 px.
- **Detail rute**: ketuk kartu opsi untuk membuka langkah-langkahnya: jalan kaki (jarak, waktu, jalan yang dilewati, petunjuk belok), naik bus (layanan, nomor rute, arah, jumlah halte, tarif, cara bayar), transit, dan tiba. Ketuk satu langkah untuk memperbesar peta ke bagian itu. Tombol kembali HP (atau gestur geser di iOS) dan Esc menutup detail.
- **Ikon**: satu keluarga di `src/components/icons.tsx` (garis 1,8, ujung bulat, isian tipis), termasuk panah belok, penyeberangan, JPO, tangga, halte, dan ikon kategori tempat di saran pencarian.

## Sumber data

| Moda | Sumber | Status |
|---|---|---|
| TransJakarta (BRT, non-BRT, Mikrotrans, Transjabodetabek, Royaltrans) | [GTFS resmi](https://gtfs.transjakarta.co.id/files/file_gtfs.zip) | ✅ Jadwal berbasis interval (`frequencies.txt`), lisensi belum jelas |
| KRL Commuter Line | Scrape jadwal per stasiun dari web KAI Commuter | ⏳ Belum. Endpoint tidak resmi dan butuh token |
| MRT Jakarta, LRT Jakarta, LRT Jabodebek | GTFS manual di `data/manual/` | ⏳ Belum |
| Jalan kaki | OpenStreetMap ([Geofabrik](https://download.geofabrik.de/asia/indonesia/java.html), ODbL) | ✅ Jaringan jalan pejalan kaki dalam 3 km dari halte |
| Ojol / taksi | Estimasi dari jarak + regulasi tarif | ⏳ Belum |
| Pencarian tempat | Halte dari timetable + indeks tempat OSM sendiri; Photon publik sebagai cadangan | ✅ Instan; Photon publik lambat (7–9 detik), jadi hanya cadangan |

## Roadmap

- [x] PWA dengan peta, pencarian tempat, pilihan jam berangkat, kartu opsi, animasi garis rute
- [x] Mesin rute RAPTOR di TypeScript + tarif TransJakarta, siap deploy ke Vercel
- [ ] Update GTFS otomatis (GitHub Actions) lalu deploy ulang
- [x] Jalan kaki lewat jaringan jalan OSM, dengan petunjuk belok
- [x] Pencarian tempat dari indeks OSM sendiri
- [ ] Scraper KRL → GTFS
- [ ] GTFS manual MRT, LRT Jakarta, LRT Jabodebek + titik transfer antar moda
- [ ] Tarif KRL (per km), MRT, LRT, dan integrasi JakLingko (maks Rp10.000/180 menit)
- [ ] Supabase: akun, rute favorit
