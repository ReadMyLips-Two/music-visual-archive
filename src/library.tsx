import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { albums as demoAlbums, type Album as DemoAlbum } from './data'
import { disconnectSpotify, getSpotifySession, spotifyGet, SpotifyError } from './spotify'

export type LibraryTrack = {
  source: 'demo' | 'spotify'
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
  source: 'demo' | 'spotify'
  id: string
  title: string
  artist: string
  year: number | null
  genre: string | null
  artwork: string | null
  artworkSmall: string | null
  url: string | null
  color: string
  note: string | null
  tracks: LibraryTrack[]
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
  source: 'demo' | 'spotify'
  albums: LibraryAlbum[]
  tracks: LibraryTrack[]
  playlists: LibraryPlaylist[]
  userName: string | null
  warnings: string[]
}

type SpotifyArtist = { name?: string }
type SpotifyImage = { url?: string }
type SpotifyAlbum = {
  id?: string; name?: string; release_date?: string; artists?: SpotifyArtist[]
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
  return {
    source: 'spotify', id, title: album.name,
    artist: album.artists?.map(artist => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
    year: Number.parseInt(album.release_date?.slice(0, 4) ?? '', 10) || null,
    genre: null, artwork: album.images?.[0]?.url ?? null,
    artworkSmall: album.images?.[1]?.url ?? album.images?.[0]?.url ?? null,
    url: album.external_urls?.spotify ?? null, color: '#e5e6e3', note: null,
    tracks: (album.tracks?.items ?? []).map(track => asTrack(track, id)).filter((track): track is LibraryTrack => Boolean(track)),
  }
}

const mapDemoAlbum = (album: DemoAlbum): LibraryAlbum => ({
  source: 'demo', id: album.id, title: album.title, artist: album.artist,
  year: album.year, genre: album.genre, artwork: null, artworkSmall: null, url: null,
  color: album.color, note: album.note,
  tracks: album.tracks.map(track => ({
    source: 'demo', id: track.id, title: track.title, artist: album.artist,
    duration: track.duration, albumId: album.id, url: null, note: track.note,
    albumTitle: album.title, artwork: null, artworkSmall: null,
  })),
})

export const demoLibrary: MusicLibrary = {
  source: 'demo', albums: demoAlbums.map(mapDemoAlbum),
  tracks: demoAlbums.flatMap(album => mapDemoAlbum(album).tracks),
  playlists: [], userName: null, warnings: [],
}

const emptySpotifyLibrary: MusicLibrary = {
  source: 'spotify', albums: [], tracks: [], playlists: [], userName: null, warnings: [],
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
  const albums = savedAlbums.map(item => item.album && asAlbum(item.album)).filter((album): album is LibraryAlbum => Boolean(album))
  const tracks = savedTracks.map(item => item.track && asTrack(item.track, item.track.album?.id ? `spotify:${item.track.album.id}` : null))
    .filter((track): track is LibraryTrack => Boolean(track))
  const warnings: string[] = []
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

  return { source: 'spotify', albums, tracks, playlists, userName: profile.display_name ?? null, warnings }
}

type LibraryContextValue = {
  library: MusicLibrary
  mode: 'demo' | 'spotify'
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: string
  error: string | null
  connected: boolean
  useDemo: () => void
  activateSpotify: () => Promise<void>
  refresh: () => Promise<void>
  disconnect: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const restoredRef = useRef(false)
  const [mode, setMode] = useState<'demo' | 'spotify'>(() => sessionStorage.getItem('mva-library-mode') === 'spotify' && getSpotifySession() ? 'spotify' : 'demo')
  const [library, setLibrary] = useState<MusicLibrary>(emptySpotifyLibrary)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const connected = Boolean(getSpotifySession())

  const refresh = async () => {
    setStatus('loading')
    setError(null)
    setLibrary(emptySpotifyLibrary)
    try {
      const next = await loadSpotifyLibrary(setProgress)
      setLibrary(next)
      setStatus('ready')
      setProgress('')
    } catch (reason) {
      setStatus('error')
      setError(reason instanceof Error ? reason.message : '读取音乐库失败。')
    }
  }

  const activateSpotify = async () => {
    setMode('spotify')
    sessionStorage.setItem('mva-library-mode', 'spotify')
    setLibrary(emptySpotifyLibrary)
    await refresh()
  }

  useEffect(() => {
    if (restoredRef.current || location.pathname === '/callback') return
    restoredRef.current = true
    if (mode === 'spotify' && getSpotifySession()) void refresh()
  }, [])

  const useDemo = () => {
    setMode('demo')
    sessionStorage.setItem('mva-library-mode', 'demo')
    setLibrary(demoLibrary)
    setStatus('idle')
    setError(null)
  }

  const disconnect = () => {
    disconnectSpotify()
    setLibrary(emptySpotifyLibrary)
    useDemo()
  }

  const value = useMemo(() => ({
    library: mode === 'demo' ? demoLibrary : library, mode, status, progress, error, connected,
    useDemo, activateSpotify, refresh, disconnect,
  }), [library, mode, status, progress, error, connected])
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('useLibrary must be used within LibraryProvider')
  return value
}
