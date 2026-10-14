import { useEffect, useMemo, useRef, useState } from 'react'
import { searchPlaces, type SearchResult } from '../osm'
import type { Place, PlaceInfo } from '../places'
import { fold } from '../text'
import { BookmarkIcon, CheckIcon, CloseIcon, PinIcon, SearchIcon } from './Icons'

type View = { west: number; south: number; east: number; north: number }

interface Props {
  places: Place[]
  getView: () => View | null
  /** Instant search over restaurants already loaded on the map. */
  searchNearby: (query: string) => PlaceInfo[]
  onPickSaved: (id: string) => void
  onPickResult: (result: PlaceInfo) => void
}

export default function SearchBox({ places, getView, searchNearby, onPickSaved, onPickResult }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searchedFor, setSearchedFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const q = query.trim()
  const savedMatches = useMemo(() => {
    if (!q) return []
    const needle = fold(q)
    return places
      .filter((p) => fold([p.name, p.cuisine, p.address].filter(Boolean).join(' ')).includes(needle))
      .slice(0, 5)
  }, [places, q])

  const nearby = useMemo(() => {
    if (!q || !open) return []
    const savedOsm = new Set(places.map((p) => p.osmId).filter(Boolean))
    return searchNearby(q).filter((p) => !p.osmId || !savedOsm.has(p.osmId))
  }, [q, open, places, searchNearby])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function runSearch() {
    if (!q) return
    const view = getView()
    if (!view) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(false)
    setOpen(true)
    try {
      const found = await searchPlaces(q, view, ctrl.signal)
      // Restaurants first, then everything else.
      setResults([...found.filter((r) => r.isFood), ...found.filter((r) => !r.isFood)])
      setSearchedFor(q)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(true)
    } finally {
      if (abortRef.current === ctrl) setLoading(false)
    }
  }

  function clear() {
    abortRef.current?.abort()
    setQuery('')
    setResults(null)
    setLoading(false)
    setError(false)
    inputRef.current?.focus()
  }

  function done() {
    setOpen(false)
    inputRef.current?.blur()
  }

  const staleResults = results && searchedFor !== q
  const showPanel = open && q.length > 0

  return (
    <div className="searchbox" ref={wrapRef}>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          runSearch()
        }}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          placeholder="Search restaurants or places"
          aria-label="Search restaurants or places"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && done()}
        />
        {query && (
          <button type="button" className="search-clear" aria-label="Clear search" onClick={clear}>
            <CloseIcon size={18} />
          </button>
        )}
      </form>

      {showPanel && (
        <div className="search-panel" role="listbox" aria-label="Search results">
          {savedMatches.length > 0 && (
            <>
              <div className="search-section">Your places</div>
              {savedMatches.map((p) => (
                <button
                  key={p.id}
                  role="option"
                  className="search-item"
                  onClick={() => {
                    onPickSaved(p.id)
                    done()
                  }}
                >
                  <span className={`search-badge badge-${p.status}`}>
                    {p.status === 'visited' ? <CheckIcon size={14} /> : <BookmarkIcon size={14} />}
                  </span>
                  <span className="search-text">
                    <span className="search-name">{p.name}</span>
                    <span className="search-sub">{[p.cuisine ?? p.kind, p.address].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {nearby.length > 0 && (
            <>
              <div className="search-section">Nearby</div>
              {nearby.map((p) => (
                <button
                  key={p.osmId ?? `${p.lat},${p.lng}`}
                  role="option"
                  className="search-item"
                  onClick={() => {
                    onPickResult(p)
                    done()
                  }}
                >
                  <span className="search-badge badge-food">
                    <PinIcon size={14} />
                  </span>
                  <span className="search-text">
                    <span className="search-name">{p.name}</span>
                    <span className="search-sub">{p.kind}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {loading && <div className="search-note">Searching OpenStreetMap…</div>}
          {error && <div className="search-note">Search isn’t responding. Try again in a moment.</div>}

          {!loading && !error && results && !staleResults && (
            <>
              <div className="search-section">More results</div>
              {results.length === 0 && <div className="search-note">No places found for “{searchedFor}”.</div>}
              {results.map((r) => (
                <button
                  key={r.osmId}
                  role="option"
                  className="search-item"
                  onClick={() => {
                    onPickResult(r)
                    done()
                  }}
                >
                  <span className={`search-badge ${r.isFood ? 'badge-food' : 'badge-place'}`}>
                    <PinIcon size={14} />
                  </span>
                  <span className="search-text">
                    <span className="search-name">{r.name}</span>
                    <span className="search-sub">
                      {[r.isFood ? (r.cuisine ?? r.kind) : r.kind, r.address].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}

          {!loading && !error && (!results || staleResults) && (
            <button className="search-go" onClick={runSearch}>
              <SearchIcon size={16} />
              Search everywhere for “{q}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
