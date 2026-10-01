export type CanonicalGenreId = 'pop' | 'electronic' | 'soul' | 'hip-hop' | 'indie' | 'rock' | 'jazz' | 'ambient' | 'dance'

const genreAliases: Record<string, CanonicalGenreId> = {
  pop: 'pop', electronic: 'electronic', rnb: 'soul', 'r&b': 'soul', soul: 'soul', 'r&b / soul': 'soul',
  hiphop: 'hip-hop', 'hip-hop': 'hip-hop', indie: 'indie', rock: 'rock', jazz: 'jazz',
  classical: 'ambient', 'classical music': 'ambient', ambient: 'ambient', dance: 'dance', 'dance-club': 'dance', 'dance/club': 'dance', 'dance / club': 'dance',
}

export function canonicalGenreId(value: string | undefined): CanonicalGenreId | null {
  if (!value) return null
  return genreAliases[value.trim().toLowerCase()] ?? null
}
