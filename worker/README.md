# Link expander (Cloudflare Worker)

Turns a Google Maps short link (`maps.app.goo.gl/…`) into the full `google.com/maps/…` URL so the
app can read the place name and coordinates. Browsers can't follow those redirects themselves
because Google sends no CORS headers.

- Only accepts Google short-link hosts and only follows redirects that stay on Google.
- Only answers sites listed in `ALLOWED_ORIGINS` (`wrangler.toml`).
- Logs are disabled and nothing is stored.

The app works without it: short links then fall back to searching the place name included in
Google Maps' share text.

## Run locally

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # local allowed origins
npm run dev                      # http://localhost:8787
```

Point the app at it with `VITE_LINK_EXPANDER_URL=http://localhost:8787` in `.env.development.local`,
then restart `npm run dev`.

## Deploy (free plan)

1. `cd worker && npx wrangler login`, then `npm run deploy`. Note the `*.workers.dev` URL it prints.
2. Make sure `ALLOWED_ORIGINS` in `wrangler.toml` includes the site's origin
   (e.g. `https://longtp12.github.io`, no path).
3. Build the app with `VITE_LINK_EXPANDER_URL=<worker URL>`. The GitHub Pages workflow already reads a
   repository variable named `LINK_EXPANDER_URL` (Settings → Secrets and variables → Actions → Variables).
