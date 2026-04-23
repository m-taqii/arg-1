import 'dotenv/config'
import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { bridge } from './bridge/socket.js'
import { captureScreen } from './screen/capture.js'
import { hasScreenChanged } from './screen/diff.js'
import { getActiveApp } from './screen/appContext.js'
import { loadPersona, incrementSession } from '../config/persona.js'
import { runOnboarding } from '../config/onboarding.js'
import { decide } from './screen/decide.js'

let persona;

function getPythonCmd() {
  const venvPath = os.platform() === 'win32' 
    ? path.join(process.cwd(), 'venv', 'Scripts', 'python.exe')
    : path.join(process.cwd(), 'venv', 'bin', 'python')

  if (fs.existsSync(venvPath)) return venvPath
  return os.platform() === 'win32' ? 'python' : 'python3'
}

const state = {
  active: false,
  isWakeWord: false,
  speechText: "",
  screen: {
    currentApp: null,
    previousApp: null,
    lastContext: null,
    idleSeconds: 0,
    lastChangedAt: null,
  },

  session: {
    startedAt: null,
    distractionCount: 0,
  },
}

const WATCH_INTERVAL_MS = parseInt(process.env.WATCH_INTERVAL_MS) || 15000
let watchInterval = null

async function tick() {
  try {
    const screenshot = await captureScreen() 
    const app = await getActiveApp()
    
    const currentContext = {
      screenshot: screenshot.buffer,
      hash: screenshot.hash,
      app: app
    }

    const previousContext = state.screen.lastContext || null

    const diffData = await hasScreenChanged(currentContext, previousContext)

    await decide(diffData, currentContext, state, persona)

    state.screen.lastContext = currentContext
    if (diffData.isChanged) {
      state.screen.lastChangedAt = Date.now()
      state.screen.idleSeconds = 0
    } else {
      state.screen.idleSeconds += WATCH_INTERVAL_MS / 1000
    }

  } catch (err) {
    console.error('[watch] Tick error:', err.message)
  }
}

function startWatchLoop() {
  if (watchInterval) return
  state.session.startedAt = Date.now()
  console.log('[argus] Watch loop started')
  watchInterval = setInterval(tick, WATCH_INTERVAL_MS)
}

function stopWatchLoop() {
  if (!watchInterval) return
  clearInterval(watchInterval)
  watchInterval = null
  console.log('[argus] Watch loop stopped')
}

export function speak(text) {
  spawn(getPythonCmd(), ['voice/speak.py', text], {
    stdio: 'inherit',
  })
}

// wake handlers 
function onWake() {
  state.isWakeWord = true;

  if (state.active) {
    console.log('[argus] Wake word heard again. Forcing check.')
    return
  }
  
  state.active = true
  console.log('[argus] Awake')
  const name = persona?.user?.name || 'there'
  speak(`Hey ${name}. I'm watching.`)
  startWatchLoop()
}

function onSleep() {
  if (!state.active) {
    console.log('[argus] Already sleeping')
    return
  }
  state.active = false
  console.log('[argus] Going to sleep')
  speak('Resting now.')
  stopWatchLoop()
}

// python process 
function spawnPython() {
  console.log('[argus] Spawning wake.py...')
  const py = spawn(getPythonCmd(), ['voice/wake.py'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  py.on('close', (code) => {
    console.error(`[argus] wake.py exited with code ${code}`)
    if (state.active) {
      console.error('[argus] Lost wake word detection while active — restarting...')
      setTimeout(spawnPython, 2000)
    }
  })

  py.on('error', (err) => {
    console.error('[argus] Failed to spawn wake.py:', err.message)
  })
}

async function shutdown() {
  console.log('\n[argus] Shutting down...')

  stopWatchLoop()
  bridge.send({ type: 'sleep' })
  await bridge.close()

  console.log('[argus] Goodbye.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function boot() {
  console.log('-'.repeat(33))
  console.log(' ◈ Argus — always watching')
  console.log('-'.repeat(33))

  persona = loadPersona()
  if (!persona) {
    persona = await runOnboarding()
  }
  persona = incrementSession(persona)

  await bridge.start()

  bridge.on('wake', onWake)
  bridge.on('sleep', onSleep)

  spawnPython()

  console.log(`[argus] Ready (Say "Hey Jarvis" to wake me). I am now watching your screen, ${persona.user.name}.`)
  startWatchLoop()
}

boot()