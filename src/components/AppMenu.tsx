import { useEffect, useRef, useState } from 'react'
import type { CloudUser } from '../cloud'
import type { SyncState } from '../places'
import { THEMES, THEME_IDS, type ThemeId } from '../themes'
import { CheckIcon, CloudIcon, PaletteIcon, UserIcon } from './Icons'

interface CloudProps {
  enabled: boolean
  ready: boolean
  user: CloudUser | null
  syncState: SyncState
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

interface Props {
  theme: ThemeId
  onTheme: (id: ThemeId) => void
  cloud: CloudProps
  placeCount: number
}

const SYNC_LABEL: Record<SyncState, string> = {
  local: 'Saved on this device',
  connecting: 'Connecting…',
  synced: 'Synced to your account',
  offline: 'Offline · changes will sync when you’re back online',
}

function Avatar({ user, size }: { user: CloudUser; size: number }) {
  const [broken, setBroken] = useState(false)
  const initial = (user.name ?? user.email ?? '?').trim().charAt(0).toUpperCase()
  return user.photoURL && !broken ? (
    <img
      className="avatar"
      src={user.photoURL}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="avatar avatar-initial" style={{ width: size, height: size }} aria-hidden>
      {initial}
    </span>
  )
}

/** Top-right menu: account / sync and map style. */
export default function AppMenu({ theme, onTheme, cloud, placeCount }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user } = cloud

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

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="switcher" ref={ref}>
      <button
        className={`icon-btn menu-btn${user ? ' has-avatar' : ''}`}
        aria-label={user ? 'Account and style' : 'Change style'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {user ? <Avatar user={user} size={34} /> : cloud.enabled ? <UserIcon /> : <PaletteIcon />}
        {cloud.enabled && !user && placeCount > 0 && <span className="menu-dot" aria-hidden />}
      </button>
      {open && (
        <div className="switcher-menu" role="menu">
          {cloud.enabled && (
            <div className="account">
              {user ? (
                <>
                  <div className="account-row">
                    <Avatar user={user} size={40} />
                    <div className="account-text">
                      <div className="account-name">{user.name ?? 'Signed in'}</div>
                      {user.email && <div className="account-email">{user.email}</div>}
                    </div>
                  </div>
                  <div className={`sync-status sync-${cloud.syncState}`}>
                    <CloudIcon />
                    {SYNC_LABEL[cloud.syncState]}
                  </div>
                  <button className="account-btn secondary" disabled={busy} onClick={run(cloud.signOut)}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p className="account-pitch">
                    Sign in to keep your places safe in your Google account and see them on all your devices.
                  </p>
                  <button
                    className="account-btn google"
                    disabled={busy || !cloud.ready}
                    onClick={run(cloud.signIn)}
                  >
                    <GoogleMark />
                    Sign in with Google
                  </button>
                  <div className="sync-status sync-local">
                    <CloudIcon />
                    {placeCount > 0
                      ? `${placeCount} place${placeCount === 1 ? '' : 's'} saved on this device only`
                      : 'Places are saved on this device until you sign in'}
                  </div>
                </>
              )}
            </div>
          )}
          <div className="switcher-title">Style</div>
          {THEME_IDS.map((id) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={id === theme}
              className="switcher-item"
              onClick={() => {
                onTheme(id)
                setOpen(false)
              }}
            >
              <span className={`swatch swatch-${id}`} aria-hidden />
              <span className="switcher-label">{THEMES[id].label}</span>
              {id === theme && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Google "G" mark for the sign-in button (brand guidelines ask for the colored logo). */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
