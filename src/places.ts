import { useCallback, useEffect, useState } from 'react'

export type PlaceStatus = 'wishlist' | 'visited'
export type PlaceSource = 'map' | 'search' | 'custom' | 'google'

/** A place on the map that may or may not be saved yet. */
export interface PlaceInfo {
  name: string
  lat: number
  lng: number
  /** OSM id like "node/123", when the place comes from OpenStreetMap. */
  osmId?: string
  /** Kind of venue, e.g. "Restaurant", "Café". */
  kind?: string
  /** Human-readable cuisine, e.g. "Vietnamese · Noodle". */
  cuisine?: string
  address?: string
  openingHours?: string
  /** The Google Maps link the place was added from, if any. */
  googleUrl?: string
  source: PlaceSource
}

export interface Place extends PlaceInfo {
  id: string
  status: PlaceStatus
  addedAt: number
  visitedAt?: number
}

const STORAGE_KEY = 'dishcovery.places.v1'

function read(): Place[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(places: Place[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places))
  } catch {
    // storage full or unavailable; keep in memory for this session
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Saved places, persisted in this browser's localStorage (until cloud sync lands). */
export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>(read)

  useEffect(() => write(places), [places])

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setPlaces(read())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /** Save (or re-file) a place with a status. Returns the saved place's id. */
  const save = useCallback(
    (info: PlaceInfo, status: PlaceStatus, existingId?: string): string => {
      const now = Date.now()
      const match = places.find(
        (p) => p.id === existingId || (info.osmId !== undefined && p.osmId === info.osmId),
      )
      if (match) {
        const visitedAt = status === 'visited' ? (match.visitedAt ?? now) : undefined
        setPlaces((prev) =>
          prev.map((p) =>
            p.id === match.id ? { ...p, ...info, id: p.id, source: p.source, status, visitedAt } : p,
          ),
        )
        return match.id
      }
      const id = newId()
      const visitedAt = status === 'visited' ? now : undefined
      setPlaces((prev) => [{ ...info, id, status, addedAt: now, visitedAt }, ...prev])
      return id
    },
    [places],
  )

  const update = useCallback((id: string, patch: Partial<PlaceInfo>) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const remove = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { places, save, update, remove }
}

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** "vietnamese;noodle" -> "Vietnamese · Noodle" */
export function formatCuisine(raw?: string): string | undefined {
  if (!raw) return undefined
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(titleCase)
    .join(' · ')
}

const KIND_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  fast_food: 'Fast food',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Pub',
  beer: 'Beer',
  biergarten: 'Beer garden',
  ice_cream: 'Ice cream',
  food_court: 'Food court',
  bakery: 'Bakery',
}

export function formatKind(raw?: string): string | undefined {
  if (!raw) return undefined
  return KIND_LABELS[raw] ?? titleCase(raw)
}
