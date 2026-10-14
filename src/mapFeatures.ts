import type { GeoJSONFeature, Map as GLMap } from 'maplibre-gl'
import { FOOD_CLASSES } from './mapStyle'
import { formatKind, type PlaceInfo } from './places'
import { fold } from './text'

/** Converts an OpenMapTiles feature id back to an OSM id ("node/123"). */
function osmIdFromFeature(f: GeoJSONFeature): string | undefined {
  const raw = typeof f.id === 'number' ? f.id : Number(f.id)
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  // Planetiler encodes OSM ids as id * 10 + type (1 = node, 2 = way, 3 = relation).
  const type = ({ 1: 'node', 2: 'way', 3: 'relation' } as Record<number, string>)[raw % 10]
  return type ? `${type}/${Math.floor(raw / 10)}` : undefined
}

export function featureToPlace(f: GeoJSONFeature): PlaceInfo | null {
  const props = f.properties ?? {}
  const name: string | undefined = props.name ?? props['name:latin'] ?? props.name_en
  if (!name || f.geometry.type !== 'Point') return null
  const [lng, lat] = f.geometry.coordinates
  return {
    name,
    lat,
    lng,
    osmId: osmIdFromFeature(f),
    kind: formatKind(props.subclass ?? props.class),
    source: 'map',
  }
}

/** Good enough for ranking nearby results (equirectangular approximation). */
function roughDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  const y = lat2 - lat1
  return x * x + y * y
}

/** Instant, offline search over restaurants in the map tiles already loaded around the view. */
export function searchLoadedFood(gl: GLMap, query: string, limit = 6): PlaceInfo[] {
  const raw = query.trim().toLowerCase()
  const needle = fold(raw)
  if (needle.length < 2) return []
  const center = gl.getCenter()
  const seen = new Set<string>()
  const matches: { place: PlaceInfo; score: number; dist: number }[] = []
  const features = gl.querySourceFeatures('openmaptiles', {
    sourceLayer: 'poi',
    filter: ['in', ['get', 'class'], ['literal', FOOD_CLASSES]],
  })
  for (const f of features) {
    const place = featureToPlace(f)
    if (!place) continue
    const key = place.osmId ?? `${place.name}@${place.lat},${place.lng}`
    if (seen.has(key)) continue
    seen.add(key)
    const folded = fold(place.name)
    if (!folded.includes(needle)) continue
    // Prefer names that match as typed (accents included), then whole-word and word-start matches,
    // so "pho" ranks Phở shops above "Văn Phòng".
    const words = folded.split(/[\s\-–,.]+/)
    const first = needle.split(' ')[0]
    const score =
      (place.name.toLowerCase().includes(raw) ? 0 : 2) +
      (words.includes(first) ? 0 : words.some((w) => w.startsWith(first)) ? 1 : 2)
    matches.push({ place, score, dist: roughDistance(center.lat, center.lng, place.lat, place.lng) })
  }
  return matches
    .sort((a, b) => a.score - b.score || a.dist - b.dist)
    .slice(0, limit)
    .map((m) => m.place)
}
