import type { LibraryAlbum } from './library'
import type { GenreId } from './genres'

export type ClassificationSource = 'musicbrainz' | 'spotify-artist-genres' | 'demo' | 'unclassified'
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
  reason?: string
}
export type ClassificationSummary = {
  status: 'idle' | 'running' | 'ready' | 'error'
  total: number
  classified: number
  unclassified: number
  completed: number
  lastError: string | null
}
export type ClassificationResult = { album: LibraryAlbum; classification: AlbumClassification }
type MbCacheEntry = { expiresAt: number; tags: string[]; confidence: number; reason?: string }
const CACHE_KEY = 'mva-musicbrainz-cache-v1'
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
const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,' ').trim()
const readCache = (): Record<string, MbCacheEntry> => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, MbCacheEntry> } catch { return {} } }
const writeCache = (cache: Record<string, MbCacheEntry>) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* private mode */ } }
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
  if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`)
  return response.json() as Promise<T>
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
  if (cached && cached.expiresAt > Date.now()) return cached
  const query = encodeURIComponent(`releasegroup:"${album.title}" AND artist:"${album.artist.split(',')[0]}"`)
  try {
    const search = await mbFetch<MbSearch>(`/api/musicbrainz/ws/2/release-group?query=${query}&fmt=json&limit=5`)
    const hit = (search['release-groups'] ?? []).map(item => ({ item, score: matchScore(album, item) })).sort((a,b) => b.score - a.score)[0]
    if (!hit || hit.score < .85 || !hit.item.id) {
      const result = { expiresAt: Date.now() + CACHE_TTL, tags: [], confidence: 0, reason: 'MusicBrainz 找不到足够可靠的专辑与艺人匹配。' }
      cache[key] = result; writeCache(cache); return result
    }
    const detail = await mbFetch<MbDetail>(`/api/musicbrainz/ws/2/release-group/${encodeURIComponent(hit.item.id)}?inc=genres+tags&fmt=json`)
    const tags = [...new Set([...(detail.genres ?? []), ...(detail.tags ?? [])].map(tag => tag.name?.trim().toLowerCase()).filter(Boolean) as string[])]
    const result = { expiresAt: Date.now() + CACHE_TTL, tags, confidence: tags.length ? Math.min(.98, hit.score / 1.0) : .55, reason: tags.length ? undefined : 'MusicBrainz 匹配成功但没有可用风格标签。' }
    cache[key] = result; writeCache(cache); return result
  } catch (error) {
    const result = { expiresAt: Date.now() + 1000 * 60 * 10, tags: [], confidence: 0, reason: error instanceof Error ? error.message : 'MusicBrainz 请求失败。' }
    cache[key] = result; writeCache(cache); return result
  }
}
export function mapRawGenres(rawTags: string[]) {
  const matched = new Set<GenreId>()
  const normalizedTags = rawTags.map(normalize)
  for (const genre of GENRE_IDS) if (synonyms[genre].some(term => normalizedTags.some(tag => tag === normalize(term) || tag.includes(normalize(term)))) ) matched.add(genre)
  return [...matched]
}
export function classifyFromTags(album: LibraryAlbum, rawTags: string[], source: ClassificationSource, confidence: number, reason?: string): AlbumClassification {
  const matched = mapRawGenres(rawTags)
  return { albumId: album.id, sourcePlatform: album.source, primaryGenre: matched[0] ?? null, secondaryGenres: matched.slice(1), rawGenreTags: rawTags, classificationSource: source, confidence, userOverride: false, lastClassifiedAt: new Date().toISOString(), reason: reason ?? (matched.length ? undefined : '没有映射到 MVA 九个音乐空间的可靠标签。') }
}
export function classifyAlbumFromKnownData(album: LibraryAlbum): AlbumClassification {
  if (album.source === 'demo') return classifyFromTags(album, album.genre ? [album.genre] : [], 'demo', 1)
  if (album.artistGenres?.length) return classifyFromTags(album, album.artistGenres, 'spotify-artist-genres', .62)
  return classifyFromTags(album, [], 'unclassified', 0, 'Spotify 未提供艺人风格词条，等待 MusicBrainz 匹配。')
}
export async function classifyAlbum(album: LibraryAlbum, onProgress?: (message: string) => void): Promise<AlbumClassification> {
  if (album.source === 'demo') return classifyAlbumFromKnownData(album)
  const known = classifyAlbumFromKnownData(album)
  if (known.primaryGenre && known.confidence >= .8) return known
  onProgress?.(`正在查询 MusicBrainz：${album.title}`)
  const mb = await lookupMusicBrainz(album)
  return classifyFromTags(album, mb.tags, 'musicbrainz', mb.confidence, mb.reason)
}
export async function classifyAlbums(albums: LibraryAlbum[], onProgress?: (message: string) => void): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = []
  for (const album of albums) results.push({ album, classification: await classifyAlbum(album, onProgress) })
  return results
}
export function summaryForClassifications(albums: LibraryAlbum[], classifications: Record<string, AlbumClassification>, status: ClassificationSummary['status'] = 'ready', lastError: string | null = null): ClassificationSummary {
  const total = albums.length, classified = albums.filter(album => Boolean(classifications[album.id]?.primaryGenre)).length
  return { status, total, classified, unclassified: total - classified, completed: Object.keys(classifications).length, lastError }
}
