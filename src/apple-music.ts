import { providerAuthKey } from './providers'

const MUSIC_KIT_SCRIPT = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
const SESSION_KEY = providerAuthKey('apple', 'session')

export const APPLE_MUSIC_APP_NAME = import.meta.env.VITE_APPLE_MUSICKIT_APP_NAME?.trim() ?? ''
export const APPLE_MUSIC_DEVELOPER_TOKEN_ENDPOINT = import.meta.env.VITE_APPLE_MUSICKIT_DEVELOPER_TOKEN_ENDPOINT?.trim() ?? ''
export const APPLE_MUSICKIT_CONFIGURED = Boolean(APPLE_MUSIC_APP_NAME && APPLE_MUSIC_DEVELOPER_TOKEN_ENDPOINT)

type AppleMusicArtwork = { url?: string; bgColor?: string }
type AppleMusicAttributes = {
  name?: string
  artistName?: string
  albumName?: string
  releaseDate?: string
  genreNames?: string[]
  url?: string
  artwork?: AppleMusicArtwork
  durationInMillis?: number
  dateAdded?: string
  trackCount?: number
}

export type AppleMusicResource = {
  id?: string
  type?: string
  attributes?: AppleMusicAttributes
}

type AppleMusicPage<T> = {
  data?: {
    data?: T[]
    next?: string | null
    meta?: { total?: number }
  }
}

type AppleMusicInstance = {
  authorize: () => Promise<string>
  unauthorize: () => Promise<void>
  api: { music: (path: string, parameters?: Record<string, unknown>) => Promise<unknown> }
  isAuthorized?: boolean
}

type MusicKitGlobal = {
  configure: (options: { developerToken: string; app: { name: string; build: string } }) => Promise<AppleMusicInstance> | void
  getInstance: () => AppleMusicInstance
}

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal
  }
}

export type AppleMusicSession = {
  storefront: string | null
  connectedAt: number
}

export class AppleMusicError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'AppleMusicError'
  }
}

let scriptPromise: Promise<MusicKitGlobal> | null = null
let instancePromise: Promise<AppleMusicInstance> | null = null

function readJson<T>(value: string | null): T | null {
  try { return value ? JSON.parse(value) as T : null } catch { return null }
}

export function getAppleMusicSession(): AppleMusicSession | null {
  const session = readJson<AppleMusicSession>(sessionStorage.getItem(SESSION_KEY))
  if (!session || !Number.isFinite(session.connectedAt)) return null
  return session
}

function saveAppleMusicSession(session: AppleMusicSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

function clearAppleMusicSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

async function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return window.MusicKit
  if (!scriptPromise) {
    scriptPromise = new Promise<MusicKitGlobal>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${MUSIC_KIT_SCRIPT}"]`)
      const script = existing ?? document.createElement('script')
      let settled = false
      const finish = () => {
        if (settled) return
        if (window.MusicKit) {
          settled = true
          resolve(window.MusicKit)
        }
      }
      const fail = () => {
        if (!settled) {
          settled = true
          reject(new AppleMusicError('无法加载 Apple MusicKit。请检查网络或内容安全策略后重试。'))
        }
      }
      script.addEventListener('load', finish, { once: true })
      script.addEventListener('error', fail, { once: true })
      window.addEventListener('musickitloaded', finish, { once: true })
      if (!existing) {
        script.src = MUSIC_KIT_SCRIPT
        script.async = true
        document.head.appendChild(script)
      } else {
        finish()
      }
    }).catch(error => {
      scriptPromise = null
      throw error
    })
  }
  return scriptPromise
}

async function fetchDeveloperToken(): Promise<string> {
  if (!APPLE_MUSICKIT_CONFIGURED) {
    throw new AppleMusicError('APPLE MUSIC SETUP REQUIRED — CONFIGURE VITE_APPLE_MUSICKIT_APP_NAME AND VITE_APPLE_MUSICKIT_DEVELOPER_TOKEN_ENDPOINT.')
  }
  let response: Response
  try {
    response = await fetch(APPLE_MUSIC_DEVELOPER_TOKEN_ENDPOINT, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  } catch {
    throw new AppleMusicError('无法连接 Apple Music developer-token 服务。请确认后端 endpoint 已启动。')
  }
  const body = await response.json().catch(() => null) as { developerToken?: string; token?: string; error?: string } | null
  if (!response.ok) throw new AppleMusicError(body?.error || `Apple Music developer-token 服务返回 HTTP ${response.status}。`, response.status)
  const token = body?.developerToken ?? body?.token
  if (!token) throw new AppleMusicError('Apple Music developer-token 服务未返回 developerToken。')
  return token
}

async function getAppleMusicInstance(): Promise<AppleMusicInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const musicKit = await loadMusicKit()
      const developerToken = await fetchDeveloperToken()
      const configured = await musicKit.configure({ developerToken, app: { name: APPLE_MUSIC_APP_NAME, build: '0.1.0' } })
      return configured ?? musicKit.getInstance()
    })().catch(error => {
      instancePromise = null
      throw error
    })
  }
  return instancePromise
}

async function readApplePage<T>(music: AppleMusicInstance, path: string, limit = 100): Promise<{ items: T[]; next: string | null }> {
  const response = await music.api.music(path, path.includes('?') ? undefined : { limit }) as AppleMusicPage<T>
  const page = response.data
  return { items: page?.data ?? [], next: page?.next ?? null }
}

async function readAllAppleResources<T>(music: AppleMusicInstance, path: string, onProgress?: (message: string) => void) {
  const items: T[] = []
  let next: string | null = path
  while (next) {
    const page: { items: T[]; next: string | null } = await readApplePage<T>(music, next)
    items.push(...page.items)
    onProgress?.(`已读取 ${items.length} 项…`)
    next = page.next
  }
  return items
}

export async function connectAppleMusic(): Promise<AppleMusicSession> {
  const music = await getAppleMusicInstance()
  try {
    await music.authorize()
    const storefrontResponse = await music.api.music('/v1/me/storefront') as AppleMusicPage<AppleMusicResource>
    const storefront = storefrontResponse.data?.data?.[0]?.id ?? null
    return saveAppleMusicSession({ storefront, connectedAt: Date.now() })
  } catch (error) {
    if (error instanceof AppleMusicError) throw error
    throw new AppleMusicError('Apple Music 授权未完成。请确认你已允许 Music Visual Archive 访问个人音乐库。')
  }
}

export async function ensureAppleMusicAuthorized(): Promise<AppleMusicInstance> {
  const music = await getAppleMusicInstance()
  if (music.isAuthorized === false) await music.authorize()
  return music
}

export async function disconnectAppleMusic() {
  try {
    if (instancePromise) {
      const music = await instancePromise
      await music.unauthorize()
    }
  } finally {
    clearAppleMusicSession()
    instancePromise = null
  }
}

export async function loadAppleMusicResources(onProgress?: (message: string) => void) {
  const music = await ensureAppleMusicAuthorized()
  onProgress?.('正在读取 Apple Music 个人资料库…')
  const [albums, songs, playlists] = await Promise.all([
    readAllAppleResources<AppleMusicResource>(music, '/v1/me/library/albums', onProgress),
    readAllAppleResources<AppleMusicResource>(music, '/v1/me/library/songs', onProgress),
    readAllAppleResources<AppleMusicResource>(music, '/v1/me/library/playlists', onProgress),
  ])
  return { albums, songs, playlists, session: getAppleMusicSession() }
}
