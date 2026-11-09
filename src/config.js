export const MODES = [
  { id: 'glyph', label: 'GLYPH', hint: 'letters that panic' },
  { id: 'orbit', label: 'ORBIT', hint: 'rings locked to you' },
  { id: 'swarm', label: 'SWARM', hint: 'they decided to follow' },
  { id: 'magnet', label: 'MAGNET', hint: 'too close on purpose' },
  { id: 'nova', label: 'NOVA', hint: 'born already exploding' },
  { id: 'flow', label: 'FLOW', hint: 'weather from nowhere' },
]

export const PALETTES = [
  { name: 'RAVE', colors: ['#ff2bd6', '#3dfff2', '#d6ff3f', '#f4efe6'] },
  { name: 'SOLAR', colors: ['#ff4d2e', '#ffd23f', '#fff1d6', '#ff8bd2'] },
  { name: 'VOID', colors: ['#7c5cff', '#5ce1ff', '#ff4fd8', '#f4efe6'] },
  { name: 'TOXIC', colors: ['#39ff14', '#d6ff3f', '#14f1ff', '#f4efe6'] },
  { name: 'EMBER', colors: ['#ff5c33', '#ffe14a', '#ff2d55', '#fff4d6'] },
]

export const WORDS = ['MAYHEM', 'CHAOS', 'FERAL', 'VOID', 'BLOOM', 'GHOST']

export const PATTERN = {
  bpm: 128,
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function realityName(value) {
  if (value < 0.2) return 'STILL'
  if (value < 0.45) return 'WARM'
  if (value < 0.7) return 'LOUD'
  if (value < 0.9) return 'FERAL'
  return 'UNTETHERED'
}
