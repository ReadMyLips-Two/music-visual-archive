import { useMemo, useSyncExternalStore } from 'react'
import type { LibraryAlbum } from './library'

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
  { id: 'ambient', number: '08', name: 'CLASSICAL / AMBIENT', entry: 'Let the space unfold.', statement: 'A slower measure of light and distance.', color: '#c5d1d6', ink: '#1c303b' },
  { id: 'dance', number: '09', name: 'DANCE / CLUB', entry: 'Move into the night.', statement: 'A sequence of bodies, mirrors, and motion.', color: '#a944a9', ink: '#fff' },
]

const STORAGE_KEY = 'mva-genre-assignments-v1'
const CHANGE_EVENT = 'mva-genre-assignments-change'
type Assignments = Record<string, GenreId[]>
const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => { window.removeEventListener(CHANGE_EVENT, onChange); window.removeEventListener('storage', onChange) }
}
const getSnapshot = () => localStorage.getItem(STORAGE_KEY) ?? '{}'
const getServerSnapshot = () => '{}'

export function useGenreAssignments(): Assignments {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    try { return JSON.parse(raw) as Assignments } catch { return {} }
  }, [raw])
}

export function setAlbumGenres(albumId: string, selected: GenreId[]) {
  let assignments: Assignments = {}
  try { assignments = JSON.parse(getSnapshot()) as Assignments } catch { /* reset invalid local data */ }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...assignments, [albumId]: selected }))
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
  for (const term of album.artistGenres ?? []) {
    const match = genreTerms.find(([, pattern]) => pattern.test(term.toLowerCase()))
    if (match) matched.add(match[0])
  }
  return [...matched]
}
const demoGenreMap: Record<string, GenreId[]> = {
  Ambient: ['ambient'], Electronic: ['electronic'], Indie: ['indie'],
}

export function albumGenres(album: LibraryAlbum, assignments: Assignments): GenreId[] {
  if (album.source === 'demo') return demoGenreMap[album.genre ?? ''] ?? []
  const manuallyAssigned = assignments[album.id]
  if (manuallyAssigned) return manuallyAssigned.filter(id => genres.some(genre => genre.id === id))
  const classified = album.classification
  if (classified) {
    return [...new Set([classified.primaryGenre, ...classified.secondaryGenres].filter((id): id is GenreId => Boolean(id) && genres.some(genre => genre.id === id)))]
  }
  return inferredGenres(album)
}

export function albumsForGenre(albums: LibraryAlbum[], genreId: GenreId, assignments: Assignments) {
  return albums.filter(album => albumGenres(album, assignments).includes(genreId))
}
