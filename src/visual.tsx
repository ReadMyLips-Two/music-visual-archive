import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type WheelEvent as ReactWheelEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLibrary, type LibraryAlbum, type LibraryTrack } from './library'
import { albumGenres, canonicalGenreId, getGenreRecords, genres, resetAlbumGenres, setAlbumGenres, setAlbumPrimaryGenre, useGenreAssignments, type GenreDefinition, type GenreId } from './genres'
import { getGenreHydrationState } from './genre-hydration'
import { fetchLyrics, type LyricsResult, LyricsProviderError } from './lyrics'
import { useAlbumIntroduction } from './album-intro'
import ParticleText from './components/ParticleText'
import TextLoop from './components/TextLoop'
import { MVAHomeLink } from './components/MVAHomeLink'

function ArchiveCover({ album, className = '', eager = false, small = false }: { album: LibraryAlbum; className?: string; eager?: boolean; small?: boolean }) {
  const [failedArtwork, setFailedArtwork] = useState(false)
  const source = small ? album.artworkSmall ?? album.artwork : album.artwork
  useEffect(() => setFailedArtwork(false), [source])
  return source && !failedArtwork
    ? <img className={`archive-cover ${className}`} src={source} loading={eager ? 'eager' : 'lazy'} alt={`${album.title} — ${album.artist} 专辑封面`} onError={() => setFailedArtwork(true)} />
    : <div className={`archive-cover archive-cover--missing ${className}`} style={{ backgroundColor: album.color }} role="img" aria-label={`${album.title} artwork unavailable`}><span>ARTWORK<br />UNAVAILABLE</span><strong>{album.title}</strong><small>{album.artist}</small></div>
}

function SpotifySource({ url, children = 'OPEN IN SPOTIFY ↗' }: { url: string | null; children?: ReactNode }) {
  return url && <a className="archive-source" href={url} target="_blank" rel="noreferrer">{children}</a>
}

function PageIntro({ number, title, aside, children }: { number: string; title: string; aside?: string; children?: ReactNode }) {
  return <header className="archive-intro">
    <div className="archive-intro__meta"><span>{number} / MVA</span><span>PERSONAL ARCHIVE</span></div>
    <h1>{title}</h1>{aside && <p className="archive-intro__aside">{aside}</p>}{children}
  </header>
}

function LibraryFeedback() {
  const { status, progress, error, refresh, library } = useLibrary()
  return <div className="archive-feedback" aria-live="polite">
    {status === 'loading' && <p>{progress || 'Reading your library…'}</p>}
    {status === 'error' && <div role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>RETRY ↗</button></div>}
    {library.warnings.map(warning => <p key={warning}>{warning}</p>)}
  </div>
}

function selectMotionAlbums(albums: LibraryAlbum[]) {
  // Motion is an archive index, so every saved album gets a turn even when
  // Spotify returns repeated artwork for different saved records.
  return albums
}

const motionTrackWidths = [96, 84, 108, 90, 100, 88, 106, 92, 98]
const motionTrackMobileWidths = [92, 86, 96, 88, 94, 90, 98, 87, 93]
const motionTrackRotations = [-3, 2, -2, 3, -1, 2, -2, 3, -1]

type MotionEntry = { album: LibraryAlbum; index: number }

function MotionSequence({ entries, lane, duplicate, sequenceRef }: { entries: MotionEntry[]; lane: 'top' | 'bottom'; duplicate: boolean; sequenceRef?: Ref<HTMLDivElement> }) {
  const mobile = window.matchMedia('(max-width:700px)').matches
  return <div ref={sequenceRef} className="motion-lane__sequence" aria-hidden={duplicate || undefined}>
    {entries.map((entry, index) => {
      const width = mobile ? motionTrackMobileWidths[index % motionTrackMobileWidths.length] : motionTrackWidths[index % motionTrackWidths.length]
      const style = {
        '--motion-width': `${width}px`,
        '--motion-mobile-width': `${width}px`,
        '--motion-rotate': `${motionTrackRotations[index % motionTrackRotations.length]}deg`,
      } as CSSProperties
      return <Link
        key={`${lane}-${duplicate ? 'copy' : 'source'}-${entry.album.id}-${entry.index}`}
        className="motion-object"
        style={style}
        tabIndex={duplicate ? -1 : undefined}
        to={`/albums/${entry.album.id}`}
        aria-label={`${entry.album.title} — ${entry.album.artist}`}
      >
        <ArchiveCover album={entry.album} small />
        <span className="motion-object__index">[{String(entry.index + 1).padStart(3, '0')}]</span>
        <span className="motion-object__label">{entry.album.title}</span>
        <small className="motion-object__artist">{entry.album.artist}</small>
      </Link>
    })}
  </div>
}

function MotionAlbumFlow({ albums }: { albums: LibraryAlbum[] }) {
  const albumKey = useMemo(() => albums.map(album => album.id).join('|'), [albums])
  const entries = useMemo(() => albums.map((album, index) => ({ album, index })), [albums])
  const topLane = useMemo(() => entries.filter((_, index) => index % 2 === 0), [entries])
  const bottomLane = useMemo(() => entries.filter((_, index) => index % 2 === 1), [entries])
  const topSequence = topLane.length ? topLane : bottomLane
  const bottomSequence = bottomLane.length ? bottomLane : topLane
  const topTrackRef = useRef<HTMLDivElement | null>(null)
  const bottomTrackRef = useRef<HTMLDivElement | null>(null)
  const topSequenceRef = useRef<HTMLDivElement | null>(null)
  const bottomSequenceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!albums.length) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tracks = [topTrackRef.current, bottomTrackRef.current]
    const sequences = [topSequenceRef.current, bottomSequenceRef.current]
    const cycleWidths = [0, 0]
    const measure = () => {
      tracks.forEach((track, index) => {
        const sequence = sequences[index]
        if (!track || !sequence) return
        const styles = getComputedStyle(track)
        const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0
        cycleWidths[index] = sequence.getBoundingClientRect().width + gap
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    sequences.forEach(sequence => { if (sequence) observer?.observe(sequence) })
    if (reduced) return () => observer?.disconnect()

    const speed = window.matchMedia('(max-width:700px)').matches ? 22 : 34
    let distance = 0
    let previous = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const delta = Math.min(64, now - previous)
      previous = now
      distance += delta * speed / 1000
      tracks.forEach((track, index) => {
        const cycleWidth = cycleWidths[index]
        if (!track || !cycleWidth) return
        track.style.transform = `translate3d(-${distance % cycleWidth}px, 0, 0)`
      })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [albumKey, albums.length, topLane.length, bottomLane.length])

  if (!albums.length) return null
  return <div className="motion-stream" aria-label="Continuous album stream" data-motion-source-count={albums.length} data-motion-top-count={topLane.length} data-motion-bottom-count={bottomLane.length}>
    <div className="motion-lane motion-lane--top">
      <div className="motion-lane__track" ref={topTrackRef}>
        <MotionSequence entries={topSequence} lane="top" duplicate={false} sequenceRef={topSequenceRef} />
        <MotionSequence entries={topSequence} lane="top" duplicate />
      </div>
    </div>
    <div className="motion-lane motion-lane--bottom">
      <div className="motion-lane__track" ref={bottomTrackRef}>
        <MotionSequence entries={bottomSequence} lane="bottom" duplicate={false} sequenceRef={bottomSequenceRef} />
        <MotionSequence entries={bottomSequence} lane="bottom" duplicate />
      </div>
    </div>
  </div>
}

export function MotionPage() {
  const { library, status } = useLibrary()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const selection = useMemo(() => selectMotionAlbums(library.albums), [library.albums])
  const sparse = selection.length < 8
  const enterIndex = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (leaving) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { navigate('/index'); return }
    setLeaving(true)
    window.setTimeout(() => navigate('/index'), 420)
  }
  return <div className={'archive-page motion-page' + (sparse ? ' motion-page--sparse' : '') + (leaving ? ' motion-page--leaving' : '')}>
    <div className="motion-topline"><span>03 / THE ARCHIVE IN MOTION</span><span>{library.albums.length} SAVED SPOTIFY ALBUMS</span></div>
    <h1 className="sr-only">The Archive in Motion</h1>
    <div className="motion-scene" aria-label="音乐封面的视觉档案">
      <div className="motion-field" aria-hidden="true" />
      <MotionAlbumFlow albums={selection} />
      {selection.length === 0 && status !== 'loading' && <p className="motion-empty">Your archive is waiting for its first saved album.<br /><Link to="/index">Continue to the index ↗</Link></p>}
      <div className="motion-collage__stars" aria-hidden="true">{[
        ['13%', '18%', '48px', '#ec5b2a'], ['25%', '32%', '42px', '#ecb928'], ['78%', '11%', '62px', '#e6a722'], ['91%', '47%', '44px', '#df5c36'],
        ['20%', '74%', '48px', '#e7be47'], ['78%', '81%', '58px', '#e2592e'], ['5%', '56%', '38px', '#e9b52c'], ['91%', '68%', '43px', '#d9c4a0'],
      ].map(([x, y, size, color], index) => <span key={index} className="motion-star" style={{ '--star-x': x, '--star-y': y, '--star-size': size, '--star-color': color } as CSSProperties} />)}</div>
      <div className="motion-collage__headline">
        <span className="motion-collage__kicker">03 / MONTHLY LISTENING / MUSIC VISUAL ARCHIVE</span>
        <h2><i>archive</i><span>IN</span><strong>MOTION</strong></h2>
        <p>{selection.length ? `${selection.length} saved records / one moving soundtrack` : 'A visual diary for records in motion.'}</p>
        <Link to="/index" onClick={enterIndex}>ENTER THE INDEX <span aria-hidden="true">→</span></Link>
      </div>
    </div>
    <div className="motion-bottomline"><span>IMAGE / MEMORY / MOTION</span><Link to="/index" onClick={enterIndex}>SKIP INTRO — THE INDEX ↗</Link></div>
    <LibraryFeedback />
  </div>
}
const INDEX_OPEN_KEY = 'mva-index-open-v1'
const INDEX_FLIP_SETTLE_DELAY = 140
const indexLoop = (value: number) => ((value % genres.length) + genres.length) % genres.length

export function IndexPage() {
  const { library } = useLibrary()
  const assignments = useGenreAssignments()
  const [outerOpen, setOuterOpen] = useState(() => { try { return sessionStorage.getItem(INDEX_OPEN_KEY) === 'open' } catch { return false } })
  const [openingProgress, setOpeningProgress] = useState(() => outerOpen ? 1 : 0)
  const [activeGenreIndex, setActiveGenreIndex] = useState(0)
  const [flipProgress, setFlipProgress] = useState(0)
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward'>('forward')
  const transitionRef = useRef(0)
  const activeRef = useRef(0)
  const openingRef = useRef(openingProgress)
  const outerOpenRef = useRef(outerOpen)
  const flipSettleTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (flipSettleTimerRef.current !== null) window.clearTimeout(flipSettleTimerRef.current)
  }, [])

  const openOuterFolder = () => {
    outerOpenRef.current = true
    openingRef.current = 1
    setOpeningProgress(1)
    setOuterOpen(true)
    try { sessionStorage.setItem(INDEX_OPEN_KEY, 'open') } catch { /* session storage can be unavailable in privacy modes */ }
  }

  const settleGenres = () => {
    flipSettleTimerRef.current = null
    const transition = transitionRef.current
    if (Math.abs(transition) < 0.001) return
    const direction = transition > 0 ? 1 : -1
    const activeIndex = indexLoop(activeRef.current + direction)
    activeRef.current = activeIndex
    transitionRef.current = 0
    setActiveGenreIndex(activeIndex)
    setFlipDirection(direction > 0 ? 'forward' : 'backward')
    setFlipProgress(0)
  }

  const scheduleFlipSettle = () => {
    if (flipSettleTimerRef.current !== null) window.clearTimeout(flipSettleTimerRef.current)
    if (Math.abs(transitionRef.current) < 0.001) return
    flipSettleTimerRef.current = window.setTimeout(settleGenres, INDEX_FLIP_SETTLE_DELAY)
  }

  const moveGenres = (units: number) => {
    if (flipSettleTimerRef.current !== null) {
      window.clearTimeout(flipSettleTimerRef.current)
      flipSettleTimerRef.current = null
    }
    let transition = transitionRef.current + units
    let activeIndex = activeRef.current
    while (transition >= 1) { activeIndex = indexLoop(activeIndex + 1); transition -= 1 }
    while (transition <= -1) { activeIndex = indexLoop(activeIndex - 1); transition += 1 }
    activeRef.current = activeIndex
    transitionRef.current = transition
    setActiveGenreIndex(activeIndex)
    setFlipDirection(transition < 0 ? 'backward' : 'forward')
    setFlipProgress(Math.abs(transition))
    scheduleFlipSettle()
  }

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault()
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    const delta = event.deltaY * factor
    if (Math.abs(delta) < 1) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!outerOpenRef.current) {
      if (delta <= 0) return
      if (reduced) { openOuterFolder(); return }
      const next = Math.min(1, openingRef.current + delta / 520)
      openingRef.current = next
      setOpeningProgress(next)
      if (next >= 1) openOuterFolder()
      return
    }
    moveGenres(reduced ? (delta > 0 ? 1 : -1) : delta / 420)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (!outerOpenRef.current) openOuterFolder()
      else moveGenres(1)
    }
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      if (outerOpenRef.current) moveGenres(-1)
    }
  }

  const orderedGenres = useMemo(() => genres.map((genre, index) => ({
    ...genre,
    count: getGenreRecords(library.albums, genre.id, assignments).length,
    layer: flipDirection === 'forward' ? indexLoop(index - activeGenreIndex) : indexLoop(activeGenreIndex - index),
  })), [activeGenreIndex, assignments, flipDirection, library.albums])
  return <div className={`archive-page index-page${outerOpen ? ' is-open' : ' is-closed'}`} style={{ '--index-opening': openingProgress } as CSSProperties}>
    <div className="index-stage" tabIndex={0} role="region" aria-label="THE INDEX archive folder; use vertical scrolling or arrow keys to flip through genres" onWheel={handleWheel} onKeyDown={handleKeyDown}>
      <div className="index-stage__meta"><span>04 / THE INDEX</span><span>NINE FOLDERS / ONE PERSONAL ARCHIVE</span></div>
      <div className="index-archive" aria-label="Nine genre folders">
        <div className="index-archive__back" aria-hidden="true" />
        <div className="index-genre-stack">
          {orderedGenres.map((folder, index) => {
            const offset = folder.layer
            const depth = offset - flipProgress
            const isCurrent = offset === 0
            const y = depth <= 0 ? Math.abs(depth) * 24 : -Math.min(8, depth) * 22
            const scale = depth <= 0 ? 1 - Math.abs(depth) * .03 : 1 - Math.min(5, depth) * .035
            const rotate = depth <= 0 ? (flipDirection === 'forward' ? -1 : 1) * Math.abs(depth) * 7 : Math.min(7, depth * 2)
            const zIndex = isCurrent ? (flipProgress < .5 ? 40 : 20) : offset === 1 ? (flipProgress < .5 ? 30 : 40) : 18 - Math.min(10, Math.abs(offset))
            const bodyClip = outerOpen && depth > 0 ? Math.min(68, 50 + Math.max(0, depth - 1) * 6) : 0
            const folderStyle = { '--folder-color': folder.color, '--folder-ink': folder.ink, '--folder-body-bottom-clip': `${bodyClip}%`, transform: `translate3d(-50%, ${y}px, 0) scale(${scale}) rotateX(${rotate}deg)`, clipPath: 'none', zIndex: outerOpen ? zIndex : 5, opacity: depth > 7 ? .72 : 1 } as CSSProperties
            return <Link key={folder.id} to={`/genres/${folder.id}`} className={`index-genre-folder${isCurrent ? ' is-current' : ''}${offset === 1 ? ' is-next' : ''}${outerOpen && depth > 0 ? ' is-rear' : ''}`} style={folderStyle} aria-label={`${folder.number} ${folder.name}，进入 Genre World`}>
              <span className="index-genre-folder__face"><span className="index-genre-folder__tab">{folder.name}</span>
                <span className="index-genre-folder__body"><b>{folder.number}</b><strong>{folder.name}</strong><small>{String(index + 1).padStart(2, '0')} / 09 · {folder.count} RECORDS</small><em>{folder.entry}</em></span>
              </span>
            </Link>
          })}
        </div>
        <div className="index-archive__cover" aria-hidden="true"><span className="index-archive__tab">ARCHIVE / 04</span><span className="index-archive__cover-line" /></div>
      </div>
      <div className="index-title" style={{ top: `${43 + openingProgress * 45}%` }} aria-live="polite"><span>THE</span><strong>INDEX</strong></div>
      <div className="index-stage__hint"><span>{outerOpen ? `${String(activeGenreIndex + 1).padStart(2, '0')} / 09 · SCROLL TO FLIP` : 'SCROLL TO OPEN THE FOLDER'}</span><Link to="/albums">ALL ALBUMS ↗</Link></div>
      <div className="index-stage__status"><LibraryFeedback /></div>
    </div>
  </div>
}

function IndieRecordCard({ album, index }: { album: LibraryAlbum; index: number }) {
  return <article className="indie-record-card">
    <Link to={`/albums/${album.id}`} state={{ genreId: 'indie' }} aria-label={`${album.title} — ${album.artist}`}>
      <span className="indie-record-card__frame"><ArchiveCover album={album} small /></span>
      <span className="indie-record-card__meta"><small>{String(index + 1).padStart(3, '0')} / INDIE ARCHIVE</small><strong>{album.title}</strong><span>{album.artist}</span><em>{album.year ?? 'YEAR UNKNOWN'} / {album.tracks.length} TRACKS</em></span>
    </Link>
    <SpotifySource url={album.url}>OPEN SOURCE ↗</SpotifySource>
  </article>
}

function IndieWorldPage({ genre, collection, status, progress, error }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; progress: string; error: string | null }) {
  const heroAlbum = collection[0]
  const isLoading = status === 'loading' && !collection.length
  const isError = status === 'error'
  return <div className="archive-page indie-world" data-record-count={collection.length}>
    <header className="indie-world__masthead"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> — {genre.number} / 09</span><span>INDIE / ALTERNATIVE</span><span>{collection.length} VERIFIED RECORDS</span></header>
    <main className="indie-world__main">
      <section className="indie-hero" aria-labelledby="indie-world-title">
        <div className="indie-hero__frame">
          <div className="indie-hero__copy">
            <span className="indie-hero__kicker">05 / GENRE WORLD / PERSONAL ARCHIVE</span>
            <h1 id="indie-world-title"><strong>INDIE</strong><em>WORLD</em></h1>
            <p>{genre.statement}</p>
            <div className="indie-hero__rule"><span>{String(collection.length).padStart(3, '0')} RECORDS</span><span>EDGE / ACCIDENT / OPEN AIR</span></div>
          </div>
          <div className="indie-hero__art">
            <div className="indie-orange-disc" aria-hidden="true" />
            {heroAlbum ? <div className="indie-hero__featured"><span className="indie-hero__featured-line"><b>01 / FEATURED RECORD</b><i /></span><Link to={`/albums/${heroAlbum.id}`} state={{ genreId: 'indie' }} aria-label={`${heroAlbum.title} — ${heroAlbum.artist}`}><strong>{heroAlbum.title}</strong><small>{heroAlbum.artist}{heroAlbum.year ? ` / ${heroAlbum.year}` : ''}</small></Link></div> : <div className="indie-hero__featured indie-hero__featured--empty"><span>NO FEATURED RECORD / NO SOURCE</span></div>}
            <span className="indie-hero__badge indie-hero__badge--one" aria-hidden="true"><i className="indie-star" /></span>
            <span className="indie-hero__badge indie-hero__badge--two" aria-hidden="true">05</span>
            <span className="indie-hero__badge indie-hero__badge--three" aria-hidden="true"><i className="indie-star" /></span>
          </div>
        </div>
      </section>

      <section className="indie-records" aria-labelledby="indie-records-title">
        <header className="indie-records__heading"><div><span>05 / FIELD NOTES / SAVED ALBUMS</span><h2 id="indie-records-title">THE OTHER<br /><i>WAY IN</i></h2></div><p>{collection.length ? 'Real records from the connected Spotify collection, arranged as a printed field guide.' : 'The Indie shelf will appear here when the connected collection has verified records.'}</p></header>
        {isLoading ? <div className="indie-state indie-state--loading" aria-live="polite"><span>READING / 05</span><h3>DEVELOPING THE FIELD</h3><p>{progress || 'Reading the connected Spotify collection…'}</p></div>
          : isError && !collection.length ? <div className="indie-state indie-state--error" role="alert"><span>05 / COLLECTION ERROR</span><h3>THE SIGNAL DID NOT ARRIVE.</h3><p>{error || 'The Indie records could not be read from the current source.'}</p><LibraryFeedback /></div>
            : collection.length ? <div className="indie-record-grid">{collection.map((album, index) => <IndieRecordCard key={album.id} album={album} index={index} />)}</div>
              : <div className="indie-state"><span>05 / NO VERIFIED RECORDS</span><h3>THE FIELD IS OPEN.</h3><p>Your unclassified saved records remain available in All Albums. Connect a source or classify a record to build this space.</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      </section>
    </main>
    <footer className="indie-world__footer"><span>INDIE / OLIVE SHADOWS / ORANGE SIGNAL</span><Link to="/index">RETURN TO THE INDEX ↗</Link></footer>
  </div>
}

export function AllAlbumsPage() {
  const { library } = useLibrary()
  const [query, setQuery] = useState(() => readGallerySession()?.query ?? '')
  const filtered = useMemo(() => library.albums.filter(album => `${album.title} ${album.artist}`.toLowerCase().includes(query.trim().toLowerCase())), [library.albums, query])
  const collectionKey = useMemo(() => galleryCollectionKey(filtered), [filtered])
  return <div className="archive-page albums-page spatial-archive-page">
    <header className="spatial-archive__header"><Link to="/index">← THE INDEX</Link><h1 className="sr-only">All Albums</h1><span>05 / PERSONAL ARCHIVE / {filtered.length} OF {library.albums.length} RECORDS</span></header>
    <div className="spatial-archive__toolbar"><label><span>FIND A RECORD</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Album / artist" /></label><span>WALK THE COLLECTION ↗</span></div>
    {filtered.length > 0 ? <SpatialAlbumGallery albums={filtered} query={query} collectionKey={collectionKey} /> : <div className="archive-empty spatial-archive__empty"><span>NO RECORDS FOUND</span><p>{query ? 'Try another album or artist.' : 'Your saved albums will appear here.'}</p><Link to="/index">RETURN TO THE INDEX ↗</Link></div>}
    <div className="spatial-archive__annotation"><span>ARCHIVE NOTE / METADATA</span><LibraryFeedback /></div>
  </div>
}

const GALLERY_SESSION_KEY = 'mva-all-albums-gallery-session-v1'
type GallerySession = { progress: number; query: string; collectionKey: string; focusedAlbumId: string | null }
const galleryCollectionKey = (albums: LibraryAlbum[]) => albums.map(album => album.id).join('|')
function readGallerySession(): GallerySession | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(GALLERY_SESSION_KEY) ?? 'null') as Partial<GallerySession> | null
    if (!value || typeof value.progress !== 'number' || !Number.isFinite(value.progress) || typeof value.query !== 'string' || typeof value.collectionKey !== 'string') return null
    return { progress: value.progress, query: value.query, collectionKey: value.collectionKey, focusedAlbumId: typeof value.focusedAlbumId === 'string' ? value.focusedAlbumId : null }
  } catch { return null }
}
function writeGallerySession(session: GallerySession) {
  try { window.sessionStorage.setItem(GALLERY_SESSION_KEY, JSON.stringify(session)) } catch { /* private browsing */ }
}
function restoreGallerySession(albums: LibraryAlbum[], collectionKey: string) {
  const saved = readGallerySession()
  if (!saved || saved.collectionKey !== collectionKey || !albums.length) return null
  const max = albums.length - 1
  const bounded = Math.max(0, Math.min(max, saved.progress))
  const focusedIndex = saved.focusedAlbumId ? albums.findIndex(album => album.id === saved.focusedAlbumId) : -1
  const current = focusedIndex >= 0 ? focusedIndex : Math.max(0, Math.min(max, Math.round(bounded)))
  return { progress: bounded, current }
}

function SpatialAlbumGallery({ albums, query, collectionKey }: { albums: LibraryAlbum[]; query: string; collectionKey: string }) {
  const initialRestore = restoreGallerySession(albums, collectionKey)
  const [current, setCurrent] = useState(initialRestore?.current ?? 0)
  const touchRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; axis: 'pending' | 'horizontal' | 'vertical' } | null>(null)
  const touchCarry = useRef(0)
  const currentRef = useRef(initialRestore?.current ?? 0)
  const targetProgress = useRef(initialRestore?.progress ?? 0)
  const renderedProgress = useRef(initialRestore?.progress ?? 0)
  const restoredCollectionRef = useRef<string | null>(null)
  const frameRef = useRef<number | null>(null)
  const galleryRef = useRef<HTMLElement | null>(null)
  const exhibitRefs = useRef(new Map<number, HTMLElement>())
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('mvaGalleryDebug') === '1'

  const clampProgress = (value: number) => Math.max(0, Math.min(Math.max(0, albums.length - 1), value))
  const debugLog = (source: string, deltaX: number, deltaY: number, accepted: boolean) => {
    if (!debugEnabled) return
    console.debug('[MVA gallery]', { source, deltaX, deltaY, accepted, selected: currentRef.current, target: targetProgress.current, rendered: renderedProgress.current, scrollY: window.scrollY })
  }

  const smoothStep = (value: number) => value * value * (3 - 2 * value)

  const applyScene = (progress: number) => {
    for (const [index, node] of exhibitRefs.current) {
      const relative = index - progress
      const distance = Math.abs(relative)
      const side = relative === 0 ? 0 : relative < 0 ? -1 : 1
      const near = Math.min(1, distance)
      const bend = smoothStep(near)
      const far = Math.min(4, Math.max(0, distance - 1))
      const x = 50 + side * (31 * bend + far * 10)
      const y = 50 + (index % 3 - 1) * 8 * bend
      const z = 180 - Math.min(5, distance) * 290
      const rotate = side * -57 * bend
      const scale = Math.max(.53, 1.04 - Math.min(4, distance) * .105)
      const opacity = Math.max(.2, 1 - distance * .14)
      node.style.setProperty('--gallery-x', `${x}%`)
      node.style.setProperty('--gallery-y', `${y}%`)
      node.style.setProperty('--gallery-z', `${z}px`)
      node.style.setProperty('--gallery-rotate', `${rotate}deg`)
      node.style.setProperty('--gallery-scale', String(scale))
      node.style.setProperty('--gallery-opacity', String(opacity))
      node.style.zIndex = String(Math.max(1, 40 - Math.round(distance * 6)))
    }
    const focused = clampProgress(Math.round(progress))
    if (focused !== currentRef.current) {
      currentRef.current = focused
      setCurrent(focused)
    }
  }

  const startCameraLoop = () => {
    if (frameRef.current !== null) return
    const tick = () => {
      renderedProgress.current = targetProgress.current
      applyScene(renderedProgress.current)
      frameRef.current = null
      if (debugEnabled) debugLog('camera-frame', 0, 0, true)
    }
    frameRef.current = window.requestAnimationFrame(tick)
  }

  const queueProgress = (delta: number, source: string, deltaX: number, deltaY: number, allowLargeDelta = false) => {
    const boundedDelta = allowLargeDelta ? delta : Math.max(-.22, Math.min(.22, delta))
    const next = clampProgress(targetProgress.current + boundedDelta)
    const accepted = next !== targetProgress.current
    targetProgress.current = next
    debugLog(source, deltaX, deltaY, accepted)
    if (accepted) startCameraLoop()
  }

  useEffect(() => {
    if (restoredCollectionRef.current === collectionKey) return
    restoredCollectionRef.current = collectionKey
    const restored = restoreGallerySession(albums, collectionKey)
    const next = restored?.current ?? clampProgress(currentRef.current)
    const progress = restored?.progress ?? next
    currentRef.current = next
    targetProgress.current = progress
    renderedProgress.current = progress
    setCurrent(next)
    applyScene(progress)
  }, [albums, collectionKey])

  useLayoutEffect(() => { applyScene(renderedProgress.current) }, [albums, current])

  useEffect(() => {
    if (!debugEnabled) return
    const onScroll = () => debugLog('document-scroll', 0, 0, false)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [debugEnabled])

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
  }, [])

  const onWheel = (event: globalThis.WheelEvent) => {
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1
    const deltaX = event.deltaX * factor
    const deltaY = event.deltaY * factor
    const horizontalIntent = Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    if (horizontalIntent) {
      event.preventDefault()
      queueProgress(deltaX / 320, 'wheel', deltaX, deltaY)
      return
    }
    if (Math.abs(deltaY) >= 8) debugLog('wheel', deltaX, deltaY, false)
  }

  useEffect(() => {
    const node = galleryRef.current
    if (!node) return
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [albums, debugEnabled])

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); queueProgress(1, 'keyboard', 1, 0, true) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); queueProgress(-1, 'keyboard', -1, 0, true) }
  }

  const onPointerLeave = () => {
    touchRef.current = null
    touchCarry.current = 0
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return
    const touch = touchRef.current
    if (!touch) return
    const deltaX = event.clientX - touch.lastX
    const deltaY = event.clientY - touch.lastY
    touch.lastX = event.clientX
    touch.lastY = event.clientY
    if (touch.axis === 'pending') {
      const totalX = Math.abs(event.clientX - touch.startX)
      const totalY = Math.abs(event.clientY - touch.startY)
      if (Math.max(totalX, totalY) < 10) return
      touch.axis = totalX > totalY * 1.2 ? 'horizontal' : 'vertical'
    }
    if (touch.axis !== 'horizontal') return
    event.preventDefault()
    touchCarry.current += deltaX
    if (Math.abs(touchCarry.current) >= 34) {
      const movement = touchCarry.current
      touchCarry.current = 0
      queueProgress(-movement / 260, 'touch', movement, deltaY)
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return
    touchRef.current = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, axis: 'pending' }
    touchCarry.current = 0
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return
    touchRef.current = null
    touchCarry.current = 0
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const savePositionBeforeLeave = () => {
    writeGallerySession({ progress: targetProgress.current, query, collectionKey, focusedAlbumId: albums[currentRef.current]?.id ?? null })
  }

  return <section ref={galleryRef} className="spatial-gallery" tabIndex={0} role="region" aria-label="空间专辑画廊，可使用方向键、滚轮或拖拽移动" onKeyDown={onKeyDown} onPointerLeave={onPointerLeave} onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <div className="spatial-gallery__room"><div className="spatial-gallery__ceiling" /><div className="spatial-gallery__floor" /><div className="spatial-gallery__back-wall" /><div className="spatial-gallery__left-wall" /><div className="spatial-gallery__right-wall" /><div className="spatial-gallery__seam spatial-gallery__seam--left" /><div className="spatial-gallery__seam spatial-gallery__seam--right" />
      <div className="spatial-gallery__exhibits">{albums.map((album, index) => {
        if (Math.abs(index - current) > 6) return null
        const focused = index === current
        return <Link key={album.id} ref={node => { if (node) exhibitRefs.current.set(index, node); else exhibitRefs.current.delete(index) }} className={`spatial-exhibit${focused ? ' is-focused' : ''}`} to={`/albums/${album.id}`} onClick={event => { if (!focused) { event.preventDefault(); queueProgress(index - currentRef.current, 'exhibit-focus', 0, 0, true) } else savePositionBeforeLeave() }} aria-label={`${album.title} — ${album.artist}${focused ? '，进入专辑' : '，聚焦展品'}`}>
          <span className="spatial-exhibit__frame"><ArchiveCover album={album} eager={Math.abs(index - current) < 2} /></span><span className="spatial-exhibit__label"><b>{String(index + 1).padStart(3, '0')}</b><strong>{album.title}</strong><small>{album.artist}</small></span>
        </Link>
      })}</div>
    </div>
    <div className="spatial-gallery__caption"><span>{String(current + 1).padStart(3, '0')} / {String(albums.length).padStart(3, '0')}</span><div><h2>{albums[current]?.title}</h2><p>{albums[current]?.artist}</p></div><Link to={`/albums/${albums[current]?.id}`} onClick={savePositionBeforeLeave}>OPEN RECORD ↗</Link></div>
    <div className="spatial-gallery__controls"><button type="button" onClick={() => queueProgress(-1, 'keyboard', -1, 0, true)} disabled={current === 0} aria-label="向后移动">←</button><span>WHEEL / DRAG / ARROW KEYS · TURN THROUGH THE ROOM</span><button type="button" onClick={() => queueProgress(1, 'keyboard', 1, 0, true)} disabled={current === albums.length - 1} aria-label="向前移动">→</button></div>
  </section>
}

export function GenresPage() {
  const { library } = useLibrary()
  const assignments = useGenreAssignments()
  return <div className="archive-page genre-directory"><PageIntro number="06" title="Genre Worlds." aside="NINE WAYS TO ENTER" />
    <p className="genre-directory__note">The archive has more than one atmosphere. Unclassified records remain in <Link to="/albums">All Albums</Link>.</p>
    <div className="genre-directory__list">{genres.map(genre => <Link key={genre.id} to={`/genres/${genre.id}`} style={{ '--genre-accent': genre.color } as CSSProperties}>
      <span>{genre.number}</span><strong>{genre.name}</strong><em>{getGenreRecords(library.albums, genre.id, assignments).length} RECORDS</em><span>↗</span></Link>)}</div>
    <Link className="archive-back" to="/index">← THE INDEX</Link>
  </div>
}

const electronicWorldContextKey = 'mva-electronic-world-context-v1'

function readElectronicWorldContext() {
  if (typeof window === 'undefined') return { scrollTop: 0, albumId: null as string | null }
  try {
    const value = JSON.parse(sessionStorage.getItem(electronicWorldContextKey) ?? '{}') as { scrollTop?: number; albumId?: string | null; restoreOnReturn?: boolean }
    return { scrollTop: typeof value.scrollTop === 'number' ? value.scrollTop : 0, albumId: value.albumId ?? null, restoreOnReturn: value.restoreOnReturn === true }
  } catch {
    return { scrollTop: 0, albumId: null as string | null, restoreOnReturn: false }
  }
}

function ElectronicAlbumOrbit({ collection, genre, selectedId, onFocusAlbum, onSaveContext }: { collection: LibraryAlbum[]; genre: GenreDefinition; selectedId: string | null; onFocusAlbum: (albumId: string) => void; onSaveContext: (albumId: string) => void }) {
  const orbitRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    const orbit = orbitRef.current
    if (!orbit || collection.length === 0) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = 26000
    let frame = 0
    const start = performance.now()
    const indexById = new Map(collection.map((album, index) => [album.id, index]))
    const render = (now: number) => {
      const rect = orbit.getBoundingClientRect()
      const radiusX = Math.min(rect.width * .42, 560)
      const radiusY = Math.min(rect.height * .36, 280)
      const radiusZ = Math.min(150, radiusX * .28)
      const elapsed = prefersReducedMotion ? 0 : (now - start) % duration
      const revolution = elapsed / duration
      cardRefs.current.forEach((node, id) => {
        const index = indexById.get(id)
        if (index === undefined) return
        const angle = index / collection.length * Math.PI * 2 - revolution * Math.PI * 2
        const depth = (Math.sin(angle) + 1) / 2
        const x = Math.cos(angle) * radiusX
        const y = Math.sin(angle) * radiusY
        const z = (depth - .5) * radiusZ
        const scale = .72 + depth * .3
        node.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${z}px) scale(${scale})`
        node.style.opacity = '1'
        node.style.zIndex = String(Math.round(depth * 100) + 10)
        node.style.setProperty('--orbit-depth', depth.toFixed(3))
      })
      if (!prefersReducedMotion) frame = window.requestAnimationFrame(render)
    }
    render(start)
    if (prefersReducedMotion) return
    frame = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(frame)
  }, [collection])

  return <div className="electronic-orbit" ref={orbitRef} style={{ '--orbit-count': collection.length } as CSSProperties}>
    <div className="electronic-orbit__radar-layer" aria-hidden="true">
      <div className="electronic-orbit__plane"><i /><i /><i /></div>
      <div className="electronic-orbit__axis electronic-orbit__axis--x" /><div className="electronic-orbit__axis electronic-orbit__axis--y" />
      <div className="electronic-orbit__center"><span>✳</span><small>LIVE / {String(collection.length).padStart(2, '0')}</small></div>
    </div>
    <div className="electronic-orbit__cards">
      {collection.map((album, index) => <div key={album.id} className={`electronic-orbit__orbit-wrapper${album.id === selectedId ? ' is-selected' : ''}`} ref={node => { if (node) cardRefs.current.set(album.id, node); else cardRefs.current.delete(album.id) }}>
        <div className={`electronic-orbit__hover-wrapper${album.id === hoverId ? ' is-hovered' : ''}`}>
          <div className="electronic-orbit__hit-zone" onPointerEnter={() => { setHoverId(album.id); onFocusAlbum(album.id) }} onPointerLeave={() => setHoverId(current => current === album.id ? null : current)}>
            <Link className="electronic-orbit__card" to={`/albums/${album.id}`} state={{ genreId: genre.id, electronicAlbumId: album.id }} onFocus={() => { setHoverId(album.id); onFocusAlbum(album.id) }} onBlur={() => setHoverId(current => current === album.id ? null : current)} onClick={() => onSaveContext(album.id)} aria-label={`${album.title} — ${album.artist}，进入专辑详情`}>
              <span className="electronic-orbit__card-index">{String(index + 1).padStart(2, '0')}</span><span className="electronic-orbit__card-cover"><ArchiveCover album={album} eager={index < 10} /></span><span className="electronic-orbit__card-label"><strong>{album.title}</strong><small>{album.artist}</small></span><span className="electronic-orbit__card-signal" aria-hidden="true">✳</span>
            </Link>
          </div>
        </div>
      </div>)}
    </div>
  </div>
}

function ElectronicParticleTextField() {
  return <div className="electronic-particle-text" aria-label="Electronic particle text field">
    <div className="electronic-particle-text__lines">
      {([
        ['GOD', 'electronic-particle-text__line--god'],
        ['BLESS', 'electronic-particle-text__line--bless'],
        ['ELECTRONIC', 'electronic-particle-text__line--electronic'],
        ['MUSIC', 'electronic-particle-text__line--music'],
      ] as const).map(([text, position]) => <ParticleText
        key={text}
        className={`electronic-particle-text__line ${position}`}
        text={text}
        particleSize={2}
        density={4}
        color="#1389ff"
        highlightColor="#4b17c0"
        scatter={180}
        gatherDuration={1600}
        stagger={420}
        pointerRepel={40}
        repelRadius={120}
        idleDrift={0.7}
        trigger="hover"
        fontSize={text === 'ELECTRONIC' ? 'clamp(4.8rem, 9.5vw, 10rem)' : text === 'MUSIC' ? 'clamp(3.2rem, 6.4vw, 6.8rem)' : 'clamp(2.8rem, 5.6vw, 6rem)'}
        fontWeight={800}
        fontFamily="inherit"
        glow
      />)}
    </div>
    <TextLoop
      className="electronic-text-loop"
      text="electronic sound"
      shape="circle"
      speed={90}
      direction="forward"
      separator="✦"
      curviness={158}
      fontSize={52}
      fontWeight={550}
      letterSpacing={4}
      uppercase={false}
      color="#ffffff"
      ribbon
      ribbonColor="#5227FF"
      ribbonWidth={62}
      pauseOnHover
    />
  </div>
}

const electronicPixelGlyphs: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
}

function ElectronicPixelTitle({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`electronic-pixel-title ${className}`} aria-hidden="true"><span className="sr-only">{text}</span>{text.split('').map((character, index) => <span key={`${character}-${index}`} className={`electronic-pixel-title__glyph${character === ' ' ? ' is-space' : ''}`}>{(electronicPixelGlyphs[character] ?? ['00000', '00000', '00000', '00000', '00000', '00000', '00000']).flatMap((row, rowIndex) => [...row].map((pixel, pixelIndex) => <i key={`${rowIndex}-${pixelIndex}`} className={pixel === '1' ? 'is-on' : undefined} />))}</span>)}</span>
}

function ElectronicWorldPage({ genre }: { genre: GenreDefinition }) {
  const { library, status } = useLibrary()
  const assignments = useGenreAssignments()
  const collection = useMemo(() => getGenreRecords(library.albums, genre.id, assignments), [library.albums, assignments, genre.id])
  const savedContext = useMemo(readElectronicWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(electronicWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const restore = () => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(restore))
    try { sessionStorage.setItem(electronicWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const focusAlbum = (albumId: string) => {
    setSelectedId(albumId)
    saveContext(albumId)
  }
  const statusLabel = library.classification.status === 'running'
    ? `CLASSIFYING ${library.classification.completed} / ${library.classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`

  return <div className="electronic-world electronic-world--rebuild" data-has-records={collection.length > 0} style={{ '--electronic-accent': genre.color } as CSSProperties}>
    <header className="electronic-world__header">
      <div className="electronic-world__mastline"><Link className="electronic-world__back" to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · 02 / 09</span><span>SIGNAL ARCHIVE / LOCAL FREQUENCY</span></div>
    </header>
    <div className="electronic-world__viewport">
      <section className="electronic-world__field" aria-label="Electronic signal archive">
        <div className="electronic-world__hero electronic-world__hero--particle-text">
          <ElectronicParticleTextField />
        </div>

        <section className="electronic-world__archive" aria-label="Electronic archive field">
          <header className="electronic-world__archive-head"><div className="electronic-world__archive-head-main"><span>02 / ARCHIVE FIELD</span><h2 aria-label="ALL SIGNALS"><ElectronicPixelTitle text="ALL SIGNALS" className="electronic-pixel-title--archive" /></h2><div className="electronic-world__archive-subline"><p>{collection.length ? `${collection.length} verified records arranged as a live visual index.` : status === 'loading' || library.classification.status === 'running' ? 'Reading and classifying your saved records.' : 'No verified Electronic records assigned yet.'}</p><strong>{String(collection.length).padStart(2, '0')} / RECORDS</strong></div></div><div className="electronic-world__archive-head-radar electronic-world__radar" aria-hidden="true"><i /><i /><i /><b>ACTIVE<br />SIGNAL</b></div></header>
          {collection.length ? <ElectronicAlbumOrbit collection={collection} genre={genre} selectedId={selectedId} onFocusAlbum={focusAlbum} onSaveContext={albumId => saveContext(albumId, window.scrollY, true)} /> : <div className="electronic-world__empty"><span className="electronic-world__empty-code">NO CARRIER / 02</span><h2>THE FIELD IS QUIET.</h2><p>{status === 'loading' || library.classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'No verified Electronic records are assigned yet. The signal archive will appear here when the collection has a record to carry it.'}</p><Link to="/albums">CHECK ALL ALBUMS ↗</Link></div>}
        </section>
        <div className="electronic-world__footerline"><span>SCROLL / TRACE THE COLLECTION</span><span>{statusLabel}</span><span>NO AUDIO DOWNLOADS</span></div>
      </section>
    </div>
  </div>
}

function PopSticker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`pop-sticker ${className}`}>{children}</span>
}

function PopArchiveId({ album, index }: { album: LibraryAlbum; index: number }) {
  return <aside className="pop-id-card" aria-label="Personal pop archive identity card">
    <img className="pop-id-card__reference" src="/assets/pop/pop-id-card.jpg" alt="" aria-hidden="true" onError={event => { event.currentTarget.style.display = 'none' }} />
    <span className="pop-id-card__star-border" aria-hidden="true">✦ · ✦ · ✦ · ✦ · ✦</span>
    <header className="pop-id-card__heading"><span>PERMANENT LICENSE</span><strong>OF POP</strong><small>PERSONAL ARCHIVE / 01 OF 09</small></header>
    <div className="pop-id-card__body">
      <div className="pop-id-card__photo"><img src="/assets/pop/pop-id-star.png" alt="Pink star archive mark" /></div>
      <dl>
        <div><dt>NO.</dt><dd>POP-2026-{String(index + 1).padStart(2, '0')}</dd></div>
        <div><dt>ISSUED TO</dt><dd>{album.artist}</dd></div>
        <div><dt>RELEASE</dt><dd>{album.year ?? 'UNKNOWN'}</dd></div>
        <div><dt>PLACE</dt><dd>SPOTIFY / SAVED</dd></div>
      </dl>
    </div>
    <p className="pop-id-card__statement">This is to certify one record kept close, filed under personal memory.</p>
    <span className="pop-id-card__stamp">SAVED<br />POP</span>
    <span className="pop-id-card__barcode" aria-hidden="true" />
    <span className="pop-id-card__signature">MVA / {album.tracks.length} TRACKS</span>
  </aside>
}

function PopMaterialLayer() {
  return <div className="pop-material-layer" aria-hidden="true">
    <span className="pop-material-layer__rose" />
    <span className="pop-material-layer__ticket">MVA / 01 / POP</span>
    <div className="pop-support-fragment"><span>POP / PAPER TRACE</span><strong>PLAY IT AGAIN</strong><small>ARCHIVE NOTE / 01—09</small><i>✦ · ✧</i></div>
    <span className="pop-symbol pop-symbol--star">✦</span>
    <span className="pop-symbol pop-symbol--asterisk">✳</span>
    <img className="pop-material-layer__stars" src="/assets/pop/pop-silver-stars.jpg" alt="" onError={event => { event.currentTarget.style.display = 'none' }} />
  </div>
}

function PopFlipPhone() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  return <div className="pop-flip-phone" style={{ '--phone-x': `${tilt.x}deg`, '--phone-y': `${tilt.y}deg` } as CSSProperties} onPointerMove={event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setTilt({ x: ((event.clientY - bounds.top) / bounds.height - .5) * -3, y: ((event.clientX - bounds.left) / bounds.width - .5) * 4 })
  }} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
    <img src="/assets/pop/pop-flip-phone.jpg" alt="" aria-hidden="true" onError={event => { event.currentTarget.style.display = 'none' }} />
    <span className="pop-flip-phone__fallback"><i>♡</i><small>CALLING<br />YOUR POP ERA</small></span>
    <span className="pop-flip-phone__hinge" />
  </div>
}

function PopHeroCollage({ genre, collection }: { genre: GenreDefinition; collection: LibraryAlbum[] }) {
  const heroAlbum = collection[0]
  return <section className="pop-hero" aria-labelledby="pop-hero-title">
    <div className="pop-hero__masthead"><span><MVAHomeLink>M / V / A</MVAHomeLink> — {genre.number} / 09</span><span>POP / PERSONAL ARCHIVE</span><span>{collection.length} SAVED RECORDS</span></div>
    <div className="pop-hero__headline" id="pop-hero-title">
      <span className="pop-hero__small-word">THIS IS</span>
      <strong className="pop-hero__word-pop">POP</strong>
      <span className="pop-hero__your">YOUR</span>
      <strong className="pop-hero__word-archive">ARCHIVE</strong>
    </div>
    <p className="pop-hero__statement">{genre.statement}<br /><span>every saved song leaves a little colour behind.</span></p>
    {heroAlbum && <figure className="pop-hero__portrait">
      <div className="pop-hero__portrait-frame"><ArchiveCover album={heroAlbum} eager /></div>
      <figcaption><span>01 / FIRST MEMORY</span><strong>{heroAlbum.artist}</strong><small>{heroAlbum.title}</small></figcaption>
    </figure>}
    {heroAlbum && <PopArchiveId album={heroAlbum} index={0} />}
    <PopFlipPhone />
    <PopSticker className="pop-sticker--loud">LOUD<br />HEART</PopSticker>
    <PopSticker className="pop-sticker--diary">dear diary,<br />play it again.</PopSticker>
    <div className="pop-hero__denim"><span>PERSONAL COLLECTION / 2026</span><strong>THE CHORUS<br />I KEPT</strong><i>♡</i></div>
    <PopMaterialLayer />
  </section>
}

function PopDenimAlbumObject({ album, index, genreId }: { album: LibraryAlbum; index: number; genreId: GenreId }) {
  return <article className="pop-album pop-album--paper" style={{ '--pop-rotate': `${index % 2 === 0 ? -2 : 2}deg`, '--pop-offset': `${index % 2 === 0 ? 0 : 22}px`, '--pop-span': index === 0 ? 4 : 3 } as CSSProperties}>
    <Link className="pop-album__link" to={`/albums/${album.id}`} state={{ genreId }} aria-label={`${album.title} — ${album.artist}`}>
      <span className="pop-album__index">POP / {String(index + 1).padStart(3, '0')}</span>
      <span className="pop-album__image"><ArchiveCover album={album} eager small /></span>
      <span className="pop-album__label"><strong>{album.title}</strong><small>{album.artist}</small><em>{album.year ?? 'YEAR UNKNOWN'} / {album.tracks.length} TRACKS</em></span>
    </Link>
  </article>
}

function PopDenimAlbumPanel({ collection, genreId }: { collection: LibraryAlbum[]; genreId: GenreId }) {
  return <section className="pop-cluster pop-cluster--denim" aria-label="The chorus I kept">
    <header className="pop-cluster__heading"><span>02 / THE CHORUS I KEPT</span><h3><strong>THE CHORUS</strong><i>I KEPT</i></h3></header>
    <div className="pop-denim-board" aria-hidden="true"><img src="/assets/pop/pop-denim.jpg" alt="" onError={event => { event.currentTarget.style.display = 'none' }} /><span className="pop-denim-board__stitch" /><img className="pop-denim-board__pin" src="/assets/pop/pop-pin.jpg" alt="" onError={event => { event.currentTarget.style.display = 'none' }} /></div>
    <div className="pop-cluster__albums">{collection.slice(0, 4).map((album, index) => <PopDenimAlbumObject key={album.id} album={album} index={index} genreId={genreId} />)}</div>
    <span className="pop-cluster__note">saved somewhere between<br />memory + noise &lt;333</span>
  </section>
}

function PopAlbumField({ collection, genreId }: { collection: LibraryAlbum[]; genreId: GenreId }) {
  return <section className="pop-album-section" aria-labelledby="pop-album-field-title">
    <div className="pop-section-heading"><div><span>02 / PERSONAL RECORDS</span><h2 id="pop-album-field-title"><i>YOUR</i><strong>SAVED</strong><em>POP</em></h2></div><p>{collection.length ? `${collection.length} real Spotify records, filed by hand and left a little imperfect.` : 'The archive is waiting for a record.'}</p></div>
    {collection.length ? <PopDenimAlbumPanel collection={collection} genreId={genreId} /> : <PopEmptyState />}
  </section>
}

function PopEmptyState() {
  return <div className="pop-empty-file"><span>POP / EMPTY FILE</span><h3>THIS SPACE<br /><i>IS WAITING</i><br />FOR A RECORD</h3><p>No verified POP albums are assigned yet. Your unclassified saved records remain available in All Albums.</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>
}

function PopLoadingState() {
  return <div className="pop-empty-file" role="status"><span>POP / READING FILE</span><h3>OPENING<br /><i>THE ARCHIVE</i></h3><p>Your saved records are being restored and classified. The POP shelf will appear when the library is ready.</p></div>
}

function PopShelfIntro({ genre, count }: { genre: GenreDefinition; count: number }) {
  return <header className="pop-shelf-intro">
    <div className="pop-shelf-intro__meta"><span>01 / {genre.name} PERSONAL ARCHIVE</span><span>{String(count).padStart(3, '0')} SAVED RECORDS / ONE WALL</span></div>
    <div className="pop-shelf-intro__title"><span>YOUR</span><strong>POP</strong><em>ARCHIVE</em></div>
    <p>{genre.statement} <i>curated, played, kept.</i></p>
  </header>
}

function PopShelfItem({ album, index, genreId }: { album: LibraryAlbum; index: number; genreId: GenreId }) {
  return <Link className="pop-shelf-item" to={`/albums/${album.id}`} state={{ genreId }} aria-label={`${album.title} — ${album.artist}`}>
    <span className="pop-shelf-item__number">{String(index + 1).padStart(3, '0')}</span>
    <span className="pop-shelf-item__cover"><ArchiveCover album={album} small /></span>
    <span className="pop-shelf-item__label"><strong>{album.title}</strong><small>{album.artist}</small></span>
  </Link>
}

type PopShelfEntry = { album: LibraryAlbum; sourceIndex: number }

function PopShelfDisplay({ entries, perShelf, genreId, pageIndex, slideDirection }: { entries: PopShelfEntry[]; perShelf: number; genreId: GenreId; pageIndex: number; slideDirection: 'next' | 'previous' }) {
  const rows = Array.from({ length: 3 }, (_, index) => entries.slice(index * perShelf, (index + 1) * perShelf))
  const animationClass = slideDirection === 'next' ? 'pop-shelf-list--next' : 'pop-shelf-list--previous'
  return <section className="pop-shelf-display" aria-label="POP album shelf display">
    {rows.map((row, rowIndex) => <div className="pop-shelf-row" key={rowIndex}>
      <div className={`pop-shelf-list ${animationClass}`} key={`${pageIndex}-${rowIndex}`}>{row.map((entry, index) => <PopShelfItem key={`${entry.album.id}-${rowIndex * perShelf + index}`} album={entry.album} index={entry.sourceIndex} genreId={genreId} />)}</div>
      <div className="pop-shelf-rail" aria-hidden="true"><span>{String(rowIndex + 1).padStart(2, '0')} / POP ARCHIVE SHELF</span></div>
    </div>)}
  </section>
}

function PopShelfPanel({ genre, collection, pending }: { genre: GenreDefinition; collection: LibraryAlbum[]; pending: boolean }) {
  const [pageIndex, setPageIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'next' | 'previous'>('next')
  const [perShelf, setPerShelf] = useState(() => window.matchMedia('(max-width:700px)').matches ? 4 : 8)
  const pageSize = perShelf * 3
  const pageCount = collection.length > 0 ? Math.max(1, Math.ceil(collection.length / pageSize)) : 1
  const canPaginate = pageCount > 1

  useEffect(() => {
    const media = window.matchMedia('(max-width:700px)')
    const updateCapacity = () => setPerShelf(media.matches ? 4 : 8)
    updateCapacity()
    media.addEventListener('change', updateCapacity)
    return () => media.removeEventListener('change', updateCapacity)
  }, [])

  useEffect(() => {
    setPageIndex(current => Math.min(current, pageCount - 1))
  }, [pageCount])

  const moveShelf = (direction: 'next' | 'previous') => {
    setSlideDirection(direction)
    setPageIndex(current => (current + (direction === 'next' ? 1 : -1) + pageCount) % pageCount)
  }

  useEffect(() => {
    if (!canPaginate) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveShelf('previous') }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveShelf('next') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPaginate, pageCount])

  const entries = useMemo<PopShelfEntry[]>(() => {
    if (!collection.length) return []
    const start = pageIndex * pageSize
    const count = collection.length <= pageSize ? collection.length : pageSize
    return Array.from({ length: count }, (_, offset) => {
      const sourceIndex = (start + offset) % collection.length
      return { album: collection[sourceIndex], sourceIndex }
    })
  }, [collection, pageIndex, pageSize])

  return <section className="pop-shelf-panel" aria-label="POP archive shelf">
    <div className="pop-shelf-panel__top"><span>01 / POP PERSONAL ARCHIVE</span><span>{String(collection.length).padStart(3, '0')} SAVED RECORDS / ONE WALL</span>{canPaginate && <span className="pop-shelf-panel__pager">SHELF {String(pageIndex + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span>}</div>
    <PopShelfIntro genre={genre} count={collection.length} />
    {collection.length ? <div className="pop-shelf-stage">
      <button type="button" className="pop-shelf-nav pop-shelf-nav--previous" aria-label="Previous albums" onClick={() => moveShelf('previous')} hidden={!canPaginate}><span aria-hidden="true" /></button>
      <PopShelfDisplay entries={entries} perShelf={perShelf} genreId={genre.id} pageIndex={pageIndex} slideDirection={slideDirection} />
      <button type="button" className="pop-shelf-nav pop-shelf-nav--next" aria-label="Next albums" onClick={() => moveShelf('next')} hidden={!canPaginate}><span aria-hidden="true" /></button>
    </div> : <div className="pop-shelf-empty">{pending ? <PopLoadingState /> : <PopEmptyState />}</div>}
  </section>
}

function PopWorldPage({ genre, collection, libraryHydrated, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; libraryHydrated: boolean; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const pending = !libraryHydrated || status === 'loading' || classification.status === 'running'
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const update = () => {
      frame = 0
      root.style.setProperty('--pop-scroll', `${window.scrollY}`)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame) }
  }, [])
  return <div ref={rootRef} className="archive-page pop-world" style={{ '--pop-record-count': collection.length } as CSSProperties}>
    <img className="pop-world__paper-texture" src="/assets/pop/pop-paper-texture.jpg" alt="" aria-hidden="true" onError={event => { event.currentTarget.style.display = 'none' }} />
    <div className="pop-world__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> — {genre.number} / 09</span><span>POP PERSONAL ARCHIVE</span><span>{collection.length} RECORDS / SPOTIFY</span></div>
    <main className="pop-world__main"><PopHeroCollage genre={genre} collection={collection} /><PopShelfPanel genre={genre} collection={collection} pending={pending} /></main>
  </div>
}

const hipHopWorldContextKey = 'mva-hip-hop-world-context-v1'

type HipHopWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readHipHopWorldContext(): HipHopWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(hipHopWorldContextKey) ?? '{}') as Partial<HipHopWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function HipHopWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readHipHopWorldContext, [])
  const saveContext = (albumId = savedContext.albumId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(hipHopWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    const rememberScroll = () => saveContext(savedContext.albumId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [savedContext.albumId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(hipHopWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)

  return <div className="hip-hop-world" style={{ '--hip-hop-record-count': collection.length } as CSSProperties}>
    <section className="hip-hop-entry" aria-labelledby="hip-hop-entry-title">
      <div className="hip-hop-entry__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>PERSONAL GENRE WORLD / SPOTIFY</span></div>
      <div className="hip-hop-entry__layout">
        <div className="hip-hop-entry__stamp" aria-hidden="true">04<br /><small>WORLD</small></div>
        <div className="hip-hop-entry__title-wrap">
          <span className="hip-hop-entry__kicker">THE INDEX / HIP-HOP ARCHIVE</span>
          <h1 id="hip-hop-entry-title"><span>HIP-</span><span>HOP</span></h1>
          <p>Rhythm written large<br />across the city.</p>
        </div>
        <div className="hip-hop-entry__aside"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>SAVED RECORDS<br />IN THIS WORLD</small></div>
      </div>
      <a className="hip-hop-entry__explore" href="#hip-hop-wall"><span>↓</span><strong>ENTER THE WALL</strong><small>SCROLL TO BROWSE THE ARCHIVE</small></a>
      <div className="hip-hop-entry__ink-mark" aria-hidden="true" />
    </section>

    <section id="hip-hop-wall" className="hip-hop-wall" aria-labelledby="hip-hop-wall-title">
      <header className="hip-hop-wall__header"><div><span>02 / THE WALL</span><h2 id="hip-hop-wall-title">ALBUM<br /><i>ARCHIVE</i></h2></div><p>{collection.length ? 'Real saved records, filed as a street-level image archive.' : 'No verified records are assigned to this world yet.'}</p><strong>{countLabel}</strong></header>
      {collection.length ? <div className="hip-hop-wall__surface"><span className="hip-hop-wall__surface-note">WHEATPASTE FIELD / {String(collection.length).padStart(2, '0')} PIECES</span><div className="hip-hop-wall__posters">
        {collection.map((album, index) => <article key={album.id} className="hip-hop-poster" style={{ '--poster-rotate': `${[-1.4, .8, -0.5, 1.2][index % 4]}deg`, '--poster-shift': `${[0, 12, -5, 7][index % 4]}px` } as CSSProperties}>
          <Link to={`/albums/${album.id}`} state={{ genreId: genre.id }} onClick={() => openAlbum(album.id)} aria-label={`${album.title} — ${album.artist}`}>
            <span className="hip-hop-poster__paper" aria-hidden="true" />
            <span className="hip-hop-poster__number">{String(index + 1).padStart(2, '0')} / 09</span>
            <ArchiveCover album={album} eager={index < 6} small />
            <span className="hip-hop-poster__caption"><strong>{album.title}</strong><small>{album.artist}</small><em>{album.year ?? 'YEAR UNKNOWN'} · {album.tracks.length} TRACKS</em></span>
          </Link>
          <SpotifySource url={album.url} children="SPOTIFY ↗" />
        </article>)}
      </div></div> : <div className="hip-hop-wall__empty"><span>NO VERIFIED RECORDS HERE YET</span><p>This wall is waiting for a reliable classification. Unclassified saved records remain available in All Albums.</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      <div className="hip-hop-wall__footer"><span>THE WALL / KEEP MOVING DOWN</span><span>REAL COVERS / NO INVENTED RECORDS</span><span>03 / SELECTED RECORD NEXT</span></div>
    </section>
  </div>
}

const soulWorldContextKey = 'mva-soul-world-context-v1'
type SoulWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readSoulWorldContext(): SoulWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(soulWorldContextKey) ?? '{}') as Partial<SoulWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function SoulGrooveLine({ className = '' }: { className?: string }) {
  return <svg className={`soul-groove-line ${className}`} viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70 C150 10 260 112 410 54 S690 10 1000 65" /></svg>
}

function SoulWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readSoulWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const selectedIndex = Math.max(0, collection.findIndex(album => album.id === selectedId))
  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(soulWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(soulWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const setSelected = (albumId: string) => setSelectedId(albumId)
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)
  const rootStyle = { '--soul-band-shift': `${selectedIndex * 4}px`, '--soul-band-breathe': `${selectedIndex % 2 ? 1 : -1}` } as CSSProperties

  return <div className="soul-world" data-selected-index={selectedIndex} style={rootStyle}>
    <section className="soul-entry" aria-labelledby="soul-entry-title">
      <div className="soul-entry__bands" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="soul-entry__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>R&B / SOUL · PERSONAL ARCHIVE</span></div>
      <div className="soul-entry__intro"><span>THE GROOVE / A COLLECTION IN MOTION</span><SoulGrooveLine className="soul-groove-line--entry" /></div>
      <div className="soul-entry__title"><span className="soul-entry__title-mark">03</span><h1 id="soul-entry-title"><strong>R&amp;B</strong><em>Soul</em></h1><p>{genre.statement}</p></div>
      <div className="soul-entry__bottom"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>SAVED RECORDS / MOVE THROUGH THE GROOVE</small><a href="#soul-record-selection">BROWSE THE COLLECTION ↓</a></div>
    </section>

    <section id="soul-record-selection" className="soul-selection" aria-labelledby="soul-selection-title">
      <header className="soul-selection__header"><div><span>02 / RECORD SELECTION</span><h2 id="soul-selection-title">THE<br /><em>GROOVE</em></h2></div><div><p>Real saved records arranged as a warm sleeve collection.</p><strong>{countLabel}</strong></div></header>
      <SoulGrooveLine className="soul-groove-line--selection" />
      {collection.length ? <div className="soul-record-rail" role="list" aria-label="R&B and Soul album collection">
        {collection.map((album, index) => <article key={album.id} role="listitem" className={`soul-record${album.id === selectedId ? ' is-selected' : ''}`} style={{ '--soul-record-rotate': `${[-2, 1.2, -1, .7, -1.5][index % 5]}deg`, '--soul-record-order': index } as CSSProperties} onMouseEnter={() => setSelected(album.id)}>
          <Link className="soul-record__link" to={`/albums/${album.id}`} state={{ genreId: genre.id }} onFocus={() => setSelected(album.id)} onClick={() => openAlbum(album.id)} aria-label={`${album.title} — ${album.artist}`}>
            <span className="soul-record__sleeve-back" aria-hidden="true" />
            <span className="soul-record__vinyl" aria-hidden="true" />
            <span className="soul-record__sleeve"><ArchiveCover album={album} eager={index < 4} small /></span>
            <span className="soul-record__label"><b>{String(index + 1).padStart(2, '0')}</b><strong>{album.title}</strong><small>{album.artist}</small><em>{album.year ?? 'YEAR UNKNOWN'} · {album.tracks.length} TRACKS</em></span>
          </Link>
        </article>)}
      </div> : <div className="soul-selection__empty"><span>NO VERIFIED RECORDS HERE YET</span><p>{status === 'loading' || classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'The groove is waiting for a reliable R&B / Soul record from your collection.'}</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      <footer className="soul-selection__footer"><span>THE GROOVE / {String(collection.length).padStart(2, '0')} RECORDS</span><span>REAL COVERS / SPOTIFY SAVED</span><span>03 / OPEN A SLEEVE</span></footer>
    </section>
  </div>
}

const rockWorldContextKey = 'mva-rock-world-context-v1'
type RockWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readRockWorldContext(): RockWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(rockWorldContextKey) ?? '{}') as Partial<RockWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function RockGuitarGraphic({ className = '', variant }: { className?: string; variant: 'paper' | 'electric' }) {
  return <svg className={`rock-guitar rock-guitar--${variant} ${className}`} viewBox="0 0 700 900" role="img" aria-label="Electric guitar graphic">
    <g transform="rotate(-20 350 450)">
      <path className="rock-guitar__neck" d="M315 266 350 278 505 74 541 91 376 324Z" />
      <path className="rock-guitar__head" d="m500 76 48-50 47 24-52 68Z" />
      <path className="rock-guitar__body" d="M315 270c-30-34-77-39-110-14-32 24-22 63 13 84-44 14-67 57-54 106 14 54 61 99 115 74 28-13 47-45 63-83 17 38 36 70 64 83 54 25 101-20 115-74 13-49-10-92-54-106 35-21 45-60 13-84-33-25-80-20-110 14-19 22-36 22-55 0Z" />
      <path className="rock-guitar__guard" d="M348 339c41 1 81 21 100 51l-30 80c-24-11-52-35-75-66-17-22-17-50 5-65Z" />
      <path className="rock-guitar__bridge" d="m270 508 135 0 10 15-155 0Z" />
      <path className="rock-guitar__pickup" d="m302 420 86 0 0 19-86 0Z" />
      <path className="rock-guitar__pickup" d="m294 458 101 0 0 18-101 0Z" />
      <path className="rock-guitar__strings" d="M329 273 324 520M336 275 334 520M343 277 344 520M350 280 354 520" />
      <g className="rock-guitar__controls"><circle cx="241" cy="450" r="10" /><circle cx="424" cy="445" r="10" /><circle cx="425" cy="485" r="10" /></g>
      <g className="rock-guitar__frets"><path d="m374 270 38 18M359 291l41 20M344 313l42 20M329 335l43 20M315 357l43 20" /></g>
      <g className="rock-guitar__tuners"><circle cx="553" cy="37" r="8" /><circle cx="565" cy="61" r="8" /><circle cx="576" cy="85" r="8" /><circle cx="512" cy="32" r="7" /><circle cx="501" cy="55" r="7" /><circle cx="490" cy="78" r="7" /></g>
    </g>
  </svg>
}

function RockWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readRockWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const [rockPage, setRockPage] = useState(0)
  const selectedIndex = Math.max(0, collection.findIndex(album => album.id === selectedId))
  const rootRef = useRef<HTMLDivElement>(null)
  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(rockWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const update = () => {
      frame = 0
      const viewport = window.innerHeight || 1
      const progress = Math.min(1, Math.max(0, (window.scrollY - viewport * .08) / (viewport * .9)))
      root.style.setProperty('--rock-progress', progress.toFixed(3))
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', update); if (frame) window.cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(rockWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const setSelected = (albumId: string) => setSelectedId(albumId)
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)
  const rockPageSize = 8
  const rockPageCount = Math.max(1, Math.ceil(collection.length / rockPageSize))
  const visibleAlbums = collection.slice(rockPage * rockPageSize, (rockPage + 1) * rockPageSize)
  const rockRows = [visibleAlbums.slice(0, 4), visibleAlbums.slice(4, 8)].filter(row => row.length)
  useEffect(() => {
    if (rockPage >= rockPageCount) setRockPage(Math.max(0, rockPageCount - 1))
  }, [rockPage, rockPageCount])
  const rootStyle = { '--rock-progress': 0, '--rock-selected': selectedIndex, '--rock-selected-angle': `${selectedIndex % 2 ? 1 : -1}deg`, '--rock-selected-shift': `${Math.min(selectedIndex, 4) * 2}px` } as CSSProperties

  return <div ref={rootRef} className="rock-world" style={rootStyle}>
    <section className="rock-paper-entry" aria-labelledby="rock-paper-title">
      <div className="rock-paper-entry__red-type" aria-hidden="true">PAPER / ELECTRIC / RECORDS / PAPER / ELECTRIC / RECORDS</div>
      <div className="rock-paper-entry__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>ROCK / PERSONAL ARCHIVE</span></div>
      <div className="rock-paper-entry__collage rock-paper-entry__collage--left" aria-hidden="true">
        <i className="rock-paper-entry__collage-star rock-paper-entry__collage-star--black" /><i className="rock-paper-entry__collage-star rock-paper-entry__collage-star--red" />
        <span className="rock-paper-entry__collage-copy rock-paper-entry__collage-copy--vertical">GUITAR / STAR / FEEDBACK</span>
        <span className="rock-paper-entry__collage-tag">LOUD<br />FAST<br />ELECTRIC</span>
        <RockGuitarGraphic className="rock-paper-entry__side-guitar" variant="electric" />
      </div>
      <div className="rock-paper-entry__collage rock-paper-entry__collage--right" aria-hidden="true">
        <span className="rock-paper-entry__collage-ribbon" /><i className="rock-paper-entry__collage-star rock-paper-entry__collage-star--red" /><i className="rock-paper-entry__collage-star rock-paper-entry__collage-star--black" />
        <span className="rock-paper-entry__collage-tag rock-paper-entry__collage-tag--cream">BATTLE<br />OF THE<br />BANDS</span>
        <span className="rock-paper-entry__collage-copy">NOISE IN MOTION<br />PLAY LOUD</span>
      </div>
      <div className="rock-paper-entry__sheet">
        <div className="rock-paper-entry__sheet-shadow" aria-hidden="true" />
        <RockGuitarGraphic className="rock-paper-entry__paper-guitar" variant="paper" />
        <span className="rock-paper-entry__star rock-paper-entry__star--one" aria-hidden="true">★</span><span className="rock-paper-entry__star rock-paper-entry__star--two" aria-hidden="true">★</span><span className="rock-paper-entry__star rock-paper-entry__star--three" aria-hidden="true">★</span>
        <span className="rock-paper-entry__orbit-copy">MUSIC FROM THE SAVED COLLECTION / {countLabel}</span>
        <h1 id="rock-paper-title">ROCK</h1>
        <div className="rock-paper-entry__info"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>SAVED RECORDS / PAPER TO ELECTRIC</small></div>
      </div>
      <a className="rock-paper-entry__explore" href="#rock-electric-wall"><span>↓</span><strong>EXPLORE ROCK</strong><small>THE PAPER OPENS INTO THE ELECTRIC WALL</small></a>
    </section>

    <section id="rock-electric-wall" className="rock-electric-wall" aria-labelledby="rock-electric-title">
      <header className="rock-electric-wall__top"><Link to="/index">← THE INDEX</Link><span>02 / ELECTRIC WALL</span><span>REAL SAVED RECORDS / SPOTIFY</span></header>
      <div className="rock-electric-wall__stage">
        <div className="rock-electric-wall__burst" aria-hidden="true" />
        <RockGuitarGraphic className="rock-electric-wall__guitar" variant="electric" />
        <span className="rock-electric-wall__star rock-electric-wall__star--a" aria-hidden="true">★</span><span className="rock-electric-wall__star rock-electric-wall__star--b" aria-hidden="true">★</span><span className="rock-electric-wall__star rock-electric-wall__star--c" aria-hidden="true">★</span>
        <div className="rock-electric-wall__words" aria-hidden="true"><span>ROCK</span><span>ALBUMS</span><span>LOUD / CLEAR / SAVED</span></div>
        <div className="rock-electric-wall__heading"><span>02 / RECORD SELECTION</span><h2 id="rock-electric-title">ELECTRIC<br />WALL</h2><p>{collection.length ? 'A real archive arranged around one red axis.' : 'The wall is ready for a verified Rock record.'}</p></div>
        {collection.length ? <div className="rock-setlist-board" aria-label="Rock setlist archive">
          <div className="rock-setlist-board__mast"><div><span>SETLIST WALL / SELECTED RECORDS</span><strong>{String(rockPage + 1).padStart(2, '0')} / {String(rockPageCount).padStart(2, '0')}</strong></div><div className="rock-setlist-board__controls"><button type="button" onClick={() => setRockPage(page => Math.max(0, page - 1))} disabled={rockPage === 0} aria-label="Previous Rock album set">←</button><span>PAGE {rockPage + 1} / {rockPageCount}</span><button type="button" onClick={() => setRockPage(page => Math.min(rockPageCount - 1, page + 1))} disabled={rockPage === rockPageCount - 1} aria-label="Next Rock album set">→</button></div></div>
          <div className="rock-setlist-board__rule"><span>BACKSTAGE ARCHIVE / {String(collection.length).padStart(2, '0')} SAVED RECORDS</span><i /> <span>SIDE A / SIDE B</span></div>
          <div className="rock-setlist-board__rows" role="list" aria-label={`Rock records page ${rockPage + 1}`}>
            {rockRows.map((row, rowIndex) => <div className="rock-setlist-row" role="listitem" key={`row-${rowIndex}`}><span className="rock-setlist-row__label">ROW {String(rowIndex + 1).padStart(2, '0')}<small>{rowIndex === 0 ? 'SIDE A' : 'SIDE B'}</small></span><div className="rock-setlist-row__cards">
              {row.map((album, index) => { const albumIndex = rockPage * rockPageSize + rowIndex * 4 + index; return <article key={album.id} className={`rock-setlist-card${album.id === selectedId ? ' is-selected' : ''}`} style={{ '--rock-setlist-rotate': `${[-1.2, .7, -0.5, 1.1][index % 4]}deg` } as CSSProperties} onMouseEnter={() => setSelected(album.id)}>
                <Link to={`/albums/${album.id}`} state={{ genreId: genre.id }} onFocus={() => setSelected(album.id)} onClick={() => openAlbum(album.id)} aria-label={`${album.title} — ${album.artist}`}>
                  <span className="rock-setlist-card__cover"><ArchiveCover album={album} eager={albumIndex < 4} small /></span><span className="rock-setlist-card__number">{String(albumIndex + 1).padStart(2, '0')}</span><span className="rock-setlist-card__copy"><strong>{album.title}</strong><small>{album.artist}</small>{album.year && <em>{album.year}</em>}</span><span className="rock-setlist-card__stamp">TRACK / ARCHIVE</span>
                </Link>
              </article> })}
            </div></div>)}
          </div>
          <div className="rock-setlist-board__footer"><span>LOUD / CLEAR / SHARP</span><span>{visibleAlbums.length} IN THIS SET</span><span>OPEN A RECORD ↗</span></div>
        </div> : <div className="rock-electric-wall__empty"><span>NO VERIFIED RECORDS HERE YET</span><p>{status === 'loading' || classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'Unclassified saved records remain available in All Albums.'}</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      </div>
      <footer className="rock-electric-wall__footer"><span>ROCK / {String(collection.length).padStart(2, '0')} RECORDS</span><span>REAL COVERS / NO INVENTED RECORDS</span><span>OPEN A RECORD / RETURN TO WALL</span></footer>
    </section>
  </div>
}

const jazzWorldContextKey = 'mva-jazz-world-context-v1'
type JazzWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readJazzWorldContext(): JazzWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(jazzWorldContextKey) ?? '{}') as Partial<JazzWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function JazzInstrumentLine({ className = '' }: { className?: string }) {
  return <svg className={`jazz-instrument-line ${className}`} viewBox="0 0 1200 900" preserveAspectRatio="none" aria-hidden="true">
    <path className="jazz-instrument-line__bell" d="M741 30C786 118 884 262 1002 360c-72-18-143-30-196-48-55-19-90-48-82-91 10-53 28-116 17-191Z" />
    <path className="jazz-instrument-line__stem" d="M741 30c72 159 95 221 33 277-59 54-150 57-250 113-164 91-373 203-407 326-29 104 35 157 130 157h389c184 0 319 80 377 178" />
    <circle className="jazz-instrument-line__round" cx="941" cy="796" r="126" />
  </svg>
}

function JazzWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readJazzWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const [isExploring, setIsExploring] = useState(false)
  const pointerStart = useRef<number | null>(null)
  const selectedIndex = Math.max(0, collection.findIndex(album => album.id === selectedId))
  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(jazzWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useEffect(() => {
    const updateExploration = () => setIsExploring(window.scrollY > window.innerHeight * .42)
    updateExploration()
    window.addEventListener('scroll', updateExploration, { passive: true })
    return () => window.removeEventListener('scroll', updateExploration)
  }, [])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(jazzWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const selectAlbum = (index: number) => {
    if (!collection.length) return
    const next = Math.max(0, Math.min(collection.length - 1, index))
    setSelectedId(collection[next]?.id ?? null)
    setIsExploring(true)
  }
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)
  const handleGalleryWheel = (event: ReactWheelEvent<HTMLElement>) => {
    const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1
    const next = selectedIndex + direction
    if (next >= 0 && next < collection.length) event.preventDefault()
    selectAlbum(next)
  }
  const handleGalleryKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectAlbum(selectedIndex + 1) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectAlbum(selectedIndex - 1) }
  }

  return <div className={`jazz-world${isExploring ? ' is-exploring' : ''}`} style={{ '--jazz-selected-index': selectedIndex } as CSSProperties}>
    <section className="jazz-theme" aria-labelledby="jazz-theme-title">
      <header className="jazz-theme__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>JAZZ / PERSONAL ARCHIVE</span></header>
      <div className="jazz-theme__title" id="jazz-theme-title"><span>LET’S</span><strong>JAZZ</strong></div>
      <JazzInstrumentLine className="jazz-instrument-line--theme" />
      <div className="jazz-theme__dots" aria-hidden="true"><i /><i /><i /></div>
      <p className="jazz-theme__statement">A LINE OF<br />IMPROVISATION.</p>
      <div className="jazz-theme__meta"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>SAVED RECORDS / THEME FIRST, THEN THE TURN</small></div>
      <a className="jazz-theme__explore" href="#jazz-improvisation" onClick={() => setIsExploring(true)}><span>↓</span><strong>EXPLORE THE COLLECTION</strong><small>FOLLOW THE LINE INTO THE ROOM</small></a>
    </section>

    <section id="jazz-improvisation" className="jazz-improvisation" aria-labelledby="jazz-gallery-title" tabIndex={0} onKeyDown={handleGalleryKeyDown} onWheel={handleGalleryWheel} onPointerDown={event => { pointerStart.current = event.clientX }} onPointerUp={event => { if (pointerStart.current !== null && Math.abs(event.clientX - pointerStart.current) > 30) selectAlbum(selectedIndex + (event.clientX < pointerStart.current ? 1 : -1)); pointerStart.current = null }}>
      <header className="jazz-improvisation__top"><span>02 / THE IMPROVISATION</span><h2 id="jazz-gallery-title">JAZZ ARCHIVE</h2><span>{countLabel}</span></header>
      <div className="jazz-improvisation__stage">
        <div className="jazz-improvisation__axis" aria-hidden="true"><JazzInstrumentLine className="jazz-instrument-line--axis" /><span>THEME / TURN / RESPONSE</span></div>
        <div className="jazz-improvisation__floor-type" aria-hidden="true">JAZZ ARCHIVE</div>
        {collection.length ? collection.map((album, index) => {
          const offset = index - selectedIndex
          if (Math.abs(offset) > 4) return null
          const distance = Math.abs(offset)
          const focused = offset === 0
          const style = {
            '--jazz-x': `${offset * 14}vw`,
            '--jazz-y': `${distance * 5.5}vh`,
            '--jazz-scale': focused ? 1.04 : Math.max(.48, .86 - distance * .1),
            '--jazz-rotate': focused ? '0deg' : `${offset < 0 ? -(8 + distance * 2) : 8 + distance * 2}deg`,
            '--jazz-depth': 10 - distance,
          } as CSSProperties
          return <Link key={album.id} className={`jazz-exhibit${focused ? ' is-focused' : ''}`} style={style} to={`/albums/${album.id}`} state={{ genreId: genre.id }} onPointerDown={event => event.stopPropagation()} onMouseEnter={() => selectAlbum(index)} onFocus={() => selectAlbum(index)} onClick={() => openAlbum(album.id)} aria-label={`${album.title} — ${album.artist}，进入专辑`}>
            <span className="jazz-exhibit__frame"><ArchiveCover album={album} eager={distance < 2} small /></span>
            <span className="jazz-exhibit__label"><b>{String(index + 1).padStart(3, '0')}</b><strong>{album.title}</strong><small>{album.artist}</small>{album.year && <em>{album.year}</em>}</span>
          </Link>
        }) : <div className="jazz-improvisation__empty"><span>NO VERIFIED RECORDS / JAZZ</span><h3>THE LINE IS OPEN.</h3><p>{status === 'loading' || classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'No verified Jazz records are assigned yet. Unclassified saved records remain in All Albums.'}</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      </div>
      <div className="jazz-improvisation__caption"><span>{collection.length ? `${String(selectedIndex + 1).padStart(3, '0')} / ${String(collection.length).padStart(3, '0')}` : '--- / ---'}</span><div><strong>{collection[selectedIndex]?.title ?? 'WAITING FOR A RECORD'}</strong><small>{collection[selectedIndex]?.artist ?? 'JAZZ ARCHIVE'}</small></div>{collection[selectedIndex] ? <Link to={`/albums/${collection[selectedIndex].id}`} state={{ genreId: genre.id }} onClick={() => openAlbum(collection[selectedIndex].id)}>OPEN RECORD ↗</Link> : <span>ARCHIVE QUIET</span>}</div>
      <footer className="jazz-improvisation__controls"><button type="button" onClick={() => selectAlbum(selectedIndex - 1)} disabled={!collection.length || selectedIndex === 0} aria-label="Previous Jazz record">←</button><span>WHEEL / SWIPE / ARROW KEYS · MOVE THROUGH THE ROOM</span><button type="button" onClick={() => selectAlbum(selectedIndex + 1)} disabled={!collection.length || selectedIndex === collection.length - 1} aria-label="Next Jazz record">→</button></footer>
    </section>
  </div>
}

const classicalWorldContextKey = 'mva-classical-world-context-v1'
type ClassicalWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readClassicalWorldContext(): ClassicalWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(classicalWorldContextKey) ?? '{}') as Partial<ClassicalWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function ClassicalArcade({ className = '' }: { className?: string }) {
  return <svg className={`classical-arcade__drawing ${className}`} viewBox="0 0 1400 820" preserveAspectRatio="none" aria-hidden="true">
    <circle className="classical-arcade__moon" cx="708" cy="316" r="46" />
    <path className="classical-arcade__horizon" d="M0 675H1400V820H0Z" />
    <path className="classical-arcade__city" d="M240 675V616h44v-46h55v46h38v-72h48v72h38v-35h38v35h37v-83h50v83h53v-46h44v46h43v-76h50v76h51v-55h35v55h64v-94h48v94h65v-45h38v45h52v-61h41v61h65v-42h44v42h50v-77h52v77h63" />
    {[0, 1, 2, 3, 4].map(index => {
      const x = 36 + index * 274
      return <g key={index} className={`classical-arcade__bay classical-arcade__bay--${index + 1}`}>
        <path className="classical-arcade__arch-shadow" d={`M${x} 714V364C${x} 176 ${x + 222} 176 ${x + 222} 364V714Z`} />
        <path className="classical-arcade__arch" d={`M${x + 30} 714V370C${x + 30} 220 ${x + 192} 220 ${x + 192} 370V714`} />
        <path className="classical-arcade__arch-inner" d={`M${x + 62} 714V380C${x + 62} 265 ${x + 160} 265 ${x + 160} 380V714`} />
        <path className="classical-arcade__column" d={`M${x + 25} 714V388h42v326M${x + 185} 714V388h42v326`} />
        <path className="classical-arcade__capital" d={`M${x + 14} 401h64l-8-26H22l-8 26Zm160 0h64l-8-26h-48l-8 26Z`} />
        <path className="classical-arcade__trefoil" d={`M${x + 111} 246c-28-31-67 1-32 29-35 28 4 60 32 29 28 31 67-1 32-29 35-28-4-60-32-29Z`} />
        <circle className="classical-arcade__rosette" cx={x + 111} cy="177" r="15" />
      </g>
    })}
  </svg>
}

function ClassicalCornerOrnament({ className = '' }: { className?: string }) {
  return <svg className={`classical-corner-ornament ${className}`} viewBox="0 0 220 220" aria-hidden="true">
    <path d="M10 210C17 137 52 98 106 92c34-4 47-31 39-62M12 208c48-7 75-34 80-81 4-38 31-59 83-54M23 196c23-26 49-39 78-38 26 1 43-11 53-35M38 201c35-25 53-54 54-86M8 14c48 31 75 61 88 91" />
    <path d="M28 172c20-3 35 4 44 22-21 4-37-3-44-22ZM75 102c16-11 32-11 49 0-17 13-33 13-49 0ZM129 49c17-8 31-5 42 9-17 7-31 4-42-9Z" />
    <circle cx="13" cy="207" r="5" /><circle cx="206" cy="12" r="5" />
  </svg>
}

function ClassicalViolinDetail() {
  return <svg className="classical-score__violin" viewBox="0 0 220 480" aria-hidden="true">
    <path className="classical-score__violin-body" d="M106 24c-26 9-31 37-17 61 11 19 6 41-13 63-25 30-27 68-7 91 12 14 13 30 0 51-18 29-10 69 18 84 25 14 63 6 78-20 12-21 9-42-9-65-13-17-12-31 1-50 23-33 18-73-8-96-22-19-28-40-18-61 11-25 2-50-25-58Z" />
    <path className="classical-score__violin-neck" d="M101 28 88 0h39l-11 28" />
    <path className="classical-score__violin-fhole" d="M78 144c14 12 13 29-3 44 17-7 26-24 15-42m51-2c-14 12-13 29 3 44-17-7-26-24-15-42" />
    <path className="classical-score__violin-bridge" d="M60 231c30-7 67-7 99 0M64 244c29-6 62-6 92 0" />
    <path className="classical-score__violin-strings" d="M98 0v330M106 0v330M114 0v330M122 0v330" />
  </svg>
}

function ClassicalWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readClassicalWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const pointerStart = useRef<number | null>(null)
  const selectedIndex = Math.max(0, collection.findIndex(album => album.id === selectedId))
  const selectedAlbum = collection[selectedIndex]

  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(classicalWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(classicalWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const selectAlbum = (index: number) => {
    if (!collection.length) return
    const next = Math.max(0, Math.min(collection.length - 1, index))
    setSelectedId(collection[next]?.id ?? null)
    setIsGalleryOpen(true)
  }
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)
  const handleGalleryWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!collection.length) return
    const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1
    if (Math.abs(event.deltaY) > 8 || Math.abs(event.deltaX) > 8) { event.preventDefault(); selectAlbum(selectedIndex + direction) }
  }
  const handleGalleryKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectAlbum(selectedIndex + 1) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectAlbum(selectedIndex - 1) }
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current !== null && Math.abs(event.clientX - pointerStart.current) > 30) selectAlbum(selectedIndex + (event.clientX < pointerStart.current ? 1 : -1))
    pointerStart.current = null
  }

  return <div className={`classical-world${isGalleryOpen ? ' is-gallery-open' : ''}`}>
    <section className="classical-arcade" aria-labelledby="classical-arcade-title">
      <header className="classical-arcade__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>CLASSICAL MUSIC / PERSONAL ARCHIVE</span></header>
      <div className="classical-arcade__night"><ClassicalArcade /></div>
      <div className="classical-arcade__title" id="classical-arcade-title"><span>THE</span><strong>CLASSICAL</strong><em>COLLECTION</em></div>
      <p className="classical-arcade__statement">FROM ARCADE<br />TO GALLERY.</p>
      <div className="classical-arcade__meta"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>SAVED WORKS / A QUIET ROOM FOR LISTENING</small></div>
      <a className="classical-arcade__explore" href="#classical-gallery" onClick={() => setIsGalleryOpen(true)}><span>↓</span><strong>ENTER THE GALLERY</strong><small>FOLLOW THE COLLECTION INWARD</small></a>
    </section>

    <section id="classical-gallery" className="classical-gallery" aria-labelledby="classical-gallery-title" tabIndex={0} onKeyDown={handleGalleryKeyDown} onWheel={handleGalleryWheel} onPointerDown={event => { pointerStart.current = event.clientX }} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStart.current = null }}>
      <header className="classical-gallery__top"><span>02 / THE GALLERY</span><h2 id="classical-gallery-title">CLASSICAL WORKS</h2><span>{countLabel}</span></header>
      <div className="classical-gallery__room">
        <ClassicalCornerOrnament className="classical-corner-ornament--tl" /><ClassicalCornerOrnament className="classical-corner-ornament--tr" /><ClassicalCornerOrnament className="classical-corner-ornament--bl" /><ClassicalCornerOrnament className="classical-corner-ornament--br" />
        <div className="classical-gallery__crest">✦<span>THE COLLECTION / ORIGINAL COVERS</span></div>
        <div className="classical-gallery__works">
          {collection.length ? collection.map((album, index) => {
            const focused = album.id === selectedId
            const frameKind = index % 5 === 0 ? 'gilt' : index % 4 === 0 ? 'wine' : index % 2 ? 'relief-light' : 'relief'
            return <Link key={album.id} className={`classical-gallery__piece classical-gallery__piece--${frameKind}${focused ? ' is-focused' : ''}`} style={{ '--classical-piece-y': `${(index % 4) * 12}px`, '--classical-piece-rotate': `${[-1.2, .6, -.8, 1.1][index % 4]}deg` } as CSSProperties} to={`/albums/${album.id}`} state={{ genreId: genre.id }} onPointerDown={event => event.stopPropagation()} onMouseEnter={() => selectAlbum(index)} onFocus={() => selectAlbum(index)} onClick={() => openAlbum(album.id)} aria-label={`${album.title} — ${album.artist}，打开专辑`}>
              <span className="classical-gallery__frame"><span className="classical-gallery__frame-crest">✦</span><span className="classical-gallery__frame-corner classical-gallery__frame-corner--left">❧</span><ArchiveCover album={album} eager={index < 4} small /><span className="classical-gallery__frame-corner classical-gallery__frame-corner--right">❧</span></span>
              <span className="classical-gallery__label"><b>{String(index + 1).padStart(2, '0')}</b><strong>{album.title}</strong><small>{album.artist}</small>{album.year && <em>{album.year}</em>}</span>
            </Link>
          }) : <div className="classical-gallery__empty"><span>NO VERIFIED RECORDS / CLASSICAL</span><h3>THE ROOM IS QUIET.</h3><p>{status === 'loading' || classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'No verified Classical records are assigned yet. Unclassified saved records remain in All Albums.'}</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
        </div>

        {selectedAlbum ? <div className="classical-score" key={selectedAlbum.id}>
          <ClassicalViolinDetail />
          <div className="classical-score__paper"><ClassicalCornerOrnament className="classical-score__ornament" /><span className="classical-score__eyebrow">03 / THE SCORE · CURRENT WORK</span><h3>{selectedAlbum.title}</h3><p>{selectedAlbum.artist}</p><div className="classical-score__staff" aria-hidden="true" />
            <dl>{selectedAlbum.year && <div><dt>RELEASE</dt><dd>{selectedAlbum.year}</dd></div>}<div><dt>TRACKS</dt><dd>{selectedAlbum.tracks.length}</dd></div><div><dt>POSITION</dt><dd>{String(selectedIndex + 1).padStart(2, '0')} / {String(collection.length).padStart(2, '0')}</dd></div></dl>
            <Link to={`/albums/${selectedAlbum.id}`} state={{ genreId: genre.id }} onClick={() => openAlbum(selectedAlbum.id)}>OPEN THE SCORE ↗</Link>
          </div>
          <div className="classical-score__black-page"><ClassicalCornerOrnament className="classical-score__black-ornament classical-score__black-ornament--tl" /><ClassicalCornerOrnament className="classical-score__black-ornament classical-score__black-ornament--br" /><span>THE WORK CONTINUES</span></div>
        </div> : null}
      </div>
      <footer className="classical-gallery__controls"><button type="button" onClick={() => selectAlbum(selectedIndex - 1)} disabled={!collection.length || selectedIndex === 0} aria-label="Previous Classical record">←</button><span>WHEEL / SWIPE / ARROW KEYS · WALK THROUGH THE ROOM</span><button type="button" onClick={() => selectAlbum(selectedIndex + 1)} disabled={!collection.length || selectedIndex === collection.length - 1} aria-label="Next Classical record">→</button></footer>
    </section>
  </div>
}

const danceWorldContextKey = 'mva-dance-world-context-v1'
type DanceWorldContext = { albumId: string | null; scrollTop: number; restoreOnReturn: boolean }

function readDanceWorldContext(): DanceWorldContext {
  try {
    const stored = JSON.parse(sessionStorage.getItem(danceWorldContextKey) ?? '{}') as Partial<DanceWorldContext>
    return { albumId: stored.albumId ?? null, scrollTop: Number(stored.scrollTop) || 0, restoreOnReturn: stored.restoreOnReturn === true }
  } catch {
    return { albumId: null, scrollTop: 0, restoreOnReturn: false }
  }
}

function DanceArchiveCard({ album, index, selectedId, onFocusAlbum, onOpenAlbum }: { album: LibraryAlbum; index: number; selectedId: string | null; onFocusAlbum: (albumId: string) => void; onOpenAlbum: (albumId: string) => void }) {
  const focused = album.id === selectedId
  return <article className={`dance-archive-card${focused ? ' is-selected' : ''}`} style={{ '--dance-card-rotate': `${[-1.4, .8, -.6, 1.1, -.4][index % 5]}deg` } as CSSProperties}>
      <Link to={`/albums/${album.id}`} state={{ genreId: 'dance' }} onPointerDown={event => event.stopPropagation()} onFocus={() => onFocusAlbum(album.id)} onMouseEnter={() => onFocusAlbum(album.id)} onClick={() => onOpenAlbum(album.id)} aria-label={`${album.title} — ${album.artist}，进入专辑详情`}>
      <span className="dance-archive-card__frame"><ArchiveCover album={album} small /></span>
      <span className="dance-archive-card__meta"><b>{String(index + 1).padStart(2, '0')}</b><strong>{album.title}</strong><small>{album.artist}</small>{album.year && <em>{album.year}</em>}</span>
    </Link>
  </article>
}

function DanceWorldPage({ genre, collection, status, classification }: { genre: GenreDefinition; collection: LibraryAlbum[]; status: string; classification: ReturnType<typeof useLibrary>['library']['classification'] }) {
  const savedContext = useMemo(readDanceWorldContext, [])
  const [selectedId, setSelectedId] = useState<string | null>(() => savedContext.albumId ?? collection[0]?.id ?? null)
  const selectedIndex = Math.max(0, collection.findIndex(album => album.id === selectedId))
  const rootRef = useRef<HTMLDivElement>(null)
  const velocityRef = useRef(0)
  const driftRef = useRef(0)
  const pointerStart = useRef<number | null>(null)

  const saveContext = (albumId = selectedId, scrollTop = window.scrollY, restoreOnReturn = false) => {
    try { sessionStorage.setItem(danceWorldContextKey, JSON.stringify({ albumId, scrollTop, restoreOnReturn })) } catch { /* storage is optional */ }
  }

  useEffect(() => {
    if (!collection.some(album => album.id === selectedId)) setSelectedId(collection[0]?.id ?? null)
  }, [collection, selectedId])

  useEffect(() => {
    const rememberScroll = () => saveContext(selectedId, window.scrollY, false)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => window.removeEventListener('scroll', rememberScroll)
  }, [selectedId])

  useLayoutEffect(() => {
    if (!savedContext.restoreOnReturn || savedContext.scrollTop <= 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: savedContext.scrollTop, behavior: 'auto' })))
    try { sessionStorage.setItem(danceWorldContextKey, JSON.stringify({ ...savedContext, restoreOnReturn: false })) } catch { /* storage is optional */ }
    return () => window.cancelAnimationFrame(frame)
  }, [savedContext.restoreOnReturn, savedContext.scrollTop])

  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const delta = Math.min(48, now - previous)
      previous = now
      const resting = .012
      velocityRef.current = velocityRef.current * Math.pow(.91, delta / 16) + resting * (1 - Math.pow(.91, delta / 16))
      driftRef.current += velocityRef.current * delta
      root.style.setProperty('--dance-drift', `${driftRef.current}px`)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const countLabel = classification.status === 'running'
    ? `CLASSIFYING ${classification.completed} / ${classification.total}`
    : status === 'loading' ? 'READING SPOTIFY LIBRARY' : `${String(collection.length).padStart(2, '0')} VERIFIED RECORDS`
  const selectedAlbum = collection[selectedIndex]
  const selectAlbum = (index: number) => {
    if (!collection.length) return
    const next = Math.max(0, Math.min(collection.length - 1, index))
    setSelectedId(collection[next]?.id ?? null)
  }
  const focusAlbum = (albumId: string) => {
    const index = collection.findIndex(album => album.id === albumId)
    if (index >= 0) selectAlbum(index)
  }
  const openAlbum = (albumId: string) => saveContext(albumId, window.scrollY, true)
  const kickTracks = (amount: number) => { velocityRef.current = Math.max(-1.15, Math.min(1.15, velocityRef.current + amount)) }
  const handleFloorWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!collection.length) return
    const direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1
    event.preventDefault()
    kickTracks(direction * .22)
    if (Math.abs(event.deltaY) > 18 || Math.abs(event.deltaX) > 18) selectAlbum(selectedIndex + direction)
  }
  const handleFloorKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); kickTracks(.24); selectAlbum(selectedIndex + 1) }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); kickTracks(-.24); selectAlbum(selectedIndex - 1) }
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current !== null && Math.abs(event.clientX - pointerStart.current) > 30) {
      const direction = event.clientX < pointerStart.current ? 1 : -1
      kickTracks(direction * .28)
      selectAlbum(selectedIndex + direction)
    }
    pointerStart.current = null
  }
  const topLane = collection.filter((_, index) => index % 2 === 0 && collection[index]?.id !== selectedId)
  const bottomLane = collection.filter((_, index) => index % 2 === 1 && collection[index]?.id !== selectedId)
  const paletteClass = selectedIndex % 2 ? 'is-blue-edition' : 'is-magenta-edition'

  return <div ref={rootRef} className={`dance-world ${paletteClass}`} style={{ '--dance-drift': '0px' } as CSSProperties}>
    <section className="dance-entry" aria-labelledby="dance-entry-title">
      <div className="dance-entry__frame" aria-hidden="true" />
      <header className="dance-entry__top"><Link to="/index">← THE INDEX</Link><span><MVAHomeLink>M / V / A</MVAHomeLink> · {genre.number} / 09</span><span>DANCE / CLUB · PERSONAL ARCHIVE</span></header>
      <div className="dance-entry__bar dance-entry__bar--top" aria-hidden="true"><span>AFTER HOURS</span><i /> <span>AFTER HOURS</span><i /> <span>AFTER HOURS</span></div>
      <div className="dance-entry__shape dance-entry__shape--orange" aria-hidden="true" />
      <div className="dance-entry__shape dance-entry__shape--star" aria-hidden="true">✦</div>
      <div className="dance-entry__headline"><span>AFTER</span><strong id="dance-entry-title">DANCE</strong><strong>CLUB</strong></div>
      <p className="dance-entry__statement">THE NIGHT<br />KEEPS A RECORD.</p>
      <div className="dance-entry__collage" aria-hidden="true">
        <span className="dance-collage__xerox"><i /><b>LIVE<br />SIGNAL</b></span>
        <span className="dance-collage__pink-note">AFTER<br />HOURS</span>
        <span className="dance-collage__blue-note">LIVE SIGNAL<br /><small>09 / 09</small></span>
        <span className="dance-collage__star">✦</span>
        <span className="dance-collage__tape">NO SLEEP / KEEP MOVING</span>
      </div>
      <div className="dance-entry__count"><span>{countLabel}</span><strong>{collection.length ? String(collection.length).padStart(2, '0') : '—'}</strong><small>RECORDS IN THE TWO-LANE FLOOR</small></div>
      <div className="dance-entry__bar dance-entry__bar--bottom" aria-hidden="true"><span>NO SLEEP / NO STATIC / KEEP MOVING</span><i /><span>AFTER HOURS / IN MOTION</span></div>
      <a className="dance-entry__explore" href="#dance-floor"><span>↓</span><strong>ENTER THE FLOOR</strong><small>FOLLOW THE TWO-LANE ARCHIVE</small></a>
    </section>

    <section id="dance-floor" className="dance-floor" aria-labelledby="dance-floor-title" tabIndex={0} onKeyDown={handleFloorKeyDown} onWheel={handleFloorWheel} onPointerDown={event => { pointerStart.current = event.clientX }} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStart.current = null }}>
      <header className="dance-floor__top"><span>02 / TWO-LANE FLOOR</span><h2 id="dance-floor-title">AFTER HOURS</h2><span>{countLabel}</span></header>
      <div className="dance-floor__stage">
        <div className="dance-floor__noise" aria-hidden="true" />
        <div className="dance-floor__star dance-floor__star--one" aria-hidden="true">✦</div><div className="dance-floor__star dance-floor__star--two" aria-hidden="true">✦</div>
        <div className="dance-floor__lane dance-floor__lane--top"><span className="dance-floor__lane-label">LANE A / SIDE ONE</span><div className="dance-floor__track">{topLane.length ? topLane.map(album => <DanceArchiveCard key={album.id} album={album} index={collection.findIndex(item => item.id === album.id)} selectedId={selectedId} onFocusAlbum={focusAlbum} onOpenAlbum={openAlbum} />) : <span className="dance-floor__lane-empty">WAITING FOR THE FIRST RECORD</span>}</div></div>
        <div className="dance-floor__lane dance-floor__lane--bottom"><span className="dance-floor__lane-label">LANE B / SIDE TWO</span><div className="dance-floor__track">{bottomLane.length ? bottomLane.map(album => <DanceArchiveCard key={album.id} album={album} index={collection.findIndex(item => item.id === album.id)} selectedId={selectedId} onFocusAlbum={focusAlbum} onOpenAlbum={openAlbum} />) : <span className="dance-floor__lane-empty">NO SECOND LANE YET</span>}</div></div>
        {selectedAlbum ? <div className="dance-focus" key={selectedAlbum.id}>
          <div className="dance-focus__print dance-focus__print--mono" aria-hidden="true"><ArchiveCover album={selectedAlbum} small /></div>
          <div className="dance-focus__print dance-focus__print--color" aria-hidden="true"><ArchiveCover album={selectedAlbum} small /></div>
          <Link className="dance-focus__record" to={`/albums/${selectedAlbum.id}`} state={{ genreId: genre.id }} onPointerDown={event => event.stopPropagation()} onClick={() => openAlbum(selectedAlbum.id)} aria-label={`${selectedAlbum.title} — ${selectedAlbum.artist}，进入专辑详情`}><ArchiveCover album={selectedAlbum} eager /></Link>
          <div className="dance-focus__meta"><span>{String(selectedIndex + 1).padStart(2, '0')} / CURRENT FOCUS</span><strong>{selectedAlbum.title}</strong><small>{selectedAlbum.artist}{selectedAlbum.year ? ` · ${selectedAlbum.year}` : ''} · {selectedAlbum.tracks.length} TRACKS</small></div>
        </div> : <div className="dance-floor__empty"><span>NO VERIFIED DANCE / CLUB RECORDS</span><h3>THE FLOOR IS OPEN.</h3><p>{status === 'loading' || classification.status === 'running' ? 'Your saved records are still being read and classified.' : 'No verified Dance / Club records are assigned yet. Unclassified saved records remain in All Albums.'}</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
      </div>
      <footer className="dance-floor__footer"><span>REAL COVERS / SPOTIFY SAVED</span><span>WHEEL / SWIPE / ARROW KEYS</span><span>{selectedAlbum ? 'OPEN THE CURRENT RECORD ↗' : 'ARCHIVE QUIET'}</span></footer>
    </section>
  </div>
}

export function GenreWorldPage() {
  const { genreId } = useParams()
  const { library, libraryHydrated, status, progress, error, connected } = useLibrary()
  const assignments = useGenreAssignments()
  const [density, setDensity] = useState(2)
  const [scale, setScale] = useState(1)
  const [looseness, setLooseness] = useState(2)
  const [showText, setShowText] = useState(true)
  const [motion, setMotion] = useState(true)
  const genre = genres.find(item => item.id === canonicalGenreId(genreId))
  const collection = genre ? getGenreRecords(library.albums, genre.id, assignments) : []
  const hydrationState = getGenreHydrationState({ connected, libraryHydrated, classificationStatus: library.classification.status })
  const pendingStatus = hydrationState === 'ready' ? status : 'loading'
  const pendingClassification = hydrationState === 'ready' || library.classification.status !== 'idle'
    ? library.classification
    : { ...library.classification, status: 'running' as const }
  if (!genre) return <MissingPage />
  if (genre.id === 'electronic') return <ElectronicWorldPage genre={genre} />
  if (genre.id === 'pop') return <PopWorldPage genre={genre} collection={collection} libraryHydrated={libraryHydrated} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'indie') return <IndieWorldPage genre={genre} collection={collection} status={pendingStatus} progress={progress} error={error} />
  if (genre.id === 'hip-hop') return <HipHopWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'soul') return <SoulWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'rock') return <RockWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'jazz') return <JazzWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'ambient') return <ClassicalWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  if (genre.id === 'dance') return <DanceWorldPage genre={genre} collection={collection} status={pendingStatus} classification={pendingClassification} />
  const worldStyle = {
    '--genre-accent': genre.color, '--genre-ink': genre.ink,
    '--world-scale': scale, '--world-gap': `${12 + looseness * 12}px`,
    '--world-columns': density === 1 ? 3 : density === 2 ? 4 : 5,
  } as CSSProperties
  return <div className={`archive-page genre-world genre-world--${genre.id}`} data-text={showText} data-motion={motion} data-density={density} style={worldStyle}>
    <div className="genre-world__top"><span><MVAHomeLink>M / V / A</MVAHomeLink> — {genre.number}</span><Link to="/index">← THE INDEX</Link></div>
    <div className="genre-world__hero"><span className="genre-world__number">{genre.number} / 09</span><h1>{genre.name}</h1><p>{genre.statement}</p><div className="genre-world__emblem" aria-hidden="true"><span /><span /><span /></div></div>
    <div className="genre-world__contents"><div className="genre-world__caption"><span>{library.classification.status === 'running' ? `CLASSIFYING ${library.classification.completed} / ${library.classification.total}` : `${String(collection.length).padStart(2, '0')} RECORDS IN THIS WORLD`}</span><strong>{genre.entry}</strong></div>
      <details className="genre-world__settings"><summary>ADJUST THE VIEW <span aria-hidden="true">＋</span></summary>
        <div className="genre-world__settings-panel">
          <label>DENSITY <input type="range" min="1" max="3" value={density} onChange={event => setDensity(Number(event.target.value))} /></label>
          <label>SCALE <input type="range" min="0.8" max="1.2" step="0.1" value={scale} onChange={event => setScale(Number(event.target.value))} /></label>
          <label>SPACING <input type="range" min="1" max="4" value={looseness} onChange={event => setLooseness(Number(event.target.value))} /></label>
          <label>TEXT <input type="checkbox" checked={showText} onChange={event => setShowText(event.target.checked)} /></label>
          <label>MOTION <input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} /></label>
        </div>
      </details>
      {collection.length ? <div className="genre-world__records">{collection.map((album, index) => <article key={album.id} style={{ '--record-order': index % 4 } as CSSProperties}>
        <Link to={`/albums/${album.id}`} state={{ genreId: genre.id }}><ArchiveCover album={album} eager={index < 3} /><span>{String(index + 1).padStart(2, '0')} / {album.title}</span></Link>
        <SpotifySource url={album.url} /></article>)}</div>
        : <div className="genre-world__empty"><span>NO VERIFIED RECORDS HERE YET</span><p>This world has room to grow.<br />Your unclassified records are waiting in All Albums.</p><Link to="/albums">VIEW ALL ALBUMS ↗</Link></div>}
    </div>
  </div>
}

export function AlbumPage() {
  const { albumId } = useParams()
  const { state } = useLocation()
  const { library } = useLibrary()
  const assignments = useGenreAssignments()
  const album = library.albums.find(item => item.id === albumId)
  const introduction = useAlbumIntroduction(album ?? null)
  if (!album) return <MissingPage />
  const fromGenre = (state as { genreId?: GenreId } | null)?.genreId
  const assigned = albumGenres(album, assignments)
  const manual = assignments[album.id]
  return <div className={`archive-page album-story${fromGenre === 'hip-hop' ? ' album-story--hip-hop' : fromGenre === 'soul' ? ' album-story--soul' : fromGenre === 'rock' ? ' album-story--rock' : fromGenre === 'ambient' ? ' album-story--classical' : ''}`}><div className="album-story__top"><Link to={fromGenre ? `/genres/${fromGenre}` : '/albums'}>← {fromGenre ? 'GENRE WORLD' : 'ALL ALBUMS'}</Link><span>06 / ALBUM OBJECT</span></div>
    <div className="album-story__spread"><div className="album-story__visual"><ArchiveCover album={album} eager /><span>{album.artwork ? 'ORIGINAL ARTWORK / SPOTIFY' : 'ARTWORK / UNAVAILABLE'}</span></div>
      <div className="album-story__text"><span className="album-story__overline">MUSIC VISUAL ARCHIVE / SAVED ALBUM</span>
        <h1>{album.title}</h1><p className="album-story__artist">{album.artist}</p><div className="album-story__rule" />
        <dl><div><dt>RELEASE</dt><dd>{album.year ?? 'UNKNOWN'}</dd></div><div><dt>WORLD</dt><dd>{assigned.map(id => genres.find(genre => genre.id === id)?.name).join(' / ') || 'UNCLASSIFIED'}</dd></div><div><dt>TRACKS IN ARCHIVE</dt><dd>{album.tracks.length}</dd></div></dl>
        {album.note && <p className="album-story__note">{album.note}</p>}
        <div className="album-story__intro"><span>ABOUT THIS RECORD</span>
          {introduction.status === 'loading' && <p className="album-story__intro--quiet" role="status">LOOKING FOR A VERIFIED NOTE…</p>}
          {introduction.status === 'ready' && <><p>{introduction.text}</p>{introduction.sourceUrl && <a href={introduction.sourceUrl} target="_blank" rel="noreferrer">SOURCE / {introduction.sourceLabel ?? 'WIKIPEDIA'} ↗</a>}</>}
          {introduction.status === 'unavailable' && <p className="album-story__intro--quiet">NO VERIFIED INTRODUCTION IS AVAILABLE FOR THIS RELEASE.</p>}
          {introduction.status === 'error' && <p className="album-story__intro--quiet">VERIFIED INTRODUCTION TEMPORARILY UNAVAILABLE.</p>}
        </div>
        <SpotifySource url={album.url} />
      </div></div>
    <section className="album-story__classify"><div><span>PERSONAL INDEX / LOCAL ONLY</span><h2>YOUR GENRE INDEX</h2><p>LOCAL ONLY · AUTOMATIC ASSIGNMENT CAN BE OVERRIDDEN.</p></div>
      <div className="album-story__genre-options">{genres.map(genre => <label key={genre.id}><input type="checkbox" checked={assigned.includes(genre.id)} onChange={event => setAlbumGenres(album.id, event.target.checked ? [...assigned, genre.id] : assigned.filter(id => id !== genre.id))} /><span>{genre.name}</span></label>)}
        <label className="album-story__primary">PRIMARY <select value={manual?.primary ?? assigned[0] ?? ''} disabled={!manual || assigned.length === 0} onChange={event => setAlbumPrimaryGenre(album.id, (event.target.value || null) as GenreId | null)}><option value="">UNRESOLVED</option>{assigned.map(id => <option key={id} value={id}>{genres.find(genre => genre.id === id)?.name}</option>)}</select></label>
        {manual && <><span className="album-story__manual-status">MANUAL OVERRIDE ACTIVE</span><button type="button" className="album-story__reset" onClick={() => resetAlbumGenres(album.id)}>RESET TO AUTOMATIC</button></>}
      </div></section>
    <section className="album-story__tracks"><div className="album-story__tracks-heading"><span>THE SEQUENCE / {String(album.tracks.length).padStart(2, '0')} OBJECTS</span><h2><span className="album-story__tracks-title">Tracks</span><span className="album-story__tracks-accent">in motion.</span></h2><p>A quiet path through the record, one object at a time.</p></div>
      {album.tracks.length ? <div className="album-story__track-sequence"><div className="album-story__track-axis" aria-hidden="true" /><ol>{album.tracks.map((track, index) => <li key={track.id}><Link to={`/tracks/${track.id}`} state={{ genreId: fromGenre, albumId: album.id }}><span className="album-story__track-number">{String(index + 1).padStart(2, '0')}</span><span className="album-story__track-copy"><strong>{track.title}</strong><em>TRACK OBJECT</em></span><small>{track.duration}</small><span className="album-story__track-arrow" aria-hidden="true">↗</span></Link></li>)}</ol></div>
        : <div className="album-story__track-sequence"><p className="archive-empty">Track metadata is unavailable for this album.</p></div>}
    </section></div>
}

const TRACK_WAVEFORM = [12, 19, 28, 16, 23, 35, 20, 14, 31, 44, 24, 18, 29, 52, 34, 22, 16, 27, 41, 23, 18, 33, 48, 30, 21, 15, 26, 38, 56, 32, 22, 17, 29, 45, 35, 20, 14, 25, 39, 51, 27, 18, 24, 34, 46, 31, 20, 13, 22, 37, 28, 17, 11]

function TrackCoverPreview({ track, album, trackIndex, worlds }: { track: LibraryTrack; album: LibraryAlbum | null; trackIndex: number; worlds: string }) {
  const artwork = track.artwork ?? album?.artwork ?? null
  const recordColor = album?.color ?? '#dc5a2c'
  const recordDark = `color-mix(in srgb, ${recordColor} 28%, #090b0b)`
  const recordMid = `color-mix(in srgb, ${recordColor} 48%, #171b1a)`
  return <section className="track-story__page track-story__page--cover track-story__turn-incoming-cover" aria-hidden="true">
    <div className="track-story__page-label"><span>MUSIC VISUAL ARCHIVE</span><span>01 / IMAGE</span></div>
    <div className="track-story__art"><div className="track-story__record-stage"><div className="track-story__vinyl" aria-hidden="true" style={{ '--vinyl-dark': recordDark, '--vinyl-mid': recordMid, '--record-label': recordColor, '--record-highlight': 'rgba(255,255,255,.72)' } as CSSProperties}><span><i>M</i></span></div>{artwork ? <img src={artwork} alt="" loading="eager" /> : album ? <ArchiveCover album={album} eager /> : <div className="track-story__no-art">ARTWORK<br />UNAVAILABLE</div>}</div></div>
    <div className="track-story__waveform" aria-hidden="true" style={{ '--wave-accent': recordMid } as CSSProperties}><span />{TRACK_WAVEFORM.map((height, index) => <i key={index} style={{ '--wave-height': `${height}%`, '--wave-index': index } as CSSProperties} />)}</div>
    <div className="track-story__cover-meta"><span>TRACK {trackIndex >= 0 ? String(trackIndex + 1).padStart(2, '0') : '—'} / MVA</span><h1>{track.title}</h1><p>{track.artist}</p></div>
    <dl className="track-story__details"><div><dt>ALBUM</dt><dd>{album?.title ?? track.albumTitle ?? 'SAVED TRACK'}</dd></div><div><dt>RELEASE</dt><dd>{album?.year ?? '—'}</dd></div><div><dt>WORLD</dt><dd>{worlds || 'UNCLASSIFIED'}</dd></div><div><dt>TRACK</dt><dd>{trackIndex >= 0 ? String(trackIndex + 1).padStart(2, '0') : '—'}</dd></div><div><dt>TIME</dt><dd>{track.duration}</dd></div></dl>
  </section>
}

type ArtworkPalette = { dark: string; mid: string; label: string; highlight: string }

const mixRgb = (color: [number, number, number], target: [number, number, number], amount: number) =>
  `rgb(${color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount)).join(' ')})`

function useArtworkPalette(artwork: string | null, fallback: string): ArtworkPalette {
  const fallbackPalette = useMemo<ArtworkPalette>(() => ({
    dark: `color-mix(in srgb, ${fallback} 28%, #090b0b)`,
    mid: `color-mix(in srgb, ${fallback} 48%, #171b1a)`,
    label: fallback,
    highlight: `color-mix(in srgb, ${fallback} 72%, white)`,
  }), [fallback])
  const [sampled, setSampled] = useState<{ artwork: string | null; palette: ArtworkPalette }>({ artwork, palette: fallbackPalette })

  useEffect(() => {
    setSampled({ artwork, palette: fallbackPalette })
    if (!artwork) return
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 48
        canvas.height = 48
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const buckets = new Map<string, { rgb: [number, number, number]; count: number; saturation: number; lightness: number }>()
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index + 3] < 200) continue
          const rgb: [number, number, number] = [pixels[index], pixels[index + 1], pixels[index + 2]]
          const max = Math.max(...rgb), min = Math.min(...rgb)
          const lightness = (max + min) / 2
          if (lightness < 12 || lightness > 244) continue
          const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255))
          const quantized = rgb.map(channel => Math.round(channel / 32) * 32) as [number, number, number]
          const key = quantized.join(',')
          const bucket = buckets.get(key)
          if (bucket) bucket.count += 1
          else buckets.set(key, { rgb: quantized, count: 1, saturation, lightness })
        }
        const candidates = [...buckets.values()].sort((a, b) => b.count - a.count)
        const label = candidates[0]
        const accent = candidates.slice(0, 16).sort((a, b) => (b.saturation * .8 + b.count / Math.max(1, candidates[0]?.count ?? 1) * .2) - (a.saturation * .8 + a.count / Math.max(1, candidates[0]?.count ?? 1) * .2))[0]
        if (!label || !accent) return
        setSampled({ artwork, palette: {
            dark: mixRgb(accent.rgb, [7, 10, 10], .72),
            mid: mixRgb(accent.rgb, [18, 22, 21], .48),
            label: mixRgb(label.rgb, accent.rgb, .28),
            highlight: mixRgb(accent.rgb, [255, 255, 255], .48),
          } })
      } catch { /* Cross-origin artwork keeps the metadata-color fallback. */ }
    }
    image.src = artwork
    return () => { cancelled = true }
  }, [artwork, fallbackPalette])

  return sampled.artwork === artwork ? sampled.palette : fallbackPalette
}

export function TrackPage() {
  const { trackId } = useParams()
  const { state, pathname } = useLocation()
  const { library } = useLibrary()
  const navigate = useNavigate()
  const assignments = useGenreAssignments()
  const [turn, setTurn] = useState<{ direction: 'previous' | 'next'; sourceId: string; targetId: string; coverSnapshot: string; lyricsSnapshot: string; lyricsScrollTop: number; incomingCover: { track: LibraryTrack; album: LibraryAlbum | null; trackIndex: number; worlds: string } } | null>(null)
  const coverPageRef = useRef<HTMLElement>(null)
  const lyricsPageRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!turn) return
    if (trackId !== turn.sourceId && trackId !== turn.targetId) {
      setTurn(null)
      return
    }
    const timer = window.setTimeout(() => setTurn(null), 660)
    return () => window.clearTimeout(timer)
  }, [trackId, turn])
  const relatedAlbum = library.albums.find(album => album.tracks.some(track => track.id === trackId) || album.id === library.tracks.find(track => track.id === trackId)?.albumId)
  const track: LibraryTrack | undefined = library.tracks.find(item => item.id === trackId) ?? relatedAlbum?.tracks.find(item => item.id === trackId)
    ?? library.playlists.flatMap(playlist => playlist.tracks).find(item => item.id === trackId)
  const art = track?.artwork ?? relatedAlbum?.artwork ?? null
  const vinylPalette = useArtworkPalette(art, relatedAlbum?.color ?? '#dc5a2c')
  if (!track) return <MissingPage />
  const backId = relatedAlbum?.id ?? (state as { albumId?: string } | null)?.albumId
  const lyricsTrack = { title: track.title, artist: track.artist, albumTitle: track.albumTitle ?? relatedAlbum?.title ?? null, duration: track.duration }
  const trackIndex = relatedAlbum ? relatedAlbum.tracks.findIndex(item => item.id === track.id) : -1
  const worlds = relatedAlbum ? albumGenres(relatedAlbum, assignments).map(id => genres.find(genre => genre.id === id)?.name).filter(Boolean).join(' / ') : ''
  const previousTrack = relatedAlbum && trackIndex > 0 ? relatedAlbum.tracks[trackIndex - 1] : null
  const nextTrack = relatedAlbum && trackIndex >= 0 && trackIndex < relatedAlbum.tracks.length - 1 ? relatedAlbum.tracks[trackIndex + 1] : null
  const routePrefix = pathname.startsWith('/track/') && !pathname.startsWith('/tracks/') ? '/track/' : '/tracks/'
  const goToTrack = (target: LibraryTrack | null, direction: 'previous' | 'next') => {
    if (!target || turn) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(`${routePrefix}${target.id}`, { state: { ...(state as { genreId?: GenreId; albumId?: string } | null), albumId: relatedAlbum?.id } })
      return
    }
    const outgoingCover = coverPageRef.current
    const outgoingLyrics = lyricsPageRef.current
    if (!outgoingCover || !outgoingLyrics) return
    const incomingArtwork = target.artwork ?? relatedAlbum?.artwork
    if (incomingArtwork) {
      const image = new Image()
      image.decoding = 'async'
      image.src = incomingArtwork
    }
    const incomingTrackIndex = relatedAlbum ? relatedAlbum.tracks.findIndex(item => item.id === target.id) : -1
    setTurn({
      direction,
      sourceId: track.id,
      targetId: target.id,
      coverSnapshot: outgoingCover.innerHTML,
      lyricsSnapshot: outgoingLyrics.innerHTML,
      lyricsScrollTop: outgoingLyrics.querySelector<HTMLElement>('.track-story__lyric')?.scrollTop ?? 0,
      incomingCover: { track: target, album: relatedAlbum ?? null, trackIndex: incomingTrackIndex, worlds },
    })
    navigate(`${routePrefix}${target.id}`, { state: { ...(state as { genreId?: GenreId; albumId?: string } | null), albumId: relatedAlbum?.id } })
  }
  const isTurning = Boolean(turn)
  return <div className="archive-page track-story"><div className="track-story__top"><Link to={backId ? `/albums/${backId}` : '/index'}>← {backId ? 'ALBUM OBJECT' : 'THE INDEX'}</Link><span>07 / TRACK OBJECT</span></div>
    <div className={`track-story__stage${turn ? ` track-story__stage--turning-${turn.direction}` : ''}`}><nav className="track-story__nav" aria-label="Track navigation"><button type="button" className="track-story__nav-button track-story__nav-button--previous" onClick={() => goToTrack(previousTrack, 'previous')} disabled={isTurning || !previousTrack} aria-label={previousTrack ? `Previous track: ${previousTrack.title}` : 'No previous track'} /><button type="button" className="track-story__nav-button track-story__nav-button--next" onClick={() => goToTrack(nextTrack, 'next')} disabled={isTurning || !nextTrack} aria-label={nextTrack ? `Next track: ${nextTrack.title}` : 'No next track'} /></nav>
    <div className="track-story__spread"><section ref={coverPageRef} className="track-story__page track-story__page--cover" aria-label="Track and album details">
      <div className="track-story__page-label"><span>MUSIC VISUAL ARCHIVE</span><span>01 / IMAGE</span></div>
      <div className="track-story__art"><div className="track-story__record-stage"><div className="track-story__vinyl" aria-hidden="true" style={{ '--vinyl-dark': vinylPalette.dark, '--vinyl-mid': vinylPalette.mid, '--record-label': vinylPalette.label, '--record-highlight': vinylPalette.highlight } as CSSProperties}><span><i aria-hidden="true">M</i></span></div>{art ? <img src={art} alt={`${track.albumTitle ?? relatedAlbum?.title ?? track.title} 封面`} />
        : relatedAlbum ? <ArchiveCover album={relatedAlbum} eager /> : <div className="track-story__no-art">ARTWORK<br />UNAVAILABLE</div>}</div></div>
      <div className="track-story__waveform" role="img" aria-label="Decorative waveform; no live audio analysis" style={{ '--wave-accent': vinylPalette.mid } as CSSProperties}><span aria-hidden="true" />{TRACK_WAVEFORM.map((height, index) => <i key={index} aria-hidden="true" style={{ '--wave-height': `${height}%`, '--wave-index': index } as CSSProperties} />)}</div>
      <div className="track-story__cover-meta"><span>TRACK {trackIndex >= 0 ? String(trackIndex + 1).padStart(2, '0') : '—'} / MVA</span><h1>{track.title}</h1><p>{track.artist}</p></div>
      <dl className="track-story__details"><div><dt>ALBUM</dt><dd>{relatedAlbum?.title ?? track.albumTitle ?? 'SAVED TRACK'}</dd></div><div><dt>RELEASE</dt><dd>{relatedAlbum?.year ?? '—'}</dd></div><div><dt>WORLD</dt><dd>{worlds || 'UNCLASSIFIED'}</dd></div><div><dt>TRACK</dt><dd>{trackIndex >= 0 ? String(trackIndex + 1).padStart(2, '0') : '—'}</dd></div><div><dt>TIME</dt><dd>{track.duration}</dd></div></dl>
    </section><section ref={lyricsPageRef} className="track-story__page track-story__page--lyrics" aria-label="Lyrics page"><div className="track-story__page-label"><span>THE READING ROOM</span><span>02 / WORDS</span></div><div className="track-story__words"><LyricsPanel key={track.id} track={lyricsTrack} />
      {track.note && <p className="track-story__note">{track.note}</p>}<SpotifySource url={track.url} />
    </div></section></div>{turn && <div className="track-story__turn-viewport" aria-hidden="true" inert><TrackCoverPreview {...turn.incomingCover} /><div className={`track-story__page track-story__page--${turn.direction === 'next' ? 'cover' : 'lyrics'} track-story__turn-companion track-story__turn-companion--${turn.direction}`} ref={node => { const scroller = node?.querySelector<HTMLElement>('.track-story__lyric'); if (scroller) scroller.scrollTop = turn.lyricsScrollTop }} dangerouslySetInnerHTML={{ __html: turn.direction === 'next' ? turn.coverSnapshot : turn.lyricsSnapshot }} /><div className={`track-story__turn-sheet track-story__turn-sheet--${turn.direction}`}><div className={`track-story__turn-back track-story__turn-back--${turn.direction}`} aria-hidden="true" /><div className={`track-story__page track-story__page--${turn.direction === 'next' ? 'lyrics' : 'cover'} track-story__turn-face`} ref={node => { const scroller = node?.querySelector<HTMLElement>('.track-story__lyric'); if (scroller) scroller.scrollTop = turn.lyricsScrollTop }} dangerouslySetInnerHTML={{ __html: turn.direction === 'next' ? turn.lyricsSnapshot : turn.coverSnapshot }} /></div></div>}</div><div className="track-story__footer"><Link to="/index">THE INDEX ↗</Link><span>A VISUAL RECORD / NO AUDIO DOWNLOADS</span></div>
  </div>
}

function LyricsPanel({ track }: { track: { title: string; artist: string; albumTitle: string | null; duration: string } }) {
  const [state, setState] = useState<{ status: 'loading' | 'idle' | 'error'; result?: LyricsResult; message?: string; kind?: LyricsProviderError['kind'] }>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void fetchLyrics(track, controller.signal).then(result => setState({ status: 'idle', result })).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setState({ status: 'error', message: reason instanceof LyricsProviderError ? reason.message : '歌词服务暂时不可用。', kind: reason instanceof LyricsProviderError ? reason.kind : 'network' })
    })
    return () => controller.abort()
  }, [track.title, track.artist, track.albumTitle, track.duration, attempt])

  const retry = () => setAttempt(value => value + 1)

  const result = state.result
  return <div className="track-story__lyric" tabIndex={0} role="region" aria-label="Lyrics reading area"><span>LYRICS / {result?.status === 'matched' && result.synced ? 'SYNCED TEXT' : 'TEXT'}</span>
    {state.status === 'loading' && <p role="status">Reading lyrics for this track…</p>}
    {state.status === 'error' && <><p role="alert">{state.message}</p>{state.kind !== 'rate-limit' && <button type="button" onClick={retry}>TRY AGAIN ↗</button>}<small>Lyrics are provided by an external service and may be unavailable.</small></>}
    {state.status === 'idle' && result?.status === 'matched' && <div className="track-story__stanzas">{result.text.trim().split(/\r?\n\s*\r?\n/).map((stanza, index) => <p key={index}>{stanza.split(/\r?\n/).map((line, lineIndex) => <span key={lineIndex}>{line || '\u00a0'}</span>)}</p>)}</div>}
    {state.status === 'idle' && result?.status === 'instrumental' && <p>This recording is marked instrumental.</p>}
    {state.status === 'idle' && result?.status === 'not-found' && <><p>Lyrics are not available for this recording.</p><small>No matching lyrics were found for the verified title, artist, album, and duration.</small></>}
    {state.status === 'idle' && result?.status === 'mismatch' && <><p>Lyrics were found, but the recording metadata did not match.</p><small>Nothing was displayed to avoid showing lyrics for a different version.</small></>}
  </div>
}

export function MissingPage() {
  return <div className="archive-page archive-empty"><span>404 / MISSING OBJECT</span><h1>This space isn't here.</h1><p>The record may be unavailable in the current library.</p><Link to="/index">RETURN TO THE INDEX ↗</Link></div>
}
