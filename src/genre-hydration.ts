export type GenreHydrationState = 'hydrating' | 'classifying' | 'ready'
export type ClassificationState = 'idle' | 'running' | 'ready' | 'error'

export function getGenreHydrationState({
  connected,
  libraryHydrated,
  classificationStatus,
}: {
  connected: boolean
  libraryHydrated: boolean
  classificationStatus: ClassificationState
}): GenreHydrationState {
  if (!connected && libraryHydrated) return 'ready'
  if (!libraryHydrated) return 'hydrating'
  return classificationStatus === 'ready' || classificationStatus === 'error' ? 'ready' : 'classifying'
}

export function shouldRunAutomaticClassification(
  albums: Array<{ classification?: unknown }>,
  classificationStatus: ClassificationState,
  existingAssignments: Record<string, unknown> = {},
) {
  return classificationStatus !== 'ready' || albums.some(album => !album.classification && !existingAssignments[(album as { id?: string }).id ?? ''])
}

export function unclassifiedAlbumIds(
  albums: Array<{ id: string; classification?: unknown }>,
  existingAssignments: Record<string, unknown> = {},
) {
  return albums.filter(album => !album.classification && !existingAssignments[album.id]).map(album => album.id)
}

export function hasCompleteClassificationCache(
  albums: Array<{ id: string }>,
  classifications: Record<string, { primaryGenre?: unknown } | undefined>,
  summary: { status: ClassificationState; completionState?: 'not-started' | 'running' | 'partial' | 'complete' },
) {
  const legacyComplete = summary.completionState === undefined && albums.every(album => Boolean(classifications[album.id]?.primaryGenre))
  const complete = summary.completionState === 'complete' || legacyComplete
  return summary.status === 'ready' && complete && albums.every(album => Boolean(classifications[album.id]))
}

export function canShowGenreEmpty(state: GenreHydrationState, recordCount: number) {
  return state === 'ready' && recordCount === 0
}
