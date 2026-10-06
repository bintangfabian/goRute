# Data manual

Feed GTFS yang dibuat tangan untuk moda yang tidak punya data terbuka. Satu folder per operator, isinya file GTFS standar (CSV):

```
mrt-jakarta/      agency, stops, routes, trips, stop_times atau frequencies, calendar, fare_*
lrt-jakarta/
lrt-jabodebek/
transfers/        perpindahan antar operator (misal Sudirman ↔ Dukuh Atas) + waktu jalan kaki
```

Nantinya `scripts/build-timetable.ts` membaca tiap folder ini sebagai feed GTFS, sama seperti feed hasil unduhan di `data/raw/`.

Catat sumber dan tanggal setiap data (jadwal resmi, interval keberangkatan, tarif) di README folder masing-masing supaya mudah diperbarui.
