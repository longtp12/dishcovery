import { useMemo, useState, type ReactNode } from 'react'
import type { Place, PlaceStatus } from '../places'
import { fold } from '../text'
import { Stars } from './ReviewBox'

type Filter = 'all' | PlaceStatus
type Sort = 'recent' | 'name' | 'rating'

interface Props {
  title: string
  places: Place[]
  /** True for a shared list: show who added each place and the members' average rating. */
  shared: boolean
  filter: Filter
  onFilter: (f: Filter) => void
  /** The list switcher, when signed in. */
  switcher?: ReactNode
  onOpen: (id: string) => void
}

/** Your rating in your own places; the members' average in a shared list. */
function ratingOf(p: Place, shared: boolean): number | undefined {
  if (!shared) return p.rating
  const all = Object.values(p.reviews ?? {}).map((r) => r.rating)
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : undefined
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** "My Places" tab: the places in the active list, as a searchable, sortable list. */
export default function PlacesView({ title, places, shared, filter, onFilter, switcher, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  /** Selected tags: a place matches if it has ANY of them. */
  const [picked, setPicked] = useState<string[]>([])

  // Tags used in this list, most used first.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of places) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [places])
  const activeTags = picked.filter((t) => tags.includes(t))
  const toggleTag = (t: string) =>
    setPicked((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const counts = {
    all: places.length,
    wishlist: places.filter((p) => p.status === 'wishlist').length,
    visited: places.filter((p) => p.status === 'visited').length,
  }

  const shown = useMemo(() => {
    const q = fold(query.trim())
    const list = places.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!activeTags.length || (p.tags ?? []).some((t) => activeTags.includes(t))) &&
        (!q || fold([p.name, p.cuisine, p.address, p.kind, ...(p.tags ?? [])].filter(Boolean).join(' ')).includes(q)),
    )
    const by: Record<Sort, (a: Place, b: Place) => number> = {
      recent: (a, b) => (b.visitedAt ?? b.addedAt) - (a.visitedAt ?? a.addedAt),
      name: (a, b) => a.name.localeCompare(b.name),
      rating: (a, b) => (ratingOf(b, shared) ?? 0) - (ratingOf(a, shared) ?? 0),
    }
    return [...list].sort(by[sort])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, filter, query, sort, shared, activeTags.join('\n')])

  return (
    <section className="places-view" aria-labelledby="places-title">
      <header className="places-head">
        <div className="places-title-row">
          <h1 id="places-title">{title}</h1>
          {switcher}
        </div>
        <div className="chips" role="group" aria-label="Show">
          {(['all', 'wishlist', 'visited'] as const).map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={`chip chip-${f}`}
              onClick={() => onFilter(f)}
            >
              {f !== 'all' && <span className="dot" aria-hidden />}
              {{ all: 'All', wishlist: 'Wishlist', visited: 'Visited' }[f]}
              <span className="chip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="tag-filter" role="group" aria-label="Filter by tags (any of the selected)">
            {tags.map((t) => (
              <button
                key={t}
                className="tag tag-toggle"
                aria-pressed={activeTags.includes(t)}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {activeTags.length > 1 && (
              <button className="tag tag-clear" onClick={() => setPicked([])}>
                Clear
              </button>
            )}
          </div>
        )}
        <div className="places-tools">
          <label className="places-search">
            <span className="visually-hidden">Search these places</span>
            <input
              type="search"
              placeholder="Search name, dish, tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="places-sort">
            <span className="visually-hidden">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="rating">Rating</option>
            </select>
          </label>
        </div>
      </header>

      {shown.length ? (
        <ul className="places-list">
          {shown.map((p) => {
            const rating = ratingOf(p, shared)
            const meta = [p.kind, p.cuisine].filter(Boolean).join(' · ')
            const when =
              p.status === 'visited'
                ? `Visited ${p.visitedAt ? formatDate(p.visitedAt) : ''}${shared && p.visitedByName ? ` by ${p.visitedByName}` : ''}`
                : `Added ${formatDate(p.addedAt)}${shared && p.addedByName ? ` by ${p.addedByName}` : ''}`
            return (
              <li key={p.id}>
                <button className="place-row" onClick={() => onOpen(p.id)}>
                  <span className={`place-badge badge-${p.status}`} aria-hidden />
                  <span className="place-row-text">
                    <span className="place-row-name">{p.name}</span>
                    {meta && <span className="place-row-meta">{meta}</span>}
                    {p.tags && p.tags.length > 0 && (
                      <span className="place-row-tags">
                        {p.tags.map((t) => (
                          <span key={t} className="tag tag-small">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="place-row-meta">
                      <span className="visually-hidden">{p.status === 'visited' ? 'Visited. ' : 'On the wishlist. '}</span>
                      {when}
                    </span>
                  </span>
                  {rating !== undefined && (
                    <span className="place-row-rating">
                      <Stars value={Math.round(rating)} size={13} />
                      <span>{rating.toFixed(shared ? 1 : 0)}</span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="places-empty">
          {places.length === 0
            ? 'Nothing saved here yet. On the map, tap a restaurant and choose Wishlist or Been here.'
            : 'No places match. Try another search or filter.'}
        </p>
      )}
    </section>
  )
}
