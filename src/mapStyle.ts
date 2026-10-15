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
  /** Restaurant / café dots from OpenStreetMap. */
  food: string
  foodStroke: string
  foodLabel: string
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
    food: '#E07A2E',
    foodStroke: '#FFFFFF',
    foodLabel: '#8A4A16',
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
    food: '#F5A524',
    foodStroke: '#121417',
    foodLabel: '#E2B567',
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
    food: '#FF5C8A',
    foodStroke: '#111111',
    foodLabel: '#111111',
  },
  // Lavender (pastel): lavender paper, mint parks, baby-blue water, blush buildings, plum ink.
  lavender: {
    bg: '#FBF7FF',
    residential: '#F5EFFF',
    park: '#CDF3DD',
    wood: '#BCEBD0',
    water: '#C6E7FF',
    building: '#F7ECF7',
    buildingOutline: '#EEDDEF',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    roadCasing: '#DCD2F7',
    motorway: '#FFD9C2',
    motorwayCasing: '#F5B796',
    rail: '#CFC5EC',
    boundary: '#B9ABE0',
    label: '#2F2A4A',
    roadLabel: '#6B6488',
    waterLabel: '#4A7CC4',
    halo: '#FBF7FF',
    food: '#FF7EB3',
    foodStroke: '#FFFFFF',
    foodLabel: '#B8437A',
  },
  // Mint (pastel): mint-white paper, periwinkle buildings, coral dots, deep-teal ink.
  mint: {
    bg: '#F2FBF7',
    residential: '#EAF7F1',
    park: '#BFEFD6',
    wood: '#AEE6C8',
    water: '#BDE6FF',
    building: '#E6F0FB',
    buildingOutline: '#D3E3F2',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    roadCasing: '#C4E8DA',
    motorway: '#FFE3BF',
    motorwayCasing: '#F4C38A',
    rail: '#BFD9D0',
    boundary: '#9CCDBD',
    label: '#1F3B44',
    roadLabel: '#5C7A80',
    waterLabel: '#3E7FB0',
    halo: '#F2FBF7',
    food: '#FF8A80',
    foodStroke: '#FFFFFF',
    foodLabel: '#C2554C',
  },
  // Strawberry (pastel): pink-white paper, blush buildings, lavender dots, berry ink.
  strawberry: {
    bg: '#FFF6F8',
    residential: '#FFEFF3',
    park: '#D6F2D9',
    wood: '#C6EBCB',
    water: '#CDE6FF',
    building: '#FBEEF3',
    buildingOutline: '#F3DFE7',
    roadMinor: '#FFFFFF',
    roadMajor: '#FFFFFF',
    roadCasing: '#F6CFDC',
    motorway: '#FFE0C7',
    motorwayCasing: '#F5BE9A',
    rail: '#E8C9D6',
    boundary: '#D9A9BE',
    label: '#4A2340',
    roadLabel: '#8A6680',
    waterLabel: '#4C7FC4',
    halo: '#FFF6F8',
    food: '#8E7BF2',
    foodStroke: '#FFFFFF',
    foodLabel: '#6A55D8',
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

export const FOOD_LAYER_IDS = ['dish-food-dot', 'dish-food-label']
export const FOOD_CLASSES = ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery']

/** Restaurant, café and bar points from the vector tiles' POI layer. */
function foodLayers(p: MapPalette, visible: boolean): LayerSpecification[] {
  const filter: ExpressionSpecification = [
    'all',
    ['==', ['geometry-type'], 'Point'],
    ['has', 'name'],
    ['in', ['get', 'class'], ['literal', FOOD_CLASSES]],
  ]
  return [
    {
      id: 'dish-food-dot',
      type: 'circle',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 14,
      filter,
      layout: { visibility: visible ? 'visible' : 'none' },
      paint: {
        'circle-color': p.food,
        // Small and soft when zoomed out (dense streets get busy), full-size up close.
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 15.5, 2.6, 16.5, 4.5, 18, 6.5],
        'circle-stroke-color': p.foodStroke,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 16, 1.5, 17, 2],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 16, 1],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 16, 1],
      },
    },
    {
      id: 'dish-food-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 16,
      filter,
      layout: {
        'text-field': LOCAL_NAME,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10.5, 18, 12.5],
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
        'text-max-width': 8,
        'text-optional': true,
        visibility: visible ? 'visible' : 'none',
      },
      paint: {
        'text-color': p.foodLabel,
        'text-halo-color': p.halo,
        'text-halo-width': 1.4,
      },
    },
  ]
}

export function themedStyle(base: StyleSpecification, theme: ThemeId, showFood = true): StyleSpecification {
  const palette = PALETTES[theme]
  const layers = base.layers.map((layer) => {
    const paint = paintFor(layer.id, layer.type, palette)
    const next = paint ? { ...layer, paint: { ...layer.paint, ...paint } } : { ...layer }
    if (layer.type === 'symbol' && layer.layout?.['text-field'] && !layer.id.includes('shield')) {
      next.layout = { ...layer.layout, 'text-field': LOCAL_NAME }
    }
    return next as LayerSpecification
  })
  // Food sits above roads/buildings but below place labels.
  const firstLabel = layers.findIndex((l) => l.id.startsWith('label_'))
  const at = firstLabel === -1 ? layers.length : firstLabel
  return {
    ...base,
    layers: [...layers.slice(0, at), ...foodLayers(palette, showFood), ...layers.slice(at)],
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
