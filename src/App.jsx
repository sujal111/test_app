import { useCallback, useEffect, useRef, useState } from 'react'
import Stage from './Stage.jsx'
import { MODES, PALETTES, PATTERN, clamp, realityName } from './config.js'

export default function App() {
  const stageRef = useRef(null)
  const [live, setLive] = useState(false)
  const [mode, setMode] = useState('flow')
  const [chaos, setChaos] = useState(0.42)
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [dropSignal, setDropSignal] = useState(0)
  const [stats, setStats] = useState({
    particles: 0,
    step: 0,
    combo: 0,
    word: 'MAYHEM',
    kick: 0,
  })

  const palette = PALETTES[paletteIndex]
  const modeInfo = MODES.find((item) => item.id === mode) ?? MODES[0]

  const arm = useCallback(() => {
    stageRef.current?.startAudio()
    setLive(true)
  }, [])

  const ignite = useCallback(() => {
    arm()
    setMode('glyph')
  }, [arm])

  const drop = useCallback(() => {
    setDropSignal((value) => value + 1)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', palette.colors[0])
    root.style.setProperty('--accent-2', palette.colors[1])
    root.style.setProperty('--accent-3', palette.colors[2])
  }, [palette])

  useEffect(() => {
    document.title = stats.combo > 1 ? `×${stats.combo} MAYHEM` : 'MAYHEM'
  }, [stats.combo])

  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (el && el.tagName === 'BUTTON' && (event.key === 'Enter' || event.code === 'Space')) return

      if (event.key >= '1' && event.key <= '6') {
        const next = MODES[Number(event.key) - 1]
        if (!next) return
        if (!live) arm()
        setMode(next.id)
        return
      }
      if (event.key === 'c' || event.key === 'C') {
        setPaletteIndex((index) => (index + 1) % PALETTES.length)
        return
      }
      if (event.key === 'm' || event.key === 'M') {
        setMuted((value) => !value)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setChaos((value) => clamp(value + 0.05, 0, 1))
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setChaos((value) => clamp(value - 0.05, 0, 1))
        return
      }
      if (event.code === 'Space' || (event.key === 'Enter' && !live)) {
        event.preventDefault()
        if (!live) ignite()
        else if (event.code === 'Space') drop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [arm, drop, ignite, live])

  return (
    <div className={live ? 'app is-live' : 'app'} data-feral={chaos >= 0.9}>
      <Stage
        ref={stageRef}
        mode={mode}
        chaos={chaos}
        paletteIndex={paletteIndex}
        live={live}
        muted={muted}
        dropSignal={dropSignal}
        onStats={setStats}
        onChaosDelta={(delta) => setChaos((value) => clamp(value + delta, 0, 1))}
      />
      <div className="vignette" key={stats.kick} />
      <div className="scanlines" />
      <div className="brackets" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      {live ? (
        <div className="hud">
          <header className="top">
            <div className="brand">
              <strong>MAYHEM</strong>
              <span>
                {modeInfo.label}
                {mode === 'glyph' ? ` · ${stats.word}` : ''}
              </span>
              <em>{modeInfo.hint}</em>
            </div>
            <div className="seq" aria-hidden="true">
              {PATTERN.kick.map((kick, index) => {
                const names = ['step']
                if (kick) names.push('is-kick')
                if (PATTERN.snare[index]) names.push('is-snare')
                if (index === stats.step) names.push('is-now')
                return <span key={index} className={names.join(' ')} />
              })}
            </div>
            <div className="readout">
              <span className="live">
                <i />
                {muted ? 'MUTED' : 'LIVE'}
              </span>
              <span>{PATTERN.bpm} BPM</span>
              <span>{stats.particles} BODIES</span>
              <b>{stats.combo > 0 ? `×${stats.combo}` : 'TAP THE KICK'}</b>
            </div>
          </header>

          <footer>
            <div className="dock">
              <div className="modes" role="group" aria-label="Physics mode">
                {MODES.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={mode === item.id ? 'on' : ''}
                    aria-pressed={mode === item.id}
                    onClick={() => setMode(item.id)}
                  >
                    <em>0{index + 1}</em>
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="reality">
                <span>
                  <span>REALITY</span>
                  <strong>{realityName(chaos)}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={chaos}
                  aria-valuetext={realityName(chaos)}
                  onChange={(event) => setChaos(Number(event.target.value))}
                />
              </label>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => setPaletteIndex((index) => (index + 1) % PALETTES.length)}>
                  {palette.name}
                </button>
                <button type="button" className="ghost" aria-pressed={muted} onClick={() => setMuted((value) => !value)}>
                  {muted ? 'SOUND OFF' : 'SOUND ON'}
                </button>
                <button type="button" className="drop" onClick={drop}>
                  DROP
                </button>
              </div>
            </div>
            <p className="keys">1–6 mode · scroll reality · C color · M mute · space drop · right-click repel · double-click black hole</p>
          </footer>
        </div>
      ) : (
        <div className="splash">
          <p className="eyebrow">
            <i /> Field 01 · cursor instrument
          </p>
          <h1 className="mark" data-text="MAYHEM">
            MAYHEM
          </h1>
          <p className="lede">Six kinds of physics, a drum machine, and a universe that answers to your hand.</p>
          <button type="button" className="ignite" onClick={ignite}>
            Ignite
          </button>
          <ul>
            <li>Click to rupture</li>
            <li>Double-click to swallow</li>
            <li>Space to drop</li>
          </ul>
        </div>
      )}
    </div>
  )
}
