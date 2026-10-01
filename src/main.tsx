import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AudioProvider, SoundControl } from './audio'
import { LandingFlower } from './LandingFlower'
import { LibraryProvider, useLibrary } from './library'
import { connectAppleMusic, AppleMusicError, APPLE_MUSICKIT_CONFIGURED } from './apple-music'
import { completeSpotifyAuthorization, SPOTIFY_CLIENT_ID, startSpotifyAuthorization } from './spotify'
import { MUSIC_PROVIDERS, type MusicProvider } from './providers'
import { AlbumPage, AllAlbumsPage, GenreWorldPage, GenresPage, IndexPage, MissingPage, MotionPage, TrackPage } from './visual'
import { MVAHomeLink } from './components/MVAHomeLink'
import './styles.css'
import './visual.css'

const chapters = [
  ['/', '01', 'Landing'],
  ['/connect', '02', 'Connect your library'],
  ['/motion', '03', 'Archive in Motion'],
  ['/index', '04', 'The Index'],
  ['/albums', '05', 'All Albums'],
  ['/genres', '05', 'Genre Worlds'],
] as const

function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const enterArchive = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (leaving) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { navigate('/connect'); return }
    setLeaving(true)
    window.setTimeout(() => navigate('/connect'), 720)
  }
  return <div className={`landing${leaving ? ' landing--leaving' : ''}`}>
    <header className="landing__masthead"><MVAHomeLink className="landing__monogram">M / V / A</MVAHomeLink><p>Music<br />Visual<br />Archive</p></header>
    <h1 className="landing__title">Music as a <br />Visual Space.</h1>
    <div className="landing__flower-wrap"><LandingFlower /></div>
    <aside className="landing-note landing-note--sound"><span>01 / SOUND</span><p>More than music,<br />a visual experience.</p><i aria-hidden="true" /></aside>
    <aside className="landing-note landing-note--archive"><span>02 / ARCHIVE</span><p>Every album<br />holds a world.</p><i aria-hidden="true" /></aside>
    <aside className="landing-note landing-note--you"><span>03 / YOU</span><p>A space for<br />your own collection.</p><i aria-hidden="true" /></aside>
    <div className="landing__sound"><SoundControl compact /></div>
    <div className="landing__edition"><span>001 / 026</span><p>A personal collection<br />of sound and image</p></div>
    <div className="landing__enter"><span>04 / ENTER</span><Link to="/connect" onClick={enterArchive}>Enter Archive <b aria-hidden="true">↗</b></Link><p>Your music,<br />reimagined.</p></div>
    <p className="landing__legal">© 2026<br />Music Visual Archive.<br />Personal archive.</p>
  </div>
}

function LibraryReadingBoard({ callbackActive = false, externalError = null }: { callbackActive?: boolean; externalError?: string | null }) {
  const { library, mode, providerState, connected, status, progress, error: libraryError, activateSpotify, activateApple, disconnect, refresh } = useLibrary()
  const [authError, setAuthError] = useState<string | null>(null)
  const [flowPhase, setFlowPhase] = useState<'reading' | 'transitioning' | 'loaded'>('reading')
  const titleMotionRef = useRef<HTMLDivElement>(null)
  const connect = async () => { setAuthError(null); try { await startSpotifyAuthorization() } catch (reason) { setAuthError(reason instanceof Error ? reason.message : '无法开始 Spotify 授权。') } }
  const albums = library.albums
  const sourceActive = connected || callbackActive
  const disconnected = !sourceActive
  const libraryReady = sourceActive && status === 'ready' && !callbackActive
  const loadedVisual = flowPhase !== 'reading'
  const readingVisual = sourceActive && flowPhase === 'reading'
  useLayoutEffect(() => {
    const wrapper = titleMotionRef.current
    const paper = wrapper?.closest<HTMLElement>('.library-board__paper')
    if (!wrapper || !paper) return
    const measureStartPosition = () => {
      const wrapperRect = wrapper.getBoundingClientRect()
      const paperRect = paper.getBoundingClientRect()
      const centeredLeft = paperRect.left + (paperRect.width - wrapperRect.width) / 2
      wrapper.style.setProperty('--title-start-x', `${centeredLeft - wrapperRect.left}px`)
    }
    measureStartPosition()
    window.addEventListener('resize', measureStartPosition)
    const fontsReady = document.fonts?.ready
    fontsReady?.then(measureStartPosition)
    return () => window.removeEventListener('resize', measureStartPosition)
  }, [disconnected])
  useEffect(() => {
    if (!libraryReady) {
      setFlowPhase('reading')
      return
    }
    setFlowPhase('transitioning')
  }, [libraryReady])
  const reading = callbackActive || status === 'loading' || readingVisual
  const loaded = flowPhase === 'loaded'
  const countLabel = loadedVisual ? `${albums.length} RECORDS / ${albums.filter(album => album.artwork).length} COVERS` : progress ? progress.toUpperCase() : 'WAITING FOR SOURCE'
  const readingHeadline = ['OPENING', 'YOUR ARCHIVE']
  const loadedHeadline = ['PERSONAL', 'ARCHIVE', String(library.albums.length || '00')]
  const error = authError || libraryError || externalError
  const sourceLabel = connected ? `${providerState.displayName} / CONNECTED` : callbackActive ? 'SPOTIFY / CONNECTING' : 'NO SOURCE CONNECTED'
  const pageHeader = <header className="library-flow__header">
    <MVAHomeLink className="library-flow__brand">M / V / A</MVAHomeLink>
    <span>02 / PERSONAL SOURCE</span>
    <div className="library-flow__session"><span>{sourceLabel}</span><SoundControl compact /></div>
  </header>
  const completeTitleTransition = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.animationName === 'library-title-travel') setFlowPhase('loaded')
  }
  const renderTitleLayer = (lines: string[], variant: 'reading' | 'loaded') => <div className={`library-board__title-layer library-board__title-layer--${variant}`} aria-hidden={variant === 'reading' ? loaded : !loaded}>
    {lines.map((line, index) => <span key={index} className={`library-board__title-line${index === 2 ? ' library-board__title-line--count' : ''}`}>{line}</span>)}
  </div>
  const connectProvider = async (provider: MusicProvider) => {
    if (provider === 'spotify') {
      void connect()
      return
    }
    setAuthError(null)
    try {
      await connectAppleMusic()
      await activateApple()
    } catch (reason) {
      setAuthError(reason instanceof AppleMusicError ? reason.message : 'Apple Music 授权未完成，请重试。')
    }
  }
  if (disconnected) return <div className="library-flow-page">
    <div className="library-flow__grain" aria-hidden="true" />
    {pageHeader}
    <main className="library-board library-board--disconnected library-connect-selection" aria-label="Music Visual Archive music source selection">
      <section className="library-board__paper">
        <div className="library-board__metadata"><span>MVA / PERSONAL ARCHIVE</span><span>SOURCE SELECT / 00</span><span>© 2026</span></div>
        <div className="library-connect-selection__layout">
          <header className="library-connect-selection__intro">
            <span className="library-connect-selection__kicker">CONNECT YOUR LIBRARY</span>
            <h1>CONNECT<br />YOUR<br />LIBRARY</h1>
          </header>
          <section className="library-source-list" aria-label="Choose your personal music source">
            {MUSIC_PROVIDERS.map(({ provider, status, displayName }, index) => {
              const isPending = status === 'pending'
              const description = provider === 'spotify'
                ? 'YOUR SAVED ALBUMS / PERSONAL LIBRARY'
                : provider === 'apple'
                  ? 'YOUR ICLOUD MUSIC LIBRARY / PERSONAL COLLECTION'
                  : 'OFFICIAL PERSONAL LIBRARY ACCESS / NOT YET ENABLED'
              const sourceContent = <>
                <span className="library-source-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="library-source-row__copy"><strong>{displayName}</strong><small>{description}</small></span>
                <span className="library-source-row__action">{isPending ? 'ACCESS PENDING —' : 'CONNECT'}{!isPending && <b aria-hidden="true">↗</b>}</span>
              </>
              return isPending
                ? <div key={provider} className="library-source-row library-source-row--pending" aria-disabled="true">{sourceContent}</div>
                : <button key={provider} type="button" className="library-source-row" onClick={() => connectProvider(provider)} disabled={provider === 'spotify' && !SPOTIFY_CLIENT_ID}>{sourceContent}</button>
            })}
          </section>
        </div>
        <div className="library-connect-selection__bottomline"><span>ONE ARCHIVE / MORE THAN ONE SOURCE</span><span>CONNECT A LIBRARY TO BEGIN BUILDING YOUR VISUAL ARCHIVE.</span></div>
        {(error || (!SPOTIFY_CLIENT_ID && !APPLE_MUSICKIT_CONFIGURED)) && <div className="library-board__error library-connect-selection__error" role="alert"><strong>{!error ? 'CONFIGURATION REQUIRED' : 'SOURCE SETUP'}</strong><span>{error || 'Configure Spotify or Apple Music before connecting a library.'}</span></div>}
      </section>
    </main>
  </div>
  return <div className="library-flow-page">
    <div className="library-flow__grain" aria-hidden="true" />
    {pageHeader}
    <main className={`library-board library-board--${flowPhase}`} aria-label="Music Visual Archive library connection and reading">
      <section className="library-board__paper">
        <div className="library-board__metadata"><span>MVA / PERSONAL ARCHIVE</span><span>{loaded ? 'ARCHIVE STATUS / LOADED' : reading ? 'ARCHIVE STATUS / READING' : 'ARCHIVE STATUS / STANDBY'}</span><span>© 2026</span></div>
        <div ref={titleMotionRef} className="library-board__title-motion" aria-live="polite" onAnimationEnd={completeTitleTransition}>
          {renderTitleLayer(readingHeadline, 'reading')}
          {renderTitleLayer(loadedHeadline, 'loaded')}
        </div>
        <div className="library-board__lower">
          <div><span className="library-board__kicker">{readingVisual ? 'READING YOUR COLLECTION' : loaded ? 'COLLECTION FOUND' : 'COLLECTION FOUND'}</span><p>{countLabel}</p></div>
          <div className="library-board__actions">
            {!connected && <button type="button" onClick={mode === 'apple' ? () => void connectProvider('apple') : connect} disabled={(mode === 'spotify' && !SPOTIFY_CLIENT_ID) || reading}>CONNECT {providerState.displayName} <b aria-hidden="true">↗</b></button>}
            {connected && !loaded && <button type="button" onClick={() => void refresh()} disabled={reading}>READ LIBRARY <b aria-hidden="true">↗</b></button>}
            {connected && !reading && <button type="button" className="library-board__quiet" onClick={disconnect}>DISCONNECT</button>}
          </div>
        </div>
        {loaded && <Link className="library-board__next-step" to="/motion">03 / ENTER THE ARCHIVE — ARCHIVE IN MOTION <b aria-hidden="true">↗</b></Link>}
        {(error || (!SPOTIFY_CLIENT_ID && mode === 'spotify' && !connected)) && <div className="library-board__error" role="alert"><strong>{!error ? 'CONFIGURATION REQUIRED' : 'READING PAUSED'}</strong><span>{error || 'Spotify is unavailable until VITE_SPOTIFY_CLIENT_ID is configured.'}</span>{error && <button type="button" onClick={() => { setAuthError(null); void (mode === 'apple' ? activateApple() : activateSpotify()) }}>TRY AGAIN ↗</button>}</div>}
      </section>
      <section className={`library-board__strip${libraryReady && albums.length > 0 ? ' library-board__strip--covers' : ''}`} aria-label={loaded ? 'Album artwork from your library' : 'Album artwork waiting to be read'}>
        <div className="library-board__baseline" aria-hidden="true" />
        {libraryReady && albums.length > 0 ? albums.map((album, index) => <figure key={album.id} className={`library-cover${album.artwork ? '' : ' library-cover--empty'}`} style={{ '--cover-index': index, '--cover-delay': `${index < 12 ? index * 48 : 0}ms` } as React.CSSProperties}>{album.artwork ? <img src={album.artwork} alt={`${album.title} by ${album.artist}`} /> : <div className="library-cover__missing" aria-label={`No artwork for ${album.title}`}><span>NO<br />IMAGE</span></div>}<figcaption><b>{String(index + 1).padStart(3, '0')}</b><span>{album.title}</span></figcaption></figure>) : <div className={`library-board__empty${flowPhase === 'reading' ? '' : ' library-board__empty--hidden'}`}><span>{reading ? '◌' : '—'}</span><p>{reading ? 'COVERS WILL APPEAR\nWHEN THE READING IS COMPLETE' : loaded ? 'NO DISPLAYABLE ARTWORK' : 'THE COLLECTION IS\nWAITING TO BE OPENED'}</p></div>}
      </section>
    </main>
  </div>
}

function ConnectLibrary() {
  return <LibraryReadingBoard />
}

function SpotifyCallback() {
  const { activateSpotify } = useLibrary()
  const [error, setError] = useState<string | null>(null)
  const [callbackActive, setCallbackActive] = useState(true)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = window.location.search
    window.history.replaceState({}, '', '/callback')
    void completeSpotifyAuthorization(search)
      .then(() => activateSpotify())
      .then(() => setCallbackActive(false))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Spotify 授权失败。'))
  }, [activateSpotify])
  return <LibraryReadingBoard callbackActive={callbackActive && !error} externalError={error} />
}

function RouteEffects() {
  const { pathname } = useLocation()
  const previousPathname = useRef<string | null>(null)
  useEffect(() => {
    const isTrackPath = (value: string | null) => Boolean(value && (value.startsWith('/tracks/') || value.startsWith('/track/')))
    const switchingTracksInPlace = isTrackPath(previousPathname.current) && isTrackPath(pathname)
    previousPathname.current = pathname
    if (!switchingTracksInPlace) {
      window.scrollTo(0, 0)
      document.getElementById('main')?.focus({ preventScroll: true })
    }
    document.title = `${document.querySelector('h1')?.textContent ?? 'Music Visual Archive'} | Music Visual Archive`
  }, [pathname])
  return null
}

function ContextBar({ pathname, connected, providerName, refresh, disconnect, status }: { pathname: string; connected: boolean; providerName: string; refresh: () => Promise<boolean>; disconnect: () => void; status: string }) {
  const isConnect = pathname === '/connect'
  const isMotion = pathname === '/motion'
  const isIndex = pathname === '/index'
  const isAlbums = pathname === '/albums'
  const isGenres = pathname === '/genres'
  const isGenre = pathname.startsWith('/genres/') || pathname.startsWith('/genre/')
  const isIndie = pathname === '/genres/indie' || pathname === '/genre/indie'
  const isAlbum = pathname.startsWith('/albums/') || pathname.startsWith('/album/')
  const isTrack = pathname.startsWith('/tracks/') || pathname.startsWith('/track/')
  const parent = isConnect ? '/' : isMotion ? '/connect' : isIndex ? '/motion' : isAlbums || isGenres || isGenre ? '/index' : isAlbum ? '/albums' : isTrack ? '/index' : '/'
  const parentLabel = isConnect ? 'EXIT' : isMotion ? 'CONNECTION' : isIndex ? 'MOTION' : isAlbums || isGenres || isGenre ? 'INDEX' : isAlbum ? 'ALBUMS' : isTrack ? 'ALBUM' : 'HOME'
  const section = isConnect ? 'LIBRARY ENTRY' : isMotion ? 'ARCHIVE IN MOTION' : isIndex ? 'THE INDEX' : isAlbums ? 'ALL ALBUMS' : isGenres ? 'GENRE WORLDS' : isIndie ? 'INDIE WORLD' : isGenre ? 'GENRE WORLD' : isAlbum ? 'ALBUM OBJECT' : isTrack ? 'TRACK OBJECT' : 'ARCHIVE'
  const number = isConnect ? '02' : isMotion ? '03' : isIndex ? '04' : isAlbums || isGenres ? '05' : isIndie ? '05' : isGenre || isAlbum ? '06' : isTrack ? '07' : '00'
  return <header className={`context-bar context-bar--${isMotion ? 'motion' : isIndex ? 'index' : isIndie ? 'indie' : isGenre ? 'genre' : 'object'}`}>
    <MVAHomeLink className="context-bar__brand">M / V / A</MVAHomeLink>
    <Link className="context-bar__back" to={parent}>← <span>{parentLabel}</span></Link>
    <div className="context-bar__chapter"><span>{number} / 07</span><strong>{section}</strong><small>PERSONAL</small></div>
    <div className="context-bar__tools">
      <SoundControl compact />
      <details className="context-bar__utilities"><summary aria-label="Archive utilities">•••</summary><div>
        <Link to={parent}>← {parentLabel}</Link>
        {!isIndex && <Link to="/index">OPEN THE INDEX ↗</Link>}
        {isMotion && <Link to="/index">ENTER THE INDEX ↗</Link>}
        {isIndex && <Link to="/motion">BACK TO MOTION</Link>}
        {connected && <button type="button" onClick={() => void refresh()} disabled={status === 'loading'}>REFRESH LIBRARY</button>}
        {connected && <button type="button" onClick={disconnect}>DISCONNECT {providerName}</button>}
      </div></details>
    </div>
  </header>
}

function AppShell() {
  const { pathname } = useLocation()
  const { connected, providerState, disconnect, refresh, status } = useLibrary()
  const isLanding = pathname === '/'
  const isConnect = pathname === '/connect'
  const isLibraryFlow = isConnect || pathname === '/callback'
  const isElectronicWorld = pathname === '/genres/electronic' || pathname === '/genre/electronic'
  const isHipHopWorld = pathname === '/genres/hip-hop' || pathname === '/genre/hip-hop'
  const isSoulWorld = pathname === '/genres/soul' || pathname === '/genre/soul'
  const isRockWorld = pathname === '/genres/rock' || pathname === '/genre/rock'
  const isClassicalWorld = pathname === '/genres/ambient' || pathname === '/genre/ambient'
  const pageKey = pathname.startsWith('/tracks/') || pathname.startsWith('/track/') ? 'track-detail' : pathname
  return <><a className="skip-link" href="#main">跳转到主要内容</a>
    {!isLanding && !isLibraryFlow && !isElectronicWorld && !isHipHopWorld && !isSoulWorld && !isRockWorld && !isClassicalWorld && <ContextBar pathname={pathname} connected={connected} providerName={providerState.displayName} refresh={refresh} disconnect={disconnect} status={status} />}
    <main id="main" tabIndex={-1} className={isLanding ? 'main--landing' : 'main--visual'}>
      <div className={isLanding ? '' : 'page-arrive'} key={pageKey}><Routes>
        <Route path="/" element={<Landing />} /><Route path="/connect" element={<ConnectLibrary />} /><Route path="/callback" element={<SpotifyCallback />} />
        <Route path="/motion" element={<MotionPage />} /><Route path="/index" element={<IndexPage />} /><Route path="/albums" element={<AllAlbumsPage />} />
        <Route path="/genres" element={<GenresPage />} /><Route path="/genres/:genreId" element={<GenreWorldPage />} /><Route path="/genre/:genreId" element={<GenreWorldPage />} />
        <Route path="/albums/:albumId" element={<AlbumPage />} /><Route path="/album/:albumId" element={<AlbumPage />} />
        <Route path="/tracks/:trackId" element={<TrackPage />} /><Route path="/track/:trackId" element={<TrackPage />} />
        <Route path="*" element={<MissingPage />} />
      </Routes></div>
    </main>
    {!isLanding && !isLibraryFlow && !isElectronicWorld && !isHipHopWorld && !isSoulWorld && !isRockWorld && !isClassicalWorld && <footer className="context-footer"><span>MVA / PERSONAL LIBRARY</span><span>NO AUDIO DOWNLOADS</span></footer>}
    <RouteEffects />
  </>
}

function App() {
  return <BrowserRouter><AudioProvider><LibraryProvider><AppShell /></LibraryProvider></AudioProvider></BrowserRouter>
}

const appRoot = ReactDOM.createRoot(document.getElementById('root')!)
appRoot.render(<React.StrictMode><App /></React.StrictMode>)
import.meta.hot?.dispose(() => appRoot.unmount())
