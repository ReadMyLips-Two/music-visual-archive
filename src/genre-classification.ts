import type { LibraryAlbum } from './library'
import type { GenreId } from './genres'

export type ClassificationSource = 'musicbrainz' | 'spotify-artist-genres' | 'apple-genre-tags' | 'unclassified'
export type MetadataLookupStatus = 'not-needed' | 'success' | 'not-found' | 'failed'
export type AlbumClassification = {
  albumId: string
  sourcePlatform: LibraryAlbum['source']
  primaryGenre: GenreId | null
  secondaryGenres: GenreId[]
  rawGenreTags: string[]
  classificationSource: ClassificationSource
  confidence: number
  userOverride: boolean
  lastClassifiedAt: string
  metadataLookup?: MetadataLookupStatus
  reason?: string
}
export type ClassificationSummary = {
  status: 'idle' | 'running' | 'ready' | 'error'
  total: number
  classified: number
  unclassified: number
  completed: number
  lastError: string | null
  completionState?: 'not-started' | 'running' | 'partial' | 'complete'
}
export type ClassificationResult = { album: LibraryAlbum; classification: AlbumClassification }
type MbCacheEntry = { expiresAt: number; tags: string[]; confidence: number; status?: MetadataLookupStatus; reason?: string }
export const MUSICBRAINZ_CACHE_KEY = 'mva-musicbrainz-cache-v4'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30
const GENRE_IDS: GenreId[] = ['pop','electronic','soul','hip-hop','indie','rock','jazz','ambient','dance']
const synonyms: Record<GenreId, string[]> = {
  pop: ['pop','art pop','electropop','indie pop','k-pop','j-pop','synthpop','teen pop','dance-pop'],
  electronic: ['electronic','electronica','idm','synth','synthwave','downtempo','breakbeat','electro','glitch','trip-hop'],
  soul: ['r&b','rnb','soul','neo soul','funk','quiet storm','motown','urban contemporary','contemporary r&b'],
  'hip-hop': ['hip hop','hip-hop','rap','trap','drill','grime','boom bap','cloud rap','gangsta rap'],
  indie: ['indie','alternative','indie rock','indie pop','shoegaze','dream pop','post-punk','post rock','lo-fi'],
  rock: ['rock','metal','punk','grunge','hardcore','hard rock','heavy metal','emo','garage rock'],
  jazz: ['jazz','bebop','swing','bossa nova','fusion','vocal jazz','free jazz','cool jazz'],
  ambient: ['ambient','classical','orchestral','chamber','neo-classical','drone','minimalism','modern classical','soundtrack'],
  dance: ['dance','club','disco','house','techno','trance','edm','dancehall','garage','uk garage'],
}
const genericTerms = new Set(['pop', 'rock', 'electronic', 'dance', 'alternative', 'soul'])
const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim()
const musicBrainzUrl = (path: string, params: Record<string, string>) => `/api/musicbrainz?${new URLSearchParams({ path, ...params }).toString()}`
const readCache = (): Record<string, MbCacheEntry> => { try { return JSON.parse(localStorage.getItem(MUSICBRAINZ_CACHE_KEY) ?? '{}') as Record<string, MbCacheEntry> } catch { return {} } }
const writeCache = (cache: Record<string, MbCacheEntry>) => { try { localStorage.setItem(MUSICBRAINZ_CACHE_KEY, JSON.stringify(cache)) } catch { /* private mode */ } }
const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
let queueTail = Promise.resolve()
let lastRequestAt = 0
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => { const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt)); if (wait) await sleep(wait); lastRequestAt = Date.now(); return task() })
  queueTail = run.then(() => undefined, () => undefined)
  return run
}
async function mbFetch<T>(url: string): Promise<T> {
  const response = await throttled(() => fetch(url, { headers: { Accept: 'application/json' } }))
  const contentType = response.headers.get('content-type') ?? ''
  if (!isJsonContentType(contentType)) throw new Error(`MusicBrainz non-JSON response: HTTP ${response.status}; content-type=${contentType || 'missing'}; url=${url}`)
  if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export function isJsonContentType(contentType: string) {
  return /(^|;)\s*application\/json\s*(;|$)/i.test(contentType) || /\+json\s*(;|$)/i.test(contentType)
}
type MbSearch = { 'release-groups'?: Array<{ id?: string; title?: string; 'first-release-date'?: string; score?: number; 'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }> }> }
type MbDetail = { tags?: Array<{ name?: string; count?: number }>; genres?: Array<{ name?: string; count?: number }> }
function matchScore(album: LibraryAlbum, hit: NonNullable<MbSearch['release-groups']>[number]) {
  const title = normalize(album.title), artist = normalize(album.artist)
  const hitTitle = normalize(hit.title ?? '')
  const hitArtist = normalize((hit['artist-credit'] ?? []).map(item => item.name ?? item.artist?.name ?? '').join(' '))
  if (!title || title !== hitTitle || !hitArtist) return 0
  const artistHit = hitArtist.includes(artist) || artist.split(' ').every(part => part.length > 2 && hitArtist.includes(part))
  if (!artistHit) return 0
  const year = album.year && hit['first-release-date'] ? Number(hit['first-release-date'].slice(0,4)) : null
  const yearScore = year && album.year && year === album.year ? .1 : .0
  return .85 + yearScore
}
async function lookupMusicBrainz(album: LibraryAlbum): Promise<MbCacheEntry> {
  const key = `${normalize(album.title)}|${normalize(album.artist)}|${album.year ?? ''}`
  const cache = readCache(), cached = cache[key]
  if (cached && cached.expiresAt > Date.now()) return { ...cached, status: cached.status ?? (cached.tags.length ? 'success' : 'not-found') }
  const query = `releasegroup:"${album.title}" AND artist:"${album.artist.split(',')[0]}"`
  try {
    const search = await mbFetch<MbSearch>(musicBrainzUrl('/ws/2/release-group/', { query, fmt: 'json', limit: '5' }))
    const hit = (search['release-groups'] ?? []).map(item => ({ item, score: matchScore(album, item) })).sort((a,b) => b.score - a.score)[0]
    if (!hit || hit.score < .85 || !hit.item.id) {
      const result = { expiresAt: Date.now() + CACHE_TTL, tags: [], confidence: 0, status: 'not-found' as const, reason: 'MusicBrainz 找不到足够可靠的专辑与艺人匹配。' }
      cache[key] = result; writeCache(cache); return result
    }
    const detail = await mbFetch<MbDetail>(musicBrainzUrl(`/ws/2/release-group/${encodeURIComponent(hit.item.id)}`, { inc: 'genres tags', fmt: 'json' }))
    const tags = [...new Set([...(detail.genres ?? []), ...(detail.tags ?? [])].map(tag => tag.name?.trim().toLowerCase()).filter(Boolean) as string[])]
    const result = { expiresAt: Date.now() + CACHE_TTL, tags, confidence: tags.length ? Math.min(.98, hit.score / 1.0) : .55, status: tags.length ? 'success' as const : 'not-found' as const, reason: tags.length ? undefined : 'MusicBrainz 匹配成功但没有可用风格标签。' }
    cache[key] = result; writeCache(cache); return result
  } catch (error) {
    const result = { expiresAt: Date.now() + 1000 * 60 * 10, tags: [], confidence: 0, status: 'failed' as const, reason: error instanceof Error ? error.message : 'MusicBrainz 请求失败。' }
    cache[key] = result; writeCache(cache); return result
  }
}
export function mapRawGenres(rawTags: string[]) {
  return rankGenreCandidates(rawTags).map(candidate => candidate.id)
}
type GenreCandidate = { id: GenreId; score: number; evidence: string[] }
export function rankGenreCandidates(rawTags: string[]): GenreCandidate[] {
  const candidates = new Map<GenreId, GenreCandidate>()
  for (const rawTag of rawTags) {
    const tag = normalize(rawTag)
    if (!tag) continue
    for (const genre of GENRE_IDS) {
      const matches = synonyms[genre].map(normalize).filter(term => tag === term || tag.includes(term))
      if (!matches.length) continue
      const best = matches.sort((a, b) => b.length - a.length)[0]
      const exact = tag === best
      const specificity = Math.min(2, best.split(' ').length * .35 + best.length / 30)
      const genericPenalty = genericTerms.has(best) ? 1.15 : 0
      const score = (exact ? 4 : 2) + specificity - genericPenalty
      const existing = candidates.get(genre)
      if (!existing) candidates.set(genre, { id: genre, score, evidence: [rawTag] })
      else { existing.score += score * .55; existing.evidence.push(rawTag) }
    }
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || GENRE_IDS.indexOf(a.id) - GENRE_IDS.indexOf(b.id))
}
export function selectAutomaticGenres(rawTags: string[], confidence: number) {
  const ranked = rankGenreCandidates(rawTags)
  if (!ranked.length || confidence <= 0) return { primaryGenre: null as GenreId | null, secondaryGenres: [] as GenreId[] }
  const primary = ranked[0]
  const reliablePrimary = confidence >= .55 && primary.score >= 2.9
  if (!reliablePrimary) return { primaryGenre: null, secondaryGenres: [] }
  const secondary = ranked.slice(1).find(candidate => candidate.score >= 2.9 && candidate.score >= primary.score * .68)
  return { primaryGenre: primary.id, secondaryGenres: secondary ? [secondary.id] : [] }
}
export function classifyFromTags(album: LibraryAlbum, rawTags: string[], source: ClassificationSource, confidence: number, reason?: string, metadataLookup: MetadataLookupStatus = source === 'musicbrainz' ? 'success' : source === 'unclassified' ? 'not-found' : 'not-needed'): AlbumClassification {
  const selected = selectAutomaticGenres(rawTags, confidence)
  const hasGenre = Boolean(selected.primaryGenre)
  return { albumId: album.id, sourcePlatform: album.source, primaryGenre: selected.primaryGenre, secondaryGenres: selected.secondaryGenres, rawGenreTags: rawTags, classificationSource: source, confidence, userOverride: false, lastClassifiedAt: new Date().toISOString(), metadataLookup, reason: reason ?? (hasGenre ? undefined : '没有映射到 MVA 九个音乐空间的可靠标签。') }
}

export function normalizeClassification(classification: AlbumClassification): AlbumClassification {
  const primary = classification.primaryGenre
  const secondary = [...new Set(classification.secondaryGenres)].filter(id => id !== primary).slice(0, 1)
  return { ...classification, secondaryGenres: secondary, metadataLookup: classification.metadataLookup ?? (classification.classificationSource === 'musicbrainz' ? (classification.primaryGenre ? 'success' : 'not-found') : 'not-needed') }
}
export function classifyAlbumFromKnownData(album: LibraryAlbum): AlbumClassification {
  const knownTags = [album.genre, ...(album.artistGenres ?? [])].filter((tag): tag is string => Boolean(tag))
  if (knownTags.length) return classifyFromTags(album, knownTags, album.source === 'apple' ? 'apple-genre-tags' : 'spotify-artist-genres', .62)
  return classifyFromTags(album, [], 'unclassified', 0, `${album.source === 'apple' ? 'Apple Music' : 'Spotify'} 未提供风格词条，等待 MusicBrainz 匹配。`)
}

type ClassificationDiagnostic = {
  albumId: string
  album: string
  artist: string
  metadataSource: ClassificationSource
  metadataTags: string[]
  normalizedGenre: string[]
  finalMvaGenre: string | null
  failureReason?: string
}
let diagnosticAttempts = 0
function reportClassificationDiagnostic(diagnostic: ClassificationDiagnostic) {
  const dev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  if (!dev || diagnosticAttempts >= 10) return
  diagnosticAttempts += 1
  console.debug('[MVA classification]', diagnostic)
}

export async function classifyAlbum(album: LibraryAlbum, onProgress?: (message: string) => void): Promise<AlbumClassification> {
  const known = classifyAlbumFromKnownData(album)
  if (known.primaryGenre) {
    reportClassificationDiagnostic({ albumId: album.id, album: album.title, artist: album.artist, metadataSource: known.classificationSource, metadataTags: known.rawGenreTags, normalizedGenre: [known.primaryGenre, ...known.secondaryGenres].filter((genre): genre is GenreId => Boolean(genre)), finalMvaGenre: known.primaryGenre, failureReason: known.reason })
    return known
  }
  onProgress?.(`正在查询 MusicBrainz：${album.title}`)
  const mb = await lookupMusicBrainz(album)
  const result = classifyFromTags(album, mb.tags, 'musicbrainz', mb.confidence, mb.reason, mb.status ?? 'not-found')
  reportClassificationDiagnostic({ albumId: album.id, album: album.title, artist: album.artist, metadataSource: 'musicbrainz', metadataTags: mb.tags, normalizedGenre: mapRawGenres(mb.tags), finalMvaGenre: result.primaryGenre, failureReason: result.reason })
  return result
}
export async function classifyAlbums(albums: LibraryAlbum[], onProgress?: (message: string) => void): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []
  for (const album of albums) results.push({ album, classification: await classifyAlbum(album, onProgress) })
  return results
}
export function summaryForClassifications(albums: LibraryAlbum[], classifications: Record<string, AlbumClassification>, status: ClassificationSummary['status'] = 'ready', lastError: string | null = null): ClassificationSummary {
  const total = albums.length, classified = albums.filter(album => Boolean(classifications[album.id]?.primaryGenre)).length
  const unclassified = total - classified
  const failedLookups = albums.some(album => classifications[album.id]?.metadataLookup === 'failed')
  const allProcessed = albums.every(album => Boolean(classifications[album.id]))
  const completionState = status === 'idle' ? 'not-started' : status === 'running' ? 'running' : status === 'error' || failedLookups || !allProcessed || unclassified > 0 ? 'partial' : 'complete'
  return { status, total, classified, unclassified, completed: albums.filter(album => Boolean(classifications[album.id])).length, lastError, completionState }
}
