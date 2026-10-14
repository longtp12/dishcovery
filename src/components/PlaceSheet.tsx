import { useEffect, useRef, useState } from 'react'
import { googleMapsUrl } from '../osm'
import type { Place, PlaceInfo, PlaceStatus } from '../places'
import { BookmarkIcon, CheckIcon, ClockIcon, CloseIcon, DirectionsIcon, PinIcon, TrashIcon } from './Icons'

interface Props {
  /** The place being shown: a saved place, or an unsaved one. */
  place: Place | PlaceInfo
  /** True for a pin the user dropped themselves (needs a name). */
  custom: boolean
  loadingDetails: boolean
  onSave: (status: PlaceStatus, name: string) => void
  onRemove: () => void
  onClose: () => void
}

const isSaved = (p: Place | PlaceInfo): p is Place => 'status' in p

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PlaceSheet({ place, custom, loadingDetails, onSave, onRemove, onClose }: Props) {
  const saved = isSaved(place) ? place : null
  const [name, setName] = useState(custom ? '' : place.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const placeKey = saved?.id ?? `${place.lat},${place.lng}`

  useEffect(() => {
    setName(custom ? '' : place.name)
    if (custom) setTimeout(() => inputRef.current?.focus(), 250)
    // Reset only when a different place is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, custom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmed = name.trim()
  const canSave = trimmed.length > 0
  const meta = [place.kind, place.cuisine].filter(Boolean).join(' · ')

  return (
    <section className="sheet" aria-label={place.name || 'New place'}>
      <div className="sheet-grip" aria-hidden />
      <div className="sheet-head">
        <div className="sheet-title-wrap">
          {custom && !saved ? (
            <input
              ref={inputRef}
              className="sheet-name-input"
              placeholder="Name this place"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSave && onSave('wishlist', trimmed)}
              aria-label="Place name"
            />
          ) : (
            <h2 className="sheet-title">{place.name}</h2>
          )}
          {meta ? (
            <p className="sheet-meta">{meta}</p>
          ) : (
            loadingDetails && <p className="sheet-meta skeleton">Loading details…</p>
          )}
        </div>
        <button className="sheet-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {(place.address || place.openingHours) && (
        <ul className="sheet-facts">
          {place.address && (
            <li>
              <PinIcon />
              <span>{place.address}</span>
            </li>
          )}
          {place.openingHours && (
            <li>
              <ClockIcon />
              <span>{place.openingHours}</span>
            </li>
          )}
        </ul>
      )}

      {saved && (
        <p className="sheet-status">
          {saved.status === 'visited' && saved.visitedAt
            ? `Visited · ${formatDate(saved.visitedAt)}`
            : `On your wishlist since ${formatDate(saved.addedAt)}`}
        </p>
      )}

      <div className="sheet-actions">
        <button
          className={`status-btn status-wishlist${saved?.status === 'wishlist' ? ' is-on' : ''}`}
          disabled={!canSave}
          aria-pressed={saved?.status === 'wishlist'}
          onClick={() => onSave('wishlist', trimmed)}
        >
          <BookmarkIcon size={18} />
          {saved?.status === 'wishlist' ? 'On wishlist' : 'Wishlist'}
        </button>
        <button
          className={`status-btn status-visited${saved?.status === 'visited' ? ' is-on' : ''}`}
          disabled={!canSave}
          aria-pressed={saved?.status === 'visited'}
          onClick={() => onSave('visited', trimmed)}
        >
          <CheckIcon size={18} />
          {saved?.status === 'visited' ? 'Visited' : 'Been here'}
        </button>
      </div>

      <div className="sheet-links">
        <a href={googleMapsUrl(place)} target="_blank" rel="noreferrer">
          <DirectionsIcon />
          Open in Google Maps
        </a>
        {saved && (
          <button className="link-danger" onClick={onRemove}>
            <TrashIcon />
            Remove
          </button>
        )}
      </div>
    </section>
  )
}
