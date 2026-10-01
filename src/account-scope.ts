import type { MusicProvider } from './providers'

export const ACTIVE_PROVIDER_KEY = 'mva-active-provider'
const PROVIDER_ORDER: MusicProvider[] = ['apple', 'spotify', 'qq']
const providerAuthKey = (provider: MusicProvider, key: string) => `mva.auth.${provider}.${key}`

export type AccountIdentity = {
  provider: MusicProvider
  accountId: string
}

export function accountScopeKey(identity: AccountIdentity) {
  return `${identity.provider}:${identity.accountId}`
}

export function libraryCacheKey(provider: MusicProvider, accountId: string, version = 1) {
  return `mva.library.${provider}.${accountId}.v${version}`
}

export function readExactScopedCache<T extends { source: MusicProvider; userId: string | null }>(
  storage: Pick<Storage, 'getItem'>,
  provider: MusicProvider,
  accountId: string | null,
  version = 1,
): T | null {
  const normalizedAccountId = accountId?.trim()
  if (!normalizedAccountId) return null
  try {
    const raw = storage.getItem(libraryCacheKey(provider, normalizedAccountId, version))
    if (!raw) return null
    const cached = JSON.parse(raw) as T
    return cached?.source === provider && cached.userId === normalizedAccountId && Array.isArray((cached as { albums?: unknown }).albums)
      ? cached
      : null
  } catch { return null }
}

function isProvider(value: string | null): value is MusicProvider {
  return value !== null && PROVIDER_ORDER.includes(value as MusicProvider)
}

/** Returns only a confirmed provider/account pair from session storage. */
export function readSessionAccountIdentity(storage: Pick<Storage, 'getItem'>): AccountIdentity | null {
  const activeProvider = storage.getItem(ACTIVE_PROVIDER_KEY)
  const providers = isProvider(activeProvider)
    ? [activeProvider]
    : PROVIDER_ORDER
  for (const provider of providers) {
    const accountId = storage.getItem(providerAuthKey(provider, 'account-id'))?.trim()
    if (accountId) return { provider, accountId }
    if (activeProvider === provider) return null
  }
  return null
}
