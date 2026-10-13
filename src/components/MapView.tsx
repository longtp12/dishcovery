import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import type { ThemeConfig } from '../themes'

// Used until (or if) the browser shares a location: Hanoi centre (Hoàn Kiếm Lake).
const FALLBACK_CENTER: LatLngTuple = [21.0285, 105.8542]
const FALLBACK_ZOOM = 13
const LOCATED_ZOOM = 15

function FlyTo({ position }: { position: LatLngTuple | null }) {
  const map = useMap()
  const last = useRef<LatLngTuple | null>(null)
  useEffect(() => {
    if (position && position !== last.current) {
      last.current = position
      map.flyTo(position, Math.max(map.getZoom(), LOCATED_ZOOM), { duration: 0.8 })
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
      attributionControl
    >
      <TileLayer
        key={theme.id}
        url={theme.tiles.url}
        attribution={theme.tiles.attribution}
        subdomains={theme.tiles.subdomains ?? 'abc'}
        maxZoom={19}
      />
      {position && (
        <>
          <CircleMarker center={position} radius={18} className="me-halo" interactive={false} />
          <CircleMarker center={position} radius={7} className="me-dot" interactive={false} />
        </>
      )}
      <FlyTo position={position} />
    </MapContainer>
  )
}
