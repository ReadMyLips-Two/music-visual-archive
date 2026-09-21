import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent, type WheelEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLibrary, type LibraryAlbum, type LibraryTrack } from './library'
import { albumGenres, albumsForGenre, genres, setAlbumGenres, useGenreAssignments, type GenreDefinition, type GenreId } from './genres'

function ArchiveCover({ album, className = '', eager = false, small = false }: { album: LibraryAlbum; className?: string; eager?: boolean; small?: boolean }) {
  return album.artwork
    ? <img className={`archive-cover ${className}`} src={small ? album.artworkSmall ?? album.artwork : album.artwork} loading={eager ? 'eager' : 'lazy'} alt={`${album.title} — ${album.artist} 专辑封面`} />
    : <div className={`archive-cover archive-cover--demo ${className}`} style={{ backgroundColor: album.color }} role="img" aria-label={`${album.title} 虚构演示封面`}><span>DEMO ARTWORK</span><strong>{album.title}</strong><small>{album.artist}</small></div>
}

function SpotifySource({ url, children = 'OPEN IN SPOTIFY ↗' }: { url: string | null; children?: ReactNode }) {
  return url && <a className="archive-source" href={url} target="_blank" rel="noreferrer">{children}</a>
}

function PageIntro({ number, title, aside, children }: { number: string; title: string; aside?: string; children?: ReactNode }) {
  const { mode } = useLibrary()
  return <header className="archive-intro">
    <div className="archive-intro__meta"><span>{number} / MVA</span><span>{mode === 'demo' ? 'DEMO ARCHIVE' : 'PERSONAL ARCHIVE'}</span></div>
    <h1>{title}</h1>{aside && <p className="archive-intro__aside">{aside}</p>}{children}
  </header>
}

function LibraryFeedback() {
  const { mode, status, progress, error, refresh, library } = useLibrary()
  if (mode === 'demo') return null
  return <div className="archive-feedback" aria-live="polite">
    {status === 'loading' && <p>{progress || 'Reading your library…'}</p>}
    {status === 'error' && <div role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>RETRY ↗</button></div>}
    {library.warnings.map(warning => <p key={warning}>{warning}</p>)}
  </div>
}

export function MotionPage() {
  const { library, mode, status } = useLibrary()
  const [showInvitation, setShowInvitation] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const timer = window.setTimeout(() => setShowInvitation(true), 5000)
    return () => window.clearTimeout(timer)
  }, [])
  const selection = useMemo(() => library.albums.slice(0, 35), [library.albums])
  return <div className="archive-page motion-page">
    <div className="motion-topline"><span>03 / THE ARCHIVE IN MOTION</span><span>{library.albums.length} SAVED ALBUMS · {mode === 'demo' ? 'DEMO' : 'SPOTIFY'}</span></div>
    <h1 className="sr-only">The Archive in Motion</h1>
    <div className="motion-scene" aria-label="音乐封面的视觉档案">
      <div className="motion-field" aria-hidden="true" />
      {selection.map((album, index) => {
        const sparse = selection.length < 8
        const column = sparse ? index : index % 7
        const row = sparse ? 0 : Math.floor(index / 7)
        const style = {
          '--motion-x': sparse ? `${12 + (index * 71) / Math.max(1, selection.length - 1)}%` : `${3 + column * 14 + (row % 2) * 5}%`,
          '--motion-y': sparse ? `${19 + (index % 3) * 17}%` : `${-10 + row * 25 + (column % 3) * 3}%`,
          '--motion-width': sparse ? `${145 + (index % 2) * 30}px` : `${105 + ((index * 13) % 65)}px`,
          '--motion-delay': `${(index % 5) * -1.4}s`,
          '--motion-duration': `${18 + (row % 3) * 4}s`,
        } as CSSProperties
        return <Link key={album.id} className="motion-object" style={style} to={`/albums/${album.id}`} aria-label={`${album.title} — ${album.artist}`}>
          <ArchiveCover album={album} eager={index < 8} small /><span>{album.title}</span>
        </Link>
      })}
      {selection.length === 0 && status !== 'loading' && <p className="motion-empty">Your archive is waiting for its first saved album.<br /><Link to="/index">Continue to the index ↗</Link></p>}
      <div className={`motion-invitation${showInvitation ? ' is-visible' : ''}`}>
        <span>YOUR COLLECTION / A VISUAL SPACE</span><p>Choose your<br /><em>visual world.</em></p>
        <Link to="/index">ENTER THE INDEX <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
    <div className="motion-bottomline"><span>IMAGE / MEMORY / MOTION</span><Link to="/index">SKIP INTRO — THE INDEX ↗</Link></div>
    <LibraryFeedback />
  </div>
}

type Folder = GenreDefinition & { route: string; album: LibraryAlbum | null }
export function IndexPage() {
  const { library, mode } = useLibrary()
  const assignments = useGenreAssignments()
  const [active, setActive] = useState<string | null>(null)
  const touchRef = useRef(false)
  const touchedOpen = useRef(false)
  const folders: Folder[] = [
    { id: 'all' as GenreId, number: '00', name: 'ALL ALBUMS', entry: 'Everything you chose to keep.', statement: '', color: '#deddda', ink: '#1e1e1e', route: '/albums', album: library.albums[0] ?? null },
    ...genres.map(genre => ({ ...genre, route: `/genres/${genre.id}`, album: albumsForGenre(library.albums, genre.id, assignments)[0] ?? null })),
  ]
  return <div className="archive-page index-page"><div className="index-heading"><PageIntro number="04" title="The Index." aside="TEN FOLDERS / ONE PERSONAL ARCHIVE" />
      <p>Find a way in.<br />One collection, many visual worlds.</p></div>
    <LibraryFeedback /><div className="folder-stack" onMouseLeave={() => setActive(null)}>
      {folders.map(folder => {
        const open = active === folder.id
        const style = { '--folder-color': folder.color, '--folder-ink': folder.ink } as CSSProperties
        return <div key={folder.id} className={`archive-folder${open ? ' is-open' : ''}`} style={style} onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(folder.id) }} onFocus={() => { if (!touchRef.current) setActive(folder.id) }}>
          <Link to={folder.route} className="archive-folder__link" aria-label={`${folder.number} ${folder.name}，进入空间`}
            onTouchStart={() => { touchedOpen.current = active === folder.id; touchRef.current = true }}
            onClick={event => {
              if (touchRef.current && !touchedOpen.current) { event.preventDefault(); setActive(folder.id) }
              touchRef.current = false
            }}>
            <span className="archive-folder__tab">{folder.name}</span>
            <span className="archive-folder__number">{folder.number}</span>
            <span className="archive-folder__reveal" aria-hidden={!open}>
              <span className="archive-folder__cover">{folder.album ? <ArchiveCover album={folder.album} eager={open} small /> : <span className="archive-folder__no-cover">NO VERIFIED<br />ALBUM YET</span>}</span>
              <span className="archive-folder__entry"><small>{folder.number} / {folder.name}</small><strong>{folder.entry}</strong><small>{folder.album ? 'ENTER SPACE ↗' : 'EXPLORE EMPTY SPACE ↗'}</small></span>
            </span>
          </Link>
        </div>
      })}
    </div><div className="index-foot"><span>{mode === 'demo' ? 'DEMO CONTENT / FICTIONAL ALBUMS' : 'UNCLASSIFIED ALBUMS REMAIN IN ALL ALBUMS'}</span><Link to="/motion">← BACK TO MOTION</Link></div>
  </div>
}

export function AllAlbumsPage() {
  const { library, mode } = useLibrary()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const touchStart = useRef(0)
  const wheelAt = useRef(0)
  const filtered = useMemo(() => library.albums.filter(album => `${album.title} ${album.artist}`.toLowerCase().includes(query.trim().toLowerCase())), [library.albums, query])
  useEffect(() => setCurrent(0), [query, library.albums])
  const move = (direction: number) => setCurrent(index => Math.max(0, Math.min(filtered.length - 1, index + direction)))
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) < 8 && Math.abs(event.deltaY) < 8) return
    if (Date.now() - wheelAt.current < 260) return
    wheelAt.current = Date.now()
    move((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) > 0 ? 1 : -1)
  }
  const onTouchEnd = (event: TouchEvent) => {
    const delta = touchStart.current - event.changedTouches[0].clientX
    if (Math.abs(delta) > 40) move(delta > 0 ? 1 : -1)
  }
  return <div className="archive-page albums-page"><PageIntro number="05" title="All Albums." aside={`${filtered.length} / ${library.albums.length} RECORDS`}>
      <p className="albums-deck__intro">A collection is never still.<br />Move through what stayed with you.</p>
    </PageIntro><LibraryFeedback />
    <div className="albums-toolbar"><Link to="/index">← THE INDEX</Link><label>FIND A RECORD <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Album / artist" /></label>
      <span>{mode === 'demo' ? 'FICTIONAL DEMO ARCHIVE' : 'YOUR SAVED SPOTIFY ALBUMS'}</span></div>
    {filtered.length > 0 ? <div className="album-deck" tabIndex={0} role="region" aria-label="专辑横向浏览，使用左右方向键切换"
      onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }}
      onWheel={onWheel} onTouchStart={event => { touchStart.current = event.touches[0].clientX }} onTouchEnd={onTouchEnd}>
      <div className="album-deck__stage">{filtered.map((album, index) => {
        const offset = index - current
        if (Math.abs(offset) > 3) return null
        return <button key={album.id} type="button" className={`album-deck__record${offset === 0 ? ' is-current' : ''}`}
          style={{ '--deck-offset': offset, '--deck-distance': Math.abs(offset), '--deck-order': 4 - Math.abs(offset) } as CSSProperties}
          onClick={() => offset === 0 ? navigate(`/albums/${album.id}`) : setCurrent(index)}
          aria-label={`${album.title} — ${album.artist}${offset === 0 ? '，进入专辑' : '，聚焦专辑'}`}>
          <ArchiveCover album={album} eager={Math.abs(offset) < 2} />
        </button>
      })}</div>
      <div className="album-deck__caption"><span>{String(current + 1).padStart(3, '0')} / {String(filtered.length).padStart(3, '0')}</span>
        <div><h2>{filtered[current]?.title}</h2><p>{filtered[current]?.artist}</p></div><Link to={`/albums/${filtered[current].id}`}>OPEN RECORD ↗</Link></div>
      <div className="album-deck__controls"><button type="button" onClick={() => move(-1)} disabled={current === 0} aria-label="上一张专辑">←</button>
        <span>DRAG / SCROLL / ARROW KEYS</span><button type="button" onClick={() => move(1)} disabled={current === filtered.length - 1} aria-label="下一张专辑">→</button></div>
    </div> : <div className="archive-empty"><span>NO RECORDS FOUND</span><p>{query ? 'Try another album or artist.' : 'Your saved albums will appear here.'}</p><Link to="/index">RETURN TO THE INDEX ↗</Link></div>}
  </div>
}

export function GenresPage() {
  const { library } = useLibrary()
  const assignments = useGenreAssignments()
  return <div className="archive-page genre-directory"><PageIntro number="06" title="Genre Worlds." aside="NINE WAYS TO ENTER" />
    <p className="genre-directory__note">The archive has more than one atmosphere. Unclassified records remain in <Link to="/albums">All Albums</Link>.</p>
    <div className="genre-directory__list">{genres.map(genre => <Link key={genre.id} to={`/genres/${genre.id}`} style={{ '--genre-accent': genre.color } as CSSProperties}>
      <span>{genre.number}</span><strong>{genre.name}</strong><em>{albumsForGenre(library.albums, genre.id, assignments).length} RECORDS</em><span>↗</span></Link>)}</div>
    <Link className="archive-back" to="/index">← THE INDEX</Link>
  </div>
}

export function GenreWorldPage() {
  const { genreId } = useParams()
  const { library } = useLibrary()
  const assignments = useGenreAssignments()
  const genre = genres.find(item => item.id === genreId)
  if (!genre) return <MissingPage />
  const collection = albumsForGenre(library.albums, genre.id, assignments)
  return <div className={`archive-page genre-world genre-world--${genre.id}`} style={{ '--genre-accent': genre.color, '--genre-ink': genre.ink } as CSSProperties}>
    <div className="genre-world__top"><span>M / V / A — {genre.number}</span><Link to="/index">← THE INDEX</Link></div>
    <div className="genre-world__hero"><span className="genre-world__number">{genre.number} / 09</span><h1>{genre.name}</h1><p>{genre.statement}</p><div className="genre-world__emblem" aria-hidden="true"><span /><span /><span /></div></div>
    <div className="genre-world__contents"><div className="genre-world__caption"><span>{String(collection.length).padStart(2, '0')} RECORDS IN THIS WORLD</span><strong>{genre.entry}</strong></div>
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
  const { library, mode } = useLibrary()
  const assignments = useGenreAssignments()
  const album = library.albums.find(item => item.id === albumId)
  if (!album) return <MissingPage />
  const fromGenre = (state as { genreId?: GenreId } | null)?.genreId
  const assigned = albumGenres(album, assignments)
  return <div className="archive-page album-story"><div className="album-story__top"><Link to={fromGenre ? `/genres/${fromGenre}` : '/albums'}>← {fromGenre ? 'GENRE WORLD' : 'ALL ALBUMS'}</Link><span>06 / ALBUM OBJECT</span></div>
    <div className="album-story__spread"><div className="album-story__visual"><ArchiveCover album={album} eager /><span>{album.source === 'demo' ? 'FICTIONAL DEMO ARTWORK' : 'ORIGINAL ARTWORK / SPOTIFY'}</span></div>
      <div className="album-story__text"><span className="album-story__overline">MUSIC VISUAL ARCHIVE / {mode === 'demo' ? 'DEMO' : 'SAVED ALBUM'}</span>
        <h1>{album.title}</h1><p className="album-story__artist">{album.artist}</p><div className="album-story__rule" />
        <dl><div><dt>RELEASE</dt><dd>{album.year ?? 'UNKNOWN'}</dd></div><div><dt>WORLD</dt><dd>{assigned.map(id => genres.find(genre => genre.id === id)?.name).join(' / ') || 'UNCLASSIFIED'}</dd></div><div><dt>TRACKS IN ARCHIVE</dt><dd>{album.tracks.length}</dd></div></dl>
        {album.note && <p className="album-story__note">{album.note}</p>}
        <SpotifySource url={album.url} />
      </div></div>
    {album.source === 'spotify' && <section className="album-story__classify"><div><span>PERSONAL INDEX / LOCAL ONLY</span><h2>Place this record in a world.</h2><p>Spotify does not provide reliable album genres here. These choices are yours and remain in this browser.</p></div>
      <div className="album-story__genre-options">{genres.map(genre => <label key={genre.id}><input type="checkbox" checked={assigned.includes(genre.id)} onChange={event => setAlbumGenres(album.id, event.target.checked ? [...assigned, genre.id] : assigned.filter(id => id !== genre.id))} /><span>{genre.name}</span></label>)}</div></section>}
    <section className="album-story__tracks"><div className="album-story__tracks-heading"><span>THE SEQUENCE</span><h2>Tracks.</h2></div>
      {album.tracks.length ? <ol>{album.tracks.map((track, index) => <li key={track.id}><Link to={`/tracks/${track.id}`} state={{ genreId: fromGenre, albumId: album.id }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{track.title}</strong><small>{track.duration}</small><span aria-hidden="true">↗</span></Link></li>)}</ol>
        : <p className="archive-empty">Track metadata is unavailable for this album.</p>}
    </section></div>
}

export function TrackPage() {
  const { trackId } = useParams()
  const { state } = useLocation()
  const { library } = useLibrary()
  const relatedAlbum = library.albums.find(album => album.tracks.some(track => track.id === trackId) || album.id === library.tracks.find(track => track.id === trackId)?.albumId)
  const track: LibraryTrack | undefined = library.tracks.find(item => item.id === trackId) ?? relatedAlbum?.tracks.find(item => item.id === trackId)
    ?? library.playlists.flatMap(playlist => playlist.tracks).find(item => item.id === trackId)
  if (!track) return <MissingPage />
  const backId = relatedAlbum?.id ?? (state as { albumId?: string } | null)?.albumId
  const art = track.artwork ?? relatedAlbum?.artwork ?? null
  return <div className="archive-page track-story"><div className="track-story__top"><Link to={backId ? `/albums/${backId}` : '/index'}>← {backId ? 'ALBUM OBJECT' : 'THE INDEX'}</Link><span>07 / TRACK OBJECT</span></div>
    <div className="track-story__spread"><div className="track-story__art">{art ? <img src={art} alt={`${track.albumTitle ?? relatedAlbum?.title ?? track.title} 封面`} />
      : relatedAlbum ? <ArchiveCover album={relatedAlbum} eager /> : <div className="track-story__no-art">ARTWORK<br />UNAVAILABLE</div>}
      <span>{track.albumTitle ?? relatedAlbum?.title ?? 'SAVED TRACK'}</span></div>
      <div className="track-story__words"><span>TRACK / {track.duration}</span><h1>{track.title}</h1><p>{track.artist}</p><div className="track-story__lyric"><span>LYRICS / TEXT</span><p>Lyrics have not been provided.</p><small>We do not reproduce or invent unlicensed lyrics.</small></div>
        {track.note && <p className="track-story__note">{track.note}</p>}<SpotifySource url={track.url} />
      </div></div><div className="track-story__footer"><Link to="/index">THE INDEX ↗</Link><span>A VISUAL RECORD / NO AUDIO DOWNLOADS</span></div>
  </div>
}

export function MissingPage() {
  return <div className="archive-page archive-empty"><span>404 / MISSING OBJECT</span><h1>This space isn't here.</h1><p>The record may be unavailable in the current library.</p><Link to="/index">RETURN TO THE INDEX ↗</Link></div>
}
