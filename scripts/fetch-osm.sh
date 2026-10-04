#!/usr/bin/env bash
# Download the Java OSM extract from Geofabrik and clip it to Jabodetabek.
# The Java extract (~900 MB) is kept for reuse; delete it to get fresh data.
set -euo pipefail

RAW_DIR="${RAW_DIR:-data/raw}"
JAVA_PBF="$RAW_DIR/java-latest.osm.pbf"
OUT_PBF="$RAW_DIR/jabodetabek.osm.pbf"
# minLon,minLat,maxLon,maxLat: covers KRL out to Rangkasbitung, Cikarang and Bogor.
BBOX="106.20,-6.75,107.30,-5.95"

if ! command -v osmium >/dev/null; then
  echo "osmium tidak ditemukan. Install dulu: brew install osmium-tool" >&2
  exit 1
fi

mkdir -p "$RAW_DIR"
if [[ ! -f "$JAVA_PBF" ]]; then
  echo "Mengunduh OSM Pulau Jawa dari Geofabrik..."
  curl -fL --progress-bar -o "$JAVA_PBF.part" \
    https://download.geofabrik.de/asia/indonesia/java-latest.osm.pbf
  mv "$JAVA_PBF.part" "$JAVA_PBF"
fi

echo "Memotong ke area Jabodetabek ($BBOX)..."
osmium extract --bbox "$BBOX" --strategy complete_ways --overwrite -o "$OUT_PBF" "$JAVA_PBF"
ls -lh "$OUT_PBF"
