export type ThemeId = 'fresh' | 'night' | 'pop' | 'lavender' | 'mint' | 'strawberry'

export interface ThemeConfig {
  id: ThemeId
  label: string
  themeColor: string
  tiles: { url: string; attribution: string; subdomains?: string }
}

const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

// All styles use free OpenStreetMap tiles (CARTO basemaps now require an API key).
// Night and Pop restyle the same tiles with a CSS filter on the tile pane (see index.css).
export const THEMES: Record<ThemeId, ThemeConfig> = {
  fresh: { id: 'fresh', label: 'Fresh', themeColor: '#F6F7F5', tiles: OSM_TILES },
  night: { id: 'night', label: 'Night', themeColor: '#121417', tiles: OSM_TILES },
  pop: { id: 'pop', label: 'Pop', themeColor: '#FFF4D6', tiles: OSM_TILES },
  // Pastel styles.
  lavender: { id: 'lavender', label: 'Lavender', themeColor: '#FBF7FF', tiles: OSM_TILES },
  mint: { id: 'mint', label: 'Mint', themeColor: '#F2FBF7', tiles: OSM_TILES },
  strawberry: { id: 'strawberry', label: 'Strawberry', themeColor: '#FFF6F8', tiles: OSM_TILES },
}

export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

const STORAGE_KEY = 'dishcovery.theme'

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in THEMES) return saved as ThemeId
  } catch {
    // storage unavailable (private mode etc.)
  }
  return 'fresh'
}

export function saveTheme(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore
  }
}
