import { useEffect, useState } from 'react'
import type { LibraryAlbum } from './library'

export type AlbumIntroductionStatus = 'loading' | 'ready' | 'unavailable' | 'error'
export type AlbumIntroduction = {
  status: Exclude<AlbumIntroductionStatus, 'loading'>
  text?: string
  sourceLabel?: string
  sourceUrl?: string
}
type AlbumIntroductionState = AlbumIntroduction | { status: 'loading' }

type CachedIntroduction = AlbumIntroduction & { expiresAt: number }
type MusicBrainzSearch = {
  'release-groups'?: Array<{
    id?: string
    title?: string
    'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>
    'first-release-date'?: string
  }>
}
type MusicBrainzDetail = {
  relations?: Array<{ type?: string; url?: { resource?: string } }>
  annotation?: string
}
type WikipediaSummary = {
  title?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
  description?: string
}
type WikipediaSearch = { query?: { search?: Array<{ title?: string }> } }

const CACHE_KEY = 'mva-album-introduction-v1'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30
const ERROR_TTL = 1000 * 60 * 10

const fold = (value: string) => value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const firstArtist = (album: LibraryAlbum) => album.artist.split(',')[0].trim()
const identityKey = (album: LibraryAlbum) => [album.id, fold(album.title), fold(firstArtist(album)), album.year ?? '', 'v1'].join('|')

function readCache(): Record<string, CachedIntroduction> {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, CachedIntroduction> } catch { return {} }
}
function writeCache(cache: Record<string, CachedIntroduction>) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* private browsing */ }
}
function cached(key: string): AlbumIntroduction | null {
  const entry = readCache()[key]
  return entry && entry.expiresAt > Date.now() ? entry : null
}
function save(key: string, result: AlbumIntroduction, ttl = CACHE_TTL) {
  const cache = readCache()
  cache[key] = { ...result, expiresAt: Date.now() + ttl }
  writeCache(cache)
  return result
}

const sentenceLimit = (text: string) => {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const sentences = cleaned.match(/[^.!?。！？]+[.!?。！？]+/g) ?? [cleaned]
  return sentences.slice(0, 3).join(' ').trim().slice(0, 620).trim()
}

function isVerifiedSummary(album: LibraryAlbum, summary: WikipediaSummary) {
  const title = fold(album.title)
  const artist = fold(firstArtist(album))
  const haystack = fold(`${summary.title ?? ''} ${summary.description ?? ''} ${summary.extract ?? ''}`)
  const titleParts = title.split(' ').filter(part => part.length > 1)
  const titleMatch = Boolean(title) && (haystack.includes(title) || (titleParts.length > 1 && titleParts.every(part => haystack.includes(part))))
  const artistMatch = Boolean(artist) && haystack.includes(artist)
  return Boolean(summary.extract && titleMatch && artistMatch)
}

async function fetchJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

async function fetchWikipediaSummary(pageTitle: string, album: LibraryAlbum, signal: AbortSignal) {
  const encoded = encodeURIComponent(pageTitle.replace(/ /g, '_'))
  const summary = await fetchJson<WikipediaSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, signal)
  return isVerifiedSummary(album, summary) ? summary : null
}

async function findWikipediaSummary(album: LibraryAlbum, signal: AbortSignal) {
  const search = await fetchJson<WikipediaSearch>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`"${album.title}" ${firstArtist(album)}`)}&format=json&origin=*`, signal)
  for (const result of search.query?.search ?? []) {
    if (!result.title) continue
    try {
      const summary = await fetchWikipediaSummary(result.title, album, signal)
      if (summary) return summary
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
  }
  return null
}

async function findMusicBrainzPage(album: LibraryAlbum, signal: AbortSignal) {
  const query = encodeURIComponent(`releasegroup:"${album.title}" AND artist:"${firstArtist(album)}"`)
  const search = await fetchJson<MusicBrainzSearch>(`/api/musicbrainz/ws/2/release-group?query=${query}&fmt=json&limit=5`, signal)
  const title = fold(album.title)
  const artist = fold(firstArtist(album))
  const hit = (search['release-groups'] ?? []).find(candidate => {
    const candidateTitle = fold(candidate.title ?? '')
    const candidateArtist = fold((candidate['artist-credit'] ?? []).map(item => item.name ?? item.artist?.name ?? '').join(' '))
    return candidate.id && candidateTitle === title && candidateArtist.includes(artist)
  })
  if (!hit?.id) return null
  const detail = await fetchJson<MusicBrainzDetail>(`/api/musicbrainz/ws/2/release-group/${encodeURIComponent(hit.id)}?inc=url-rels+annotation&fmt=json`, signal)
  const wikipediaUrl = detail.relations?.find(relation => relation.type === 'wikipedia' && relation.url?.resource)?.url?.resource
  if (wikipediaUrl) {
    const pageTitle = decodeURIComponent(wikipediaUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ')
    if (pageTitle) {
      try {
        const summary = await fetchWikipediaSummary(pageTitle, album, signal)
        if (summary) return { summary, sourceUrl: summary.content_urls?.desktop?.page ?? wikipediaUrl }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
      }
    }
  }
  return null
}

export async function fetchAlbumIntroduction(album: LibraryAlbum, signal: AbortSignal): Promise<AlbumIntroduction> {
  const key = identityKey(album)
  const existing = cached(key)
  if (existing) return existing
  try {
    let fromMusicBrainz: Awaited<ReturnType<typeof findMusicBrainzPage>> = null
    try {
      fromMusicBrainz = await findMusicBrainzPage(album, signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
    let fallbackSummary: WikipediaSummary | null = null
    try {
      fallbackSummary = fromMusicBrainz ? null : await findWikipediaSummary(album, signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      return save(key, { status: 'error' }, ERROR_TTL)
    }
    const verified = fromMusicBrainz ?? (fallbackSummary ? { summary: fallbackSummary, sourceUrl: fallbackSummary.content_urls?.desktop?.page } : null)
    if (!verified?.summary.extract) return save(key, { status: 'unavailable' })
    return save(key, {
      status: 'ready',
      text: sentenceLimit(verified.summary.extract),
      sourceLabel: 'WIKIPEDIA / VERIFIED RELEASE LINK',
      sourceUrl: verified.sourceUrl,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return save(key, { status: 'error' }, ERROR_TTL)
  }
}

export function useAlbumIntroduction(album: LibraryAlbum | null) {
  const [result, setResult] = useState<AlbumIntroductionState>({ status: 'loading' })
  useEffect(() => {
    if (!album) {
      setResult({ status: 'unavailable' })
      return
    }
    const controller = new AbortController()
    setResult({ status: 'loading' })
    void fetchAlbumIntroduction(album, controller.signal).then(setResult).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setResult({ status: 'error' })
    })
    return () => controller.abort()
  }, [album?.id, album?.title, album?.artist, album?.year])
  return result
}
