/**
 * ElevenLabs Realtime STT WebSocket Integration
 * Connects to ElevenLabs WebSocket and handles audio streaming and transcript events
 */

export interface TranscriptEvent {
  type: 'partial_transcript' | 'committed_transcript' | 'committed_transcript_with_timestamps'
  text: string
  words?: Array<{
    word: string
    start: number
    end: number
  }>
}

export interface ElevenLabsWebSocketCallbacks {
  onPartialTranscript?: (text: string) => void
  onCommittedTranscript?: (text: string) => void
  onCommittedTranscriptWithTimestamps?: (
    text: string,
    words: Array<{ word: string; start: number; end: number }>
  ) => void
  onError?: (error: Error) => void
  onClose?: () => void
}

export class ElevenLabsWebSocket {
  private ws: WebSocket | null = null
  private callbacks: ElevenLabsWebSocketCallbacks = {}
  private isConnected = false

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
  async connect(token: string, callbacks: ElevenLabsWebSocketCallbacks = {}): Promise<void> {
    if (this.isConnected && this.ws) {
      console.warn('WebSocket already connected')
      return
    }

    this.callbacks = callbacks

    // Build WebSocket URL with query parameters
    const params = new URLSearchParams({
      model_id: 'scribe_v2_realtime',
      token: token,
      commit_strategy: 'vad',
      include_timestamps: 'true',
      audio_format: 'pcm_16000'
    })

    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`
    console.log('Connecting to ElevenLabs WebSocket:', wsUrl.replace(token, 'TOKEN_HIDDEN'))

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('ElevenLabs WebSocket connected')
          this.isConnected = true
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          const wsError = new Error('WebSocket connection error')
          this.callbacks.onError?.(wsError)
          reject(wsError)
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason)
          this.isConnected = false
          this.ws = null
          this.callbacks.onClose?.()
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Failed to create WebSocket')
        this.callbacks.onError?.(err)
        reject(err)
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(data: any): Promise<void> {
    // Handle different message typesata
    if (data.message_type) {
      switch (data.message_type) {
        case 'session_started':
          console.log('ElevenLabs session started:', data.session_id)
          break

        case 'partial_transcript':
          if (data.text && this.callbacks.onPartialTranscript) {
            this.callbacks.onPartialTranscript(data.text)
          }
          break

        case 'committed_transcript':
          if (data.text && this.callbacks.onCommittedTranscript) {
            console.log('Committed transcript:', data.text)
            // TODO replace hardcoded localhost:3000 with process.env.BACKEND_URL
            const response = await fetch(`http://localhost:3000/agent/run`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ transcript: data.text })
            })
            // log response code from backend
            console.log('Backend response code:', response.status)
            this.callbacks.onCommittedTranscript(data.text)
          }
          break

        case 'committed_transcript_with_timestamps':
          if (data.text && this.callbacks.onCommittedTranscriptWithTimestamps) {
            this.callbacks.onCommittedTranscriptWithTimestamps(data.text, data.words || [])
          }
          break

        case 'input_error':
          console.error('ElevenLabs input error:', data.error)
          this.callbacks.onError?.(new Error(data.error || 'Input error'))
          break

        default:
          console.log('Unknown message_type:', data.message_type, data)
      }
    } else if (data.type) {
      // Handle legacy format with 'type' field
      switch (data.type) {
        case 'partial_transcript':
          if (data.text && this.callbacks.onPartialTranscript) {
            this.callbacks.onPartialTranscript(data.text)
          }
          break

        case 'committed_transcript':
          if (data.text && this.callbacks.onCommittedTranscript) {
            this.callbacks.onCommittedTranscript(data.text)
          }
          break

        case 'committed_transcript_with_timestamps':
          if (data.text && this.callbacks.onCommittedTranscriptWithTimestamps) {
            this.callbacks.onCommittedTranscriptWithTimestamps(data.text, data.words || [])
          }
          break

        default:
          console.log('Unknown message type:', data.type, data)
      }
    } else {
      console.log('Unknown message format:', data)
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
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Failed to send audio'))
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  /**
   * Check if WebSocket is connected
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }
}
