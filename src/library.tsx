import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { disconnectAppleMusic, getAppleMusicSession, loadAppleMusicResources, type AppleMusicResource, AppleMusicError } from './apple-music'
import { disconnectSpotify, getSpotifySession, spotifyGet, SpotifyError } from './spotify'
import { createProviderState, providerAuthKey, type MusicProvider, type MusicProviderState } from './providers'
import { ACTIVE_PROVIDER_KEY, libraryCacheKey, readExactScopedCache } from './account-scope'
import { classifyAlbums, classifyAlbumFromKnownData, normalizeClassification, summaryForClassifications, type AlbumClassification, type ClassificationSummary } from './genre-classification'
import { hasCompleteClassificationCache, shouldRunAutomaticClassification } from './genre-hydration'
import { getCurrentAccountGenreAssignments } from './genres'

export type LibraryTrack = {
  source: MusicProvider
  id: string
  title: string
  artist: string
  duration: string
  albumId: string | null
  albumTitle: string | null
  artwork: string | null
  artworkSmall: string | null
  url: string | null
  note: string | null
}

export type LibraryAlbum = {
  source: MusicProvider
  id: string
  title: string
  artist: string
  year: number | null
  genre: string | null
  artistGenres: string[] | null
  artwork: string | null
  artworkSmall: string | null
  url: string | null
  color: string
  note: string | null
  tracks: LibraryTrack[]
  classification?: AlbumClassification
}

export type LibraryPlaylist = {
  id: string
  name: string
  url: string | null
  artwork: string | null
  total: number
  tracks: LibraryTrack[]
  access: 'readable' | 'restricted'
}

export type MusicLibrary = {
  source: MusicProvider
  albums: LibraryAlbum[]
  tracks: LibraryTrack[]
  playlists: LibraryPlaylist[]
  userId: string | null
  userName: string | null
  warnings: string[]
  classification: ClassificationSummary
}

type SpotifyArtist = { id?: string; name?: string }
type SpotifyImage = { url?: string }
type SpotifyAlbum = {
  id?: string; name?: string; release_date?: string; artists?: SpotifyArtist[]
  genres?: string[]
  images?: SpotifyImage[]; external_urls?: { spotify?: string }
  tracks?: { items?: SpotifyTrack[] }
}
type SpotifyTrack = {
  id?: string; name?: string; duration_ms?: number; type?: string
  artists?: SpotifyArtist[]; album?: SpotifyAlbum
  external_urls?: { spotify?: string }
}
type SpotifyPlaylist = {
  id?: string; name?: string; images?: SpotifyImage[]; collaborative?: boolean
  owner?: { id?: string }; items?: { total?: number }; tracks?: { total?: number }
  external_urls?: { spotify?: string }
}
type Page<T> = { items?: T[]; next?: string | null; offset?: number; limit?: number; total?: number }

const emptyClassification = (): ClassificationSummary => ({ status: 'idle', total: 0, classified: 0, unclassified: 0, completed: 0, lastError: null })
const ACCOUNT_CHANGE_EVENT = 'mva-library-account-change'
const LIBRARY_CACHE_VERSION = 1

const emptyLibrary = (source: MusicProvider): MusicLibrary => ({
  source, albums: [], tracks: [], playlists: [], userId: null, userName: null, warnings: [], classification: emptyClassification(),
})

function readCachedLibrary(provider: MusicProvider): MusicLibrary | null {
  const accountId = sessionStorage.getItem(providerAuthKey(provider, 'account-id'))
  return readExactScopedCache<MusicLibrary>(localStorage, provider, accountId, LIBRARY_CACHE_VERSION)
}

function writeCachedLibrary(library: MusicLibrary) {
  if (!library.userId) return
  try { localStorage.setItem(libraryCacheKey(library.source, library.userId), JSON.stringify(library)) } catch { /* private mode or storage quota */ }
}

const duration = (ms?: number) => {
  if (!Number.isFinite(ms)) return '—'
  const seconds = Math.floor((ms ?? 0) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const asTrack = (track: SpotifyTrack, albumId: string | null): LibraryTrack | null => {
  if (!track.id || !track.name || (track.type && track.type !== 'track')) return null
  return {
    source: 'spotify', id: `spotify:${track.id}`, title: track.name,
    artist: track.artists?.map(artist => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
    duration: duration(track.duration_ms), albumId,
    albumTitle: track.album?.name ?? null, artwork: track.album?.images?.[0]?.url ?? null,
    artworkSmall: track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
    url: track.external_urls?.spotify ?? null, note: null,
  }
}

const asAlbum = (album: SpotifyAlbum): LibraryAlbum | null => {
  if (!album.id || !album.name) return null
  const id = `spotify:${album.id}`
  const genreTags = [...new Set((album.genres ?? []).filter(Boolean))]
  return {
    source: 'spotify', id, title: album.name,
    artist: album.artists?.map(artist => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
    year: Number.parseInt(album.release_date?.slice(0, 4) ?? '', 10) || null,
    genre: genreTags[0] ?? null, artistGenres: genreTags.length ? genreTags : null, artwork: album.images?.[0]?.url ?? null,
    artworkSmall: album.images?.[1]?.url ?? album.images?.[0]?.url ?? null,
    url: album.external_urls?.spotify ?? null, color: '#e5e6e3', note: null,
    tracks: (album.tracks?.items ?? []).map(track => asTrack(track, id)).filter((track): track is LibraryTrack => Boolean(track)),
  }
}

async function readArtistGenres(saved: { album?: SpotifyAlbum }[], onProgress?: (message: string) => void) {
  // Spotify's artist genres field is deprecated and can be empty. Enrichment is
  // best effort; an absent or blocked value never becomes an invented label.
  const ids = [...new Set(saved.flatMap(row => row.album?.artists?.map(artist => artist.id).filter((id): id is string => Boolean(id)) ?? []))]
  const selected = ids.slice(0, 60)
  const result = new Map<string, string[]>()
  let next = 0
  let throttled = false
  onProgress?.('正在尝试读取艺人风格词条…')
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (next < selected.length && !throttled) {
      const id = selected[next++]
      try {
        const artist = await spotifyGet<{ genres?: string[] }>(`/artists/${encodeURIComponent(id)}`)
        result.set(id, Array.isArray(artist.genres) ? artist.genres : [])
      } catch (error) {
        if (error instanceof SpotifyError && error.status === 429) throttled = true
        result.set(id, [])
      }
    }
  }))
  return { result, limited: ids.length > selected.length || throttled }
}
async function fetchAll<T>(path: string, onProgress?: (message: string) => void): Promise<T[]> {
  const items: T[] = []
  let offset = 0
  for (;;) {
    const separator = path.includes('?') ? '&' : '?'
    const page = await spotifyGet<Page<T>>(`${path}${separator}limit=50&offset=${offset}`)
    items.push(...(page.items ?? []))
    onProgress?.(`已读取 ${items.length} 项…`)
    if (!page.next || !page.items?.length) break
    offset = (page.offset ?? offset) + (page.limit ?? page.items.length)
  }
  return items
}

export async function loadSpotifyLibrary(onProgress?: (message: string) => void): Promise<MusicLibrary> {
  onProgress?.('正在确认 Spotify 账户…')
  const profile = await spotifyGet<{ id?: string; display_name?: string }>('/me')
  const session = getSpotifySession()
  if (!session?.scopes.includes('user-library-read')) throw new SpotifyError('缺少 user-library-read 权限，请断开后重新连接。', 403)

  onProgress?.('正在读取已保存专辑…')
  const savedAlbums = await fetchAll<{ album?: SpotifyAlbum }>('/me/albums', onProgress)
  onProgress?.('正在读取已保存歌曲…')
  const savedTracks = await fetchAll<{ track?: SpotifyTrack }>('/me/tracks', onProgress)
  const { result: artistGenres, limited: genreLookupLimited } = await readArtistGenres(savedAlbums, onProgress)
  const albums = savedAlbums.map(item => {
    const album = item.album && asAlbum(item.album)
    if (!album) return null
    album.artistGenres = [...new Set([...(album.artistGenres ?? []), ...(item.album?.artists?.flatMap(artist => artist.id ? artistGenres.get(artist.id) ?? [] : []) ?? [])])]
    return album
  }).filter((album): album is LibraryAlbum => Boolean(album))
  const tracks = savedTracks.map(item => item.track && asTrack(item.track, item.track.album?.id ? `spotify:${item.track.album.id}` : null))
    .filter((track): track is LibraryTrack => Boolean(track))
  const warnings: string[] = genreLookupLimited ? ['部分艺人风格词条未能读取；相应专辑保持未分类，可在专辑页手动整理。'] : []
  const playlists: LibraryPlaylist[] = []

  if (session.scopes.includes('playlist-read-private')) {
    try {
      onProgress?.('正在读取播放列表…')
      const playlistRows = await fetchAll<SpotifyPlaylist>('/me/playlists', onProgress)
      for (const playlist of playlistRows) {
        if (!playlist.id) continue
        const canReadItems = playlist.owner?.id === profile.id || playlist.collaborative === true
        const entry: LibraryPlaylist = {
          id: playlist.id, name: playlist.name ?? 'Untitled playlist',
          url: playlist.external_urls?.spotify ?? null, artwork: playlist.images?.[0]?.url ?? null,
          total: playlist.items?.total ?? playlist.tracks?.total ?? 0,
          tracks: [], access: canReadItems ? 'readable' : 'restricted',
        }
        if (canReadItems) {
          try {
            onProgress?.(`正在读取播放列表：${entry.name}`)
            const playlistItems = await fetchAll<{ item?: SpotifyTrack; track?: SpotifyTrack }>(`/playlists/${encodeURIComponent(playlist.id)}/items`, onProgress)
            entry.tracks = playlistItems.map(row => asTrack(row.item ?? row.track ?? {}, null)).filter((track): track is LibraryTrack => Boolean(track))
          } catch (error) {
            if (error instanceof SpotifyError && error.status === 403) {
              entry.access = 'restricted'
              warnings.push(`播放列表「${entry.name}」的条目无权读取。`)
            } else { throw error }
          }
        }
        playlists.push(entry)
      }
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 403) warnings.push('缺少播放列表读取权限；已保存的专辑和歌曲仍可浏览。')
      else throw error
    }
  } else warnings.push('未授予播放列表读取权限；已保存的专辑和歌曲仍可浏览。')

  return { source: 'spotify', albums, tracks, playlists, userId: profile.id ?? null, userName: profile.display_name ?? null, warnings, classification: { status: 'idle', total: albums.length, classified: 0, unclassified: albums.length, completed: 0, lastError: null } }
}

const appleArtwork = (artwork: { url?: string } | undefined, size: number) => artwork?.url?.replace('{w}', String(size)).replace('{h}', String(size)) ?? null

const asAppleAlbum = (resource: AppleMusicResource): LibraryAlbum | null => {
  const attributes = resource.attributes
  if (!resource.id || !attributes?.name) return null
  const genreNames = attributes.genreNames ?? []
  return {
    source: 'apple', id: `apple:${resource.id}`, title: attributes.name,
    artist: attributes.artistName ?? 'Unknown artist',
    year: Number.parseInt(attributes.releaseDate?.slice(0, 4) ?? '', 10) || null,
    genre: genreNames[0] ?? null, artistGenres: genreNames.length ? genreNames : null,
    artwork: appleArtwork(attributes.artwork, 800), artworkSmall: appleArtwork(attributes.artwork, 240),
    url: attributes.url ?? null, color: attributes.artwork?.bgColor ? `#${attributes.artwork.bgColor}` : '#e5e6e3',
    note: null, tracks: [],
  }
}

const asAppleTrack = (resource: AppleMusicResource): LibraryTrack | null => {
  const attributes = resource.attributes
  if (!resource.id || !attributes?.name) return null
  return {
    source: 'apple', id: `apple:${resource.id}`, title: attributes.name,
    artist: attributes.artistName ?? 'Unknown artist', duration: duration(attributes.durationInMillis),
    albumId: null, albumTitle: attributes.albumName ?? null,
    artwork: appleArtwork(attributes.artwork, 800), artworkSmall: appleArtwork(attributes.artwork, 240),
    url: attributes.url ?? null, note: null,
  }
}

const asApplePlaylist = (resource: AppleMusicResource): LibraryPlaylist | null => {
  const attributes = resource.attributes
  if (!resource.id || !attributes?.name) return null
  return {
    id: `apple:${resource.id}`, name: attributes.name, url: attributes.url ?? null,
    artwork: appleArtwork(attributes.artwork, 600), total: attributes.trackCount ?? 0, tracks: [], access: 'readable',
  }
}

export async function loadAppleMusicLibrary(onProgress?: (message: string) => void): Promise<MusicLibrary> {
  try {
    const resources = await loadAppleMusicResources(onProgress)
    const albums = resources.albums.map(asAppleAlbum).filter((album): album is LibraryAlbum => Boolean(album))
    const tracks = resources.songs.map(asAppleTrack).filter((track): track is LibraryTrack => Boolean(track))
    const playlists = resources.playlists.map(asApplePlaylist).filter((playlist): playlist is LibraryPlaylist => Boolean(playlist))
    return {
      source: 'apple', albums, tracks, playlists, userId: null, userName: null,
      warnings: ['Apple Music 个人库已读取；Apple Music API 不提供可直接显示的账户昵称。'],
      classification: { status: 'idle', total: albums.length, classified: 0, unclassified: albums.length, completed: 0, lastError: null },
    }
  } catch (error) {
    if (error instanceof AppleMusicError) throw error
    throw new AppleMusicError('Apple Music 个人资料库读取失败，请重新授权后重试。')
  }
}

type LibraryContextValue = {
  library: MusicLibrary
  libraryHydrated: boolean
  mode: MusicProvider
  providerState: MusicProviderState
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: string
  error: string | null
  connected: boolean
  activateSpotify: () => Promise<boolean>
  activateApple: () => Promise<boolean>
  refresh: () => Promise<boolean>
  disconnect: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const restoredRef = useRef(false)
  const initialProvider = getAppleMusicSession() ? 'apple' : 'spotify' as MusicProvider
  const initialConnected = initialProvider === 'apple' ? Boolean(getAppleMusicSession()) : Boolean(getSpotifySession())
  const initialCachedLibrary = initialConnected ? readCachedLibrary(initialProvider) : null
  const [mode, setMode] = useState<MusicProvider>(initialProvider)
  const [library, setLibrary] = useState<MusicLibrary>(() => initialCachedLibrary ?? emptyLibrary(initialProvider))
  const [libraryHydrated, setLibraryHydrated] = useState(() => !initialConnected || Boolean(initialCachedLibrary))
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(() => initialConnected && !initialCachedLibrary ? 'loading' : initialCachedLibrary ? 'ready' : 'idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const classificationRun = useRef(0)
  const connected = mode === 'apple' ? Boolean(getAppleMusicSession()) : Boolean(getSpotifySession())

  const classifyInBackground = async (next: MusicLibrary, run: number) => {
    const manualAssignments = getCurrentAccountGenreAssignments()
    const initial = Object.fromEntries(next.albums.map(album => [album.id, normalizeClassification(album.classification ?? classifyAlbumFromKnownData(album))]))
    const albumsToClassify = next.albums.filter(album => !album.classification && !manualAssignments[album.id])
    const running = summaryForClassifications(next.albums, initial, 'running')
    setLibrary({ ...next, albums: next.albums.map(album => ({ ...album, classification: initial[album.id] })), classification: running })
    if (!shouldRunAutomaticClassification(next.albums, next.classification.status, manualAssignments)) {
      const ready = { ...next, albums: next.albums.map(album => ({ ...album, classification: initial[album.id] })), classification: summaryForClassifications(next.albums, initial, 'ready') }
      setLibrary(ready)
      writeCachedLibrary(ready)
      setProgress('')
      return
    }
    try {
      const results = await classifyAlbums(albumsToClassify, setProgress)
      if (run !== classificationRun.current) return
      const classifications = { ...initial, ...Object.fromEntries(results.map(result => [result.album.id, normalizeClassification(result.classification)])) }
      const summary = summaryForClassifications(next.albums, classifications, 'ready')
      const warnings = [...next.warnings]
      if (summary.unclassified > 0) warnings.push(`${summary.unclassified} 张专辑暂未完成可靠分类；它们仍保留在 All Albums。`)
      const classifiedLibrary = { ...next, albums: next.albums.map(album => ({ ...album, classification: classifications[album.id] })), warnings, classification: summary }
      setLibrary(classifiedLibrary)
      writeCachedLibrary(classifiedLibrary)
      setProgress('')
    } catch (reason) {
      if (run !== classificationRun.current) return
      const partiallyClassified = {
        ...next,
        albums: next.albums.map(album => ({ ...album, classification: initial[album.id] })),
        classification: { ...running, status: 'error' as const, lastError: reason instanceof Error ? reason.message : '分类请求失败。' },
      }
      setLibrary(partiallyClassified)
      writeCachedLibrary(partiallyClassified)
      setProgress('')
    }
  }

  const refreshFor = async (provider: MusicProvider) => {
    const run = ++classificationRun.current
    setMode(provider)
    sessionStorage.setItem(ACTIVE_PROVIDER_KEY, provider)
    setStatus('loading')
    setError(null)
    const cached = readCachedLibrary(provider)
    if (cached) setLibrary(cached)
    else setLibrary(emptyLibrary(provider))
    setLibraryHydrated(Boolean(cached))
    try {
      const next = provider === 'apple' ? await loadAppleMusicLibrary(setProgress) : await loadSpotifyLibrary(setProgress)
      let confirmedCache = cached
      if (next.userId) {
        sessionStorage.setItem(providerAuthKey(provider, 'account-id'), next.userId)
        window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT))
        // The profile response is the first point at which an unknown
        // account can be safely matched to an existing scoped cache.
        confirmedCache = readCachedLibrary(provider)
      }
      const cachedById = new Map((confirmedCache?.albums ?? []).map(album => [album.id, album.classification]))
      const hasCompleteCachedClassification = confirmedCache
        ? hasCompleteClassificationCache(next.albums, Object.fromEntries(cachedById), confirmedCache.classification)
        : false
      const hydratedClassifications = Object.fromEntries(next.albums.flatMap(album => {
        const classification = cachedById.get(album.id)
        return classification ? [[album.id, classification]] : []
      }))
      const hydrated = {
        ...next,
        albums: next.albums.map(album => ({ ...album, classification: cachedById.get(album.id) })),
        classification: hasCompleteCachedClassification ? summaryForClassifications(next.albums, hydratedClassifications, 'ready') : next.classification,
      }
      setLibrary(hydrated)
      setLibraryHydrated(true)
      setStatus('ready')
      if (hasCompleteCachedClassification) {
        writeCachedLibrary(hydrated)
        setProgress('')
        return true
      }
      setProgress('正在后台整理音乐类型…')
      void classifyInBackground(hydrated, run)
      return true
    } catch (reason) {
      setStatus('error')
      setLibraryHydrated(Boolean(cached))
      setError(reason instanceof Error ? reason.message : '读取音乐库失败。')
      return false
    }
  }

  const refresh = () => refreshFor(mode)

  const activateSpotify = async () => {
    setMode('spotify')
    return refreshFor('spotify')
  }

  const activateApple = async () => {
    setMode('apple')
    return refreshFor('apple')
  }

  useEffect(() => {
    if (restoredRef.current || location.pathname === '/callback') return
    restoredRef.current = true
    if (initialConnected) sessionStorage.setItem(ACTIVE_PROVIDER_KEY, initialProvider)
    if (mode === 'apple' && getAppleMusicSession()) void refreshFor('apple')
    else if (mode === 'spotify' && getSpotifySession()) void refreshFor('spotify')
  }, [])

  const disconnect = () => {
    if (mode === 'apple') {
      void disconnectAppleMusic()
      sessionStorage.removeItem(providerAuthKey('apple', 'account-id'))
    } else {
      disconnectSpotify()
      sessionStorage.removeItem(providerAuthKey('spotify', 'account-id'))
    }
    const nextProvider = mode === 'apple'
      ? getSpotifySession() ? 'spotify' : null
      : getAppleMusicSession() ? 'apple' : null
    if (nextProvider) sessionStorage.setItem(ACTIVE_PROVIDER_KEY, nextProvider)
    else sessionStorage.removeItem(ACTIVE_PROVIDER_KEY)
    setLibrary(emptyLibrary(mode))
    setLibraryHydrated(true)
    window.dispatchEvent(new Event(ACCOUNT_CHANGE_EVENT))
    setStatus('idle')
    setProgress('')
    setError(null)
  }

  const providerState = useMemo(() => createProviderState(mode, {
    connectionStatus: connected ? 'connected' : 'disconnected',
    accountId: library.userId,
    libraryStatus: status === 'loading' ? 'loading' : status === 'ready' ? 'ready' : status === 'error' ? 'error' : 'idle',
  }), [mode, connected, library.userId, status])
  const value = useMemo(() => ({
    library, libraryHydrated, mode, providerState, status, progress, error, connected,
    activateSpotify, activateApple, refresh, disconnect,
  }), [library, libraryHydrated, mode, providerState, status, progress, error, connected])
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('useLibrary must be used within LibraryProvider')
  return value
}
