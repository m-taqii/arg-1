import net from 'net'
import fs from 'fs'
import { EventEmitter } from 'events'

const SOCKET_PATH = '/tmp/argus.sock'

class ArgusBridge extends EventEmitter {
  constructor() {
    super()
    this.server = null
    this.client = null       // Active connection from the external process
    this.buffer = ''         // Accumulates data for partial message handling
    this.ready = false
  }

  // Initializes the Unix Socket server and handles incoming connections
  start() {
    return new Promise((resolve) => {

      if (fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH)
      }

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
              this._route(message)
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

      this.server.listen(SOCKET_PATH, () => {
        console.log(`[bridge] Socket ready at ${SOCKET_PATH}`)
        resolve()
      })

      this.server.on('error', (err) => {
        console.error('[bridge] Server error:', err.message)
      })
    })
  }


// Emits internal events based on the message type received from the socket
  _route(message) {
    if (message.type) {
      this.emit(message.type, message)
    }
  }

  // send a message to Python
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

  // Gracefully shuts down the server and removes the socket file
  close() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.destroy()
        this.client = null
      }
      if (this.server) {
        this.server.close(() => {
          if (fs.existsSync(SOCKET_PATH)) {
            fs.unlinkSync(SOCKET_PATH)
          }
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