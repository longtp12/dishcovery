/**
 * Dishcovery link expander: follows a Google Maps short link (maps.app.goo.gl/…) and returns
 * the full google.com/maps URL, which the app can read the place name and coordinates from.
 * Browsers can't do this themselves because Google sends no CORS headers on those redirects.
 *
 * POST { "url": "https://maps.app.goo.gl/…" }  ->  200 { "url": "https://www.google.com/maps/place/…" }
 *
 * Deliberately minimal: only Google short-link hosts, only allowed app origins, nothing logged or stored.
 */

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])
const GOOGLE_MAPS = /^(www\.|maps\.)?google\.[a-z.]+$/i
const MAX_HOPS = 5

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (!origin || !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })

function isShortLink(u) {
  if (u.protocol !== 'https:') return false
  if (u.hostname === 'maps.app.goo.gl') return u.pathname.length > 1
  if (u.hostname === 'goo.gl') return u.pathname.startsWith('/maps/')
  return false
}

const isGoogleMaps = (u) =>
  u.protocol === 'https:' && GOOGLE_MAPS.test(u.hostname) && (u.hostname.startsWith('maps.') || u.pathname.startsWith('/maps'))

/** Follows redirects by hand so every hop stays on Google's short-link or Maps hosts. */
async function expand(start) {
  let current = start
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (isGoogleMaps(current)) return current.href
    if (!SHORT_HOSTS.has(current.hostname)) return null
    const res = await fetch(current.href, { method: 'GET', redirect: 'manual' })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) return null
    current = new URL(location, current)
  }
  return isGoogleMaps(current) ? current.href : null
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin'), env)

    if (request.method === 'OPTIONS') {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 })
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors ?? {})
    if (!cors) return json({ error: 'origin_not_allowed' }, 403)

    let input
    try {
      const body = await request.json()
      input = new URL(String(body?.url ?? ''))
    } catch {
      return json({ error: 'invalid_url' }, 400, cors)
    }
    if (!isShortLink(input)) return json({ error: 'not_a_google_maps_short_link' }, 400, cors)

    try {
      const url = await expand(input)
      return url ? json({ url }, 200, cors) : json({ error: 'could_not_expand' }, 422, cors)
    } catch {
      return json({ error: 'upstream_failed' }, 502, cors)
    }
  },
}
