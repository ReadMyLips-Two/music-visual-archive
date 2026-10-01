import test from 'node:test'
import assert from 'node:assert/strict'
import { selectAutomaticGenres } from '../src/genre-classification.ts'

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
