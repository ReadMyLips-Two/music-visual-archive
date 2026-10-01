import { useMemo, useSyncExternalStore } from 'react'
import type { LibraryAlbum } from './library'
import { accountScopeKey, readSessionAccountIdentity } from './account-scope'
export { canonicalGenreId } from './genre-keys'

export type GenreId = 'pop' | 'electronic' | 'soul' | 'hip-hop' | 'indie' | 'rock' | 'jazz' | 'ambient' | 'dance'

export type GenreDefinition = {
  id: GenreId
  number: string
  name: string
  entry: string
  statement: string
  color: string
  ink: string
}

export const genres: GenreDefinition[] = [
  { id: 'pop', number: '01', name: 'POP', entry: 'A brighter kind of feeling.', statement: 'Every chorus leaves a colour behind.', color: '#f0a5c4', ink: '#241b29' },
  { id: 'electronic', number: '02', name: 'ELECTRONIC', entry: 'Enter the frequency.', statement: 'Signals, patterns, and the spaces between beats.', color: '#2047d3', ink: '#fff' },
  { id: 'soul', number: '03', name: 'R&B / SOUL', entry: 'Stay a little longer.', statement: 'A warm room for voices that remain.', color: '#955342', ink: '#fff8ee' },
  { id: 'hip-hop', number: '04', name: 'HIP-HOP', entry: 'Words take the lead.', statement: 'Rhythm written large across the city.', color: '#282727', ink: '#fff' },
  { id: 'indie', number: '05', name: 'INDIE / ALTERNATIVE', entry: 'Find the other way in.', statement: 'An archive of edges, accidents, and open air.', color: '#a7b69b', ink: '#1a2b20' },
  { id: 'rock', number: '06', name: 'ROCK', entry: 'Turn the page louder.', statement: 'Pressure, grain, and a line that refuses to break.', color: '#a53330', ink: '#fff9ee' },
  { id: 'jazz', number: '07', name: 'JAZZ', entry: 'Listen to the pause.', statement: 'The note you remember arrives between the others.', color: '#c69455', ink: '#182c3b' },
  { id: 'ambient', number: '08', name: 'CLASSICAL MUSIC', entry: 'Let the space unfold.', statement: 'A slower measure of light and distance.', color: '#c5d1d6', ink: '#1c303b' },
  { id: 'dance', number: '09', name: 'DANCE / CLUB', entry: 'Move into the night.', statement: 'A sequence of bodies, mirrors, and motion.', color: '#a944a9', ink: '#fff' },
]

const STORAGE_KEY = 'mva-genre-assignments-v2'
const CHANGE_EVENT = 'mva-genre-assignments-change'
const ACCOUNT_CHANGE_EVENT = 'mva-library-account-change'
const REPRESENTATIVE_KEY = 'mva-genre-representatives-v2'
type GenreSelection = { genres: GenreId[]; primary: GenreId | null }
type Assignments = Record<string, GenreSelection>
const readStored = (key: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}
const currentScope = () => {
  const identity = readSessionAccountIdentity(sessionStorage)
  return identity ? accountScopeKey(identity) : null
}
const isGenreId = (value: unknown): value is GenreId => typeof value === 'string' && genres.some(genre => genre.id === value)
const normalizeAssignments = (value: unknown): Assignments => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([albumId, entry]) => {
    if (Array.isArray(entry)) {
      const selected = entry.filter(isGenreId)
      return [[albumId, { genres: [...new Set(selected)], primary: selected[0] ?? null } satisfies GenreSelection]]
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const selected = Array.isArray((entry as { genres?: unknown }).genres) ? (entry as { genres: unknown[] }).genres.filter(isGenreId) : []
    const primary = isGenreId((entry as { primary?: unknown }).primary) && selected.includes((entry as { primary: GenreId }).primary)
      ? (entry as { primary: GenreId }).primary
      : selected[0] ?? null
    return [[albumId, { genres: [...new Set(selected)], primary } satisfies GenreSelection]]
  })) as Assignments
}
const readAccountAssignments = (): Assignments => {
  const scope = currentScope()
  if (!scope) return {}
  const stored = readStored(STORAGE_KEY)
  if (stored[scope]) return normalizeAssignments(stored[scope])
  // v1 had no provider namespace, so ownership cannot be confirmed. Leave
  // it untouched and rebuild only from the current account's library.
  return {}
}
const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener(ACCOUNT_CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => { window.removeEventListener(CHANGE_EVENT, onChange); window.removeEventListener(ACCOUNT_CHANGE_EVENT, onChange); window.removeEventListener('storage', onChange) }
}
const getSnapshot = () => JSON.stringify(readAccountAssignments())
const getServerSnapshot = () => '{}'

export function useGenreAssignments(): Assignments {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    try { return JSON.parse(raw) as Assignments } catch { return {} }
  }, [raw])
}

export function setAlbumGenres(albumId: string, selected: GenreId[]) {
  const account = currentScope()
  if (!account) return
  const all = readStored(STORAGE_KEY), current = readAccountAssignments()[albumId]
  all[account] = { ...normalizeAssignments(all[account]), [albumId]: { genres: [...new Set(selected)], primary: current?.primary && selected.includes(current.primary) ? current.primary : selected[0] ?? null } }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function setAlbumPrimaryGenre(albumId: string, primary: GenreId | null) {
  const assignments = readAccountAssignments()[albumId]
  if (!assignments || (primary && !assignments.genres.includes(primary))) return
  const account = currentScope()
  if (!account) return
  const all = readStored(STORAGE_KEY)
  all[account] = { ...normalizeAssignments(all[account]), [albumId]: { ...assignments, primary } }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function resetAlbumGenres(albumId: string) {
  const account = currentScope()
  if (!account) return
  const all = readStored(STORAGE_KEY)
  const assignments = normalizeAssignments(all[account])
  if (Object.hasOwn(assignments, albumId)) { delete assignments[albumId]; all[account] = assignments; localStorage.setItem(STORAGE_KEY, JSON.stringify(all)) }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const genreTerms: [GenreId, RegExp][] = [
  ['ambient', /ambient|classical|orchestral|chamber|neo[- ]?classical|drone|minimalism/],
  ['jazz', /jazz|bebop|swing|bossa nova|fusion jazz/],
  ['soul', /r&b|rnb|soul|neo soul|funk|quiet storm/],
  ['hip-hop', /hip[- ]?hop|rap|trap|drill|grime/],
  ['rock', /\brock\b|metal|punk|grunge|hardcore/],
  ['indie', /indie|alternative|shoegaze|dream pop|post[- ]?punk/],
  ['dance', /dance|club|disco|house|techno|trance|edm/],
  ['electronic', /electronic|electronica|synth|idm|downtempo|breakbeat/],
  ['pop', /\bpop\b|k-pop|j-pop|synthpop/],
]

function inferredGenres(album: LibraryAlbum): GenreId[] {
  const matched = new Set<GenreId>()
  for (const term of [album.genre, ...(album.artistGenres ?? [])].filter((value): value is string => Boolean(value))) {
    const match = genreTerms.find(([, pattern]) => pattern.test(term.toLowerCase()))
    if (match) matched.add(match[0])
  }
  return [...matched].slice(0, 2)
}
export function albumGenres(album: LibraryAlbum, assignments: Assignments): GenreId[] {
  const manuallyAssigned = assignments[album.id]
  if (manuallyAssigned) {
    const selected = manuallyAssigned.genres.filter(id => genres.some(genre => genre.id === id))
    return manuallyAssigned.primary && selected.includes(manuallyAssigned.primary)
      ? [manuallyAssigned.primary, ...selected.filter(id => id !== manuallyAssigned.primary)]
      : selected
  }
  const classified = album.classification
  if (classified) {
    return [...new Set([classified.primaryGenre, ...classified.secondaryGenres].filter((id): id is GenreId => Boolean(id) && genres.some(genre => genre.id === id)))]
  }
  return inferredGenres(album)
}

export function albumsForGenre(albums: LibraryAlbum[], genreId: GenreId, assignments: Assignments) {
  return albums.filter(album => albumGenres(album, assignments).includes(genreId))
}

/** The single records source used by every genre layout. Viewport never changes this result. */
export function getGenreRecords(albums: LibraryAlbum[], genreId: GenreId, assignments: Assignments) {
  return albumsForGenre(albums, genreId, assignments)
}

type Representatives = Record<string, string>
const normalizeRepresentatives = (value: unknown): Representatives => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, albumId]) => typeof albumId === 'string')) as Representatives
}
const readRepresentatives = (): Representatives => {
  const scope = currentScope()
  if (!scope) return {}
  const stored = readStored(REPRESENTATIVE_KEY)
  if (stored[scope]) return normalizeRepresentatives(stored[scope])
  return {}
}
export function getRepresentativeAlbumId(genreId: GenreId | 'all', albums: LibraryAlbum[], assignments: Assignments) {
  const candidates = genreId === 'all' ? albums : albumsForGenre(albums, genreId, assignments)
  const selected = readRepresentatives()[genreId]
  return candidates.some(album => album.id === selected) ? selected : candidates[0]?.id ?? null
}
export function setRepresentativeAlbum(genreId: GenreId | 'all', albumId: string) {
  const account = currentScope()
  if (!account) return
  const all = readStored(REPRESENTATIVE_KEY)
  all[account] = { ...normalizeRepresentatives(all[account]), [genreId]: albumId }
  localStorage.setItem(REPRESENTATIVE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
