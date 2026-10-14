import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L, { type LatLngTuple, type Map as LeafletMap } from 'leaflet'
import type { Map as GLMap } from 'maplibre-gl'
import { FOOD_LAYER_IDS } from '../mapStyle'
import { featureToPlace } from '../mapFeatures'
import type { Place, PlaceInfo } from '../places'
import type { ThemeConfig } from '../themes'

// MapLibre is large, so load it in its own chunk after the app shell renders.
const VectorBasemap = lazy(() => import('./VectorBasemap'))

// Used until (or if) the browser shares a location: Hanoi centre (Hoàn Kiếm Lake).
const FALLBACK_CENTER: LatLngTuple = [21.0285, 105.8542]
const FALLBACK_ZOOM = 15 // restaurant data starts at this zoom
const LOCATED_ZOOM = 16

const meIcon = L.divIcon({
  className: 'me-marker',
  html: '<span class="me-pulse"></span><span class="me-dot"></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

const PIN_SVG = {
  wishlist:
    '<path d="M8 4.5h8v15l-4-2.7-4 2.7z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  visited:
    '<path d="m6.5 12.5 3.6 3.6 7.4-8.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  new: '<path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
}

function pinIcon(kind: keyof typeof PIN_SVG, selected: boolean) {
  return L.divIcon({
    className: `pin pin-${kind}${selected ? ' is-selected' : ''}`,
    html: `<span class="pin-body"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${PIN_SVG[kind]}</svg></span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
  })
}

export interface FocusRequest {
  lat: number
  lng: number
  zoom?: number
  /** Changes whenever a new fly-to is requested, even to the same spot. */
  key: number
}

function Interactions({
  glRef,
  onPickFeature,
  onLongPress,
  onBackgroundClick,
}: {
  glRef: React.RefObject<GLMap | null>
  onPickFeature: (place: PlaceInfo) => void
  onLongPress: (lat: number, lng: number) => void
  onBackgroundClick: () => void
}) {
  useMapEvents({
    click(e) {
      const gl = glRef.current
      if (gl) {
        const p = gl.project([e.latlng.lng, e.latlng.lat])
        const pad = 14
        const layers = FOOD_LAYER_IDS.filter((id) => gl.getLayer(id))
        const hits = layers.length
          ? gl.queryRenderedFeatures(
              [
                [p.x - pad, p.y - pad],
                [p.x + pad, p.y + pad],
              ],
              { layers },
            )
          : []
        // Closest named feature to the tap.
        const best = hits
          .map(featureToPlace)
          .filter((x): x is PlaceInfo => x !== null)
          .sort(
            (a, b) =>
              e.latlng.distanceTo([a.lat, a.lng]) - e.latlng.distanceTo([b.lat, b.lng]),
          )[0]
        if (best) {
          onPickFeature(best)
          return
        }
      }
      onBackgroundClick()
    },
    contextmenu(e) {
      e.originalEvent.preventDefault()
      onLongPress(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ position, focus }: { position: LatLngTuple | null; focus: FocusRequest | null }) {
  const map = useMap()
  const last = useRef<LatLngTuple | null>(null)
  useEffect(() => {
    if (position && position !== last.current) {
      last.current = position
      map.flyTo(position, Math.max(map.getZoom(), LOCATED_ZOOM), { duration: 1.1, easeLinearity: 0.2 })
    }
  }, [map, position])
  useEffect(() => {
    if (!focus) return
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), focus.zoom ?? 17), { duration: 0.9 })
  }, [map, focus])
  return null
}

function Ready({ onMap }: { onMap: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onMap(map)
  }, [map, onMap])
  return null
}

interface Props {
  theme: ThemeConfig
  showFood: boolean
  position: LatLngTuple | null
  places: Place[]
  selectedId: string | null
  /** An unsaved place being looked at (tapped restaurant, search result, dropped pin). */
  candidate: PlaceInfo | null
  focus: FocusRequest | null
  onSelectPlace: (id: string) => void
  onPickFeature: (place: PlaceInfo) => void
  onLongPress: (lat: number, lng: number) => void
  onBackgroundClick: () => void
  onMap: (map: LeafletMap) => void
  onGL?: (gl: GLMap | null) => void
}

export default function MapView({
  theme,
  showFood,
  position,
  places,
  selectedId,
  candidate,
  focus,
  onSelectPlace,
  onPickFeature,
  onLongPress,
  onBackgroundClick,
  onMap,
  onGL,
}: Props) {
  const glRef = useRef<GLMap | null>(null)
  const onGLReady = useCallback((gl: GLMap | null) => {
    glRef.current = gl
    onGL?.(gl)
  }, [onGL])

  const icons = useMemo(
    () => ({
      wishlist: pinIcon('wishlist', false),
      visited: pinIcon('visited', false),
      wishlistSel: pinIcon('wishlist', true),
      visitedSel: pinIcon('visited', true),
      new: pinIcon('new', true),
    }),
    [],
  )

  return (
    <MapContainer
      className="map"
      center={position ?? FALLBACK_CENTER}
      zoom={position ? LOCATED_ZOOM : FALLBACK_ZOOM}
      zoomControl={false}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={90}
      maxZoom={19}
      minZoom={3}
      tapHold
      attributionControl
    >
      <Suspense fallback={null}>
        <VectorBasemap theme={theme} showFood={showFood} onReady={onGLReady} />
      </Suspense>
      {places.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={p.id === selectedId ? icons[`${p.status}Sel`] : icons[p.status]}
          zIndexOffset={p.id === selectedId ? 1000 : 0}
          title={p.name}
          eventHandlers={{ click: () => onSelectPlace(p.id) }}
        />
      ))}
      {candidate && (
        <Marker position={[candidate.lat, candidate.lng]} icon={icons.new} zIndexOffset={2000} interactive={false} />
      )}
      {position && <Marker position={position} icon={meIcon} interactive={false} keyboard={false} />}
      <Interactions
        glRef={glRef}
        onPickFeature={onPickFeature}
        onLongPress={onLongPress}
        onBackgroundClick={onBackgroundClick}
      />
      <FlyTo position={position} focus={focus} />
      <Ready onMap={onMap} />
    </MapContainer>
  )
}
