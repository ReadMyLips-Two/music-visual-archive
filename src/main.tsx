import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AudioProvider, SoundControl } from './audio'
import { LandingFlower } from './LandingFlower'
import { LibraryProvider, useLibrary } from './library'
import { completeSpotifyAuthorization, SPOTIFY_CLIENT_ID, startSpotifyAuthorization } from './spotify'
import { AlbumPage, AllAlbumsPage, GenreWorldPage, GenresPage, IndexPage, MissingPage, MotionPage, TrackPage } from './visual'
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
    <header className="landing__masthead"><Link to="/" className="landing__monogram" aria-label="Music Visual Archive home">M / V / A</Link><p>Music<br />Visual<br />Archive</p></header>
    <h1 className="landing__title">Music as a <br />Visual Space.</h1>
    <div className="landing__flower-wrap"><LandingFlower /></div>
    <aside className="landing-note landing-note--sound"><span>01 / SOUND</span><p>More than music,<br />a visual experience.</p><i aria-hidden="true" /></aside>
    <aside className="landing-note landing-note--archive"><span>02 / ARCHIVE</span><p>Every album<br />holds a world.</p><i aria-hidden="true" /></aside>
    <aside className="landing-note landing-note--you"><span>03 / YOU</span><p>A space for<br />your own collection.</p><i aria-hidden="true" /></aside>
    <div className="landing__sound"><SoundControl compact /></div>
    <div className="landing__edition"><span>001 / 026</span><p>A personal collection<br />of sound and image</p></div>
    <div className="landing__enter"><span>04 / ENTER</span><Link to="/connect" onClick={enterArchive}>Enter Archive <b aria-hidden="true">↗</b></Link><p>Your music,<br />reimagined.</p></div>
    <p className="landing__legal">© 2026<br />Music Visual Archive.<br />Demo content.</p>
  </div>
}

function ConnectLibrary() {
  const { connected, mode, status, progress, error, useDemo, activateSpotify, disconnect } = useLibrary()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState<string | null>(null)
  const connect = async () => {
    setAuthError(null)
    try { await startSpotifyAuthorization() }
    catch (reason) { setAuthError(reason instanceof Error ? reason.message : '无法开始 Spotify 授权。') }
  }
  return <div className="archive-page connect-page">
    <div className="connect-page__meta"><span>02 / AN ARCHIVE BEGINS WITH A COLLECTION</span><span>YOUR MUSIC / YOUR SPACE</span></div>
    <div className="connect-page__heading">
      <h1>Make it<br /><em>yours.</em></h1>
      <div className="connect-page__aside"><span>THE SECOND MOVEMENT</span><p>Every collection begins somewhere. Open the music you have kept, and watch it become a space.</p></div>
    </div>
    <div className="connect-page__choices">
      <section className="connect-choice connect-choice--spotify"><span>01 / PERSONAL</span><div><h2>Connect Spotify</h2><p>Saved albums, tracks, and accessible playlists. Permission is granted on Spotify.</p>{connected && <p className="connect-choice__status">CONNECTED IN THIS BROWSER</p>}</div>
        <div className="connect-choice__actions"><button type="button" onClick={connect} disabled={!SPOTIFY_CLIENT_ID}>{connected ? 'RECONNECT ↗' : 'CONNECT SPOTIFY ↗'}</button>
        {connected && <><button type="button" onClick={() => { void activateSpotify().then(ok => { if (ok) navigate('/motion') }) }}>ENTER YOUR ARCHIVE →</button><button type="button" onClick={disconnect}>DISCONNECT</button></>}</div></section>
      <section className="connect-choice connect-choice--demo"><span>02 / PREVIEW</span><div><h2>Demo Archive</h2><p>Three fictional albums. A preview of the space, clearly separate from your own library.</p></div>
        <button type="button" onClick={() => { useDemo(); navigate('/motion') }}>ENTER DEMO ↗</button></section>
    </div>
    {!SPOTIFY_CLIENT_ID && <p className="connect-page__feedback" role="alert">请在 .env.local 中配置 VITE_SPOTIFY_CLIENT_ID 并重启 Vite。</p>}
    {mode === 'spotify' && status === 'loading' && <p className="connect-page__feedback" role="status">{progress || 'Reading your library…'}</p>}
    {(authError || error) && <p className="connect-page__feedback" role="alert">{authError || error}</p>}
    <div className="connect-page__foot"><span>NO PASSWORDS ARE ENTERED HERE</span><span>NO COMMERCIAL AUDIO IS DOWNLOADED</span></div>
  </div>
}

function SpotifyCallback() {
  const navigate = useNavigate()
  const { activateSpotify, progress, error: libraryError } = useLibrary()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = window.location.search
    window.history.replaceState({}, '', '/callback')
    void completeSpotifyAuthorization(search)
      .then(() => activateSpotify())
      .then(ok => { if (ok) navigate('/motion', { replace: true }) })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Spotify 授权失败。'))
  }, [activateSpotify, navigate])
  return <div className="archive-page callback-page"><span>02 / CONNECTING YOUR LIBRARY</span><h1>{error ? 'The connection paused.' : 'Opening your archive.'}</h1>
    {error || libraryError ? <div role="alert"><p>{error || libraryError}</p><Link to="/connect">RETURN TO CONNECTION ↗</Link></div> : <p role="status">{progress || '正在连接 Spotify…'}</p>}</div>
}

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${document.querySelector('h1')?.textContent ?? 'Music Visual Archive'} | Music Visual Archive`
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
  return null
}

function ContextBar({ pathname, mode, connected, refresh, disconnect, status }: { pathname: string; mode: 'demo' | 'spotify'; connected: boolean; refresh: () => Promise<boolean>; disconnect: () => void; status: string }) {
  const isConnect = pathname === '/connect'
  const isMotion = pathname === '/motion'
  const isIndex = pathname === '/index'
  const isAlbums = pathname === '/albums'
  const isGenres = pathname === '/genres'
  const isGenre = pathname.startsWith('/genres/') || pathname.startsWith('/genre/')
  const isAlbum = pathname.startsWith('/albums/') || pathname.startsWith('/album/')
  const isTrack = pathname.startsWith('/tracks/') || pathname.startsWith('/track/')
  const parent = isConnect ? '/' : isMotion ? '/connect' : isIndex ? '/motion' : isAlbums || isGenres || isGenre ? '/index' : isAlbum ? '/albums' : isTrack ? '/index' : '/'
  const parentLabel = isConnect ? 'EXIT' : isMotion ? 'CONNECTION' : isIndex ? 'MOTION' : isAlbums || isGenres || isGenre ? 'INDEX' : isAlbum ? 'ALBUMS' : isTrack ? 'ALBUM' : 'HOME'
  const section = isConnect ? 'LIBRARY ENTRY' : isMotion ? 'ARCHIVE IN MOTION' : isIndex ? 'THE INDEX' : isAlbums ? 'ALL ALBUMS' : isGenres ? 'GENRE WORLDS' : isGenre ? 'GENRE WORLD' : isAlbum ? 'ALBUM OBJECT' : isTrack ? 'TRACK OBJECT' : 'ARCHIVE'
  const number = isConnect ? '02' : isMotion ? '03' : isIndex ? '04' : isAlbums || isGenres ? '05' : isGenre || isAlbum ? '06' : isTrack ? '07' : '00'
  return <header className={`context-bar context-bar--${isMotion ? 'motion' : isIndex ? 'index' : isGenre ? 'genre' : 'object'}`}>
    <Link className="context-bar__brand" to="/" aria-label="Music Visual Archive home">M / V / A</Link>
    <Link className="context-bar__back" to={parent}>← <span>{parentLabel}</span></Link>
    <div className="context-bar__chapter"><span>{number} / 07</span><strong>{section}</strong><small>{mode === 'demo' ? 'DEMO' : 'PERSONAL'}</small></div>
    <div className="context-bar__tools">
      <SoundControl compact />
      <details className="context-bar__utilities"><summary aria-label="Archive utilities">•••</summary><div>
        <Link to={parent}>← {parentLabel}</Link>
        {!isIndex && <Link to="/index">OPEN THE INDEX ↗</Link>}
        {isMotion && <Link to="/index">ENTER THE INDEX ↗</Link>}
        {isIndex && <Link to="/motion">BACK TO MOTION</Link>}
        {connected && <button type="button" onClick={() => void refresh()} disabled={status === 'loading'}>REFRESH LIBRARY</button>}
        {connected && <button type="button" onClick={disconnect}>DISCONNECT SPOTIFY</button>}
      </div></details>
    </div>
  </header>
}

function AppShell() {
  const { pathname } = useLocation()
  const { mode, connected, disconnect, refresh, status } = useLibrary()
  const isLanding = pathname === '/'
  return <><a className="skip-link" href="#main">跳转到主要内容</a>
    {!isLanding && <ContextBar pathname={pathname} mode={mode} connected={connected} refresh={refresh} disconnect={disconnect} status={status} />}
    <main id="main" tabIndex={-1} className={isLanding ? 'main--landing' : 'main--visual'}>
      <div className={isLanding ? '' : 'page-arrive'} key={pathname}><Routes>
        <Route path="/" element={<Landing />} /><Route path="/connect" element={<ConnectLibrary />} /><Route path="/callback" element={<SpotifyCallback />} />
        <Route path="/motion" element={<MotionPage />} /><Route path="/index" element={<IndexPage />} /><Route path="/albums" element={<AllAlbumsPage />} />
        <Route path="/genres" element={<GenresPage />} /><Route path="/genres/:genreId" element={<GenreWorldPage />} /><Route path="/genre/:genreId" element={<GenreWorldPage />} />
        <Route path="/albums/:albumId" element={<AlbumPage />} /><Route path="/album/:albumId" element={<AlbumPage />} />
        <Route path="/tracks/:trackId" element={<TrackPage />} /><Route path="/track/:trackId" element={<TrackPage />} />
        <Route path="*" element={<MissingPage />} />
      </Routes></div>
    </main>
    {!isLanding && <footer className="context-footer"><span>MVA / {mode === 'demo' ? 'DEMO CONTENT' : 'PERSONAL LIBRARY'}</span><span>NO AUDIO DOWNLOADS</span></footer>}
    <RouteEffects />
  </>
}

function App() {
  return <BrowserRouter><AudioProvider><LibraryProvider><AppShell /></LibraryProvider></AudioProvider></BrowserRouter>
}

const appRoot = ReactDOM.createRoot(document.getElementById('root')!)
appRoot.render(<React.StrictMode><App /></React.StrictMode>)
import.meta.hot?.dispose(() => appRoot.unmount())
