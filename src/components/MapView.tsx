import { lazy, Suspense, useEffect, useRef } from 'react'
import { MapContainer, Marker, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import type { ThemeConfig } from '../themes'

// Used until (or if) the browser shares a location: Hanoi centre (Hoàn Kiếm Lake).
const FALLBACK_CENTER: LatLngTuple = [21.0285, 105.8542]
const FALLBACK_ZOOM = 14
const LOCATED_ZOOM = 15.5

// MapLibre is large, so load it in its own chunk after the app shell renders.
const VectorBasemap = lazy(() => import('./VectorBasemap'))

const meIcon = L.divIcon({
  className: 'me-marker',
  html: '<span class="me-pulse"></span><span class="me-dot"></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

function FlyTo({ position }: { position: LatLngTuple | null }) {
  const map = useMap()
  const last = useRef<LatLngTuple | null>(null)
  useEffect(() => {
    if (position && position !== last.current) {
      last.current = position
      map.flyTo(position, Math.max(map.getZoom(), LOCATED_ZOOM), { duration: 1.1, easeLinearity: 0.2 })
    }
  }, [map, position])
  return null
}

interface Props {
  theme: ThemeConfig
  position: LatLngTuple | null
}

export default function MapView({ theme, position }: Props) {
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
      attributionControl
    >
      <Suspense fallback={null}>
        <VectorBasemap theme={theme} />
      </Suspense>
      {position && <Marker position={position} icon={meIcon} interactive={false} keyboard={false} />}
      <FlyTo position={position} />
    </MapContainer>
  )
}
