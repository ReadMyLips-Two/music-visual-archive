export type LyricsTrack = {
  title: string
  artist: string
  albumTitle: string | null
  duration: string
}

export type LyricsRecord = {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export type LyricsResult =
  | { status: 'matched'; record: LyricsRecord; text: string; synced: boolean }
  | { status: 'instrumental' }
  | { status: 'not-found' }
  | { status: 'mismatch' }

export class LyricsProviderError extends Error {
  readonly kind: 'rate-limit' | 'network' | 'provider'
  constructor(message: string, kind: 'rate-limit' | 'network' | 'provider') { super(message); this.kind = kind }
}

const API_BASE = 'https://lrclib.net/api'
const CLIENT_ID = 'Music Visual Archive/0.1 (https://lrclib.net/docs)'

export function parseDurationSeconds(value: string): number | null {
  const match = value.match(/^(\d+):(\d{1,2})$/)
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[&]/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function artistMatches(expected: string, actual: string) {
  const left = normalize(expected.split(',')[0])
  const right = normalize(actual)
  if (!left || !right) return false
  return left === right || right.split(' feat ')[0].trim() === left || right.split(' and ')[0].trim() === left
}

export function verifyLyricsMatch(track: LyricsTrack, record: LyricsRecord) {
  const expectedDuration = parseDurationSeconds(track.duration)
  const titleMatches = normalize(track.title) === normalize(record.trackName)
  const albumMatches = Boolean(track.albumTitle && record.albumName) && normalize(track.albumTitle!) === normalize(record.albumName)
  const artistMatchesExactly = artistMatches(track.artist, record.artistName)
  const durationMatches = expectedDuration === null || Math.abs(expectedDuration - record.duration) <= 2
  return { titleMatches, albumMatches, artistMatches: artistMatchesExactly, durationMatches, valid: titleMatches && albumMatches && artistMatchesExactly && durationMatches }
}

export function syncedToPlainText(value: string) {
  return value.split(/\r?\n/).map(line => line.replace(/^\s*(?:\[\d{1,2}:\d{2}(?:\.\d{1,3})?\])+\s*/, '')).join('\n').trim()
}

export function chooseLyricsText(record: LyricsRecord) {
  if (record.syncedLyrics?.trim()) return { text: syncedToPlainText(record.syncedLyrics), synced: true }
  if (record.plainLyrics?.trim()) return { text: record.plainLyrics.trim(), synced: false }
  return null
}

export async function fetchLyrics(track: LyricsTrack, signal?: AbortSignal): Promise<LyricsResult> {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist.split(',')[0].trim() })
  if (track.albumTitle) params.set('album_name', track.albumTitle)
  const duration = parseDurationSeconds(track.duration)
  if (duration) params.set('duration', String(duration))
  let response: Response
  try {
    response = await fetch(`${API_BASE}/get?${params.toString()}`, { headers: { 'X-User-Agent': CLIENT_ID, Accept: 'application/json' }, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new LyricsProviderError('无法连接歌词服务。', 'network')
  }
  if (response.status === 404) return { status: 'not-found' }
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    throw new LyricsProviderError(retryAfter ? `歌词服务暂时限流，请约 ${retryAfter} 秒后重试。` : '歌词服务暂时限流，请稍后重试。', 'rate-limit')
  }
  if (!response.ok) throw new LyricsProviderError(`歌词服务返回 HTTP ${response.status}。`, 'provider')
  const record = await response.json() as LyricsRecord
  const match = verifyLyricsMatch(track, record)
  if (!match.valid) return { status: 'mismatch' }
  if (record.instrumental) return { status: 'instrumental' }
  const selected = chooseLyricsText(record)
  return selected ? { status: 'matched', record, ...selected } : { status: 'not-found' }
}
