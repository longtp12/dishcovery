import { useEffect, useRef, useState } from 'react'
import { MINE, type PlaceList, type Scope } from '../places'
import { CheckIcon, PeopleIcon } from './Icons'

interface Props {
  lists: PlaceList[]
  scope: Scope
  uid: string
  onScope: (scope: Scope) => void
  onNew: () => void
  onManage: (id: string) => void
}

/** Chooses which places the map shows: your own, or one of your shared lists. */
export default function ListSwitcher({ lists, scope, uid, onScope, onNew, onManage }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = lists.find((l) => l.id === scope)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const pick = (s: Scope) => {
    onScope(s)
    setOpen(false)
  }

  return (
    <div className="list-switcher" ref={ref}>
      <button
        className={`chip list-chip${active ? ' is-shared' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {active && <PeopleIcon size={15} />}
        <span className="list-chip-label">{active ? active.name : 'My places'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="switcher-menu list-menu" role="menu">
          <button role="menuitemradio" aria-checked={scope === MINE} className="switcher-item" onClick={() => pick(MINE)}>
            <span className="switcher-label">My places</span>
            {scope === MINE && <CheckIcon />}
          </button>
          {lists.length > 0 && <div className="switcher-title">Shared lists</div>}
          {lists.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={scope === l.id}
              className="switcher-item"
              onClick={() => pick(l.id)}
            >
              <span className="switcher-label">
                {l.name}
                <span className="list-sub">
                  {l.ownerUid === uid ? 'You' : l.ownerName} ·{' '}
                  {l.memberEmails.length} {l.memberEmails.length === 1 ? 'person' : 'people'}
                </span>
              </span>
              {scope === l.id && <CheckIcon />}
            </button>
          ))}
          <div className="list-menu-actions">
            {active && (
              <button
                className="account-btn secondary"
                onClick={() => {
                  setOpen(false)
                  onManage(active.id)
                }}
              >
                {active.ownerUid === uid ? 'Manage list' : 'List details'}
              </button>
            )}
            <button
              className="account-btn secondary"
              onClick={() => {
                setOpen(false)
                onNew()
              }}
            >
              + New shared list
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
