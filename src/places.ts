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

/** Your own places; any other scope is a shared list's id. */
export const MINE = 'mine'
export type Scope = string

/** A list shared with other people by Google email; members see and edit its places together. */
export interface PlaceList {
  id: string
  name: string
  ownerUid: string
  ownerName: string
  /** Lowercase emails of everyone invited (the owner's included). */
  memberEmails: string[]
  /** Everyone who has opened it signed in. */
  memberUids: string[]
  createdAt: number
}

const SCOPE_KEY = 'dishcovery.scope.v1'

export const normalizeEmails = (emails: string[]) => [
  ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
]

const INFO_KEYS = [
  'name', 'lat', 'lng', 'osmId', 'kind', 'cuisine', 'address', 'openingHours', 'googleUrl', 'googleId', 'sharedId',
  'source',
] as const

/** Just the place details (no saved status or authorship), without empty fields. */
export function infoOf(p: PlaceInfo): PlaceInfo {
  const out: Record<string, unknown> = {}
  for (const key of INFO_KEYS) if (p[key] !== undefined) out[key] = p[key]
  return out as unknown as PlaceInfo
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
  /** Shared lists only: who added it, who marked it visited, who changed it last. */
  addedBy?: string
  addedByName?: string
  visitedBy?: string
  visitedByName?: string
  updatedBy?: string
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
  const [lists, setLists] = useState<PlaceList[]>([])
  const [listPlaces, setListPlaces] = useState<Record<string, Place[]>>({})
  const [scope, setScope] = useState<Scope>(() => {
    try {
      return localStorage.getItem(SCOPE_KEY) || MINE
    } catch {
      return MINE
    }
  })
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
    return c.watchPlaces(user.uid, MINE, setCloudPlaces, () =>
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

  // Signed in: follow the shared lists you own or were invited to.
  useEffect(() => {
    const c = cloudRef.current
    if (!user || !c) {
      setLists([])
      return
    }
    return c.watchLists(user, setLists, () => setMessage('Couldn’t load your shared lists.'))
  }, [user])

  // Invited to a list: record that you've joined (adds your uid to its members).
  const joined = useRef(new Set<string>())
  useEffect(() => {
    const c = cloudRef.current
    if (!user || !c) return
    for (const l of lists) {
      if (l.ownerUid === user.uid || l.memberUids.includes(user.uid) || joined.current.has(l.id)) continue
      joined.current.add(l.id)
      c.joinList(l.id, user.uid)
        .then(() => setMessage(`You’ve joined “${l.name}”, shared by ${l.ownerName}`))
        .catch(() => {})
    }
  }, [lists, user])

  // Follow the places of every shared list (so "Save to…" knows what's already in each).
  const listIds = lists.map((l) => l.id).join(',')
  useEffect(() => {
    const c = cloudRef.current
    if (!user || !c || !listIds) {
      setListPlaces({})
      return
    }
    const ids = listIds.split(',')
    setListPlaces((prev) => Object.fromEntries(ids.filter((id) => prev[id]).map((id) => [id, prev[id]])))
    let stopped = false
    const unsubs = new Map<string, () => void>()
    const timers: ReturnType<typeof setTimeout>[] = []
    // A just-created list may not have reached the server yet, which denies the first read: retry a few times.
    const watch = (id: string, attempt = 0) => {
      unsubs.set(
        id,
        c.watchPlaces(user.uid, id, (ps) => setListPlaces((prev) => ({ ...prev, [id]: ps })), () => {
          if (stopped || attempt >= 5) return
          timers.push(setTimeout(() => !stopped && watch(id, attempt + 1), 1000 * 2 ** attempt))
        }),
      )
    }
    ids.forEach((id) => watch(id))
    return () => {
      stopped = true
      timers.forEach(clearTimeout)
      unsubs.forEach((u) => u())
    }
  }, [listIds, user])

  const minePlaces = useMemo(() => (user ? (cloudPlaces ?? []) : localPlaces), [user, cloudPlaces, localPlaces])
  const placesIn = useCallback(
    (s: Scope): Place[] => (s === MINE ? minePlaces : (listPlaces[s] ?? [])),
    [minePlaces, listPlaces],
  )
  // A remembered list you no longer have (or while signed out) falls back to your own places.
  const activeScope: Scope = user && lists.some((l) => l.id === scope) ? scope : MINE
  const places = placesIn(activeScope)
  const syncState: SyncState = !user ? 'local' : cloudPlaces === null ? 'connecting' : online ? 'synced' : 'offline'

  const setActiveScope = useCallback((s: Scope) => {
    setScope(s)
    try {
      localStorage.setItem(SCOPE_KEY, s)
    } catch {
      // not remembered; fine
    }
  }, [])

  const persist = useCallback(
    (s: Scope, next: Place) => {
      requestPersistentStorage()
      const c = cloudRef.current
      if (user && c) {
        c.putPlace(user.uid, s, next).catch(() =>
          setMessage(`Couldn’t save ${next.name} ${s === MINE ? 'to your account' : 'to the shared list'}.`),
        )
      } else if (s === MINE) {
        setLocalPlaces((prev) => [next, ...prev.filter((p) => p.id !== next.id)])
      }
    },
    [user],
  )

  /** Shared-list places record who added and who visited them. */
  const stamp = useCallback(
    (s: Scope, next: Place, prev?: Place): Place => {
      if (s === MINE || !user) return next
      const me = displayName(user)
      const keepVisitor = prev?.status === 'visited' && prev.visitedBy
      return {
        ...next,
        addedBy: prev?.addedBy ?? user.uid,
        addedByName: prev?.addedByName ?? me,
        updatedBy: user.uid,
        visitedBy: next.status === 'visited' ? (keepVisitor ? prev.visitedBy : user.uid) : undefined,
        visitedByName: next.status === 'visited' ? (keepVisitor ? prev.visitedByName : me) : undefined,
      }
    },
    [user],
  )

  /** Save (or re-file) a place with a status in your places or a shared list. Returns the saved place. */
  const save = useCallback(
    (s: Scope, place: PlaceInfo, status: PlaceStatus, existingId?: string): Place => {
      const now = Date.now()
      const info = infoOf(place)
      const inScope = placesIn(s)
      const match = existingId
        ? inScope.find((p) => p.id === existingId)
        : inScope.find((p) => samePlace(info, p) || (info.sharedId !== undefined && p.sharedId === info.sharedId))
      const sharedId = share(match ? { ...info, sharedId: info.sharedId ?? match.sharedId } : info)
      if (match) {
        const visitedAt = status === 'visited' ? (match.visitedAt ?? now) : undefined
        const next = stamp(s, { ...match, ...info, id: match.id, source: match.source, sharedId, status, visitedAt }, match)
        persist(s, next)
        return next
      }
      const next = stamp(s, { ...info, id: newId(), sharedId, status, addedAt: now, visitedAt: status === 'visited' ? now : undefined })
      persist(s, next)
      return next
    },
    [placesIn, persist, share, stamp],
  )

  const update = useCallback(
    (s: Scope, id: string, patch: Partial<PlaceInfo>) => {
      const current = placesIn(s).find((p) => p.id === id)
      if (current) persist(s, stamp(s, { ...current, ...patch }, current))
    },
    [placesIn, persist, stamp],
  )

  const remove = useCallback(
    (s: Scope, id: string) => {
      const c = cloudRef.current
      if (user && c) {
        c.deletePlace(user.uid, s, id).catch(() => setMessage('Couldn’t remove that place.'))
      } else if (s === MINE) {
        setLocalPlaces((prev) => prev.filter((p) => p.id !== id))
      }
    },
    [user],
  )

  /** Creates a shared list (and switches to it). */
  const createList = useCallback(
    (name: string, emails: string[]) => {
      const c = cloudRef.current
      if (!user || !c) return
      const { id, done } = c.createList({
        name,
        ownerUid: user.uid,
        ownerName: displayName(user),
        memberEmails: normalizeEmails([...(user.email ? [user.email] : []), ...emails]),
        memberUids: [user.uid],
        createdAt: Date.now(),
      })
      done.catch(() => setMessage(`Couldn’t create “${name}”.`))
      setActiveScope(id)
    },
    [user, setActiveScope],
  )

  const updateList = useCallback((id: string, patch: { name?: string; memberEmails?: string[] }) => {
    const p = patch.memberEmails ? { ...patch, memberEmails: normalizeEmails(patch.memberEmails) } : patch
    cloudRef.current?.updateList(id, p).catch(() => setMessage('Couldn’t update that list.'))
  }, [])

  const leaveList = useCallback(
    (id: string) => {
      if (!user?.email) return
      cloudRef.current?.leaveList(id, user.uid, user.email).catch(() => setMessage('Couldn’t leave that list.'))
      if (scope === id) setActiveScope(MINE)
    },
    [user, scope, setActiveScope],
  )

  const deleteList = useCallback(
    (id: string) => {
      cloudRef.current?.deleteList(id).catch(() => setMessage('Couldn’t delete that list.'))
      if (scope === id) setActiveScope(MINE)
    },
    [scope, setActiveScope],
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
    /** Places in the active scope (your own places or the selected shared list). */
    places,
    placesIn,
    scope: activeScope,
    setScope: setActiveScope,
    lists,
    createList,
    updateList,
    leaveList,
    deleteList,
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
