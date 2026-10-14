import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'
import { setWorkerUrl, type Map as GLMap, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadBaseStyle, themedStyle } from '../mapStyle'
import type { ThemeConfig } from '../themes'

// MapLibre locates its worker relative to its own module URL, which bundling breaks.
setWorkerUrl(workerUrl)

const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'

/**
 * Crisp vector basemap (MapLibre rendered inside Leaflet), recoloured per theme.
 * Falls back to the theme's raster tiles if the vector style can't be loaded.
 */
interface Props {
  theme: ThemeConfig
  /** Show OpenStreetMap restaurant/café dots. */
  showFood?: boolean
  /** Receives the MapLibre map once created (for querying restaurant features). */
  onReady?: (gl: GLMap | null) => void
}

export default function VectorBasemap({ theme, showFood = true, onReady }: Props) {
  const map = useMap()
  const layerRef = useRef<ReturnType<typeof maplibreGL> | null>(null)
  const [base, setBase] = useState<StyleSpecification | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadBaseStyle().then(
      (style) => !cancelled && setBase(style),
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!base) return
    const style = themedStyle(base, theme.id, showFood)
    if (layerRef.current) {
      layerRef.current.getMaplibreMap().setStyle(style, { diff: true })
      return
    }
    const layer = maplibreGL({ style, attributionControl: { customAttribution: OFM_ATTRIBUTION } })
    layer.addTo(map)
    layerRef.current = layer
    onReady?.(layer.getMaplibreMap())
  }, [base, theme.id, showFood, map, onReady])

  useEffect(
    () => () => {
      layerRef.current?.remove()
      layerRef.current = null
      onReady?.(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
    [],
  )

  if (failed) {
    return (
      <TileLayer
        key={theme.id}
        url={theme.tiles.url}
        attribution={theme.tiles.attribution}
        className="raster-fallback"
        maxZoom={19}
      />
    )
  }
  return null
}
