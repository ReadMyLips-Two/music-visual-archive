import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AudioProvider, SoundControl } from './audio'
import { LandingFlower } from './LandingFlower'
import { LibraryProvider, useLibrary, type LibraryAlbum } from './library'
import { completeSpotifyAuthorization, SPOTIFY_CLIENT_ID, startSpotifyAuthorization } from './spotify'
import { AlbumPage, AllAlbumsPage, GenreWorldPage, GenresPage, IndexPage as VisualIndexPage, MissingPage, MotionPage, TrackPage } from './visual'
import './styles.css'
import './visual.css'

const navigation = [
  ['/', 'Landing Page'], ['/connect', 'Connect Your Library'], ['/motion', 'The Archive in Motion'],
  ['/index', 'The Index'], ['/albums', 'All Albums'], ['/genres', 'Genre World'],
] as const

function PageHeading({ title, description }: { title: string; description: string }) {
  const { mode } = useLibrary()
  return <header className="page-heading"><p className="eyebrow">Music Visual Archive / {mode === 'demo' ? 'Demo Archive' : 'Your Spotify Library'}</p><h1>{title}</h1><p>{description}</p></header>
}

function AlbumCard({ album }: { album: LibraryAlbum }) {
  return <article className="album-card"><Link className="album-card__main" to={`/albums/${album.id}`}>
      {album.artwork ? <img className="cover cover--spotify" src={album.artwork} alt={`${album.title} 专辑封面`} />
        : <div className="cover" style={{ backgroundColor: album.color }}><span>DEMO ARTWORK</span><strong>{album.title}</strong><span>{album.year} / {album.genre}</span></div>}
      <h2>{album.title}</h2><p>{album.artist}{album.genre ? ` · ${album.genre}` : ''}</p>
    </Link>{album.url && <a className="spotify-source" href={album.url} target="_blank" rel="noreferrer">Spotify 原专辑 ↗</a>}</article>
}

function Landing() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  const enterArchive = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (leaving) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate('/connect')
      return
    }
    setLeaving(true)
    window.setTimeout(() => navigate('/connect'), 720)
  }

  return <div className={`landing${leaving ? ' landing--leaving' : ''}`}>
    <header className="landing__masthead">
      <Link to="/" className="landing__monogram" aria-label="Music Visual Archive home">M / V / A</Link>
      <p>Music<br />Visual<br />Archive</p>
    </header>

    <h1 className="landing__title">Music as a <br />Visual Space.</h1>

    <div className="landing__flower-wrap">
      <LandingFlower />
    </div>

    <aside className="landing-note landing-note--sound">
      <span>01 / SOUND</span>
      <p>More than music,<br />a visual experience.</p>
      <i aria-hidden="true" />
    </aside>
    <aside className="landing-note landing-note--archive">
      <span>02 / ARCHIVE</span>
      <p>Every album<br />holds a world.</p>
      <i aria-hidden="true" />
    </aside>
    <aside className="landing-note landing-note--you">
      <span>03 / YOU</span>
      <p>A space for<br />your own collection.</p>
      <i aria-hidden="true" />
    </aside>

    <div className="landing__sound"><SoundControl compact /></div>

    <div className="landing__edition"><span>001 / 026</span><p>A personal collection<br />of sound and image</p></div>

    <div className="landing__enter">
      <span>04 / ENTER</span>
      <Link to="/connect" onClick={enterArchive}>Enter Archive <b aria-hidden="true">↗</b></Link>
      <p>Your music,<br />reimagined.</p>
    </div>

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
    <div className="connect-page__meta"><span>02 / PERSONAL ARCHIVE</span><span>SELECT A SOURCE</span></div>
    <div className="connect-page__heading"><h1>CONNECT YOUR<br /><em>LIBRARY.</em></h1><p>A personal archive begins<br />with your music.</p></div>
    <div className="connect-page__choices">
      <div className="connect-choice connect-choice--spotify"><span>01</span><div><h2>Spotify</h2><p>Your saved albums, tracks and accessible playlists. Authorization happens on Spotify.</p>
        {connected && <p className="connect-choice__status">CONNECTED IN THIS BROWSER</p>}</div>
        <div className="connect-choice__actions"><button type="button" onClick={connect} disabled={!SPOTIFY_CLIENT_ID}>CONNECT ↗</button>
          {connected && <><button type="button" onClick={() => { void activateSpotify().then(() => navigate('/motion')) }}>CONTINUE →</button><button type="button" onClick={disconnect}>DISCONNECT</button></>}</div></div>
      <div className="connect-choice connect-choice--unavailable"><span>02</span><div><h2>Apple Music</h2><p>Another way into the archive.</p></div><span>NOT AVAILABLE YET</span></div>
      <div className="connect-choice connect-choice--unavailable"><span>03</span><div><h2>QQ 音乐</h2><p>A future library connection.</p></div><span>NOT AVAILABLE YET</span></div>
      <div className="connect-choice connect-choice--demo"><span>04</span><div><h2>Explore the Demo Archive</h2><p>A clearly marked fictional collection. No account required.</p></div>
        <button type="button" onClick={() => { useDemo(); navigate('/motion') }}>ENTER DEMO ↗</button></div>
    </div>
    {!SPOTIFY_CLIENT_ID && <p role="alert">请在 .env.local 中配置 VITE_SPOTIFY_CLIENT_ID 并重启 Vite。</p>}
    {mode === 'spotify' && status === 'loading' && <p className="connect-page__feedback" role="status">{progress || 'Reading your library…'}</p>}
    {(authError || error) && <p className="connect-page__feedback" role="alert">{authError || error}</p>}
    <p className="connect-page__foot">NO PASSWORDS ARE ENTERED HERE / NO COMMERCIAL AUDIO IS DOWNLOADED</p>
  </div>
}

function SpotifyCallback() {
  const navigate = useNavigate()
  const { activateSpotify, progress } = useLibrary()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = window.location.search
    window.history.replaceState({}, '', '/callback')
    void completeSpotifyAuthorization(search)
      .then(() => activateSpotify())
      .then(() => navigate('/motion', { replace: true }))
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Spotify 授权失败。'))
  }, [activateSpotify, navigate])
  return <><PageHeading title="Spotify Connection" description="正在校验授权并读取个人音乐库。" />
    {error ? <section className="panel" role="alert"><p>{error}</p><Link className="button" to="/connect">返回连接页</Link></section>
      : <p role="status">{progress || '正在连接 Spotify…'}</p>}</>
}

function LibraryState() {
  const { mode, status, progress, error, refresh, library } = useLibrary()
  if (mode === 'demo') return null
  return <>{status === 'loading' && <p className="panel" role="status">{progress || '正在读取 Spotify 收藏…'}</p>}
    {status === 'error' && <section className="panel connect-error" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>重新读取</button> <Link to="/connect">连接设置</Link></section>}
    {library.warnings.map(warning => <p className="panel" role="status" key={warning}>{warning}</p>)}</>
}

function Motion() {
  const { library, mode } = useLibrary()
  return <><PageHeading title="The Archive in Motion" description={mode === 'spotify' ? '以你保存的专辑构成视觉档案。' : '以连续的视觉片段浏览演示音乐记忆。'} />
    <LibraryState />{library.albums.length === 0 && <p className="panel">{mode === 'spotify' ? '尚未保存专辑。你的已保存歌曲和播放列表可在 THE INDEX 浏览。' : '演示档案为空。'}</p>}
    <div className="motion-list">{library.albums.map((album, index) => <Link to={`/albums/${album.id}`} className="motion-item" style={{ backgroundColor: album.color }} key={album.id}>
      <span>{String(index + 1).padStart(2, '0')} / {mode === 'demo' ? 'DEMO' : 'SAVED ALBUM'}</span><h2>{album.title}</h2><p>{album.artist}</p><span>查看专辑 →</span></Link>)}</div></>
}

function IndexPage() {
  const { library, mode } = useLibrary()
  return <><PageHeading title="The Index" description={mode === 'spotify' ? '你保存的专辑、歌曲与可访问的播放列表。未推断音乐类型。' : '演示档案中的专辑与曲目。'} />
    <LibraryState /><h2>Albums / {library.albums.length}</h2>
    {library.albums.map(album => <section className="panel" key={album.id}><h2><Link to={`/albums/${album.id}`}>{album.title} ↗</Link></h2><p>{album.artist}{album.year ? ` · ${album.year}` : ''}{album.genre ? ` · ${album.genre}` : ''}</p></section>)}
    <h2>{mode === 'demo' ? 'Tracks' : 'Saved Tracks'} / {library.tracks.length}</h2><ul className="track-list">{library.tracks.map(track => <li key={track.id}><Link to={`/tracks/${track.id}`}>{track.title}</Link><span>{track.artist} · {track.duration}</span></li>)}</ul>
    <h2>Playlists / {library.playlists.length}</h2>{library.playlists.map(playlist => <section className="panel" key={playlist.id}><h2>{playlist.url ? <a href={playlist.url} target="_blank" rel="noreferrer">{playlist.name} ↗ Spotify</a> : playlist.name}</h2>
      <p>{playlist.access === 'restricted' ? 'Spotify 目前仅允许读取自己拥有或协作的播放列表条目。' : `${playlist.tracks.length} 首可读取歌曲`}</p>
      {playlist.access === 'readable' && <ul className="track-list">{playlist.tracks.map((track, index) => <li key={`${track.id}-${index}`}><Link to={`/tracks/${track.id}`}>{track.title}</Link><span>{track.artist}</span></li>)}</ul>}</section>)}
    {library.albums.length === 0 && library.tracks.length === 0 && library.playlists.length === 0 && <p className="panel">音乐库为空。保存专辑或歌曲后，可返回此页重新读取。</p>}
  </>
}

function AllAlbums() {
  const { library, mode } = useLibrary()
  const [query, setQuery] = useState('')
  const filtered = library.albums.filter(album => `${album.title} ${album.artist} ${album.genre ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <><PageHeading title="All Albums" description={mode === 'spotify' ? '你的 Spotify 已保存专辑。类型未知的专辑保留在此，不会被编造标签。' : '浏览全部虚构演示专辑。'} />
    <LibraryState /><label className="search">搜索专辑或艺人<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Album or artist" /></label>
    <p role="status">{filtered.length} 张{mode === 'demo' ? '演示' : '已保存'}专辑</p><div className="album-grid">{filtered.map(album => <AlbumCard key={album.id} album={album} />)}</div>
    {filtered.length === 0 && <p className="panel">{query ? '没有匹配的专辑。' : '这里还没有已保存的专辑。'}</p>}</>
}

function Genres() {
  const { library, mode } = useLibrary()
  const genres = [...new Set(library.albums.map(album => album.genre).filter((genre): genre is string => Boolean(genre)))]
  return <><PageHeading title="Genre World" description={mode === 'spotify' ? 'Spotify 当前收藏数据未提供可靠的专辑类型；未知类型只显示在 All Albums。' : '演示专辑的风格归类仅用于展示。'} />
    {genres.length === 0 && <p className="panel">暂无可确认类型的专辑。请在 <Link to="/albums">All Albums</Link> 浏览全部收藏。</p>}
    {genres.map(genre => <section className="panel" key={genre}><h2>{genre}</h2><div className="album-grid">{library.albums.filter(album => album.genre === genre).map(album => <AlbumCard key={album.id} album={album} />)}</div></section>)}</>
}

function AlbumDetail() {
  const { albumId } = useParams()
  const { library } = useLibrary()
  const album = library.albums.find(item => item.id === albumId)
  if (!album) return <NotFound />
  return <><Link to="/albums">← All Albums</Link><PageHeading title={album.title} description={album.source === 'demo' ? 'Album Detail / 虚构演示专辑' : 'Album Detail / Spotify 已保存专辑'} />
    <div className="detail-grid">{album.artwork ? <img className="cover detail-cover cover--spotify" src={album.artwork} alt={`${album.title} 专辑封面`} />
      : <div className="cover detail-cover" style={{ backgroundColor: album.color }}><span>DEMO ARTWORK</span><strong>{album.title}</strong><span>{album.artist}</span></div>}
    <section><h2>专辑档案</h2><dl><dt>艺人</dt><dd>{album.artist}</dd><dt>年份</dt><dd>{album.year ?? '—'}</dd><dt>风格</dt><dd>{album.genre ?? '未分类'}</dd></dl>
      {album.note && <p>{album.note}</p>}{album.url && <p><a href={album.url} target="_blank" rel="noreferrer">在 Spotify 查看原专辑 ↗</a></p>}
      <h2>曲目</h2><ul className="track-list">{album.tracks.map(track => <li key={track.id}><Link to={`/tracks/${track.id}`}>{track.title} →</Link><span>{track.duration}</span></li>)}</ul>
      {album.tracks.length === 0 && <p>此专辑的曲目暂不可用。</p>}</section></div></>
}

function TrackDetail() {
  const { trackId } = useParams()
  const { library } = useLibrary()
  const album = library.albums.find(item => item.tracks.some(track => track.id === trackId))
  const track = library.tracks.find(item => item.id === trackId) ?? album?.tracks.find(item => item.id === trackId)
    ?? library.playlists.flatMap(playlist => playlist.tracks).find(item => item.id === trackId)
  if (!track) return <NotFound />
  return <>{album ? <Link to={`/albums/${album.id}`}>← {album.title}</Link> : <Link to="/index">← The Index</Link>}
    <PageHeading title={track.title} description={track.source === 'demo' ? 'Track Detail / 虚构演示曲目' : 'Track Detail / Spotify 曲目信息'} />
    <section className="panel"><h2>曲目档案</h2><dl><dt>艺人</dt><dd>{track.artist}</dd><dt>时长</dt><dd>{track.duration}</dd></dl>
      {track.note && <p>{track.note}</p>}{track.url && <p><a href={track.url} target="_blank" rel="noreferrer">在 Spotify 查看曲目 ↗</a></p>}
      <p className="muted">本站仅展示音乐视觉档案与元数据，不提供商业录音播放或下载。</p></section></>
}

function NotFound() {
  return <><PageHeading title="未找到这份档案" description="页面或演示记录不存在。" /><Link className="button" to="/albums">返回专辑列表</Link></>
}

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = `${document.querySelector('h1')?.textContent ?? 'Music Visual Archive'} | Music Visual Archive`
    document.getElementById('main')?.focus()
  }, [pathname])
  return null
}

function AppShell() {
  const { pathname } = useLocation()
  const { mode, connected, disconnect, refresh, status } = useLibrary()
  const isLanding = pathname === '/'
  const currentLabel = navigation.find(([path]) => path === pathname)?.[1] ?? (pathname.startsWith('/genres/') ? 'Genre World' : pathname.startsWith('/albums/') ? 'Album Detail' : pathname.startsWith('/tracks/') ? 'Track Detail' : 'Music Visual Archive')
  return <><a className="skip-link" href="#main">跳转到主要内容</a>
    {!isLanding && <header className="archive-shell"><Link to="/" className="archive-shell__brand" aria-label="Music Visual Archive home">M / V / A</Link>
      <span className="archive-shell__place">{currentLabel.toUpperCase()} <i> / {mode === 'demo' ? 'DEMO' : 'PERSONAL'}</i></span>
      <nav aria-label="主要导航"><NavLink to="/index">THE INDEX</NavLink><NavLink to="/albums">ALL ALBUMS</NavLink><NavLink to="/connect">LIBRARY</NavLink></nav>
      <div className="archive-shell__tools"><SoundControl compact />{connected && <details><summary>ACCOUNT</summary><div><button type="button" onClick={() => void refresh()} disabled={status === 'loading'}>REFRESH LIBRARY</button><button type="button" onClick={disconnect}>DISCONNECT SPOTIFY</button></div></details>}</div>
    </header>}
    <main id="main" tabIndex={-1} className={isLanding ? 'main--landing' : 'main--visual'}><Routes><Route path="/" element={<Landing />} /><Route path="/connect" element={<ConnectLibrary />} /><Route path="/callback" element={<SpotifyCallback />} /><Route path="/motion" element={<MotionPage />} /><Route path="/index" element={<VisualIndexPage />} /><Route path="/albums" element={<AllAlbumsPage />} /><Route path="/genres" element={<GenresPage />} /><Route path="/genres/:genreId" element={<GenreWorldPage />} /><Route path="/albums/:albumId" element={<AlbumPage />} /><Route path="/tracks/:trackId" element={<TrackPage />} /><Route path="*" element={<MissingPage />} /></Routes></main>
    {!isLanding && <footer className="archive-footer"><span>MUSIC VISUAL ARCHIVE / 2026</span><span>{mode === 'demo' ? 'FICTIONAL DEMO CONTENT' : 'PERSONAL SPOTIFY LIBRARY'}</span><span>NO AUDIO DOWNLOADS</span></footer>}<RouteEffects /></>
}

function App() {
  return <BrowserRouter><AudioProvider><LibraryProvider><AppShell /></LibraryProvider></AudioProvider></BrowserRouter>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
