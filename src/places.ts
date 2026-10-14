import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloudConfigured, getCloud, type Cloud, type CloudUser } from './cloud'
import { metresBetween } from './gmaps'
import { fold } from './text'

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
  /** Google's own id for the place, when the link had one. */
  googleId?: string
  /** The community place (sharedPlaces/{id}) this place is linked to. */
  sharedId?: string
  source: PlaceSource
}

/** A place someone added from a Google Maps link; every signed-in user can see it. */
export interface SharedPlace extends PlaceInfo {
  id: string
  addedBy: string
  addedByName: string
  createdAt: number
}

/** Places this close with the same name are treated as the same place. */
const SAME_SPOT_METRES = 30

export function samePlace(a: PlaceInfo, b: PlaceInfo): boolean {
  if (a.osmId && a.osmId === b.osmId) return true
  if (a.googleId && a.googleId === b.googleId) return true
  if (a.googleUrl && a.googleUrl === b.googleUrl) return true
  const name = fold(a.name.trim())
  return name.length > 0 && name === fold(b.name.trim()) && metresBetween(a.lat, a.lng, b.lat, b.lng) <= SAME_SPOT_METRES
}

/** Is this saved place the same as that community place? */
export const isSharedCopy = (p: PlaceInfo, s: SharedPlace) => p.sharedId === s.id || samePlace(p, s)

/** 53-bit string hash (cyrb53), as hex. */
function hash(str: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/** Community place ids come from the Google place, so two people adding the same link land on one doc. */
const sharedIdFor = (info: PlaceInfo) => `g-${hash(info.googleId ? `id:${info.googleId}` : `url:${info.googleUrl}`)}`

export interface Place extends PlaceInfo {
  id: string
  status: PlaceStatus
  addedAt: number
  visitedAt?: number
}

const STORAGE_KEY = 'dishcovery.places.v1'
/** Places moved into a cloud account are kept here too, just in case. */
const BACKUP_KEY = 'dishcovery.places.backup.v1'

function read(key = STORAGE_KEY): Place[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(places: Place[], key = STORAGE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(places))
  } catch {
    // storage full or unavailable; keep in memory for this session
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

let persistRequested = false
/** Ask the browser not to evict our local data (e.g. Safari's 7-day cleanup). */
function requestPersistentStorage() {
  if (persistRequested) return
  persistRequested = true
  navigator.storage?.persist?.().catch(() => {})
}

export type SyncState = 'local' | 'connecting' | 'synced' | 'offline'

/**
 * Saved places. Signed in: stored in the user's Firestore account (synced across devices,
 * cached offline). Signed out or not configured: stored in this browser's localStorage.
 */
export function usePlaces() {
  const [localPlaces, setLocalPlaces] = useState<Place[]>(() => read())
  const [user, setUser] = useState<CloudUser | null>(null)
  const [authReady, setAuthReady] = useState(!cloudConfigured)
  const [cloudPlaces, setCloudPlaces] = useState<Place[] | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [message, setMessage] = useState<string | null>(null)
  const [community, setCommunity] = useState<SharedPlace[]>([])
  const cloudRef = useRef<Cloud | null>(null)

  useEffect(() => write(localPlaces), [localPlaces])

  // Keep multiple open tabs in sync (local mode).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setLocalPlaces(read())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Connect to Firebase (if configured) and follow the signed-in user.
  useEffect(() => {
    if (!cloudConfigured) return
    let unsub = () => {}
    let cancelled = false
    getCloud()
      .then((c) => {
        if (cancelled) return
        cloudRef.current = c
        unsub = c.onUser((u) => {
          setUser(u)
          setAuthReady(true)
        })
      })
      .catch(() => setAuthReady(true))
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  // Signed in: move this browser's places into the account, then follow the account's places.
  useEffect(() => {
    const c = cloudRef.current
    if (!user || !c) {
      setCloudPlaces(null)
      return
    }
    const local = read()
    if (local.length) {
      c.migrate(user.uid, local)
        .then((added) => {
          write([...read(BACKUP_KEY), ...local], BACKUP_KEY)
          setLocalPlaces([])
          if (added) setMessage(`Moved ${added} place${added === 1 ? '' : 's'} from this device to your account`)
        })
        .catch(() => setMessage('Couldn’t move this device’s places to your account yet. They’re still saved here.'))
    }
    return c.watchPlaces(user.uid, setCloudPlaces, () =>
      setMessage('Couldn’t load your places from the cloud. Showing what’s saved offline.'),
    )
  }, [user])

  // Signed in: follow the community places (signed-out users don't see them).
  useEffect(() => {
    const c = cloudRef.current
    if (!user || !c) {
      setCommunity([])
      return
    }
    return c.watchShared(setCommunity, () => setMessage('Couldn’t load community places.'))
  }, [user])

  /**
   * Places added from a Google Maps link are shared with the community (once; matching
   * places already there are reused). Returns the community id to link the saved place to.
   */
  const share = useCallback(
    (info: PlaceInfo): string | undefined => {
      const c = cloudRef.current
      if (info.sharedId) return info.sharedId
      if (!user || !c || info.source !== 'google' || !info.googleUrl || !info.name.trim()) return undefined
      const existing = community.find((s) => samePlace(info, s))
      if (existing) return existing.id
      const { name, lat, lng, googleUrl, googleId, osmId, kind, cuisine, address, openingHours } = info
      const shared: SharedPlace = {
        id: sharedIdFor(info),
        name: name.trim(),
        lat,
        lng,
        googleUrl,
        googleId,
        osmId,
        kind,
        cuisine,
        address,
        openingHours,
        source: 'google',
        addedBy: user.uid,
        addedByName: displayName(user),
        createdAt: Date.now(),
      }
      // If someone else added it at the same moment, theirs is the community copy; that's fine.
      c.addShared(shared).catch(() => {})
      return shared.id
    },
    [user, community],
  )

  const renameShared = useCallback((id: string, name: string) => {
    cloudRef.current?.updateShared(id, { name }).catch(() => setMessage('Couldn’t rename that community place.'))
  }, [])

  const removeShared = useCallback((id: string) => {
    cloudRef.current?.deleteShared(id).catch(() => setMessage('Couldn’t remove that community place.'))
  }, [])

  const places = useMemo(() => (user ? (cloudPlaces ?? []) : localPlaces), [user, cloudPlaces, localPlaces])
  const syncState: SyncState = !user ? 'local' : cloudPlaces === null ? 'connecting' : online ? 'synced' : 'offline'

  const persist = useCallback(
    (next: Place) => {
      requestPersistentStorage()
      const c = cloudRef.current
      if (user && c) {
        c.putPlace(user.uid, next).catch(() => setMessage(`Couldn’t save ${next.name} to your account.`))
      } else {
        setLocalPlaces((prev) => [next, ...prev.filter((p) => p.id !== next.id)])
      }
    },
    [user],
  )

  /** Save (or re-file) a place with a status. Returns the saved place's id. */
  const save = useCallback(
    (info: PlaceInfo, status: PlaceStatus, existingId?: string): string => {
      const now = Date.now()
      const match = places.find(
        (p) => p.id === existingId || (info.osmId !== undefined && p.osmId === info.osmId),
      )
      const sharedId = share(match ? { ...info, sharedId: info.sharedId ?? match.sharedId } : info)
      if (match) {
        const visitedAt = status === 'visited' ? (match.visitedAt ?? now) : undefined
        persist({ ...match, ...info, id: match.id, source: match.source, sharedId, status, visitedAt })
        return match.id
      }
      const id = newId()
      persist({ ...info, id, sharedId, status, addedAt: now, visitedAt: status === 'visited' ? now : undefined })
      return id
    },
    [places, persist, share],
  )

  const update = useCallback(
    (id: string, patch: Partial<PlaceInfo>) => {
      const current = places.find((p) => p.id === id)
      if (current) persist({ ...current, ...patch })
    },
    [places, persist],
  )

  const remove = useCallback(
    (id: string) => {
      const c = cloudRef.current
      if (user && c) {
        c.deletePlace(user.uid, id).catch(() => setMessage('Couldn’t remove that place from your account.'))
      } else {
        setLocalPlaces((prev) => prev.filter((p) => p.id !== id))
      }
    },
    [user],
  )

  const signIn = useCallback(async () => {
    try {
      const c = await getCloud()
      await c.signIn()
    } catch {
      setMessage('Sign-in didn’t work. Please try again.')
    }
  }, [])

  const signOut = useCallback(async () => {
    await cloudRef.current?.signOut()
  }, [])

  const clearMessage = useCallback(() => setMessage(null), [])

  return {
    places,
    save,
    update,
    remove,
    community,
    renameShared,
    removeShared,
    cloud: { enabled: cloudConfigured, ready: authReady, user, syncState, signIn, signOut },
    message,
    clearMessage,
  }
}

export const displayName = (u: CloudUser) => u.name?.trim() || u.email?.split('@')[0] || 'Someone'

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
