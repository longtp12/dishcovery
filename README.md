# Dishcovery

A free restaurant tracker: keep a map of the places you've visited and the ones on your wishlist.

Built with React, TypeScript, Vite and Leaflet, with a MapLibre vector basemap from OpenFreeMap (free, no API key).

## Develop

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub Pages at `https://<user>.github.io/dishcovery/`. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Styles

Three themes (Fresh, Night, Pop) are defined as CSS variables in `src/index.css`; the map is recoloured to match in `src/mapStyle.ts`. The chosen style is saved in `localStorage`.
