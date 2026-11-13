import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { createRig } from './audio.js'
import { PALETTES, WORDS } from './config.js'

function keep(damping, dt) {
  return Math.max(0.25, 1 - (1 - damping) * dt)
}

function sampleWord(word, width, height) {
  const canvas = document.createElement('canvas')
  const cw = Math.max(1, Math.floor(width))
  const ch = Math.max(1, Math.floor(height))
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d', { willReadFrequently: true })
  g.clearRect(0, 0, cw, ch)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = Math.min(width * 0.2, height * 0.24, 210)
  g.font = `800 ${size}px Syne, Impact, sans-serif`
  while (size > 28 && g.measureText(word).width > width * 0.84) {
    size *= 0.9
    g.font = `800 ${size}px Syne, Impact, sans-serif`
  }
  const cy = height < 820 ? height * 0.4 : height * 0.46
  g.fillText(word, width / 2, cy)
  const data = g.getImageData(0, 0, cw, ch).data
  let pts = []
  for (let y = 0; y < ch; y += 5) {
    for (let x = 0; x < cw; x += 5) {
      if (data[(y * cw + x) * 4 + 3] > 150) pts.push({ x, y })
    }
  }
  if (pts.length > 1100) {
    const stride = Math.ceil(pts.length / 1100)
    pts = pts.filter((_, index) => index % stride === 0)
  }
  if (pts.length < 12) {
    const radius = Math.min(width, height) * 0.22
    pts = Array.from({ length: 180 }, (_, index) => {
      const angle = (index / 180) * Math.PI * 2
      return {
        x: width / 2 + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.72,
      }
    })
  }
  return pts
}

export default function Stage({
  ref,
  mode,
  chaos,
  paletteIndex,
  live,
  muted,
  hue,
  hueName,
  dropSignal,
  onStats,
  onChaosDelta,
}) {
  const canvasRef = useRef(null)
  const api = useRef({
    mode,
    chaos,
    paletteIndex,
    live,
    muted,
    hue,
    hueName,
    dropSignal,
  })
  const onStatsRef = useRef(onStats)
  const onChaosRef = useRef(onChaosDelta)
  const rigRef = useRef(null)

  useLayoutEffect(() => {
    api.current.mode = mode
    api.current.chaos = chaos
    api.current.paletteIndex = paletteIndex
    api.current.live = live
    api.current.muted = muted
    api.current.hue = hue
    api.current.hueName = hueName
    api.current.dropSignal = dropSignal
    onStatsRef.current = onStats
    onChaosRef.current = onChaosDelta
  })

  useImperativeHandle(ref, () => ({
    startAudio() {
      api.current.live = true
      const rig = rigRef.current
      if (!rig) return
      rig.setMuted(api.current.muted)
      rig.start()
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rig = createRig()
    rigRef.current = rig

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0, y: 0, ui: false, touched: false, repulse: false }
    const parts = []
    const sparks = []
    const shockwaves = []
    const floaters = []
    const toasts = []
    let dust = []
    let glyphs = []
    let glyphKey = ''
    let w = 0
    let h = 0
    let dpr = 1
    let primed = false
    let wasLive = false
    let appliedDrop = 0
    let mutedApplied = null
    let hueApplied = 0
    let last = performance.now()
    let raf = 0
    let dead = false
    let combo = 0
    let lastKickAt = 0
    let kickCount = 0
    let currentStep = 0
    let stepCounter = 0
    let wordIndex = 0
    let paletteShift = 0
    let chaosBoost = 0
    let kickFlash = 0
    let shake = 0
    let flash = 0
    let allowLinks = true
    let reported = { step: -1, combo: -1, kick: -1, word: '', particles: -1 }

    function capFor() {
      if (reduce) return 150
      const area = w * h
      if (area < 520000) return 360
      if (area > 1500000) return 680
      return 520
    }

    function makeDust() {
      dust = Array.from({ length: 72 }, () => ({
        x: Math.random(),
        y: Math.random(),
        z: Math.random(),
        s: Math.random() < 0.85 ? 1 : 2,
        a: 0.12 + Math.random() * 0.4,
      }))
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const nw = Math.max(1, rect.width)
      const nh = Math.max(1, rect.height)
      const ndpr = Math.min(window.devicePixelRatio || 1, Math.min(nw, nh) > 1100 ? 1.35 : 2)
      if (nw === w && nh === h && ndpr === dpr && canvas.width !== 0) return
      w = nw
      h = nh
      dpr = ndpr
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      primed = false
      glyphKey = ''
      if (!pointer.touched) {
        pointer.x = w / 2
        pointer.y = h / 2
      }
      if (!dust.length) makeDust()
    }

    function ensurePopulation() {
      const cap = capFor()
      while (parts.length < cap) {
        parts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          seed: Math.random(),
          ci: Math.floor(Math.random() * 4),
          size: 1 + Math.random() * 2.1,
        })
      }
      if (parts.length > cap) parts.length = cap
    }

    function refreshGlyphs() {
      const key = `${WORDS[wordIndex]}|${Math.round(w)}|${Math.round(h)}`
      if (glyphKey === key) return
      glyphs = sampleWord(WORDS[wordIndex], w, h)
      glyphKey = key
    }

    function spark(x, y, count, power) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = Math.random() * power
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.012 + Math.random() * 0.028,
          ci: Math.floor(Math.random() * 4),
          size: 1 + Math.random() * 2.2,
        })
      }
      if (sparks.length > 340) sparks.splice(0, sparks.length - 340)
    }

    function makeWave(x, y, radius, ci, power = 1) {
      shockwaves.push({
        x,
        y,
        r: radius,
        vr: (2.2 + Math.random() * 1.4) * power,
        life: 1,
        ci,
      })
      if (shockwaves.length > 18) shockwaves.splice(0, shockwaves.length - 18)
    }

    function scatter(power) {
      for (let i = 0; i < parts.length; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = Math.random() * power
        parts[i].vx += Math.cos(angle) * speed
        parts[i].vy += Math.sin(angle) * speed
      }
    }

    function pushToast(text) {
      toasts[0] = { text, life: 1 }
    }

    function igniteBurst() {
      flash = 0.55
      shake = reduce ? 0 : 10
      spark(w / 2, h / 2, 90, 9)
      scatter(8)
    }

    function triggerDrop() {
      flash = 1
      shake = reduce ? 0 : 28
      chaosBoost = 1
      paletteShift = (paletteShift + 2) % 4
      spark(w / 2, h * 0.46, 110, 13)
      spark(pointer.x, pointer.y, 70, 9)
      makeWave(w / 2, h / 2, 16, 0, 1.7)
      makeWave(pointer.x, pointer.y, 10, 1, 1.3)
      scatter(18)
      pushToast('DROP')
      rig.impact()
    }

    function detonate() {
      if (!blackhole) return
      spark(blackhole.x, blackhole.y, 130, 11)
      makeWave(blackhole.x, blackhole.y, 12, 0)
      makeWave(blackhole.x, blackhole.y, 36, 2)
      shake = Math.max(shake, reduce ? 0 : 16)
      flash = Math.max(flash, 0.5)
      blackhole = null
    }

    let blackhole = null

    function registerHit() {
      const dt = rig.now() - lastKickAt
      const onBeat = lastKickAt > 0 && dt > -0.045 && dt < 0.12
      if (onBeat) {
        combo += 1
        floaters.push({
          x: pointer.x,
          y: pointer.y - 22,
          text: combo > 1 ? `×${combo}` : 'HIT',
          life: 1,
        })
        if (combo === 8) pushToast('LOCKED IN')
        else if (combo === 16) pushToast('UNHINGED')
        else if (combo === 32) pushToast('NO SIGNAL')
        else if (combo === 64) pushToast('GONE')
      } else if (combo >= 4) {
        floaters.push({ x: pointer.x, y: pointer.y - 22, text: 'BREAK', life: 1 })
        combo = 0
      } else {
        combo = 0
      }
      if (floaters.length > 14) floaters.splice(0, floaters.length - 14)
    }

    function pointFrom(event) {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.touched = true
    }

    function onMove(event) {
      const ui = !!(event.target && event.target.closest && event.target.closest('button, input, .dock, .ignite'))
      pointer.ui = ui
      if (ui) return
      const rect = canvas.getBoundingClientRect()
      const nx = event.clientX - rect.left
      const ny = event.clientY - rect.top
      const speed = Math.hypot(nx - pointer.x, ny - pointer.y)
      pointer.x = nx
      pointer.y = ny
      pointer.touched = true
      if (api.current.live && speed > 22 && sparks.length < 280) spark(nx, ny, 1, 2.2)
    }

    function onDown(event) {
      if (!api.current.live) return
      pointFrom(event)
      if (event.button === 2) {
        pointer.repulse = true
        return
      }
      if (event.button !== 0) return
      spark(pointer.x, pointer.y, 46, 8)
      makeWave(pointer.x, pointer.y, 8, 0)
      shake = Math.max(shake, reduce ? 0 : 7)
      registerHit()
    }

    function onUp(event) {
      if (event.button === 2) pointer.repulse = false
    }

    function onDouble(event) {
      if (!api.current.live) return
      event.preventDefault()
      pointFrom(event)
      if (blackhole) detonate()
      blackhole = {
        x: pointer.x,
        y: pointer.y,
        until: performance.now() + 1300,
        dur: 1300,
      }
    }

    function onWheel(event) {
      event.preventDefault()
      const delta = Math.max(-0.06, Math.min(0.06, -event.deltaY * 0.00035))
      if (delta !== 0) onChaosRef.current?.(delta)
    }

    function onContext(event) {
      event.preventDefault()
    }

    function stepBody(p, index, dt, modeId, chaosNow, now) {
      if (blackhole) {
        const dx = blackhole.x - p.x
        const dy = blackhole.y - p.y
        const dist = Math.hypot(dx, dy) || 1
        p.vx += (dx / dist) * 1.7 * dt
        p.vy += (dy / dist) * 1.7 * dt
        p.vx += (-dy / dist) * 0.95 * dt
        p.vy += (dx / dist) * 0.95 * dt
        p.vx *= keep(0.9, dt)
        p.vy *= keep(0.9, dt)
      } else if (modeId === 'glyph' && glyphs.length) {
        const target = glyphs[index % glyphs.length]
        const pull = 0.055 + (1 - chaosNow) * 0.04
        p.vx += (target.x - p.x) * pull * dt
        p.vy += (target.y - p.y) * pull * dt
        p.vx *= keep(0.72, dt)
        p.vy *= keep(0.72, dt)
      } else if (modeId === 'orbit') {
        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const dist = Math.hypot(dx, dy) || 1
        const ring = 62 + p.seed * 200
        const radial = (ring - dist) * 0.0048
        p.vx += (-dy / dist) * (0.26 + chaosNow * 0.75) * dt + (dx / dist) * radial * dt
        p.vy += (dx / dist) * (0.26 + chaosNow * 0.75) * dt + (dy / dist) * radial * dt
        p.vx *= keep(0.955, dt)
        p.vy *= keep(0.955, dt)
      } else if (modeId === 'swarm') {
        const friend = parts[(index * 7 + 13) % parts.length]
        p.vx += (friend.vx - p.vx) * 0.05 * dt
        p.vy += (friend.vy - p.vy) * 0.05 * dt
        p.vx += (pointer.x - p.x) * 0.0015 * (1 + chaosNow) * dt
        p.vy += (pointer.y - p.y) * 0.0015 * (1 + chaosNow) * dt
        p.vx += Math.cos(now * 0.002 + p.seed * 14) * 0.14 * dt
        p.vy += Math.sin(now * 0.0017 + p.seed * 14) * 0.14 * dt
        p.vx *= keep(0.96, dt)
        p.vy *= keep(0.96, dt)
      } else if (modeId === 'magnet') {
        p.vx += (pointer.x - p.x) * (0.0032 + chaosNow * 0.0045) * dt
        p.vy += (pointer.y - p.y) * (0.0032 + chaosNow * 0.0045) * dt
        p.vx *= keep(0.84, dt)
        p.vy *= keep(0.84, dt)
      } else if (modeId === 'nova') {
        const ox = p.x - w / 2
        const oy = p.y - h / 2
        const od = Math.hypot(ox, oy) || 1
        p.vx += (ox / od) * (0.24 + chaosNow * 0.6) * dt
        p.vy += (oy / od) * (0.24 + chaosNow * 0.6) * dt
        p.vx *= keep(0.985, dt)
        p.vy *= keep(0.985, dt)
      } else {
        const angle =
          Math.sin(p.x * 0.004 + now * 0.00035) * Math.PI +
          Math.cos(p.y * 0.0036 - now * 0.00024) * Math.PI
        p.vx += Math.cos(angle) * (0.16 + chaosNow * 0.5) * dt
        p.vy += Math.sin(angle * 1.35) * (0.16 + chaosNow * 0.5) * dt
        const dx = pointer.x - p.x
        const dy = pointer.y - p.y
        const dist = Math.hypot(dx, dy) || 1
        p.vx += (dx / dist) * 0.2 * dt
        p.vy += (dy / dist) * 0.2 * dt
        p.vx *= keep(0.95, dt)
        p.vy *= keep(0.95, dt)
      }

      if (pointer.repulse) {
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const dist = Math.hypot(dx, dy) || 1
        if (dist < 250) {
          const force = ((250 - dist) / 250) * 2.8
          p.vx += (dx / dist) * force * dt
          p.vy += (dy / dist) * force * dt
        }
      }

      p.x += p.vx * dt
      p.y += p.vy * dt

      if (modeId === 'nova' && !blackhole) {
        const od = Math.hypot(p.x - w / 2, p.y - h / 2)
        if (od > Math.max(w, h) * 0.58) {
          p.x = w / 2 + (Math.random() - 0.5) * 28
          p.y = h / 2 + (Math.random() - 0.5) * 28
          p.vx = (Math.random() - 0.5) * 2
          p.vy = (Math.random() - 0.5) * 2
        }
      } else if (modeId === 'flow' && !blackhole) {
        if (p.x < 0) p.x += w
        if (p.x > w) p.x -= w
        if (p.y < 0) p.y += h
        if (p.y > h) p.y -= h
      } else if (p.x < -90 || p.x > w + 90 || p.y < -90 || p.y > h + 90) {
        p.x = pointer.x + (Math.random() - 0.5) * 180
        p.y = pointer.y + (Math.random() - 0.5) * 180
        p.vx *= 0.2
        p.vy *= 0.2
      }
    }

    function drawLinks(list, radius, color) {
      const cell = radius
      const grid = new Map()
      for (let i = 0; i < list.length; i++) {
        const key = `${Math.floor(list[i].x / cell)},${Math.floor(list[i].y / cell)}`
        let bucket = grid.get(key)
        if (!bucket) {
          bucket = []
          grid.set(key, bucket)
        }
        bucket.push(i)
      }
      ctx.beginPath()
      let drawn = 0
      for (let i = 0; i < list.length; i++) {
        const p = list[i]
        const cx = Math.floor(p.x / cell)
        const cy = Math.floor(p.y / cell)
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const bucket = grid.get(`${cx + ox},${cy + oy}`)
            if (!bucket) continue
            for (let k = 0; k < bucket.length; k++) {
              const j = bucket[k]
              if (j <= i) continue
              const q = list[j]
              const dx = p.x - q.x
              const dy = p.y - q.y
              if (dx * dx + dy * dy < radius * radius) {
                ctx.moveTo(p.x, p.y)
                ctx.lineTo(q.x, q.y)
                drawn += 1
                if (drawn > 640) {
                  ctx.strokeStyle = color
                  ctx.stroke()
                  return
                }
              }
            }
          }
        }
      }
      ctx.strokeStyle = color
      ctx.stroke()
    }

    function report(bodies) {
      const word = WORDS[wordIndex]
      if (
        currentStep === reported.step &&
        combo === reported.combo &&
        kickCount === reported.kick &&
        word === reported.word &&
        Math.abs(bodies - reported.particles) <= 30
      ) {
        return
      }
      reported = { step: currentStep, combo, kick: kickCount, word, particles: bodies }
      onStatsRef.current?.({ ...reported })
    }

    function frame(now) {
      if (dead) return
      const dt = Math.min(2, (now - last) / 16.6667)
      last = now
      const started = performance.now()
      const state = api.current
      const modeId = state.mode
      const chaosNow = Math.min(1, state.chaos + chaosBoost)
      const palette = PALETTES[state.paletteIndex % PALETTES.length].colors

      const wantMuted = !state.live || state.muted
      if (wantMuted !== mutedApplied) {
        mutedApplied = wantMuted
        rig.setMuted(wantMuted)
      }

      if (state.live && !wasLive) {
        wasLive = true
        igniteBurst()
      }
      if (!state.live) wasLive = false

      if (state.dropSignal !== appliedDrop) {
        appliedDrop = state.dropSignal
        if (appliedDrop > 0 && state.live) triggerDrop()
      }

      if (state.hue !== hueApplied) {
        hueApplied = state.hue
        canvas.style.filter = state.hue ? `hue-rotate(${state.hue}deg)` : ''
        if (state.live) pushToast(state.hueName)
      }

      const events = rig.tick()
      for (let i = 0; i < events.length; i++) {
        const ev = events[i]
        currentStep = ev.step
        stepCounter += 1
        if (ev.kick) {
          kickFlash = 1
          lastKickAt = ev.time
          kickCount += 1
          if (state.live && !reduce && pointer.touched) {
            spark(pointer.x, pointer.y, 14 + Math.floor(chaosNow * 18), 5 + chaosNow * 4)
            makeWave(pointer.x, pointer.y, 10, 0)
            if (modeId === 'glyph') scatter(chaosNow * 7)
          }
        }
        if (ev.snare) {
          kickFlash = Math.max(kickFlash, 0.55)
          paletteShift = (paletteShift + 1) % palette.length
          if (state.live) makeWave(w * 0.5, h * 0.46, 20, 1)
        } else if (ev.hat) {
          kickFlash = Math.max(kickFlash, 0.16)
        }
        if (modeId === 'glyph' && state.live && stepCounter % 64 === 0) {
          wordIndex = (wordIndex + 1) % WORDS.length
          glyphKey = ''
          scatter(16)
        }
      }

      if (blackhole && now > blackhole.until) detonate()

      if (w < 2) resize()
      ensurePopulation()
      refreshGlyphs()

      for (let i = 0; i < parts.length; i++) stepBody(parts[i], i, dt, modeId, chaosNow, now)

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        if (blackhole) {
          const dx = blackhole.x - s.x
          const dy = blackhole.y - s.y
          const dist = Math.hypot(dx, dy) || 1
          s.vx += (dx / dist) * 1.3 * dt
          s.vy += (dy / dist) * 1.3 * dt
        }
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vx *= keep(0.985, dt)
        s.vy *= keep(0.985, dt)
        s.life -= s.decay * dt
        if (s.life <= 0) sparks.splice(i, 1)
      }

      chaosBoost *= keep(0.992, dt)
      if (chaosBoost < 0.01) chaosBoost = 0
      kickFlash *= keep(0.86, dt)
      shake *= keep(0.86, dt)
      flash *= keep(0.84, dt)

      const fade = reduce
        ? 0.62
        : modeId === 'glyph'
          ? 0.4
          : modeId === 'flow'
            ? 0.18
            : modeId === 'nova'
              ? 0.24
              : 0.28

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = primed ? `rgba(7, 6, 11, ${fade})` : '#07060b'
      primed = true
      ctx.fillRect(0, 0, w, h)

      const px = (pointer.x - w / 2) / w
      const py = (pointer.y - h / 2) / h
      for (let i = 0; i < dust.length; i++) {
        const speck = dust[i]
        ctx.globalAlpha = speck.a
        ctx.fillStyle = speck.z > 0.86 ? palette[1] : '#f4efe6'
        ctx.fillRect(speck.x * w - px * speck.z * 26, speck.y * h - py * speck.z * 18, speck.s, speck.s)
      }

      ctx.save()
      if (!reduce) {
        const zoom = 1 + kickFlash * 0.032
        ctx.translate(w / 2 + (Math.random() - 0.5) * shake, h / 2 + (Math.random() - 0.5) * shake)
        ctx.scale(zoom, zoom)
        ctx.translate(-w / 2, -h / 2)
      }

      ctx.globalCompositeOperation = 'lighter'
      if (allowLinks && modeId !== 'glyph' && !reduce) {
        ctx.globalAlpha = 0.22
        ctx.lineWidth = 1
        drawLinks(parts, modeId === 'nova' ? 52 : 74, palette[1])
      }

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        const size = (modeId === 'glyph' ? 1.75 : p.size) * (1 + kickFlash * (modeId === 'glyph' ? 0.15 : 0.7))
        const col =
          modeId === 'glyph'
            ? palette[(i + paletteShift) % 2]
            : palette[(p.ci + paletteShift) % palette.length]
        if (modeId !== 'glyph' && chaosNow > 0.4) {
          ctx.globalAlpha = 0.25
          ctx.fillStyle = palette[(p.ci + paletteShift + 1) % palette.length]
          ctx.fillRect(p.x + 2 + chaosNow * 2, p.y, size, size)
        }
        ctx.globalAlpha = modeId === 'glyph' ? 0.95 : 0.78
        ctx.fillStyle = col
        if (p.seed > 0.88 && modeId !== 'glyph') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.seed * 6 + now * 0.001)
          ctx.fillRect(-size, -size, size * 2, size * 2)
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i]
        ctx.globalAlpha = Math.max(0, s.life)
        ctx.fillStyle = palette[(s.ci + paletteShift) % palette.length]
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2)
        ctx.fill()
      }

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i]
        sw.r += sw.vr * dt
        sw.life -= 0.034 * dt
        if (sw.life <= 0) {
          shockwaves.splice(i, 1)
          continue
        }
        ctx.globalAlpha = Math.max(0, sw.life) * 0.85
        ctx.strokeStyle = palette[sw.ci % palette.length]
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (blackhole) {
        const age = 1 - Math.max(0, blackhole.until - now) / blackhole.dur
        const radius = 14 + age * 30
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.fillStyle = '#020108'
        ctx.beginPath()
        ctx.arc(blackhole.x, blackhole.y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'lighter'
        ctx.lineWidth = 1.6
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = palette[0]
        ctx.beginPath()
        ctx.arc(blackhole.x, blackhole.y, radius + 7, now * 0.004, now * 0.004 + 4.2)
        ctx.stroke()
        ctx.strokeStyle = palette[1]
        ctx.beginPath()
        ctx.arc(blackhole.x, blackhole.y, radius + 14, -now * 0.005, -now * 0.005 + 3.4)
        ctx.stroke()
      }

      ctx.restore()

      if (flash > 0.02) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = Math.min(0.75, flash * 0.55)
        ctx.fillStyle = '#f4efe6'
        ctx.fillRect(0, 0, w, h)
      }

      ctx.globalCompositeOperation = 'source-over'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '500 13px "IBM Plex Mono", monospace'
      for (let i = floaters.length - 1; i >= 0; i--) {
        const floater = floaters[i]
        ctx.globalAlpha = Math.max(0, floater.life)
        ctx.fillStyle = '#f4efe6'
        ctx.fillText(floater.text, floater.x, floater.y)
        floater.y -= 0.7 * dt
        floater.life -= 0.02 * dt
        if (floater.life <= 0) floaters.splice(i, 1)
      }

      if (toasts[0]) {
        const toast = toasts[0]
        ctx.globalAlpha = Math.max(0, Math.min(1, toast.life * 1.3))
        ctx.fillStyle = '#f4efe6'
        ctx.font = `800 ${Math.min(92, w * 0.09)}px Syne, sans-serif`
        ctx.fillText(toast.text, w / 2, h * 0.58)
        toast.life -= 0.012 * dt
        if (toast.life <= 0) toasts.length = 0
      }

      if (state.live && pointer.touched && !pointer.ui) {
        ctx.save()
        ctx.translate(pointer.x, pointer.y)
        ctx.rotate(now * 0.0012)
        ctx.strokeStyle = palette[0]
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 1
        const radius = 15 + kickFlash * 14
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2
          ctx.moveTo(Math.cos(angle) * (radius + 4), Math.sin(angle) * (radius + 4))
          ctx.lineTo(Math.cos(angle) * (radius + 11), Math.sin(angle) * (radius + 11))
        }
        ctx.stroke()
        ctx.restore()
      }

      if (!reduce && chaosNow > 0.78 && Math.random() < 0.1) {
        const y = Math.floor(Math.random() * canvas.height)
        const sliceH = Math.max(1, Math.floor((2 + Math.random() * 12) * dpr))
        if (y + sliceH < canvas.height) {
          const slice = ctx.getImageData(0, y, canvas.width, sliceH)
          const dx = Math.floor((Math.random() - 0.5) * 36 * chaosNow * dpr)
          ctx.putImageData(slice, dx, y)
        }
      }

      ctx.globalAlpha = 1
      report(parts.length + sparks.length)
      allowLinks = performance.now() - started < 13
      raf = requestAnimationFrame(frame)
    }

    resize()
    ensurePopulation()
    makeDust()
    document.fonts?.load?.('800 120px Syne')
    document.fonts?.ready?.then(() => {
      if (!dead) glyphKey = ''
    })

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('dblclick', onDouble)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContext)
    const observer = new ResizeObserver(() => resize())
    observer.observe(canvas)
    raf = requestAnimationFrame(frame)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('dblclick', onDouble)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      canvas.style.filter = ''
      rig.close()
      rigRef.current = null
    }
  }, [])

  return <canvas ref={canvasRef} aria-label="Generative particle field. Click, drag, and play the kicks." />
}
