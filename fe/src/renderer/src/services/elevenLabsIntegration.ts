/**
 * Eleven Labs WebSocket Integration
 *
 * This module provides helper functions to send audio data to Eleven Labs
 * using their recommended format: PCM 16-bit, 16kHz, mono
 *
 * Reference: https://elevenlabs.io/docs/api-reference/websockets
 */

export interface ElevenLabsConfig {
  apiKey: string
  voiceId?: string
  modelId?: string
}

/**
 * Converts Int16Array PCM data to base64 string for transmission
 */
export function pcmToBase64(pcmData: Int16Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2)
  const view = new DataView(buffer)

  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(i * 2, pcmData[i], true) // true = little-endian
  }

  const uint8Array = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i])
  }

  return btoa(binary)
}

/**
 * Example function to send audio to Eleven Labs WebSocket
 * This is a placeholder - you'll need to implement the actual WebSocket connection
 */
export async function sendToElevenLabs(
  pcmData: Int16Array,
  source: 'mic' | 'system',
  config: ElevenLabsConfig
): Promise<void> {
  // Convert PCM to base64
  const audioBase64 = pcmToBase64(pcmData)

  // Example payload structure for Eleven Labs
  const payload = {
    text: '', // For conversational AI, this might be empty
    audio: audioBase64,
    model_id: config.modelId || 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5
    }
  }

  console.log(`[${source}] Sending ${pcmData.length} samples to Eleven Labs`, payload)

  // TODO: Implement actual WebSocket or HTTP API call
  // For WebSocket: wss://api.elevenlabs.io/v1/...
  // For HTTP: https://api.elevenlabs.io/v1/...

  // Example WebSocket connection (pseudo-code):
  /*
  const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`)

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'audio',
      audio: audioBase64,
      format: 'pcm_16000'
    }))
  }

  ws.onmessage = (event) => {
    const response = JSON.parse(event.data)
    // Handle AI response
  }
  */
}

/**
 * Buffer manager for collecting audio chunks before sending
 * Useful for batching small audio chunks into larger ones
 */
export class AudioBuffer {
  private buffer: Int16Array[] = []
  private maxChunks: number

  constructor(maxChunks = 10) {
    this.maxChunks = maxChunks
  }

  add(chunk: Int16Array): Int16Array | null {
    this.buffer.push(chunk)

    if (this.buffer.length >= this.maxChunks) {
      return this.flush()
    }

    return null
  }

  flush(): Int16Array | null {
    if (this.buffer.length === 0) return null

    const totalLength = this.buffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Int16Array(totalLength)

    let offset = 0
    for (const chunk of this.buffer) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    this.buffer = []
    return combined
  }

  clear(): void {
    this.buffer = []
  }
}
