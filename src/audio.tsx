import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

// Add only owned or explicitly licensed audio here. A single provider lives above
// the router content so playback can continue across Landing, Motion and Index.
const ENTRY_AUDIO_SRC: string | null = null

type AudioState = {
  available: boolean
  enabled: boolean
  muted: boolean
  volume: number
  message: string
  requestSound: () => void
  toggleMute: () => void
  setVolume: (value: number) => void
}

const AudioContext = createContext<AudioState | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolumeState] = useState(() => Number(localStorage.getItem('mva-volume') ?? 0.65))
  const [message, setMessage] = useState('Sound is off')

  const requestSound = () => {
    if (!ENTRY_AUDIO_SRC) {
      setMessage('No licensed audio source configured')
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(ENTRY_AUDIO_SRC)
      audioRef.current.loop = true
      audioRef.current.volume = volume
    }

    audioRef.current.play().then(() => {
      setEnabled(true)
      setMuted(false)
      setMessage('Entry sound is on')
    }).catch(() => setMessage('Sound could not be started'))
  }

  const toggleMute = () => {
    if (!audioRef.current || !enabled) {
      requestSound()
      return
    }
    const next = !muted
    audioRef.current.muted = next
    setMuted(next)
    setMessage(next ? 'Sound is muted' : 'Entry sound is on')
  }

  const setVolume = (value: number) => {
    setVolumeState(value)
    localStorage.setItem('mva-volume', String(value))
    if (audioRef.current) audioRef.current.volume = value
  }

  const value = useMemo(() => ({
    available: Boolean(ENTRY_AUDIO_SRC), enabled, muted, volume, message,
    requestSound, toggleMute, setVolume,
  }), [enabled, muted, volume, message])

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
      {audio.available ? (audio.enabled && !audio.muted ? 'Sound on' : 'Enable sound') : 'Sound / silent'}
    </button>
    {audio.available && audio.enabled && <label>
      <span>Volume</span>
      <input type="range" min="0" max="1" step="0.05" value={audio.volume} onChange={event => audio.setVolume(Number(event.target.value))} />
    </label>}
    <span className="sound-control__status" id="sound-status" role="status">{audio.message}</span>
  </div>
}
