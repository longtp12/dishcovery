import { useCallback, useEffect, useState } from 'react'
import type { LatLngTuple } from 'leaflet'
import MapView from './components/MapView'
import StyleSwitcher from './components/StyleSwitcher'
import { BookmarkIcon, ImportIcon, LocateIcon, MapIcon, SearchIcon } from './components/Icons'
import { THEMES, loadTheme, saveTheme, type ThemeId } from './themes'

type Filter = 'all' | 'wishlist' | 'visited'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'visited', label: 'Visited' },
]

export default function App() {
  const [themeId, setThemeId] = useState<ThemeId>(loadTheme)
  const [filter, setFilter] = useState<Filter>('all')
  const [position, setPosition] = useState<LatLngTuple | null>(null)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
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

  return (
    <div className="app">
      <main className="map-area">
        <MapView theme={theme} position={position} />

        <div className="top-overlay">
          <div className="top-row">
            <label className="search">
              <SearchIcon />
              <input type="search" placeholder="Search restaurants or places" aria-label="Search" disabled />
            </label>
            <StyleSwitcher value={themeId} onChange={setThemeId} />
          </div>
          <div className="chips" role="tablist" aria-label="Filter places">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={`chip chip-${f.id}`}
                onClick={() => setFilter(f.id)}
              >
                {f.id !== 'all' && <span className="dot" aria-hidden />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`icon-btn locate-btn${locating ? ' is-locating' : ''}`}
          aria-label="Show my location"
          onClick={() => locate()}
        >
          <LocateIcon />
        </button>

        {notice && (
          <div className="toast" role="status">
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
