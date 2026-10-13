import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'
import type { ThemeId } from './themes'

// Free, key-less vector tiles from OpenFreeMap. We load their minimal "Positron"
// style once and recolour it per theme so the map matches the app chrome.
export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

export interface MapPalette {
  bg: string
  residential: string
  park: string
  wood: string
  water: string
  building: string
  buildingOutline: string
  roadMinor: string
  roadMajor: string
  roadCasing: string
  motorway: string
  motorwayCasing: string
  rail: string
  boundary: string
  label: string
  roadLabel: string
  waterLabel: string
  halo: string
}

export const PALETTES: Record<ThemeId, MapPalette> = {
  fresh: {
    bg: '#EFF1EC',
    residential: '#EBEDE7',
    park: '#D5E9D3',
    wood: '#CDE4CB',
    water: '#BFE0E4',
    building: '#E3E6DF',
    buildingOutline: '#D7DBD3',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    roadCasing: '#DCE0D9',
    motorway: '#FCE6CC',
    motorwayCasing: '#F0CFA8',
    rail: '#D5D9D2',
    boundary: '#B9BFBA',
    label: '#2C3832',
    roadLabel: '#6E7872',
    waterLabel: '#3F7C86',
    halo: '#F6F7F5',
  },
  night: {
    bg: '#15181B',
    residential: '#181B1F',
    park: '#18241F',
    wood: '#17221D',
    water: '#123540',
    building: '#1E2227',
    buildingOutline: '#252A30',
    roadMinor: '#22272C',
    roadMajor: '#2B3137',
    roadCasing: '#15181B',
    motorway: '#4A3B1F',
    motorwayCasing: '#2B2416',
    rail: '#2A2F35',
    boundary: '#3A4047',
    label: '#C8CCD1',
    roadLabel: '#7F868D',
    waterLabel: '#5D8EA0',
    halo: '#121417',
  },
  pop: {
    bg: '#FFF4D6',
    residential: '#FFEFC9',
    park: '#BCE7A6',
    wood: '#ABDD95',
    water: '#94D4FF',
    building: '#FFE2AA',
    buildingOutline: '#E7C27F',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    roadCasing: '#111111',
    motorway: '#FF8A3D',
    motorwayCasing: '#111111',
    rail: '#111111',
    boundary: '#111111',
    label: '#111111',
    roadLabel: '#333333',
    waterLabel: '#1F4FD8',
    halo: '#FFF4D6',
  },
}

type Paint = Record<string, unknown>

function paintFor(id: string, type: LayerSpecification['type'], p: MapPalette): Paint | null {
  if (type === 'background') return { 'background-color': p.bg }
  if (type === 'symbol') {
    if (id.includes('shield')) return null
    const color = id.startsWith('water')
      ? p.waterLabel
      : id.startsWith('highway-name')
        ? p.roadLabel
        : p.label
    return { 'text-color': color, 'text-halo-color': p.halo }
  }
  if (id === 'park') return { 'fill-color': p.park }
  if (id === 'landcover_wood') return { 'fill-color': p.wood }
  if (id === 'landuse_residential') return { 'fill-color': p.residential }
  if (id.startsWith('landcover_') || id.startsWith('road_area') || id === 'road_pier') {
    return { [`${type}-color`]: p.bg }
  }
  if (id === 'water') return { 'fill-color': p.water }
  if (id === 'waterway') return { 'line-color': p.water }
  if (id === 'building') return { 'fill-color': p.building, 'fill-outline-color': p.buildingOutline }
  if (id.startsWith('aeroway')) return { [`${type}-color`]: p.roadMinor }
  if (id.startsWith('boundary')) return { 'line-color': p.boundary }
  if (id.startsWith('railway')) return { 'line-color': id.endsWith('dashline') ? p.bg : p.rail }
  if (id.includes('motorway')) {
    return { 'line-color': id.includes('casing') ? p.motorwayCasing : p.motorway }
  }
  if (id.includes('casing')) return { 'line-color': p.roadCasing }
  if (id.includes('major')) return { 'line-color': p.roadMajor }
  if (id === 'highway_minor' || id === 'highway_path') return { 'line-color': p.roadMinor }
  return null
}

// Show places in their local language (e.g. "Hà Nội" rather than "Hanoi"), like Google Maps.
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name_en']]

export function themedStyle(base: StyleSpecification, theme: ThemeId): StyleSpecification {
  const palette = PALETTES[theme]
  return {
    ...base,
    layers: base.layers.map((layer) => {
      const paint = paintFor(layer.id, layer.type, palette)
      const next = paint ? { ...layer, paint: { ...layer.paint, ...paint } } : { ...layer }
      if (layer.type === 'symbol' && layer.layout?.['text-field'] && !layer.id.includes('shield')) {
        next.layout = { ...layer.layout, 'text-field': LOCAL_NAME }
      }
      return next as LayerSpecification
    }),
  }
}

let baseStyle: Promise<StyleSpecification> | null = null

export function loadBaseStyle(): Promise<StyleSpecification> {
  baseStyle ??= fetch(BASE_STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`Map style request failed: ${r.status}`)
    return r.json() as Promise<StyleSpecification>
  })
  baseStyle.catch(() => (baseStyle = null))
  return baseStyle
}
