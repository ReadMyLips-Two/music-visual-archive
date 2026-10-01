export type MusicProvider = 'spotify' | 'apple' | 'qq'
export type ProviderAvailability = 'available' | 'pending'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'error'

export type MusicProviderState = {
  provider: MusicProvider
  status: ProviderAvailability
  connectionStatus: ConnectionStatus
  displayName: string
  accountId: string | null
  libraryStatus: LibraryStatus
}

export const MUSIC_PROVIDERS: ReadonlyArray<Pick<MusicProviderState, 'provider' | 'status' | 'displayName'>> = [
  { provider: 'spotify', status: 'available', displayName: 'SPOTIFY' },
  { provider: 'apple', status: 'available', displayName: 'APPLE MUSIC' },
  { provider: 'qq', status: 'pending', displayName: 'QQ MUSIC' },
]

/** Keep credentials and connection metadata separated by provider from the start. */
export const providerAuthNamespace = (provider: MusicProvider) => `mva.auth.${provider}.`
export const providerAuthKey = (provider: MusicProvider, key: string) => `${providerAuthNamespace(provider)}${key}`

export function createProviderState(provider: MusicProvider, overrides: Partial<MusicProviderState> = {}): MusicProviderState {
  const descriptor = MUSIC_PROVIDERS.find(item => item.provider === provider) ?? MUSIC_PROVIDERS[0]
  return {
    provider,
    status: descriptor.status,
    connectionStatus: 'disconnected',
    displayName: descriptor.displayName,
    accountId: null,
    libraryStatus: 'idle',
    ...overrides,
  }
}
