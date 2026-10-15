import { useEffect, useState } from 'react'
import { REVIEW_MAX } from '../places'

export interface ReviewValue {
  rating?: number
  text?: string
}

export interface OtherReview {
  name: string
  rating: number
  text?: string
}

interface Props {
  /** Resets the editor when a different place is shown. */
  placeKey: string
  mine: ReviewValue
  /** Shared lists: the other members' reviews. Undefined in your own places. */
  others?: OtherReview[]
  onChange: (review: { rating: number; text?: string } | null) => void
}

export function Stars({ value, onPick, size = 26 }: { value: number; onPick?: (n: number) => void; size?: number }) {
  return (
    <span className={`stars${onPick ? ' is-input' : ''}`} role={onPick ? 'radiogroup' : 'img'} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <path
              d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"
              fill={n <= value ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )
        return onPick ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className={n <= value ? 'is-on' : ''}
            onClick={() => onPick(n)}
          >
            {star}
          </button>
        ) : (
          <span key={n} className={n <= value ? 'is-on' : ''}>
            {star}
          </span>
        )
      })}
    </span>
  )
}

/** Your star rating and short review of a saved place, plus (in shared lists) everyone else's. */
export default function ReviewBox({ placeKey, mine, others, onChange }: Props) {
  const rating = mine.rating ?? 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(mine.text ?? '')

  useEffect(() => {
    setEditing(false)
    setDraft(mine.text ?? '')
    // Reset only when a different place is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey])

  const pick = (n: number) => {
    // Tapping your current rating again clears it, unless that would also throw away a written review.
    if (n === rating && !mine.text) onChange(null)
    else onChange({ rating: n, text: mine.text })
  }

  const saveText = () => {
    if (rating) onChange({ rating, text: draft })
    setEditing(false)
  }

  const avg = others?.length
    ? [...others.map((o) => o.rating), ...(rating ? [rating] : [])]
    : []

  return (
    <div className="review">
      <div className="review-head">
        <span className="review-label">
          Your rating
          {!others && <span className="review-private"> · only you see this</span>}
        </span>
        <Stars value={rating} onPick={pick} />
      </div>

      {editing ? (
        <div className="review-edit">
          <textarea
            value={draft}
            maxLength={REVIEW_MAX}
            rows={3}
            autoFocus
            placeholder="What was good? What to order?"
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Your review"
          />
          <div className="review-edit-actions">
            <span className="review-count">
              {draft.length}/{REVIEW_MAX}
            </span>
            {mine.text && (
              <button
                className="link-btn danger"
                onClick={() => {
                  onChange({ rating })
                  setDraft('')
                  setEditing(false)
                }}
              >
                Delete review
              </button>
            )}
            <button className="link-btn" onClick={() => (setDraft(mine.text ?? ''), setEditing(false))}>
              Cancel
            </button>
            <button className="account-btn primary review-save" onClick={saveText}>
              Save
            </button>
          </div>
        </div>
      ) : mine.text ? (
        <p className="review-text">
          “{mine.text}”{' '}
          <button className="link-btn" onClick={() => (setDraft(mine.text ?? ''), setEditing(true))}>
            Edit
          </button>
        </p>
      ) : (
        rating > 0 && (
          <button className="link-btn review-add" onClick={() => setEditing(true)}>
            + Add a short review
          </button>
        )
      )}

      {others && others.length > 0 && (
        <div className="review-others">
          <div className="review-summary">
            <Stars value={Math.round(avg.reduce((a, b) => a + b, 0) / avg.length)} size={14} />
            <span>
              {(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1)} · {avg.length} rating{avg.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul>
            {others.map((o) => (
              <li key={o.name + o.rating + (o.text ?? '')}>
                <div className="review-who">
                  <span>{o.name}</span>
                  <Stars value={o.rating} size={13} />
                </div>
                {o.text && <p>{o.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
