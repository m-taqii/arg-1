import { spawn } from 'child_process'
import { createReadStream, existsSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'os'
import { freshPersona, savePersona } from './persona.js'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
})

const QUESTIONS = [
  {
    key: 'user.name',
    ask: "Hey. I'm Argus. Before we start, I need to know a bit about you. What's your name?",
    process: (answer) => answer.trim(),
  },
  {
    key: 'user.doing',
    ask: (persona) =>
      `Good to meet you, ${persona.user.name}. What are you working on these days — give me the short version.`,
    process: (answer) =>
      answer
        .split(/,|and/)
        .map((s) => s.trim())
        .filter(Boolean),
  },
  {
    key: 'user.deadlines',
    ask: "What's the most important thing you need to finish right now?",
    process: (answer) => [answer.trim()],
  },
  {
    key: 'preferences.tone',
    ask: "How do you want me to talk to you — straight up and direct, friendly and relaxed, or completely brutal with no filter?",
    process: (answer) => {
      const a = answer.toLowerCase()
      if (a.includes('brutal')) return 'brutal'
      if (a.includes('friendly') || a.includes('relax')) return 'friendly'
      return 'direct'   // default
    },
  },
  {
    key: 'user.workStyle',
    ask: "Last one. Anything I should know about how you work? Like when you're most focused, or what throws you off.",
    process: (answer) => answer.trim(),
  },
]

function speakAndWait(text) {
  return new Promise((resolve, reject) => {
    const venvPath = os.platform() === 'win32' 
      ? path.join(process.cwd(), 'venv', 'Scripts', 'python.exe')
      : path.join(process.cwd(), 'venv', 'bin', 'python')

    const pythonCmd = existsSync(venvPath) ? venvPath : (os.platform() === 'win32' ? 'python' : 'python3')
    
    const py = spawn(pythonCmd, ['voice/speak.py', text], {
      stdio: 'inherit',
    })
    py.on('close', resolve)
    py.on('error', reject)
  })
}

function listen(durationMs = 7000) {
  return new Promise((resolve, reject) => {
    const audioPath = path.join(process.cwd(), 'onboard_recording.wav')
    
    if (existsSync(audioPath)) {
      unlinkSync(audioPath)
    }

    console.log('[onboarding] Listening (via FFmpeg)...')

    let format, device
    if (os.platform() === 'win32') {
      format = 'dshow'
      // Targeted device name for this specific Windows system
      device = 'audio=Microphone (High Definition Audio Device)' 
    } else if (os.platform() === 'darwin') {
      format = 'avfoundation'
      device = ':0'
    } else {
      format = 'alsa'
      device = 'default'
    }

    const rec = spawn('ffmpeg', [
      '-y',
      '-f', format,
      '-i', device,
      '-t', `${durationMs / 1000}`,
      audioPath
    ], { stdio: 'inherit' })

    rec.on('error', (err) => {
      reject(new Error(`FFmpeg launch failed: ${err.message}`))
    })

    rec.on('close', async (code) => {
      // code 0 means success
      if (code !== 0 && code !== null) {
        return reject(new Error(`FFmpeg recording failed with exit code ${code}`))
      }
      
      try {
        if (!existsSync(audioPath)) {
          return reject(new Error(`Recording file missing: ${audioPath}`))
        }

        console.log('[onboarding] Transcribing...')

        const response = await openai.audio.transcriptions.create({
          file: createReadStream(audioPath),
          model: 'whisper-large-v3-turbo',
        })
        resolve(response.text)
      } catch (err) {
        reject(new Error(`Transcription failed: ${err.message}`))
      }
    })
  })
}

function setNestedKey(obj, key, value) {
  const keys = key.split('.')
  let target = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) target[keys[i]] = {}
    target = target[keys[i]]
  }
  target[keys[keys.length - 1]] = value
}

export async function runOnboarding() {
  console.log('[onboarding] Starting Argus setup...')

  const persona = freshPersona()

  for (const question of QUESTIONS) {
    const text = typeof question.ask === 'function' ? question.ask(persona) : question.ask

    try {
      await speakAndWait(text)
      await new Promise((r) => setTimeout(r, 800))
      
      const answer = await listen(7000)
      console.log(`[onboarding] Heard: "${answer}"`)

      const processed = question.process(answer)
      setNestedKey(persona, question.key, processed)

    } catch (err) {
      console.error(`[onboarding] Step failed: ${err.message}`)
    }
  }

  const name = persona.user.name || 'friend'
  await speakAndWait(`All set, ${name}. I'm ready to watch.`)

  persona.memory.firstSeen = new Date().toISOString()
  savePersona(persona)

  return persona
}