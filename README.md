<p align="center">
  <img src="public/icon.svg" width="112" height="112" alt="Dishcovery icon: a smiling pastel watermelon slice">
</p>

<h1 align="center">Dishcovery</h1>

<p align="center">
  A free restaurant tracker: a map of the places you've been and the ones you want to try.<br>
  <a href="https://longtp12.github.io/dishcovery/"><strong>Open the app → longtp12.github.io/dishcovery</strong></a>
</p>

## Use it on your phone

Dishcovery is a web app you can install like a normal app (no app store needed).

- **iPhone / iPad:** open the link in **Safari** → **Share** → **Add to Home Screen**.
- **Android:** open the link in **Chrome** → **⋮** → **Install app** (or **Add to Home screen**).
- **Desktop:** in Chrome or Edge, click the install icon in the address bar.

Sign in with Google (menu, top right) to keep your places in your account and see them on every device.

## Features

- **Restaurant dots** from OpenStreetMap: tap one to see cuisine, address and opening hours, then save it.
- **Wishlist and Visited**, with filters and counts, plus a **My Places** tab to search, filter and sort everything you've saved.
- **Ratings and reviews**: 1–5 stars and a short note on each place.
- **Add places your way**: search (accents optional, so "pho" finds Phở), long-press the map to drop your own pin, or paste a **Google Maps link** (or the whole text from Google Maps' Share button).
- **Community places**: places added from Google Maps links show up for every signed-in user as community pins they can save.
- **Shared lists**: make a list (e.g. "Hanoi date spots"), invite people by Google email, and keep a shared wishlist together, with who added and who visited each place and everyone's ratings.
- **Six map styles**: Pop (default), Fresh, Night, and pastel Lavender, Mint and Strawberry. Signed in, your style follows you across devices.
- **Patchy signal is fine**: your saved places are cached on the device, and changes sync when you're back online.

## Who sees what

| Data | Who can see it |
| --- | --- |
| Your places, ratings and reviews in **My places** | Only you |
| A **shared list** and its places, ratings and reviews | The list's members (people the owner invited by email) |
| **Community places** (added from Google Maps links) | Everyone signed in; only the person who added one can rename or remove it |
| Your style setting | Only you |

Signed out, places stay in your browser only. Access is enforced by the Firestore security rules in [`firestore.rules`](firestore.rules).

## Built with

React 19, TypeScript and Vite · Leaflet with a MapLibre vector basemap from [OpenFreeMap](https://openfreemap.org) (free, no API key) · OpenStreetMap data and Nominatim search · Firebase Auth and Firestore (free Spark plan) · an optional Cloudflare Worker that expands short Google Maps links ([worker/README.md](worker/README.md)) · hosted on GitHub Pages.

## Develop

```bash
npm install
npm run dev
```

Cloud sync needs a Firebase project; without one, the app keeps places in the browser. Setup, including the env file: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

Testing without a real Firebase project:

```bash
npm run emulators                 # local Auth + Firestore emulators (needs Java)
npm run dev -- --mode emulator    # uses .env.emulator.local
npm run test:rules                # security-rules tests against the emulator
```

If port 8080 is taken, run the Firestore emulator on another port and set `VITE_FIRESTORE_EMULATOR_PORT` to it.

## Deploy

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and publishes it to GitHub Pages. One-time setup:

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables:** `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and optionally `LINK_EXPANDER_URL` (no `VITE_` prefix; the workflow adds it).
3. Whenever `firestore.rules` changes, publish it in the Firebase console (**Firestore → Rules → Publish**).

## Project layout

```
src/
  App.tsx              app shell: map, sheets, tabs, selection
  places.ts            saved places, lists, community places, reviews (state + sync)
  cloud.ts, cloudImpl.ts   Firebase interface (loaded lazily)
  gmaps.ts             reading Google Maps links
  osm.ts, mapFeatures.ts   OpenStreetMap search and map features
  mapStyle.ts, themes.ts   map colours per style
  components/          MapView, PlaceSheet, PlacesView, ListSwitcher, ListManager, ReviewBox, …
firestore.rules        security rules (tests in tests/rules.test.mjs)
worker/                optional short-link expander (Cloudflare Worker)
```
