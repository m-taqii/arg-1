import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PERSONA_PATH = path.join(__dirname, 'persona.json')

const DEFAULT_PERSONA = {
  user: {
    name: null,
    doing: [],           // what they're working on / their life context
    deadlines: [],       // current important deadlines
    goals: [],           // bigger picture ambitions
    workStyle: null,     // how they describe their own work style
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },

  // argus observes and fills these over time — never asked directly
  patterns: {
    productiveHours: [],        // e.g. ["22:00-02:00"]
    distractionTriggers: [],    // apps or times that lead to spiraling
    peakFocusApp: null,         // app where best work happens
    averageSessionMinutes: null,
    typicalIdleReason: null,    // "steps away often" / "gets stuck in editor"
  },

  // user preferences — set during onboarding, user can edit persona.json directly
  preferences: {
    tone: null,                      // "direct" | "friendly" | "brutal"
    interruptionSensitivity: 'medium', // "low" | "medium" | "high"
    wakeWords: ['hey argus'],
    sleepWords: ['argus rest now'],
    language: 'en',
  },

  // argus writes these — internal tracking, user should not edit
  memory: {
    firstSeen: null,
    totalSessions: 0,
    lastSession: null,
    notes: [],    // things argus wants to remember: ["always works late before deadlines"]
  },
}

export function loadPersona() {
  if (!fs.existsSync(PERSONA_PATH)) {
    return null
  }

  try {
    const raw = fs.readFileSync(PERSONA_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return deepMerge(DEFAULT_PERSONA, parsed)
  } catch (err) {
    console.error('[persona] Failed to read persona.json:', err.message)
    return null
  }
}

export function savePersona(persona) {
  try {
    fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2), 'utf-8')
    console.log('[persona] Saved')
  } catch (err) {
    console.error('[persona] Failed to save:', err.message)
  }
}

export function updatePersona(key, value) {
  const persona = loadPersona()
  if (!persona) {
    console.warn('[persona] Cannot update — no persona found')
    return
  }

  const keys = key.split('.')
  let target = persona
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) target[keys[i]] = {}
    target = target[keys[i]]
  }
  target[keys[keys.length - 1]] = value

  savePersona(persona)
}

export function addNote(note) {
  const persona = loadPersona()
  if (!persona) return

  const entry = {
    note,
    observedAt: new Date().toISOString(),
  }

  persona.memory.notes.push(entry)

  if (persona.memory.notes.length > 20) {
    persona.memory.notes = persona.memory.notes.slice(-20)
  }

  savePersona(persona)
}

export function incrementSession(persona) {
  persona.memory.totalSessions += 1
  persona.memory.lastSession = new Date().toISOString()
  if (!persona.memory.firstSeen) {
    persona.memory.firstSeen = new Date().toISOString()
  }
  savePersona(persona)
  return persona
}

export function freshPersona() {
  return JSON.parse(JSON.stringify(DEFAULT_PERSONA))
}

function deepMerge(source, target) {
  const result = { ...source }
  for (const key of Object.keys(target)) {
    if (
      target[key] !== null &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(source[key] || {}, target[key])
    } else {
      result[key] = target[key]
    }
  }
  return result
}