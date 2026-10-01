export default function handler(request, response) {
  response.setHeader('Content-Type', 'application/json')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method not allowed' })
  }
  return response.status(400).json({
    error: 'Missing MusicBrainz path',
    details: 'Use /api/musicbrainz/ws/2/... for proxied MusicBrainz requests.',
  })
}
