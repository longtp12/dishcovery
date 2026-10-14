import { formatCuisine, formatKind, type PlaceInfo } from './places'

// Nominatim (OpenStreetMap's geocoder) is free but asks for at most 1 request/second
// and no search-as-you-type, so every call goes through this queue and search runs on submit.
const NOMINATIM = 'https://nominatim.openstreetmap.org'
let nextSlot = 0

async function nominatim<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const wait = Math.max(0, nextSlot - Date.now())
  nextSlot = Date.now() + wait + 1100
  if (wait) await new Promise((r) => setTimeout(r, wait))
  signal?.throwIfAborted()
  const url = `${NOMINATIM}/${path}?${new URLSearchParams({
    format: 'jsonv2',
    'accept-language': 'vi,en',
    ...params,
  })}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  return res.json() as Promise<T>
}

interface NominatimResult {
  osm_type: 'node' | 'way' | 'relation'
  osm_id: number
  lat: string
  lon: string
  category?: string
  type?: string
  name?: string
  display_name: string
  address?: Record<string, string>
  extratags?: Record<string, string>
}

const FOOD_TYPES = new Set([
  'restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'biergarten', 'ice_cream', 'food_court', 'bakery',
])

/** Street-level address from Nominatim's address parts, e.g. "13 Phố Lò Đúc, Hai Bà Trưng". */
function shortAddress(r: NominatimResult): string {
  const a = r.address ?? {}
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(' ')
  const area = a.suburb ?? a.quarter ?? a.city_district ?? a.neighbourhood
  const city = a.city ?? a.town ?? a.village ?? a.state
  const parts = [street, area, city].filter(Boolean)
  if (parts.length) return [...new Set(parts)].join(', ')
  return r.display_name.split(', ').slice(1, 4).join(', ')
}

function toPlaceInfo(r: NominatimResult, source: PlaceInfo['source']): PlaceInfo {
  const type = r.type ?? ''
  return {
    name: r.name || r.display_name.split(', ')[0],
    lat: Number(r.lat),
    lng: Number(r.lon),
    osmId: `${r.osm_type}/${r.osm_id}`,
    kind: FOOD_TYPES.has(type) ? formatKind(type) : formatKind(type || r.category),
    cuisine: formatCuisine(r.extratags?.cuisine),
    address: shortAddress(r),
    openingHours: r.extratags?.opening_hours,
    source,
  }
}

export interface SearchResult extends PlaceInfo {
  isFood: boolean
}

/** Search places by name or address, biased towards the current view. */
export async function searchPlaces(
  query: string,
  view: { west: number; south: number; east: number; north: number },
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const results = await nominatim<NominatimResult[]>(
    'search',
    {
      q: query,
      limit: '8',
      addressdetails: '1',
      extratags: '1',
      viewbox: [view.west, view.north, view.east, view.south].join(','),
    },
    signal,
  )
  return results.map((r) => ({ ...toPlaceInfo(r, 'search'), isFood: FOOD_TYPES.has(r.type ?? '') }))
}

/** Full details (cuisine, address, hours) for an OSM object like "node/123". */
export async function lookupPlace(osmId: string, signal?: AbortSignal): Promise<PlaceInfo | null> {
  const [type, id] = osmId.split('/')
  const code = { node: 'N', way: 'W', relation: 'R' }[type]
  if (!code) return null
  const [r] = await nominatim<NominatimResult[]>(
    'lookup',
    { osm_ids: `${code}${id}`, addressdetails: '1', extratags: '1' },
    signal,
  )
  return r ? toPlaceInfo(r, 'map') : null
}

/** Address for an arbitrary point (used when dropping a custom pin). */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  const r = await nominatim<NominatimResult & { error?: string }>(
    'reverse',
    { lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' },
    signal,
  )
  return r.error ? undefined : shortAddress(r)
}

/** Google Maps link (no API key needed): searches by name + address, or exact coordinates. */
export function googleMapsUrl(p: Pick<PlaceInfo, 'name' | 'lat' | 'lng' | 'address'>) {
  const query = p.name && p.address ? `${p.name}, ${p.address}` : `${p.lat},${p.lng}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
