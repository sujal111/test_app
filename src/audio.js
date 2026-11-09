import { PATTERN } from './config.js'

const STEP = 60 / PATTERN.bpm / 4

export function createRig() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return createFallback()

  let ctx
  try {
    ctx = new AudioContext()
  } catch {
    return createFallback()
  }

  const master = ctx.createGain()
  master.gain.value = 0
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 18
  comp.ratio.value = 3.2
  comp.attack.value = 0.004
  comp.release.value = 0.2
  master.connect(comp)
  comp.connect(ctx.destination)

  let noise = null
  const queue = []
  let next = 0
  let step = 0
  let started = false

  function noiseBuffer() {
    if (noise) return noise
    const length = Math.floor(ctx.sampleRate * 0.8)
    noise = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return noise
  }

  function envGain(value, time, duration) {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(value, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration)
    gain.connect(master)
    return gain
  }

  function kick(time) {
    const osc = ctx.createOscillator()
    const gain = envGain(0.7, time, 0.28)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(172, time)
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.11)
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + 0.32)
  }

  function snare(time) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer()
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1200
    const gain = envGain(0.26, time, 0.16)
    src.connect(filter)
    filter.connect(gain)
    src.start(time)
    src.stop(time + 0.18)

    const osc = ctx.createOscillator()
    const tone = envGain(0.1, time, 0.09)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(188, time)
    osc.connect(tone)
    osc.start(time)
    osc.stop(time + 0.12)
  }

  function hat(time) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer()
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 7800
    const gain = envGain(0.1, time, 0.04)
    src.connect(filter)
    filter.connect(gain)
    src.start(time)
    src.stop(time + 0.05)
  }

  function schedule(time, index) {
    if (PATTERN.kick[index]) kick(time)
    if (PATTERN.snare[index]) snare(time)
    if (PATTERN.hat[index]) hat(time)
  }

  return {
    start() {
      if (started) {
        ctx.resume()
        return
      }
      started = true
      next = ctx.currentTime + 0.06
      ctx.resume()
    },
    setMuted(muted) {
      master.gain.setTargetAtTime(muted ? 0 : 0.82, ctx.currentTime, 0.03)
    },
    now() {
      return ctx.currentTime
    },
    impact() {
      const time = ctx.currentTime
      ;[52, 78, 104, 156].forEach((freq, index) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const filter = ctx.createBiquadFilter()
        osc.type = index === 0 ? 'sine' : 'sawtooth'
        osc.frequency.setValueAtTime(freq, time)
        osc.frequency.exponentialRampToValueAtTime(Math.max(32, freq * 0.5), time + 0.7)
        gain.gain.setValueAtTime(index === 0 ? 0.42 : 0.05, time)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8)
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(280, time)
        filter.frequency.linearRampToValueAtTime(2400, time + 0.16)
        filter.frequency.linearRampToValueAtTime(220, time + 0.72)
        osc.connect(filter)
        filter.connect(gain)
        gain.connect(master)
        osc.start(time)
        osc.stop(time + 0.86)
      })
    },
    tick() {
      if (!started) return []
      if (next < ctx.currentTime - 0.08) {
        queue.length = 0
        next = ctx.currentTime + 0.03
      }
      while (next < ctx.currentTime + 0.2) {
        schedule(next, step)
        queue.push({
          time: next,
          step,
          kick: PATTERN.kick[step] === 1,
          snare: PATTERN.snare[step] === 1,
          hat: PATTERN.hat[step] === 1,
        })
        next += STEP
        step = (step + 1) % PATTERN.kick.length
      }
      const due = []
      const horizon = ctx.currentTime + 0.02
      while (queue.length && queue[0].time <= horizon) due.push(queue.shift())
      return due
    },
    close() {
      ctx.close().catch(() => {})
    },
  }
}

function createFallback() {
  let started = false
  let origin = 0
  let next = 0
  let step = 0

  return {
    start() {
      if (started) return
      started = true
      origin = performance.now() / 1000
      next = 0.06
    },
    setMuted() {},
    now() {
      return started ? performance.now() / 1000 - origin : 0
    },
    impact() {},
    tick() {
      if (!started) return []
      const now = performance.now() / 1000 - origin
      const due = []
      while (next <= now + 0.02) {
        due.push({
          time: next,
          step,
          kick: PATTERN.kick[step] === 1,
          snare: PATTERN.snare[step] === 1,
          hat: PATTERN.hat[step] === 1,
        })
        next += STEP
        step = (step + 1) % PATTERN.kick.length
      }
      return due
    },
    close() {},
  }
}
