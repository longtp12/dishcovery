import { useEffect, useRef, useState } from 'react'
import { THEMES, THEME_IDS, type ThemeId } from '../themes'
import { CheckIcon, PaletteIcon } from './Icons'

interface Props {
  value: ThemeId
  onChange: (id: ThemeId) => void
}

export default function StyleSwitcher({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div className="switcher" ref={ref}>
      <button
        className="icon-btn"
        aria-label="Change style"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <PaletteIcon />
      </button>
      {open && (
        <div className="switcher-menu" role="menu">
          <div className="switcher-title">Style</div>
          {THEME_IDS.map((id) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={id === value}
              className="switcher-item"
              onClick={() => {
                onChange(id)
                setOpen(false)
              }}
            >
              <span className={`swatch swatch-${id}`} aria-hidden />
              <span className="switcher-label">{THEMES[id].label}</span>
              {id === value && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
