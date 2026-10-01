import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classifyAlbum, isJsonContentType, MUSICBRAINZ_CACHE_KEY } from '../src/genre-classification.ts'
import { albumGenres } from '../src/genres.ts'
import musicbrainzRootHandler from '../api/musicbrainz/index.js'

const album = {
  source: 'spotify', id: 'spotify:album-routing-test', title: 'Routing Test', artist: 'Routing Artist', year: 2024,
  genre: null, artistGenres: null, artwork: null, artworkSmall: null, url: null, color: '#000', note: null, tracks: [],
}

function mockResponse() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    send(value) { this.body = value; return this },
  }
}

test('the exact MusicBrainz API entrypoint always returns JSON', async () => {
  const response = mockResponse()
  await musicbrainzRootHandler({ method: 'GET' }, response)
  assert.equal(response.statusCode, 400)
  assert.equal(response.headers['Content-Type'], 'application/json')
  assert.equal(typeof response.body.error, 'string')
})

test('the nested rewrite reaches the exact proxy and preserves query parameters', async () => {
  const originalFetch = globalThis.fetch
  let upstreamUrl = null
  globalThis.fetch = async url => {
    upstreamUrl = String(url)
    return {
      status: 200,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({ 'release-groups': [] }),
    }
  }
  const response = mockResponse()
  await musicbrainzRootHandler({ method: 'GET', query: { path: 'ws/2/release-group', query: 'releasegroup:"Discovery"', fmt: 'json', limit: '1' } }, response)
  globalThis.fetch = originalFetch
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(response.body), { 'release-groups': [] })
  const parsed = new URL(upstreamUrl)
  assert.equal(parsed.pathname, '/ws/2/release-group')
  assert.equal(parsed.searchParams.get('query'), 'releasegroup:"Discovery"')
  assert.equal(parsed.searchParams.get('fmt'), 'json')
  assert.equal(parsed.searchParams.get('limit'), '1')
})

test('the SPA rewrite explicitly excludes API paths', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const source = config.rewrites.find(entry => entry.destination === '/index.html')?.source ?? ''
  assert.match(source, /\(\?!api/)
  assert.match(source, /api\(\?:\/\|\$\)/)
  assert.notEqual(source, '/(.*)')
  const nested = config.rewrites.find(entry => entry.source === '/api/musicbrainz/:path*')
  assert.deepEqual(nested, { source: '/api/musicbrainz/:path*', destination: '/api/musicbrainz?path=:path*' })
})

test('non-JSON metadata responses are rejected before parsing', () => {
  assert.equal(isJsonContentType('application/json; charset=utf-8'), true)
  assert.equal(isJsonContentType('application/ld+json'), true)
  assert.equal(isJsonContentType('text/html; charset=utf-8'), false)
})

test('a non-JSON response is not stored as a usable metadata result', async () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  globalThis.window = { setTimeout }
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'text/html' : null },
    json: async () => ({ shouldNot: 'run' }),
  })

  const result = await classifyAlbum(album)
  assert.equal(result.primaryGenre, null)
  assert.equal(result.metadataLookup, 'failed')
  assert.match(result.reason, /non-JSON response/)
  const cached = JSON.parse(values.get(MUSICBRAINZ_CACHE_KEY))
  const entry = Object.values(cached)[0]
  assert.equal(entry.status, 'failed')
  assert.doesNotMatch(JSON.stringify(entry), /<html>/i)
})

test('manual genre choices remain authoritative across metadata cache migration', () => {
  const records = albumGenres({ ...album, classification: { primaryGenre: 'rock', secondaryGenres: [] } }, {
    [album.id]: { genres: ['pop'], primary: 'pop' },
  })
  assert.deepEqual(records, ['pop'])
  assert.equal(MUSICBRAINZ_CACHE_KEY, 'mva-musicbrainz-cache-v3')
})
