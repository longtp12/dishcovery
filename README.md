# Dishcovery

A free restaurant tracker: keep a map of the places you've visited and the ones on your wishlist.

Built with React, TypeScript, Vite and Leaflet, with a MapLibre vector basemap from OpenFreeMap (free, no API key).

## Features

- **Restaurant dots** from OpenStreetMap (restaurants, cafés, bars…) straight from the map tiles. Tap one to see cuisine, address and hours, then save it.
- **Search**: instant, accent-insensitive matches over your saved places and nearby restaurants as you type; press Enter to search everywhere (Nominatim).
- **Long-press** anywhere to drop and name your own place.
- **Google Maps links**: paste a link (or the whole text from Google Maps' Share button) into the search bar to drop the place and match it to OpenStreetMap. Short `maps.app.goo.gl` links use the optional [link expander worker](worker/README.md) when `VITE_LINK_EXPANDER_URL` is set; otherwise the place name from the shared text is searched.
- **Wishlist / Visited** pins and filter chips. Places are saved in this browser's localStorage for now.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub Pages at `https://<user>.github.io/dishcovery/`. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Styles

Three themes (Fresh, Night, Pop) are defined as CSS variables in `src/index.css`; the map is recoloured to match in `src/mapStyle.ts`. The chosen style is saved in `localStorage`.
