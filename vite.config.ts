import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/dishcovery/',
  plugins: [react()],
  // Pre-bundle these together so the Leaflet bridge and our code share one MapLibre instance.
  optimizeDeps: {
    include: ['maplibre-gl', '@maplibre/maplibre-gl-leaflet'],
  },
})
