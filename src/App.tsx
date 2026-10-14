import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLngTuple, Map as LeafletMap } from 'leaflet'
import type { Map as GLMap } from 'maplibre-gl'
import MapView, { type FocusRequest } from './components/MapView'
import PlaceSheet from './components/PlaceSheet'
import SearchBox from './components/SearchBox'
import StyleSwitcher from './components/StyleSwitcher'
import { BookmarkIcon, ImportIcon, LocateIcon, MapIcon } from './components/Icons'
import { googlePlaceInfo, matchGooglePlace, resolveGoogleLink, type GoogleLink } from './gmaps'
import { searchLoadedFood } from './mapFeatures'
import { lookupPlace, reverseGeocode } from './osm'
import { usePlaces, type PlaceInfo, type PlaceStatus } from './places'
import { THEMES, loadTheme, saveTheme, type ThemeId } from './themes'

type Filter = 'all' | 'wishlist' | 'visited'

type Selection =
  | { type: 'saved'; id: string }
  | { type: 'candidate'; info: PlaceInfo; custom: boolean }
  | null

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
  const { places, save, update, remove } = usePlaces()
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

  const selectedPlace = selection?.type === 'saved' ? places.find((p) => p.id === selection.id) : undefined
  const candidate = selection?.type === 'candidate' ? selection.info : null

  /** Show an unsaved place; fill in cuisine/address/hours in the background. */
  const showCandidate = useCallback(
    (info: PlaceInfo, custom = false) => {
      detailsAbort.current?.abort()
      const already = info.osmId ? places.find((p) => p.osmId === info.osmId) : undefined
      if (already) {
        setSelection({ type: 'saved', id: already.id })
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
    [places],
  )

  const closeSheet = useCallback(() => {
    detailsAbort.current?.abort()
    setLoadingDetails(false)
    setSelection(null)
  }, [])

  const handleSave = (status: PlaceStatus, name: string) => {
    if (selection?.type === 'saved' && selectedPlace) {
      save(selectedPlace, status, selectedPlace.id)
      setNotice(status === 'visited' ? `Marked ${selectedPlace.name} as visited` : `Moved ${selectedPlace.name} to your wishlist`)
      return
    }
    if (selection?.type === 'candidate') {
      const info = { ...selection.info, name: name || selection.info.name }
      const id = save(info, status)
      setSelection({ type: 'saved', id })
      setNotice(status === 'visited' ? `Saved ${info.name} as visited` : `Added ${info.name} to your wishlist`)
      if (filter !== 'all' && filter !== status) setFilter('all')
    }
  }

  const handleRemove = () => {
    if (!selectedPlace) return
    remove(selectedPlace.id)
    setNotice(`Removed ${selectedPlace.name}`)
    // Keep it on screen as an unsaved place so a mis-tap is easy to undo.
    const { name, lat, lng, osmId, kind, cuisine, address, openingHours, googleUrl, source } = selectedPlace
    const info: PlaceInfo = { name, lat, lng, osmId, kind, cuisine, address, openingHours, googleUrl, source }
    setSelection({ type: 'candidate', info, custom: false })
  }

  // Saved places from search/map get details filled in lazily if they were saved before details loaded.
  useEffect(() => {
    if (!selectedPlace?.osmId || selectedPlace.cuisine || selectedPlace.address) return
    const ctrl = new AbortController()
    lookupPlace(selectedPlace.osmId, ctrl.signal)
      .then((d) => d && update(selectedPlace.id, { cuisine: d.cuisine, address: d.address, openingHours: d.openingHours }))
      .catch(() => {})
    return () => ctrl.abort()
  }, [selectedPlace, update])

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
          showCandidate({ ...match, name: pin.name, source: 'google', googleUrl: pin.googleUrl })
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
      showCandidate({ ...match, source: 'google', googleUrl: link.url })
      flyTo(match.lat, match.lng)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setNotice('Couldn’t look up that place. Check your connection and try again.')
    }
  }

  const sheetPlace = selectedPlace ?? candidate

  return (
    <div className="app">
      <main className="map-area">
        <MapView
          theme={theme}
          showFood={filter === 'all'}
          position={position}
          places={visiblePlaces}
          selectedId={selectedPlace?.id ?? null}
          candidate={candidate}
          focus={focus}
          onSelectPlace={(id) => setSelection({ type: 'saved', id })}
          onPickFeature={(info) => showCandidate(info)}
          onLongPress={(lat, lng) => {
            showCandidate({ name: '', lat, lng, source: 'custom' }, true)
          }}
          onBackgroundClick={closeSheet}
          onMap={onMap}
          onGL={onGL}
        />

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
            <StyleSwitcher value={themeId} onChange={setThemeId} />
          </div>
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
            Tap a restaurant dot to save it, or long-press anywhere to add your own spot.
          </div>
        )}

        {sheetPlace && (
          <PlaceSheet
            place={sheetPlace}
            custom={selection?.type === 'candidate' && selection.custom}
            loadingDetails={loadingDetails}
            onSave={handleSave}
            onRemove={handleRemove}
            onClose={closeSheet}
          />
        )}

        {notice && (
          <div className={`toast${sheetPlace ? ' above-sheet' : ''}`} role="status">
            {notice}
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        <button className="tab is-active" aria-current="page">
          <MapIcon />
          <span>Map</span>
        </button>
        <button className="tab" disabled title="Coming soon">
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
