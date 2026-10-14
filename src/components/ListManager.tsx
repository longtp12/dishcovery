import { useEffect, useState } from 'react'
import type { CloudUser } from '../cloud'
import { normalizeEmails, type PlaceList } from '../places'
import { CloseIcon } from './Icons'

interface Props {
  /** The list to show; null to create a new one. */
  list: PlaceList | null
  user: CloudUser
  onCreate: (name: string, emails: string[]) => void
  onSave: (id: string, patch: { name?: string; memberEmails?: string[] }) => void
  onLeave: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_MEMBERS = 50

/** Create a shared list, or rename it and manage who's in it (owner); members can view and leave. */
export default function ListManager({ list, user, onCreate, onSave, onLeave, onDelete, onClose }: Props) {
  const isOwner = !list || list.ownerUid === user.uid
  const myEmail = user.email?.toLowerCase() ?? ''
  const [name, setName] = useState(list?.name ?? '')
  const [emails, setEmails] = useState<string[]>(() =>
    (list?.memberEmails ?? []).filter((e) => e !== myEmail || !isOwner),
  )
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const addDraft = () => {
    const found = normalizeEmails(draft.split(/[\s,;]+/))
    if (!found.length) return true
    const bad = found.find((e) => !EMAIL.test(e))
    if (bad) {
      setError(`“${bad}” doesn’t look like an email address.`)
      return false
    }
    const next = normalizeEmails([...emails, ...found]).filter((e) => e !== myEmail)
    if (next.length + 1 > MAX_MEMBERS) {
      setError(`A list can have up to ${MAX_MEMBERS} people.`)
      return false
    }
    setEmails(next)
    setDraft('')
    setError(null)
    return true
  }

  const trimmed = name.trim()
  const submit = () => {
    if (!trimmed || !addDraft()) return
    // Typed but not yet added emails count too.
    const pending = normalizeEmails(draft.split(/[\s,;]+/)).filter((e) => EMAIL.test(e))
    const all = normalizeEmails([...emails, ...pending]).filter((e) => e !== myEmail)
    if (!list) onCreate(trimmed, all)
    else {
      const memberEmails = normalizeEmails([myEmail, ...all])
      const changedMembers =
        memberEmails.length !== list.memberEmails.length || memberEmails.some((e) => !list.memberEmails.includes(e))
      const patch = {
        ...(trimmed !== list.name ? { name: trimmed } : {}),
        ...(changedMembers ? { memberEmails } : {}),
      }
      if (Object.keys(patch).length) onSave(list.id, patch)
    }
    onClose()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname)
      setCopied(true)
    } catch {
      setError('Couldn’t copy. Share the address from your browser instead.')
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={list ? list.name : 'New shared list'}>
        <div className="modal-head">
          <h2>{list ? (isOwner ? 'Manage list' : list.name) : 'New shared list'}</h2>
          <button className="sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {isOwner ? (
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              maxLength={80}
              placeholder="e.g. Hanoi date spots"
              autoFocus={!list}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : (
          <p className="modal-note">Shared by {list?.ownerName}. Everyone in the list can add places and mark them visited.</p>
        )}

        <div className="field">
          <span>People</span>
          <ul className="member-list">
            {isOwner && (
              <li>
                <span className="member-email">{myEmail || 'You'}</span>
                <span className="member-tag">you · owner</span>
              </li>
            )}
            {emails.map((e) => (
              <li key={e}>
                <span className="member-email">{e}</span>
                {e === myEmail ? (
                  <span className="member-tag">you</span>
                ) : (
                  isOwner && (
                    <button
                      className="member-remove"
                      aria-label={`Remove ${e}`}
                      onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                    >
                      <CloseIcon size={16} />
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="member-add">
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                placeholder="Invite by Google email"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && addDraft()}
              />
              <button className="account-btn secondary" onClick={addDraft} disabled={!draft.trim()}>
                Add
              </button>
            </div>
          )}
          {error && <p className="modal-error">{error}</p>}
          {isOwner && (
            <p className="modal-note">
              They’ll see this list after signing in to Dishcovery with that Google account.{' '}
              <button className="link-btn" onClick={copyLink}>
                {copied ? 'Link copied' : 'Copy app link'}
              </button>
            </p>
          )}
        </div>

        <div className="modal-actions">
          {list &&
            (isOwner ? (
              <button
                className="link-btn danger"
                onClick={() => {
                  if (confirm(`Delete “${list.name}” and its places for everyone?`)) {
                    onDelete(list.id)
                    onClose()
                  }
                }}
              >
                Delete list
              </button>
            ) : (
              <button
                className="link-btn danger"
                onClick={() => {
                  if (confirm(`Leave “${list.name}”? You’ll need a new invite to rejoin.`)) {
                    onLeave(list.id)
                    onClose()
                  }
                }}
              >
                Leave list
              </button>
            ))}
          {isOwner && (
            <button className="account-btn primary" disabled={!trimmed} onClick={submit}>
              {list ? 'Save' : 'Create list'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
