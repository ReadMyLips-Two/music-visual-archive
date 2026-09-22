import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

// Add only owned or explicitly licensed sources. The entry slot covers Landing,
// Connect, Motion and Index. Each genre has an independent optional slot.
const AUDIO_SOURCES: Record<string, string | null> = {
  entry: null,
  pop: null, electronic: null, soul: null, 'hip-hop': null, indie: null,
  rock: null, jazz: null, ambient: null, dance: null,
}

type AudioState = {
  available: boolean
  enabled: boolean
  muted: boolean
  volume: number
  message: string
  slot: string
  requestSound: () => void
  toggleMute: () => void
  setVolume: (value: number) => void
}

const AudioContext = createContext<AudioState | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const slot = pathname.startsWith('/genres/') || pathname.startsWith('/genre/')
    ? pathname.split('/')[2] : 'entry'
  const source = AUDIO_SOURCES[slot] ?? null
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolumeState] = useState(() => {
    const saved = Number(localStorage.getItem('mva-volume') ?? 0.65)
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.65
  })
  const [message, setMessage] = useState('No licensed audio source configured')

  useEffect(() => {
    if (!enabled) return
    if (!source) {
      audioRef.current?.pause()
      setMessage(`No licensed audio source configured for ${slot}`)
      return
    }
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (audio.src !== new URL(source, window.location.href).href) audio.src = source
    audio.loop = true
    audio.volume = volume
    audio.muted = muted
    void audio.play().then(() => setMessage(`${slot} sound is on`)).catch(() => setMessage('Sound could not be started'))
  }, [source, slot, enabled, muted, volume])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const requestSound = () => {
    if (!source) { setMessage(`No licensed audio source configured for ${slot}`); return }
    setEnabled(true)
    setMuted(false)
  }
  const toggleMute = () => {
    if (!enabled) { requestSound(); return }
    setMuted(value => !value)
    setMessage(muted ? `${slot} sound is on` : 'Sound is muted')
  }
  const setVolume = (value: number) => {
    const safe = Math.max(0, Math.min(1, value))
    setVolumeState(safe)
    localStorage.setItem('mva-volume', String(safe))
  }
  const value = useMemo(() => ({
    available: Boolean(source), enabled, muted, volume, message, slot,
    requestSound, toggleMute, setVolume,
  }), [source, enabled, muted, volume, message, slot])
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) throw new Error('useAudio must be used inside AudioProvider')
  return context
}

export function SoundControl({ compact = false }: { compact?: boolean }) {
  const audio = useAudio()
  return <div className={`sound-control${compact ? ' sound-control--compact' : ''}`}>
    <button type="button" onClick={audio.enabled ? audio.toggleMute : audio.requestSound} aria-describedby="sound-status">
      <span aria-hidden="true" className="sound-control__mark">{audio.enabled && !audio.muted ? '◼' : '□'}</span>
      {audio.available ? (audio.enabled && !audio.muted ? 'Sound on' : 'Enable sound') : 'Sound / no source'}
    </button>
    {audio.available && audio.enabled && <label><span>Volume</span>
      <input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={event => audio.setVolume(Number(event.target.value))} />
    </label>}
    <span className="sound-control__status" id="sound-status" role="status">{audio.message}</span>
  </div>
}