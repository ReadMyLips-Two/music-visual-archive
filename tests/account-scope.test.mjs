import test from 'node:test'
import assert from 'node:assert/strict'
import { accountScopeKey, libraryCacheKey, readExactScopedCache, readSessionAccountIdentity } from '../src/account-scope.ts'

const storage = (values = {}) => ({
  getItem(key) { return values[key] ?? null },
})

test('library cache reads require the exact provider and account identity', () => {
  const cache = storage({
    [libraryCacheKey('spotify', 'user-a')]: JSON.stringify({ source: 'spotify', userId: 'user-a', albums: [{ id: 'a' }] }),
  })

  assert.equal(readExactScopedCache(cache, 'spotify', null), null)
  assert.equal(readExactScopedCache(cache, 'spotify', 'user-b'), null)
  assert.deepEqual(readExactScopedCache(cache, 'spotify', 'user-a')?.albums, [{ id: 'a' }])
})

test('provider and account are both part of the persistent scope', () => {
  assert.equal(accountScopeKey({ provider: 'spotify', accountId: 'same-id' }), 'spotify:same-id')
  assert.notEqual(accountScopeKey({ provider: 'spotify', accountId: 'same-id' }), accountScopeKey({ provider: 'apple', accountId: 'same-id' }))
})

test('an active provider with unknown identity does not fall back to another provider', () => {
  const session = storage({
    'mva-active-provider': 'spotify',
    'mva.auth.apple.account-id': 'apple-user',
  })
  assert.equal(readSessionAccountIdentity(session), null)
})

test('a confirmed active provider identity is restored', () => {
  const session = storage({
    'mva-active-provider': 'spotify',
    'mva.auth.spotify.account-id': 'spotify-user',
  })
  assert.deepEqual(readSessionAccountIdentity(session), { provider: 'spotify', accountId: 'spotify-user' })
})
