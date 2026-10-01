import { providerAuthKey } from './providers'

export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? ''
export const SPOTIFY_REDIRECT_URI = `${window.location.origin}/callback`
const SCOPES = ['user-library-read', 'playlist-read-private', 'playlist-read-collaborative']
const SESSION_KEY = providerAuthKey('spotify', 'session')
const PENDING_KEY = providerAuthKey('spotify', 'pending')
const LEGACY_SESSION_KEY = 'mva-spotify-session'

export type SpotifySession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

type PendingAuthorization = { state: string; verifier: string; createdAt: number }

export class SpotifyError extends Error {
  constructor(message: string, public status?: number) { super(message) }
}

function randomUrlSafe(length: number) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[byte % 66]).join('')
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function getSpotifySession(): SpotifySession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as SpotifySession
    if (!value.accessToken || !value.refreshToken || !Number.isFinite(value.expiresAt)) return null
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
      sessionStorage.removeItem(LEGACY_SESSION_KEY)
    }
    return value
  } catch { return null }
}

function saveSession(session: SpotifySession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function disconnectSpotify() {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  sessionStorage.removeItem(LEGACY_SESSION_KEY)
}

export async function startSpotifyAuthorization() {
  if (!SPOTIFY_CLIENT_ID) throw new SpotifyError('缺少 VITE_SPOTIFY_CLIENT_ID。请先在 .env.local 配置并重启开发服务器。')
  // A new authorization may belong to a different Spotify user. Do not let
  // the previous account identity authorize a cache read during that switch.
  sessionStorage.removeItem(providerAuthKey('spotify', 'account-id'))
  const verifier = randomUrlSafe(64)
  const state = randomUrlSafe(32)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, verifier, createdAt: Date.now() } satisfies PendingAuthorization))
  const url = new URL('https://accounts.spotify.com/authorize')
  url.search = new URLSearchParams({
    response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SCOPES.join(' '), state, code_challenge_method: 'S256', code_challenge: encodeBase64Url(digest),
  }).toString()
  location.assign(url.toString())
}

async function requestToken(params: URLSearchParams): Promise<TokenResponse> {
  let response: Response
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    })
  } catch { throw new SpotifyError('无法连接 Spotify 授权服务器。请检查网络后重试。') }
  const body = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok) {
    if (body.error === 'invalid_grant') throw new SpotifyError('Spotify 授权已失效，请重新连接。', response.status)
    throw new SpotifyError(`Spotify 授权失败（HTTP ${response.status}）。`, response.status)
  }
  if (!body.access_token || !body.expires_in) throw new SpotifyError('Spotify 未返回有效的访问令牌。')
  return body
}

export async function completeSpotifyAuthorization(search: string): Promise<SpotifySession> {
  const params = new URLSearchParams(search)
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  let pending: PendingAuthorization | null = null
  try { pending = raw ? JSON.parse(raw) as PendingAuthorization : null } catch { /* invalid pending state */ }
  if (!pending || !params.get('state') || params.get('state') !== pending.state || Date.now() - pending.createdAt > 10 * 60_000) {
    throw new SpotifyError('Spotify 回调 state 校验失败或授权已超时，请重新连接。')
  }
  if (params.has('error')) throw new SpotifyError(params.get('error') === 'access_denied' ? '你取消了 Spotify 授权。' : 'Spotify 未完成授权，请重试。')
  const code = params.get('code')
  if (!code) throw new SpotifyError('Spotify 回调缺少授权码，请重新连接。')
  if (!SPOTIFY_CLIENT_ID) throw new SpotifyError('缺少 Spotify Client ID 配置。')
  const token = await requestToken(new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID, code_verifier: pending.verifier,
  }))
  if (!token.refresh_token) throw new SpotifyError('Spotify 未返回刷新令牌，请重新连接。')
  return saveSession({
    accessToken: token.access_token!, refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in! * 1000,
    scopes: (token.scope ?? SCOPES.join(' ')).split(' ').filter(Boolean),
  })
}

let refreshInFlight: Promise<SpotifySession> | null = null
export async function getValidSpotifySession(forceRefresh = false): Promise<SpotifySession> {
  const session = getSpotifySession()
  if (!session) throw new SpotifyError('Spotify 会话已结束，请重新连接。', 401)
  if (!forceRefresh && session.expiresAt > Date.now() + 60_000) return session
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const token = await requestToken(new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: session.refreshToken, client_id: SPOTIFY_CLIENT_ID,
        }))
        return saveSession({
          accessToken: token.access_token!, refreshToken: token.refresh_token ?? session.refreshToken,
          expiresAt: Date.now() + token.expires_in! * 1000,
          scopes: token.scope ? token.scope.split(' ').filter(Boolean) : session.scopes,
        })
      } catch (error) {
        if (error instanceof SpotifyError && error.status === 400) disconnectSpotify()
        throw error
      }
    })().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

export async function spotifyGet<T>(path: string, retry = true): Promise<T> {
  const session = await getValidSpotifySession()
  let response: Response
  try {
    response = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
  } catch { throw new SpotifyError('无法连接 Spotify Web API。请检查网络后重试。') }
  if (response.status === 401 && retry) {
    await getValidSpotifySession(true)
    return spotifyGet<T>(path, false)
  }
  if (response.status === 403) throw new SpotifyError('Spotify 拒绝访问该资源；可能缺少权限，或此播放列表并非你拥有/协作。', 403)
  if (response.status === 429) {
    const body = await response.json().catch(() => ({})) as { reason?: string }
    throw new SpotifyError(body.reason === 'QUOTA_EXCEEDED' ? 'Spotify Development mode 配额已用尽，请稍后重试。' : 'Spotify 请求过于频繁，请稍后重试。', 429)
  }
  if (!response.ok) throw new SpotifyError(`Spotify 数据读取失败（HTTP ${response.status}）。`, response.status)
  return response.json() as Promise<T>
}
