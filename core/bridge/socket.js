import net from 'net'
import { EventEmitter } from 'events'

class ArgusBridge extends EventEmitter {
  constructor() {
    super()
    this.server = null
    this.client = null
    this.buffer = ''
    this.ready = false
  }

  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        console.log('[bridge] Python connected')
        this.client = socket
        this.ready = true

        socket.on('data', (data) => {
          this.buffer += data.toString()
          const lines = this.buffer.split('\n')
          this.buffer = lines.pop()

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const message = JSON.parse(line)
              if (message.type) {
                this.emit(message.type, message)
              }
            } catch (err) {
              console.error('[bridge] Failed to parse message:', line)
            }
          }
        })

        socket.on('close', () => {
          console.log('[bridge] Python disconnected')
          this.client = null
          this.ready = false
        })

        socket.on('error', (err) => {
          console.error('[bridge] Socket error:', err.message)
        })
      })

      const PORT = 5001
      this.server.listen(PORT, '127.0.0.1', () => {
        console.log(`[bridge] Socket ready at 127.0.0.1:${PORT}`)
        resolve()
      })

      this.server.on('error', (err) => {
        console.error('[bridge] Server error:', err.message)
      })
    })
  }

  send(message) {
    if (!this.client || !this.ready) {
      console.warn('[bridge] Cannot send — Python not connected yet')
      return
    }
    try {
      this.client.write(JSON.stringify(message) + '\n')
    } catch (err) {
      console.error('[bridge] Failed to send message:', err.message)
    }
  }

  close() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.destroy()
        this.client = null
      }
      if (this.server) {
        this.server.close(() => {
          console.log('[bridge] Bridge stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

export const bridge = new ArgusBridge()