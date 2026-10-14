/** Reading Google Maps links (no Google API: we only parse the URL text). */
import { searchPlaces, type SearchResult } from './osm'
import type { PlaceInfo } from './places'
import { fold } from './text'

export type GoogleLink =
  /** `googleId` is Google's own id for the place (e.g. "0x313…:0x8f…"), when the link has one. */
  | { kind: 'full'; name?: string; lat?: number; lng?: number; googleId?: string; url: string }
  /** Short share links can't be opened from the browser; `name` comes from the shared text, if any. */
  | { kind: 'short'; name?: string; url: string }

const GOOGLE_HOST = /^(www\.|maps\.)?google\.[a-z.]+$/i
const SHORT_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i

const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

const validCoords = (lat?: number, lng?: number) =>
  lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')).trim()
  } catch {
    return s.replace(/\+/g, ' ').trim()
  }
}

const COORD_PAIR = /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/

/** Recognises a Google Maps link and pulls out the place name and coordinates when present. */
export function parseGoogleMapsLink(input: string): GoogleLink | null {
  const text = input.trim()
  const match = text.match(/https?:\/\/\S+/i)
  if (!match) return null
  // Google Maps' Share sheet sends "<Place name>\n<link>" (sometimes with an address line).
  const sharedName = sharedTextName(text.replace(match[0], ''))
  let url: URL
  try {
    url = new URL(match[0])
  } catch {
    return null
  }

  if (SHORT_HOST.test(url.hostname)) {
    // goo.gl is also used for non-maps links; only treat maps ones as places.
    if (url.hostname.toLowerCase() === 'goo.gl' && !url.pathname.startsWith('/maps')) return null
    return { kind: 'short', name: sharedName, url: url.href }
  }
  if (!GOOGLE_HOST.test(url.hostname)) return null
  if (!url.hostname.startsWith('maps.') && !url.pathname.startsWith('/maps')) return null

  const href = url.href
  let name: string | undefined
  let lat: number | undefined
  let lng: number | undefined

  // /maps/place/<Name>/...
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/)
  if (place) {
    const decoded = decode(place[1])
    const pair = decoded.match(COORD_PAIR)
    if (pair) [lat, lng] = [num(pair[1]), num(pair[2])]
    else name = decoded
  }

  // The place's own pin: ...!3d<lat>!4d<lng> (more precise than the @ viewport centre).
  const pin = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) [lat, lng] = [num(pin[1]), num(pin[2])]

  // ?q= / ?query= / ?ll= / ?destination= : either "lat,lng" or a text query.
  for (const key of ['q', 'query', 'll', 'center', 'destination', 'daddr']) {
    const v = url.searchParams.get(key)
    if (!v) continue
    const pair = v.match(COORD_PAIR)
    if (pair && !validCoords(lat, lng)) [lat, lng] = [num(pair[1]), num(pair[2])]
    else if (!pair && !name) name = v.trim()
  }

  // /maps/search/<text or lat,lng>/
  const search = url.pathname.match(/\/maps\/search\/([^/]+)/)
  if (search) {
    const decoded = decode(search[1])
    const pair = decoded.match(COORD_PAIR)
    if (pair && !validCoords(lat, lng)) [lat, lng] = [num(pair[1]), num(pair[2])]
    else if (!pair && !name) name = decoded
  }

  // Map viewport centre: /@<lat>,<lng>,<zoom>z (last resort for the location).
  const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at && !validCoords(lat, lng)) [lat, lng] = [num(at[1]), num(at[2])]

  name ??= sharedName
  if (!validCoords(lat, lng)) [lat, lng] = [undefined, undefined]
  if (!name && lat === undefined) return null
  return { kind: 'full', name, lat, lng, googleId: googlePlaceId(url), url: href }
}

/** Google's id for the place: the "feature id" in /data=…!1s0x…:0x…, or an explicit place id parameter. */
function googlePlaceId(url: URL): string | undefined {
  const href = decode(url.href)
  const id =
    href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ??
    url.searchParams.get('ftid') ??
    url.searchParams.get('query_place_id') ??
    url.searchParams.get('place_id') ??
    href.match(/!19s(ChIJ[\w-]+)/)?.[1]
  if (!id || id.length > 120) return undefined
  return id.startsWith('0x') ? id.toLowerCase() : id
}

/** First meaningful line of the text around a shared link, e.g. "Phở Thìn Lò Đúc". */
function sharedTextName(rest: string): string | undefined {
  const line = rest
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 1 && !/^(check out|xem|see|on google maps|trên google maps)\b/i.test(l))
  return line ? line.replace(/[\s:–-]+$/, '').slice(0, 80) || undefined : undefined
}

/** Distance in metres between two points (haversine). */
export function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

type View = { west: number; south: number; east: number; north: number }

// Optional link-expander service (see /worker) that follows maps.app.goo.gl redirects,
// which browsers can't do because Google sends no CORS headers.
const EXPANDER_URL = import.meta.env.VITE_LINK_EXPANDER_URL?.trim() || undefined
export const canExpandShortLinks = Boolean(EXPANDER_URL)

/** Returns the full google.com/maps URL behind a short link, or null if unavailable. */
export async function expandShortLink(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!EXPANDER_URL) return null
  try {
    const res = await fetch(EXPANDER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { url?: unknown }
    return typeof data.url === 'string' ? data.url : null
  } catch {
    return null
  }
}

/** Turns any pasted Google link into a full one when possible (expanding short links). */
export async function resolveGoogleLink(link: GoogleLink, signal?: AbortSignal): Promise<GoogleLink> {
  if (link.kind === 'full') return link
  const expanded = await expandShortLink(link.url, signal)
  const parsed = expanded ? parseGoogleMapsLink(expanded) : null
  if (parsed?.kind !== 'full') return link
  // Keep the short link the user shared; it's what they'd expect to open later.
  return { ...parsed, name: parsed.name ?? link.name, url: link.url }
}

/** Name variants to try with OpenStreetMap: the full Google name, then its first words ("Phở Thìn Lò Đúc" -> "Phở Thìn"). */
function nameVariants(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return [...new Set([name, words.slice(0, 3).join(' '), words.slice(0, 2).join(' ')])].filter(
    (v) => v.length >= 3,
  )
}

/**
 * Finds the OpenStreetMap place for a Google Maps place, so we get cuisine, hours and an
 * address. With coordinates we only accept a match within ~250 m; without, the best hit near `view`.
 */
export async function matchGooglePlace(
  name: string,
  near: { lat: number; lng: number } | null,
  view: View,
  signal?: AbortSignal,
): Promise<SearchResult | null> {
  const box = near
    ? { west: near.lng - 0.004, east: near.lng + 0.004, south: near.lat - 0.004, north: near.lat + 0.004 }
    : view
  const wanted = fold(name)
  for (const variant of nameVariants(name)) {
    const results = await searchPlaces(variant, box, signal, Boolean(near))
    const scored = results
      .map((r) => ({
        r,
        dist: near ? metresBetween(near.lat, near.lng, r.lat, r.lng) : 0,
        same: fold(r.name).includes(fold(variant)) || wanted.includes(fold(r.name)),
      }))
      .filter((x) => !near || x.dist <= 250)
      .sort((a, b) => Number(b.r.isFood) - Number(a.r.isFood) || Number(b.same) - Number(a.same) || a.dist - b.dist)
    if (scored[0]) return scored[0].r
  }
  return null
}

export function googlePlaceInfo(link: Extract<GoogleLink, { kind: 'full' }>): PlaceInfo | null {
  if (link.lat === undefined || link.lng === undefined) return null
  return {
    name: link.name ?? '',
    lat: link.lat,
    lng: link.lng,
    source: 'google',
    googleUrl: link.url,
    googleId: link.googleId,
  }
}
