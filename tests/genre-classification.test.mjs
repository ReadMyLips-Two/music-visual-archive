import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyAlbumFromKnownData, classifyFromTags, selectAutomaticGenres, summaryForClassifications } from '../src/genre-classification.ts'

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
