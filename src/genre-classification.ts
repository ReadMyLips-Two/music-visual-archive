import type { LibraryAlbum } from './library'
import type { GenreId } from './genres'

export type ClassificationSource = 'musicbrainz' | 'spotify-artist-genres' | 'apple-genre-tags' | 'unclassified'
export type MetadataLookupStatus = 'not-needed' | 'success' | 'not-found' | 'failed' | 'retryable-failure'
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
  processed: number
  retryableFailures: number
  permanentNoMatch: number
  completionState: 'idle' | 'running' | 'partial' | 'complete'
}
export type ClassificationResult = { album: LibraryAlbum; classification: AlbumClassification }
export type ClassificationQueueStats = {
  total: number
  remaining: number
  classified: number
  requestCount: number
  cacheHits: number
  retryableFailures: number
  count429: number
  count503: number
  currentAlbum: string | null
}
export type ClassificationRunOptions = {
  signal?: AbortSignal
  isActive?: () => boolean
  onResult?: (result: ClassificationResult, stats: ClassificationQueueStats) => void
  retryDelayMs?: (retryIndex: number, retryAfterMs?: number) => number
}
type MbCacheEntry = { expiresAt: number; tags: string[]; confidence: number; status?: MetadataLookupStatus; reason?: string }
export const MUSICBRAINZ_CACHE_KEY = 'mva-musicbrainz-cache-v5'
export const MUSICBRAINZ_REQUEST_SPACING_MS = 1200
export const MUSICBRAINZ_RETRY_DELAYS_MS = [2000, 5000, 10000] as const
export function getMusicBrainzRetryDelay(retryIndex: number, retryAfterMs = 0) {
  return Math.max(MUSICBRAINZ_RETRY_DELAYS_MS[Math.min(retryIndex, MUSICBRAINZ_RETRY_DELAYS_MS.length - 1)] ?? MUSICBRAINZ_RETRY_DELAYS_MS.at(-1)!, retryAfterMs)
}
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
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Classification cancelled', 'AbortError')); return }
  const timer = window.setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, ms)
  const cancel = () => { window.clearTimeout(timer); reject(new DOMException('Classification cancelled', 'AbortError')) }
  signal?.addEventListener('abort', cancel, { once: true })
})
let queueTail = Promise.resolve()
let lastRequestAt = 0
function throttled<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = queueTail.then(async () => { if (signal?.aborted) throw new DOMException('Classification cancelled', 'AbortError'); const wait = Math.max(0, MUSICBRAINZ_REQUEST_SPACING_MS - (Date.now() - lastRequestAt)); if (wait) await sleep(wait, signal); if (signal?.aborted) throw new DOMException('Classification cancelled', 'AbortError'); lastRequestAt = Date.now(); return task() })
  queueTail = run.then(() => undefined, () => undefined)
  return run
}
class MusicBrainzRequestError extends Error {
  readonly status: number | null
  readonly retryable: boolean
  readonly retryAfterMs: number
  constructor(message: string, status: number | null, retryable: boolean, retryAfterMs = 0) { super(message); this.status = status; this.retryable = retryable; this.retryAfterMs = retryAfterMs }
}
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
function retryAfterMs(response: Response) {
  const value = response.headers.get('retry-after')
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0
}
async function mbFetch<T>(url: string, signal?: AbortSignal, stats?: ClassificationQueueStats): Promise<T> {
  const response = await throttled(() => fetch(url, { headers: { Accept: 'application/json' }, signal }), signal)
  if (stats) {
    stats.requestCount += 1
    if (response.status === 429) stats.count429 += 1
    if (response.status === 503) stats.count503 += 1
  }
  const contentType = response.headers.get('content-type') ?? ''
  const retryable = response.status === 429 || response.status === 503 || response.status >= 500
  if (!isJsonContentType(contentType)) throw new MusicBrainzRequestError(`MusicBrainz non-JSON response: HTTP ${response.status}; content-type=${contentType || 'missing'}; url=${url}`, response.status, retryable, retryAfterMs(response))
  if (!response.ok) throw new MusicBrainzRequestError(`MusicBrainz HTTP ${response.status}`, response.status, retryable, retryAfterMs(response))
  try { return await response.json() as T } catch { throw new MusicBrainzRequestError(`MusicBrainz returned invalid JSON: ${url}`, response.status, true, retryAfterMs(response)) }
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
async function lookupMusicBrainz(album: LibraryAlbum, signal?: AbortSignal, stats?: ClassificationQueueStats, retryDelayMs = getMusicBrainzRetryDelay): Promise<MbCacheEntry> {
  const key = `${normalize(album.title)}|${normalize(album.artist)}|${album.year ?? ''}`
  const cache = readCache(), cached = cache[key]
  if (cached && cached.expiresAt > Date.now() && (cached.status === 'success' || cached.status === 'not-found' || !cached.status)) {
    if (stats) stats.cacheHits += 1
    return { ...cached, status: cached.status ?? (cached.tags.length ? 'success' : 'not-found') }
  }
  const query = `releasegroup:"${album.title}" AND artist:"${album.artist.split(',')[0]}"`
  for (let retry = 0; ; retry += 1) {
    try {
      const search = await mbFetch<MbSearch>(musicBrainzUrl('/ws/2/release-group/', { query, fmt: 'json', limit: '5' }), signal, stats)
      const hit = (search['release-groups'] ?? []).map(item => ({ item, score: matchScore(album, item) })).sort((a,b) => b.score - a.score)[0]
      if (!hit || hit.score < .85 || !hit.item.id) {
        const result = { expiresAt: Date.now() + CACHE_TTL, tags: [], confidence: 0, status: 'not-found' as const, reason: 'MusicBrainz 找不到足够可靠的专辑与艺人匹配。' }
        cache[key] = result; writeCache(cache); return result
      }
      const detail = await mbFetch<MbDetail>(musicBrainzUrl(`/ws/2/release-group/${encodeURIComponent(hit.item.id)}`, { inc: 'genres tags', fmt: 'json' }), signal, stats)
      const tags = [...new Set([...(detail.genres ?? []), ...(detail.tags ?? [])].map(tag => tag.name?.trim().toLowerCase()).filter(Boolean) as string[])]
      const result = { expiresAt: Date.now() + CACHE_TTL, tags, confidence: tags.length ? Math.min(.98, hit.score / 1.0) : .55, status: tags.length ? 'success' as const : 'not-found' as const, reason: tags.length ? undefined : 'MusicBrainz 匹配成功但没有可用风格标签。' }
      cache[key] = result; writeCache(cache); return result
    } catch (error) {
      if (isAbortError(error)) throw error
      const requestError = error instanceof MusicBrainzRequestError
        ? error
        : new MusicBrainzRequestError(error instanceof Error ? error.message : 'MusicBrainz 请求失败。', null, true)
      if (!requestError.retryable || retry >= MUSICBRAINZ_RETRY_DELAYS_MS.length) {
        return { expiresAt: 0, tags: [], confidence: 0, status: requestError.retryable ? 'retryable-failure' : 'failed', reason: requestError.message }
      }
      if (stats) stats.retryableFailures += 1
      const delay = retryDelayMs(retry, requestError.retryAfterMs)
      await sleep(delay, signal)
    }
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

export async function classifyAlbum(album: LibraryAlbum, onProgress?: (message: string) => void, signal?: AbortSignal, stats?: ClassificationQueueStats, retryDelayMs = getMusicBrainzRetryDelay): Promise<AlbumClassification> {
  const known = classifyAlbumFromKnownData(album)
  if (known.primaryGenre) {
    reportClassificationDiagnostic({ albumId: album.id, album: album.title, artist: album.artist, metadataSource: known.classificationSource, metadataTags: known.rawGenreTags, normalizedGenre: [known.primaryGenre, ...known.secondaryGenres].filter((genre): genre is GenreId => Boolean(genre)), finalMvaGenre: known.primaryGenre, failureReason: known.reason })
    return known
  }
  onProgress?.(`正在查询 MusicBrainz：${album.title}`)
  const mb = await lookupMusicBrainz(album, signal, stats, retryDelayMs)
  const result = classifyFromTags(album, mb.tags, 'musicbrainz', mb.confidence, mb.reason, mb.status ?? 'not-found')
  reportClassificationDiagnostic({ albumId: album.id, album: album.title, artist: album.artist, metadataSource: 'musicbrainz', metadataTags: mb.tags, normalizedGenre: mapRawGenres(mb.tags), finalMvaGenre: result.primaryGenre, failureReason: result.reason })
  return result
}
const artistKey = (album: LibraryAlbum) => normalize(album.artist.split(',')[0])
const reusedClassification = (album: LibraryAlbum, classification: AlbumClassification): AlbumClassification => ({
  ...classification,
  albumId: album.id,
  sourcePlatform: album.source,
  lastClassifiedAt: new Date().toISOString(),
  reason: 'Reused a resolved classification for the same artist.',
})
export async function classifyAlbums(albums: LibraryAlbum[], onProgress?: (message: string) => void, options: ClassificationRunOptions = {}): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []
  const artistClassifications = new Map<string, AlbumClassification>()
  const stats: ClassificationQueueStats = { total: albums.length, remaining: albums.length, classified: 0, requestCount: 0, cacheHits: 0, retryableFailures: 0, count429: 0, count503: 0, currentAlbum: null }
  for (const album of albums) {
    if (options.signal?.aborted || options.isActive && !options.isActive()) throw new DOMException('Classification cancelled', 'AbortError')
    stats.currentAlbum = album.title
    const known = classifyAlbumFromKnownData(album)
    const artist = artistKey(album)
    const cachedArtistClassification = artist ? artistClassifications.get(artist) : undefined
    const classification = known.primaryGenre
      ? known
      : cachedArtistClassification?.primaryGenre
        ? reusedClassification(album, cachedArtistClassification)
        : await classifyAlbum(album, onProgress, options.signal, stats, options.retryDelayMs)
    if (classification.primaryGenre && artist && !artistClassifications.has(artist)) artistClassifications.set(artist, classification)
    const result = { album, classification: normalizeClassification(classification) }
    results.push(result)
    stats.remaining = albums.length - results.length
    stats.classified = results.filter(item => Boolean(item.classification.primaryGenre)).length
    stats.retryableFailures = results.filter(item => item.classification.metadataLookup === 'retryable-failure').length
    options.onResult?.(result, { ...stats })
    if (stats.remaining % 10 === 0 || stats.remaining === 0) {
      const dev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
      if (dev) console.debug('[CLASSIFIER]', { ...stats })
    }
  }
  return results
}
export function summaryForClassifications(albums: LibraryAlbum[], classifications: Record<string, AlbumClassification>, status: ClassificationSummary['status'] = 'ready', lastError: string | null = null, options: { manualAssignmentIds?: Iterable<string>; retryableFailures?: number; permanentNoMatch?: number } = {}): ClassificationSummary {
  const manualIds = new Set(options.manualAssignmentIds ?? [])
  const total = albums.length, classified = albums.filter(album => Boolean(classifications[album.id]?.primaryGenre) || manualIds.has(album.id)).length
  const unclassified = total - classified
  const processed = albums.filter(album => Boolean(classifications[album.id]) || manualIds.has(album.id)).length
  const retryableFailures = options.retryableFailures ?? albums.filter(album => classifications[album.id]?.metadataLookup === 'retryable-failure').length
  const permanentNoMatch = options.permanentNoMatch ?? albums.filter(album => classifications[album.id]?.metadataLookup === 'not-found').length
  const completionState = status === 'idle' ? 'idle' : status === 'running' ? 'running' : status === 'error' || processed < total || unclassified > 0 || retryableFailures > 0 ? 'partial' : 'complete'
  return { status, total, classified, unclassified, completed: processed, processed, retryableFailures, permanentNoMatch, lastError, completionState }
}
