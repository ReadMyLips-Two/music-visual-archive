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
) {
  return classificationStatus !== 'ready' || albums.some(album => !album.classification)
}

export function canShowGenreEmpty(state: GenreHydrationState, recordCount: number) {
  return state === 'ready' && recordCount === 0
}
