import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyAlbumFromKnownData, classifyAlbums, classifyFromTags, getMusicBrainzRetryDelay, MUSICBRAINZ_REQUEST_SPACING_MS, MUSICBRAINZ_RETRY_DELAYS_MS, selectAutomaticGenres, summaryForClassifications } from '../src/genre-classification.ts'

const album = {
  source: 'spotify', id: 'spotify:album-1', title: 'Test Album', artist: 'Test Artist', year: 2024,
  genre: null, artistGenres: null, artwork: null, artworkSmall: null, url: null, color: '#000', note: null, tracks: [],
}

test('one strongly supported tag produces one primary genre', () => {
  assert.deepEqual(selectAutomaticGenres(['jazz'], .8), { primaryGenre: 'jazz', secondaryGenres: [] })
})

test('two distinct supported tags produce at most primary plus secondary', () => {
  const result = selectAutomaticGenres(['jazz', 'soul'], .8)
  assert.equal(result.primaryGenre, 'jazz')
  assert.deepEqual(result.secondaryGenres, ['soul'])
})

test('many candidates are deterministically capped at two', () => {
  const result = selectAutomaticGenres(['jazz', 'soul', 'rock', 'pop', 'dance'], .8)
  assert.ok(result.primaryGenre)
  assert.ok(result.secondaryGenres.length <= 1)
})

test('weak or missing evidence stays unresolved', () => {
  assert.deepEqual(selectAutomaticGenres([], .8), { primaryGenre: null, secondaryGenres: [] })
  assert.deepEqual(selectAutomaticGenres(['unknown'], .8), { primaryGenre: null, secondaryGenres: [] })
  assert.deepEqual(selectAutomaticGenres(['jazz'], .2), { primaryGenre: null, secondaryGenres: [] })
})

test('duplicate and overlapping evidence does not create duplicate genres', () => {
  const result = selectAutomaticGenres(['jazz', 'jazz', 'bebop'], .8)
  assert.deepEqual(result, { primaryGenre: 'jazz', secondaryGenres: [] })
})

test('known album or artist metadata remains usable without MusicBrainz', () => {
  const classified = classifyAlbumFromKnownData({ ...album, genre: 'Jazz' })
  assert.equal(classified.primaryGenre, 'jazz')
  assert.equal(classified.classificationSource, 'spotify-artist-genres')
  assert.equal(classified.metadataLookup, 'not-needed')
})

test('failed metadata lookup produces a partial, not complete, classification pass', () => {
  const failed = classifyFromTags(album, [], 'musicbrainz', 0, 'MusicBrainz HTTP 503', 'failed')
  const summary = summaryForClassifications([album], { [album.id]: failed }, 'ready')
  assert.equal(summary.completionState, 'partial')
  assert.equal(summary.status, 'ready')
  assert.equal(summary.unclassified, 1)
})

test('successful classification pass is explicitly complete', () => {
  const classified = classifyFromTags(album, ['jazz'], 'musicbrainz', .8)
  const summary = summaryForClassifications([album], { [album.id]: classified }, 'ready')
  assert.equal(summary.completionState, 'complete')
  assert.equal(summary.completed, 1)
})

test('retry schedule uses the configured backoff and respects Retry-After', () => {
  assert.deepEqual([...MUSICBRAINZ_RETRY_DELAYS_MS], [2000, 5000, 10000])
  assert.equal(getMusicBrainzRetryDelay(0), 2000)
  assert.equal(getMusicBrainzRetryDelay(1, 6000), 6000)
  assert.equal(getMusicBrainzRetryDelay(2, 100), 10000)
  assert.equal(MUSICBRAINZ_REQUEST_SPACING_MS, 1200)
})

test('duplicate artists reuse a resolved result and keep requests sequential', async () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  globalThis.window = { setTimeout, clearTimeout }
  let active = 0
  let maximumActive = 0
  let requestCount = 0
  globalThis.fetch = async url => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    requestCount += 1
    const parsed = new URL(url, 'http://local.test')
    const body = parsed.searchParams.get('path')?.endsWith('/release-group/')
      ? { 'release-groups': [{ id: 'mb-1', title: 'First Album', 'artist-credit': [{ name: 'Shared Artist' }], 'first-release-date': '2024-01-01' }] }
      : { tags: [{ name: 'pop' }], genres: [] }
    return {
      status: 200,
      ok: true,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => { active -= 1; return body },
    }
  }
  const albums = [
    { ...album, id: 'spotify:first', title: 'First Album', artist: 'Shared Artist', year: 2024 },
    { ...album, id: 'spotify:second', title: 'Second Album', artist: 'Shared Artist', year: 2024 },
  ]
  const updates = []
  const results = await classifyAlbums(albums, undefined, { retryDelayMs: () => 0, onResult: (_result, stats) => updates.push(stats) })
  assert.equal(requestCount, 2)
  assert.equal(maximumActive, 1)
  assert.equal(results[1].classification.primaryGenre, 'pop')
  assert.equal(updates.length, 2)
})

test('503 retries three times and is not cached as a permanent no-match', async () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  globalThis.window = { setTimeout, clearTimeout }
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return {
      status: 503,
      ok: false,
      headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json' : name.toLowerCase() === 'retry-after' ? '0' : null },
      json: async () => ({ error: 'busy' }),
    }
  }
  let finalStats
  const [result] = await classifyAlbums([album], undefined, { retryDelayMs: () => 0, onResult: (_result, stats) => { finalStats = stats } })
  assert.equal(requestCount, 4)
  assert.equal(finalStats.count503, 4)
  assert.equal(result.classification.metadataLookup, 'retryable-failure')
  assert.equal(values.has('mva-musicbrainz-cache-v5'), false)
})

test('progressive callbacks classify 100 metadata-ready records without upstream requests', async () => {
  const albums = Array.from({ length: 100 }, (_, index) => ({ ...album, id: `spotify:known-${index}`, artist: `Artist ${index}`, artistGenres: ['pop'] }))
  let updates = 0
  const results = await classifyAlbums(albums, undefined, { onResult: () => { updates += 1 } })
  assert.equal(updates, 100)
  assert.equal(results.filter(result => result.classification.primaryGenre === 'pop').length, 100)
})

test('queue cancellation stops before the next account record is processed', async () => {
  const albums = [
    { ...album, id: 'spotify:cancel-1', artistGenres: ['pop'] },
    { ...album, id: 'spotify:cancel-2', artistGenres: ['rock'] },
  ]
  let active = true
  let updates = 0
  await assert.rejects(
    classifyAlbums(albums, undefined, { isActive: () => active, onResult: () => { updates += 1; active = false } }),
    error => error?.name === 'AbortError',
  )
  assert.equal(updates, 1)
})
