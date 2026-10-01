const MUSICBRAINZ_ORIGIN = 'https://musicbrainz.org'

function pathValue(value) {
  return Array.isArray(value) ? value.join('/') : typeof value === 'string' ? value : ''
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const path = pathValue(request.query?.path)
  if (!path) return response.status(400).json({ error: 'Missing MusicBrainz path', details: 'Use /api/musicbrainz/ws/2/... for proxied MusicBrainz requests.' })
  if (!path.startsWith('ws/2/')) return response.status(404).json({ error: 'Unsupported MusicBrainz path' })

  const upstream = new URL(`${MUSICBRAINZ_ORIGIN}/${path}`)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (key === 'path') continue
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string') upstream.searchParams.append(key, item)
    }
  }

  try {
    const result = await fetch(upstream, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Music Visual Archive/1.0 (https://music-visual-archive.vercel.app; boseanpark@gmail.com)',
      },
    })
    const body = await result.text()
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    try {
      JSON.parse(body)
    } catch {
      return response.status(502).json({ error: 'MusicBrainz upstream returned non-JSON data', details: `Upstream HTTP ${result.status}` })
    }
    return response.status(result.status).send(body)
  } catch {
    return response.status(502).json({ error: 'MusicBrainz request failed' })
  }
}
