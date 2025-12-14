/**
 * ElevenLabs Realtime STT WebSocket Integration
 * Connects to ElevenLabs WebSocket and handles audio streaming and transcript events
 */

export interface TranscriptEvent {
  type: 'partial_transcript' | 'committed_transcript'
  text: string
}

export type AudioSource = 'mic' | 'system'

export interface ElevenLabsWebSocketCallbacks {
  onPartialTranscript?: (text: string, source: AudioSource) => void
  onCommittedTranscript?: (text: string, source: AudioSource) => void
  onError?: (error: Error, source: AudioSource) => void
  onClose?: (source: AudioSource) => void
}

export class ElevenLabsWebSocket {
  private ws: WebSocket | null = null
  private callbacks: ElevenLabsWebSocketCallbacks = {}
  private isConnected = false
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null
  private silentChunk: Int16Array | null = null

  /**
   * Create a silent audio chunk for keepalive
   */
  private createSilentChunk(): Int16Array {
    // Create 100ms of silence at 16kHz (1600 samples)
    return new Int16Array(1600).fill(0)
  }
  private source: AudioSource = 'mic'

  /**
   * Convert PCM Int16Array to base64 string
   */
  private pcmToBase64(pcmData: Int16Array): string {
    // Convert Int16Array to Uint8Array (little-endian)
    const uint8Array = new Uint8Array(pcmData.length * 2)
    const dataView = new DataView(uint8Array.buffer)

    for (let i = 0; i < pcmData.length; i++) {
      dataView.setInt16(i * 2, pcmData[i], true) // true = little-endian
    }

    // Convert to base64
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    return btoa(binary)
  }

  /**
   * Connect to ElevenLabs Realtime STT WebSocket
   */
  async connect(token: string, source: AudioSource, callbacks: ElevenLabsWebSocketCallbacks = {}): Promise<void> {
    if (this.isConnected && this.ws) {
      console.warn('WebSocket already connected')
      return
    }

    this.callbacks = callbacks
    this.source = source

    // Build WebSocket URL with query parameters
    const params = new URLSearchParams({
      model_id: 'scribe_v2_realtime',
      token: token,
      commit_strategy: 'vad',
      audio_format: 'pcm_16000',
      vad_silence_threshold_secs: '1.5' // Commit after 0.3 seconds of silence (faster response)
    })

    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`
    console.log(`Connecting to ElevenLabs WebSocket (${source}):`, wsUrl.replace(token, 'TOKEN_HIDDEN'))

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log(`ElevenLabs WebSocket connected (${this.source})`)
          this.isConnected = true
          this.startKeepalive()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error(`Error parsing WebSocket message (${this.source}):`, error)
          }
        }

        this.ws.onerror = (error) => {
          console.error(`WebSocket error (${this.source}):`, error)
          const wsError = new Error('WebSocket connection error')
          this.callbacks.onError?.(wsError, this.source)
          reject(wsError)
        }

        this.ws.onclose = (event) => {
          console.log(`WebSocket closed (${this.source}):`, event.code, event.reason)
          this.stopKeepalive()
          this.isConnected = false
          this.ws = null
          this.silentChunk = null
          this.callbacks.onClose?.(this.source)
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to create WebSocket')
        this.callbacks.onError?.(err, this.source)
        reject(err)
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(data: any): Promise<void> {
    // Handle different message types
    if (data.message_type) {
      switch (data.message_type) {
        case 'session_started':
          console.log(`ElevenLabs session started (${this.source}):`, data.session_id)
          break

        case 'partial_transcript':
          if (data.text && this.callbacks.onPartialTranscript) {
            this.callbacks.onPartialTranscript(data.text, this.source)
          }
          break

        case 'committed_transcript':
          if (data.text && this.callbacks.onCommittedTranscript) {
            console.log(`Committed transcript (${this.source}):`, data.text)
            // TODO replace hardcoded localhost:3000 with process.env.BACKEND_URL
            const response = await fetch(`http://localhost:3000/agent/run`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ transcript: data.text, source: this.source })
            })
            // log response code from backend
            console.log('Backend response code:', response.status)
            this.callbacks.onCommittedTranscript(data.text, this.source)
          }
          break

        case 'input_error':
          console.error(`ElevenLabs input error (${this.source}):`, data.error)
          this.callbacks.onError?.(new Error(data.error || 'Input error'), this.source)
          break

        default:
          console.log(`Unknown message_type (${this.source}):`, data.message_type, data)
      }
    } else if (data.type) {
      // Handle legacy format with 'type' field
      switch (data.type) {
        case 'partial_transcript':
          if (data.text && this.callbacks.onPartialTranscript) {
            this.callbacks.onPartialTranscript(data.text, this.source)
          }
          break

        case 'committed_transcript':
          if (data.text && this.callbacks.onCommittedTranscript) {
            this.callbacks.onCommittedTranscript(data.text, this.source)
          }
          break

        default:
          console.log(`Unknown message type (${this.source}):`, data.type, data)
      }
    } else {
      console.log(`Unknown message format (${this.source}):`, data)
    }
  }

  /**
   * Start sending keepalive silent audio chunks every 5 seconds
   */
  private startKeepalive(): void {
    // Clear any existing interval
    this.stopKeepalive()

    // Create silent chunk once
    this.silentChunk = this.createSilentChunk()

    // Send silent audio every 5 seconds to keep connection alive
    this.keepaliveInterval = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        console.log('Sending keepalive silent chunk')
        this.sendAudioChunk(this.silentChunk!)
      }
    }, 5000) // Every 5 seconds
  }

  /**
   * Stop sending keepalive chunks
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval)
      this.keepaliveInterval = null
    }
  }

  /**
   * Send audio chunk to ElevenLabs
   */
  sendAudioChunk(pcmData: Int16Array): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send audio')
      return
    }

    try {
      const audioBase64 = this.pcmToBase64(pcmData)
      // ElevenLabs Realtime STT API format
      const message = {
        message_type: 'input_audio_chunk',
        audio_base_64: audioBase64,
        commit: false, // VAD will handle commits automatically
        sample_rate: 16000
      }
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Error sending audio chunk:', error)
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Failed to send audio'), this.source)
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopKeepalive()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.silentChunk = null
  }

  /**
   * Check if WebSocket is connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }
}
