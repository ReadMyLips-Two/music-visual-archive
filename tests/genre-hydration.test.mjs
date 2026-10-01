import test from 'node:test'
import assert from 'node:assert/strict'
import { canShowGenreEmpty, getGenreHydrationState, hasCompleteClassificationCache, shouldRunAutomaticClassification, unclassifiedAlbumIds } from '../src/genre-hydration.ts'
import { canonicalGenreId } from '../src/genre-keys.ts'
import { readSessionAccountIdentity } from '../src/account-scope.ts'

test('a fresh authenticated library enters classification instead of authoritative empty state', () => {
  assert.equal(shouldRunAutomaticClassification([{ id: 'album-1' }], 'idle'), true)
  const state = getGenreHydrationState({ connected: true, libraryHydrated: true, classificationStatus: 'idle' })
  assert.equal(state, 'classifying')
  assert.equal(canShowGenreEmpty(state, 0), false)
})

test('a complete existing account classification restores without another classification run', () => {
  const albums = [{ classification: { primaryGenre: 'pop' } }, { classification: { primaryGenre: 'rock' } }]
  assert.equal(shouldRunAutomaticClassification(albums, 'ready'), false)
  assert.equal(getGenreHydrationState({ connected: true, libraryHydrated: true, classificationStatus: 'ready' }), 'ready')
})

test('unknown identity never becomes a valid account scope', () => {
  const values = new Map([['mva-active-provider', 'spotify']])
  const storage = { getItem: key => values.get(key) ?? null }
  assert.equal(readSessionAccountIdentity(storage), null)
})

test('direct genre refresh remains non-empty-publishable during hydration and classification', () => {
  assert.equal(getGenreHydrationState({ connected: true, libraryHydrated: false, classificationStatus: 'idle' }), 'hydrating')
  assert.equal(getGenreHydrationState({ connected: true, libraryHydrated: true, classificationStatus: 'running' }), 'classifying')
  assert.equal(canShowGenreEmpty('hydrating', 0), false)
  assert.equal(canShowGenreEmpty('classifying', 0), false)
  assert.equal(canShowGenreEmpty('ready', 0), true)
})

test('route aliases resolve to the same canonical classification keys', () => {
  assert.equal(canonicalGenreId('pop'), 'pop')
  assert.equal(canonicalGenreId('rnb'), 'soul')
  assert.equal(canonicalGenreId('R&B / Soul'), 'soul')
  assert.equal(canonicalGenreId('hiphop'), 'hip-hop')
  assert.equal(canonicalGenreId('classical'), 'ambient')
  assert.equal(canonicalGenreId('Dance / Club'), 'dance')
  assert.equal(canonicalGenreId('dance-club'), 'dance')
})

test('a 100-album library leaves manually assigned records out of automatic classification', () => {
  const albums = Array.from({ length: 100 }, (_, index) => ({ id: `album-${index}` }))
  const manualAssignments = Object.fromEntries(albums.slice(0, 20).map(album => [album.id, { genres: ['pop'] }]))
  assert.equal(unclassifiedAlbumIds(albums, manualAssignments).length, 80)
  assert.equal(shouldRunAutomaticClassification(albums, 'idle', manualAssignments), true)
  assert.equal(shouldRunAutomaticClassification(albums.slice(0, 20), 'ready', manualAssignments), false)
})

test('partial or legacy-unclassified caches do not short-circuit the next classification pass', () => {
  const albums = [{ id: 'album-1' }, { id: 'album-2' }]
  const partial = { 'album-1': { primaryGenre: 'pop' }, 'album-2': { primaryGenre: null } }
  assert.equal(hasCompleteClassificationCache(albums, partial, { status: 'ready', completionState: 'partial' }), false)
  assert.equal(hasCompleteClassificationCache(albums, partial, { status: 'ready' }), false)
  assert.equal(hasCompleteClassificationCache(albums, { 'album-1': { primaryGenre: 'pop' }, 'album-2': { primaryGenre: 'rock' } }, { status: 'ready' }), true)
})
