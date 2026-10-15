import { useEffect, useMemo, useState } from 'react'
import { MAX_TAGS, TAG_MAX_LENGTH, normalizeTag } from '../places'
import { fold } from '../text'
import { CloseIcon } from './Icons'

interface Props {
  /** Resets the editor when a different place is shown. */
  placeKey: string
  tags: string[]
  /** Tags to offer, best first (matching the place's cuisine, then ones you use, then defaults). */
  suggestions: string[]
  /** True for a shared list: say that members see the tags. */
  shared: boolean
  onChange: (tags: string[]) => void
}

/** A saved place's tags: chips you can remove, and an input with tap-to-add suggestions. */
export default function TagEditor({ placeKey, tags, suggestions, shared, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setAdding(false)
    setDraft('')
  }, [placeKey])

  const full = tags.length >= MAX_TAGS
  const offer = useMemo(() => {
    const q = fold(draft.trim())
    return suggestions.filter((s) => !tags.includes(s) && (!q || fold(s).includes(q))).slice(0, 8)
  }, [suggestions, tags, draft])

  const add = (raw: string) => {
    const t = normalizeTag(raw)
    if (!t || tags.includes(t) || full) return
    onChange([...tags, t])
    setDraft('')
  }

  return (
    <div className="tags" aria-label={shared ? 'Tags (shared with the list)' : 'Tags'} role="group">
      <ul className="tag-list">
        {tags.map((t) => (
          <li key={t} className="tag">
            <span>{t}</span>
            <button aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              <CloseIcon size={13} />
            </button>
          </li>
        ))}
        {!adding && !full && (
          <li>
            <button className="tag tag-add" onClick={() => setAdding(true)}>
              + {tags.length ? 'Tag' : 'Add tags'}
            </button>
          </li>
        )}
      </ul>

      {adding && (
        <div className="tag-edit">
          <label className="visually-hidden" htmlFor="tag-input">
            New tag
          </label>
          <input
            id="tag-input"
            autoFocus
            autoCapitalize="none"
            enterKeyHint="done"
            maxLength={TAG_MAX_LENGTH}
            placeholder={full ? `Up to ${MAX_TAGS} tags` : 'e.g. korean, drinks, fancy'}
            disabled={full}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add(draft)
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setAdding(false)
              }
            }}
          />
          <button className="link-btn" onClick={() => (draft.trim() ? add(draft) : setAdding(false))}>
            {draft.trim() ? 'Add' : 'Done'}
          </button>
          {offer.length > 0 && !full && (
            <div className="tag-suggest" aria-label="Suggestions">
              {offer.map((s) => (
                <button key={s} className="tag tag-suggestion" onClick={() => add(s)}>
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
