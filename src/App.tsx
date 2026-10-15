import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngTuple, Map as LeafletMap } from 'leaflet'
import type { Map as GLMap } from 'maplibre-gl'
import MapView, { type FocusRequest } from './components/MapView'
import PlaceSheet from './components/PlaceSheet'
import SearchBox from './components/SearchBox'
import AppMenu from './components/AppMenu'
import ListManager from './components/ListManager'
import ListSwitcher from './components/ListSwitcher'
import PlacesView from './components/PlacesView'
import { BookmarkIcon, ImportIcon, LocateIcon, MapIcon } from './components/Icons'
import { googlePlaceInfo, matchGooglePlace, resolveGoogleLink, type GoogleLink } from './gmaps'
import { searchLoadedFood } from './mapFeatures'
import { lookupPlace, reverseGeocode } from './osm'
import {
  MINE,
  infoOf,
  isSharedCopy,
  samePlace,
  usePlaces,
  type Place,
  type PlaceInfo,
  type PlaceStatus,
  type Scope,
  type SharedPlace,
} from './places'
import { THEMES, loadTheme, saveTheme, type ThemeId } from './themes'

type Filter = 'all' | 'wishlist' | 'visited'

type Selection =
  /** `pending` is shown until the just-saved place arrives from storage, so the sheet doesn't blink. */
  | { type: 'saved'; id: string; pending?: Place }
  | { type: 'candidate'; info: PlaceInfo; custom: boolean }
  | { type: 'community'; id: string }
  | null

/** The plain place details of a community place, linked to it, ready to save. */
function sharedInfo(s: SharedPlace): PlaceInfo {
  const { name, lat, lng, osmId, kind, cuisine, address, openingHours, googleUrl, googleId } = s
  return { name, lat, lng, osmId, kind, cuisine, address, openingHours, googleUrl, googleId, sharedId: s.id, source: 'google' }
}

export default function App() {
  const [themeId, setThemeId] = useState<ThemeId>(loadTheme)
  const [filter, setFilter] = useState<Filter>('all')
  const [position, setPosition] = useState<LatLngTuple | null>(null)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const glRef = useRef<GLMap | null>(null)
  const detailsAbort = useRef<AbortController | null>(null)
  const {
    places,
    placesIn,
    scope,
    setScope,
    lists,
    createList,
    updateList,
    leaveList,
    deleteList,
    save,
    update,
    remove,
    setReview,
    community,
    renameShared,
    removeShared,
    cloud,
    message,
    clearMessage,
  } = usePlaces()
  /** Bottom tabs: the map, or the "My Places" list. */
  const [view, setView] = useState<'map' | 'list'>('map')
  /** The list manager dialog: 'new', a list id, or closed. */
  const [managing, setManaging] = useState<string | null>(null)
  const theme = THEMES[themeId]

  useEffect(() => {
    document.documentElement.dataset.theme = themeId
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor)
    saveTheme(themeId)
  }, [themeId, theme.themeColor])

  const locate = useCallback((quiet = false) => {
    if (!('geolocation' in navigator)) {
      if (!quiet) setNotice('Location isn’t available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
        setNotice(null)
      },
      (err) => {
        setLocating(false)
        if (!quiet || err.code !== err.PERMISSION_DENIED) {
          setNotice(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission is off. Enable it in your browser to center the map on you.'
              : 'Couldn’t find your location. Try again in a moment.',
          )
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => locate(true), [locate])

  // Messages from the places store (sync, migration, errors) show as toasts.
  useEffect(() => {
    if (!message) return
    setNotice(message)
    clearMessage()
  }, [message, clearMessage])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(t)
  }, [notice])

  const counts = useMemo(
    () => ({
      all: places.length,
      wishlist: places.filter((p) => p.status === 'wishlist').length,
      visited: places.filter((p) => p.status === 'visited').length,
    }),
    [places],
  )
  const visiblePlaces = useMemo(
    () => (filter === 'all' ? places : places.filter((p) => p.status === filter)),
    [places, filter],
  )

  // Community places you already have are shown as your own pins instead.
  const visibleCommunity = useMemo(
    () => (filter === 'all' ? community.filter((s) => !places.some((p) => isSharedCopy(p, s))) : []),
    [community, places, filter],
  )

  const selectedPlace =
    selection?.type === 'saved' ? (places.find((p) => p.id === selection.id) ?? selection.pending) : undefined
  const candidate = selection?.type === 'candidate' ? selection.info : null
  useEffect(() => {
    if (selection?.type === 'saved' && selection.pending && places.some((p) => p.id === selection.id)) {
      setSelection({ type: 'saved', id: selection.id })
    }
  }, [selection, places])
  const selectedShared = selection?.type === 'community' ? community.find((s) => s.id === selection.id) : undefined
  // The community place behind whatever is shown, for "added by" and the adder's controls.
  const sheetShared =
    selectedShared ??
    (selectedPlace?.sharedId ? community.find((s) => s.id === selectedPlace.sharedId) : undefined)

  /** Show an unsaved place; fill in cuisine/address/hours in the background. */
  const showCandidate = useCallback(
    (info: PlaceInfo, custom = false) => {
      detailsAbort.current?.abort()
      const already = places.find((p) => samePlace(info, p))
      if (already) {
        setSelection({ type: 'saved', id: already.id })
        return
      }
      const shared = community.find((s) => samePlace(info, s))
      if (shared) {
        setSelection({ type: 'community', id: shared.id })
        return
      }
      setSelection({ type: 'candidate', info, custom })
      const needsDetails = custom ? !info.address : info.osmId && !(info.cuisine || info.address)
      if (!needsDetails) {
        setLoadingDetails(false)
        return
      }
      const ctrl = new AbortController()
      detailsAbort.current = ctrl
      setLoadingDetails(true)
      const fetchDetails: Promise<Partial<PlaceInfo> | null> = custom
        ? reverseGeocode(info.lat, info.lng, ctrl.signal).then((address) => (address ? { address } : null))
        : lookupPlace(info.osmId!, ctrl.signal).then((d) =>
            d ? { cuisine: d.cuisine, address: d.address, openingHours: d.openingHours, kind: info.kind ?? d.kind } : null,
          )
      fetchDetails
        .then((extra) => {
          if (!extra || ctrl.signal.aborted) return
          setSelection((sel) =>
            sel?.type === 'candidate' && sel.info === info ? { ...sel, info: { ...info, ...extra } } : sel,
          )
        })
        .catch(() => {})
        .finally(() => {
          if (detailsAbort.current === ctrl) setLoadingDetails(false)
        })
    },
    [places, community],
  )

  const closeSheet = useCallback(() => {
    detailsAbort.current?.abort()
    setLoadingDetails(false)
    setSelection(null)
  }, [])

  const listLabel = (s: Scope) => (s === MINE ? 'My places' : (lists.find((l) => l.id === s)?.name ?? 'Shared list'))

  // Where the card saves to: the list on screen unless you pick another one ("Save to…").
  const [target, setTarget] = useState<Scope>(scope)
  const selKey =
    selection?.type === 'candidate' ? `c:${selection.info.lat},${selection.info.lng}` : `${selection?.type}:${selection?.id}`
  useEffect(() => setTarget(scope), [selKey, scope])

  const sheetInfo: PlaceInfo | null = selectedPlace ?? candidate ?? (selectedShared ? sharedInfo(selectedShared) : null)
  // The place as saved in the target, if it's there.
  const targetSaved: Place | undefined =
    !sheetInfo
      ? undefined
      : target === scope && selectedPlace
        ? selectedPlace
        : placesIn(target).find(
            (p) => samePlace(sheetInfo, p) || (sheetInfo.sharedId !== undefined && p.sharedId === sheetInfo.sharedId),
          )

  const handleSave = (status: PlaceStatus, name: string) => {
    if (!sheetInfo) return
    const info = { ...infoOf(sheetInfo), name: name || sheetInfo.name }
    const inList = target === MINE ? '' : ` in “${listLabel(target)}”`
    if (targetSaved) {
      save(target, info, status, targetSaved.id)
      setNotice(status === 'visited' ? `Marked ${info.name} as visited${inList}` : `Moved ${info.name} to the wishlist${inList}`)
      return
    }
    const saved = save(target, info, status)
    if (target === scope) {
      setSelection({ type: 'saved', id: saved.id, pending: saved })
      if (filter !== 'all' && filter !== status) setFilter('all')
    }
    const done = status === 'visited' ? `Saved ${info.name} as visited` : `Added ${info.name} to ${inList ? 'the' : 'your'} wishlist`
    setNotice(
      target === MINE && cloud.enabled && !cloud.user
        ? `${done} on this device. Sign in from the menu ↗ to keep it in your account.`
        : done + inList,
    )
  }

  const handleRemove = () => {
    if (!targetSaved) return
    remove(target, targetSaved.id)
    setNotice(`Removed ${targetSaved.name}${target === MINE ? '' : ` from “${listLabel(target)}”`}`)
    // Keep it on screen as an unsaved place so a mis-tap is easy to undo.
    if (target === scope && selectedPlace) setSelection({ type: 'candidate', info: infoOf(selectedPlace), custom: false })
  }

  // Saved places from search/map get details filled in lazily if they were saved before details loaded.
  useEffect(() => {
    if (!selectedPlace?.osmId || selectedPlace.cuisine || selectedPlace.address) return
    const ctrl = new AbortController()
    lookupPlace(selectedPlace.osmId, ctrl.signal)
      .then((d) => d && update(scope, selectedPlace.id, { cuisine: d.cuisine, address: d.address, openingHours: d.openingHours }))
      .catch(() => {})
    return () => ctrl.abort()
  }, [selectedPlace, update, scope])

  const getView = useCallback(() => {
    const b = mapRef.current?.getBounds()
    return b ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : null
  }, [])

  const onMap = useCallback((m: LeafletMap) => {
    mapRef.current = m
  }, [])

  const onGL = useCallback((gl: GLMap | null) => {
    glRef.current = gl
    if (import.meta.env.DEV) Object.assign(window, { __gl: gl }) // handy for debugging in the console
  }, [])

  const searchNearby = useCallback(
    (query: string) => (glRef.current ? searchLoadedFood(glRef.current, query) : []),
    [],
  )

  const flyTo = (lat: number, lng: number) => setFocus({ lat, lng, zoom: 17, key: Date.now() })

  const linkAbort = useRef<AbortController | null>(null)
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  /** Paste a Google Maps link -> pin on the map + save card, matched to OSM when possible. */
  const openGoogleLink = async (pasted: GoogleLink) => {
    linkAbort.current?.abort()
    const ctrl = new AbortController()
    linkAbort.current = ctrl
    const view = getView() ?? { west: 105.78, south: 20.98, east: 105.9, north: 21.07 } // Hanoi
    try {
      if (pasted.kind === 'short') setNotice('Opening Google Maps link…')
      const link = await resolveGoogleLink(pasted, ctrl.signal)
      if (ctrl.signal.aborted) return
      const pin = link.kind === 'full' ? googlePlaceInfo(link) : null

      if (pin) {
        // Show the pin straight away; upgrade to the OpenStreetMap place if we find it.
        setNotice(null)
        showCandidate(pin, true)
        flyTo(pin.lat, pin.lng)
        if (!pin.name) return
        const match = await matchGooglePlace(pin.name, pin, view, ctrl.signal)
        const sel = selectionRef.current
        const stillShowing = sel?.type === 'candidate' && sel.info.googleUrl === pin.googleUrl
        if (match && stillShowing && !ctrl.signal.aborted) {
          showCandidate({ ...match, name: pin.name, source: 'google', googleUrl: pin.googleUrl, googleId: pin.googleId })
        }
        return
      }

      const name = link.name
      if (!name) {
        setNotice('Couldn’t open that link. Paste the whole text from Google Maps’ Share button, or open the link and copy the full address.')
        return
      }
      setNotice(`Looking up “${name}”…`)
      const match = await matchGooglePlace(name, null, view, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!match) {
        setNotice(`Couldn’t find “${name}” on the map. Long-press its spot to add it yourself.`)
        return
      }
      setNotice(null)
      showCandidate({ ...match, source: 'google', googleUrl: link.url, googleId: link.kind === 'full' ? link.googleId : undefined })
      flyTo(match.lat, match.lng)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setNotice('Couldn’t look up that place. Check your connection and try again.')
    }
  }

  const sheetPlace = targetSaved ?? (sheetInfo && (sheetInfo === candidate ? candidate : infoOf(sheetInfo)))
  // Your rating/review: private in your places; in a shared list, yours plus the other members'.
  const uid = cloud.user?.uid
  const myListReview = uid && target !== MINE ? targetSaved?.reviews?.[uid] : undefined
  const sheetReview =
    targetSaved && (target === MINE || uid)
      ? {
          mine:
            target === MINE
              ? { rating: targetSaved.rating, text: targetSaved.review }
              : { rating: myListReview?.rating, text: myListReview?.text },
          others:
            target === MINE
              ? undefined
              : Object.entries(targetSaved.reviews ?? {})
                  .filter(([id]) => id !== uid)
                  .sort(([, a], [, b]) => b.at - a.at)
                  .map(([, r]) => ({ name: r.name ?? 'Someone', rating: r.rating, text: r.text })),
          onChange: (r: { rating: number; text?: string } | null) => setReview(target, targetSaved.id, r),
        }
      : undefined
  const switcher = cloud.user && (
    <ListSwitcher
      lists={lists}
      scope={scope}
      uid={cloud.user.uid}
      onScope={(s) => {
        setScope(s)
        closeSheet()
      }}
      onNew={() => setManaging('new')}
      onManage={setManaging}
    />
  )

  const openFromList = (id: string) => {
    const p = places.find((x) => x.id === id)
    if (!p) return
    setView('map')
    if (filter !== 'all' && filter !== p.status) setFilter('all')
    setSelection({ type: 'saved', id })
    flyTo(p.lat, p.lng)
  }

  const managedList = managing && managing !== 'new' ? lists.find((l) => l.id === managing) : undefined

  return (
    <div className="app">
      <main className="map-area">
        <div className="map-layer" inert={view !== 'map'}>
          <MapView
            theme={theme}
            showFood={filter === 'all'}
            position={position}
            places={visiblePlaces}
            selectedId={selectedPlace?.id ?? null}
            candidate={candidate}
            community={visibleCommunity}
            selectedCommunityId={selectedShared?.id ?? null}
            focus={focus}
            onSelectPlace={(id) => setSelection({ type: 'saved', id })}
            onSelectCommunity={(id) => setSelection({ type: 'community', id })}
            onPickFeature={(info) => showCandidate(info)}
            onLongPress={(lat, lng) => {
              showCandidate({ name: '', lat, lng, source: 'custom' }, true)
            }}
            onBackgroundClick={closeSheet}
            onMap={onMap}
            onGL={onGL}
          />
        </div>

        {view === 'map' && (
          <>

            <div className="top-overlay">
              <div className="top-row">
                <SearchBox
                  places={places}
                  getView={getView}
                  searchNearby={searchNearby}
                  onPickSaved={(id) => {
                    const p = places.find((x) => x.id === id)
                    if (!p) return
                    if (filter !== 'all' && filter !== p.status) setFilter('all')
                    setSelection({ type: 'saved', id })
                    flyTo(p.lat, p.lng)
                  }}
                  onPickResult={(r) => {
                    showCandidate(r)
                    flyTo(r.lat, r.lng)
                  }}
                  onGoogleLink={openGoogleLink}
                />
                <AppMenu theme={themeId} onTheme={setThemeId} cloud={cloud} placeCount={places.length} />
              </div>
              <div className="filter-row">
                {switcher}
                <div className="chips" role="tablist" aria-label="Filter places">
                  {(['all', 'wishlist', 'visited'] as const).map((f) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={filter === f}
                      className={`chip chip-${f}`}
                      onClick={() => setFilter(f)}
                    >
                      {f !== 'all' && <span className="dot" aria-hidden />}
                      {{ all: 'All', wishlist: 'Wishlist', visited: 'Visited' }[f]}
                      {f !== 'all' && counts[f] > 0 && <span className="chip-count">{counts[f]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!sheetPlace && (
              <button
                className={`icon-btn locate-btn${locating ? ' is-locating' : ''}`}
                aria-label="Show my location"
                onClick={() => locate()}
              >
                <LocateIcon />
              </button>
            )}

            {!sheetPlace && places.length === 0 && !notice && (
              <div className="hint" role="note">
                {scope === MINE
                  ? 'Tap a restaurant dot to save it, or long-press anywhere to add your own spot.'
                  : `Nothing in “${listLabel(scope)}” yet. Tap a restaurant dot to add it for everyone in the list.`}
              </div>
            )}
          </>
        )}

        {sheetPlace && (
          <PlaceSheet
            place={sheetPlace}
            custom={selection?.type === 'candidate' && selection.custom}
            loadingDetails={loadingDetails}
            community={
              sheetShared && {
                addedByName: sheetShared.addedByName,
                mine: sheetShared.addedBy === cloud.user?.uid,
                onRename: (name) => renameShared(sheetShared.id, name),
                onRemove: () => {
                  removeShared(sheetShared.id)
                  setNotice(`Removed ${sheetShared.name} from community places`)
                  if (selection?.type === 'community') setSelection(null)
                },
              }
            }
            targets={cloud.user && lists.length ? [MINE, ...lists.map((l) => l.id)].map((id) => ({ id, label: listLabel(id) })) : undefined}
            target={target}
            onTarget={setTarget}
            review={sheetReview}
            onSave={handleSave}
            onRemove={handleRemove}
            onClose={closeSheet}
          />
        )}

        {view === 'list' && (
          <PlacesView
            title={listLabel(scope)}
            places={places}
            shared={scope !== MINE}
            filter={filter}
            onFilter={setFilter}
            switcher={switcher}
            onOpen={openFromList}
          />
        )}

        {managing && cloud.user && (managing === 'new' || managedList) && (
          <ListManager
            list={managedList ?? null}
            user={cloud.user}
            onCreate={(name, emails) => {
              createList(name, emails)
              setNotice(`Created “${name}”. Places you save now go to this list.`)
            }}
            onSave={updateList}
            onLeave={(id) => {
              leaveList(id)
              setNotice(`Left “${listLabel(id)}”`)
            }}
            onDelete={(id) => {
              deleteList(id)
              setNotice(`Deleted “${listLabel(id)}”`)
            }}
            onClose={() => setManaging(null)}
          />
        )}

        {notice && (
          <div className={`toast${sheetPlace ? ' above-sheet' : ''}`} role="status">
            {notice}
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        <button
          className={`tab${view === 'map' ? ' is-active' : ''}`}
          aria-current={view === 'map' ? 'page' : undefined}
          onClick={() => setView('map')}
        >
          <MapIcon />
          <span>Map</span>
        </button>
        <button
          className={`tab${view === 'list' ? ' is-active' : ''}`}
          aria-current={view === 'list' ? 'page' : undefined}
          onClick={() => {
            closeSheet()
            setView('list')
          }}
        >
          <BookmarkIcon />
          <span>My Places</span>
        </button>
        <button className="tab" disabled title="Coming soon">
          <ImportIcon />
          <span>Import</span>
        </button>
      </nav>
    </div>
  )
}
