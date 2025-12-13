export interface AudioCaptureConfig {
  sampleRate: number
  channelCount: number
}

export interface AudioData {
  buffer: Int16Array
  timestamp: number
}

export class AudioCapture {
  private audioContext: AudioContext | null = null
  private micStream: MediaStream | null = null
  private systemStream: MediaStream | null = null
  private micProcessor: ScriptProcessorNode | null = null
  private systemProcessor: ScriptProcessorNode | null = null
  private isCapturing = false
  private onAudioDataCallback: ((data: AudioData, source: 'mic' | 'system') => void) | null = null

  constructor(private config: AudioCaptureConfig = { sampleRate: 16000, channelCount: 1 }) {}

  async start(onAudioData: (data: AudioData, source: 'mic' | 'system') => void): Promise<void> {
    if (this.isCapturing) {
      console.warn('Audio capture already running')
      return
    }

    this.onAudioDataCallback = onAudioData
    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate })

    try {
      // Capture microphone audio
      await this.startMicrophoneCapture()

      // Attempt to capture system audio (tab/speaker audio)
      await this.startSystemAudioCapture()

      this.isCapturing = true
      console.log('Audio capture started successfully')
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      await this.stop()
      throw error
    }
  }

  private async startMicrophoneCapture(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: this.config.sampleRate
        }
      })

      const micSource = this.audioContext!.createMediaStreamSource(this.micStream)
      this.micProcessor = this.audioContext!.createScriptProcessor(4096, 1, 1)

      this.micProcessor.onaudioprocess = (e) => {
        if (this.onAudioDataCallback) {
          const inputData = e.inputBuffer.getChannelData(0)
          const pcmData = this.convertToPCM16(inputData)
          this.onAudioDataCallback(
            {
              buffer: pcmData,
              timestamp: Date.now()
            },
            'mic'
          )
        }
      }

      micSource.connect(this.micProcessor)
      this.micProcessor.connect(this.audioContext!.destination)

      console.log('Microphone capture started')
    } catch (error) {
      console.error('Failed to start microphone capture:', error)
      throw new Error('Microphone access denied or unavailable')
    }
  }

  private async startSystemAudioCapture(): Promise<void> {
    try {
      // Use getDisplayMedia with audio to capture system/tab audio
      // This captures the audio from the tab/window being shared
      this.systemStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: this.config.sampleRate
        } as MediaTrackConstraints
      })

      // Check if we got an audio track
      const audioTracks = this.systemStream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.warn('No system audio track available - user may not have shared audio')
        return
      }

      const systemSource = this.audioContext!.createMediaStreamSource(this.systemStream)
      this.systemProcessor = this.audioContext!.createScriptProcessor(4096, 1, 1)

      this.systemProcessor.onaudioprocess = (e) => {
        if (this.onAudioDataCallback) {
          const inputData = e.inputBuffer.getChannelData(0)
          const pcmData = this.convertToPCM16(inputData)
          this.onAudioDataCallback(
            {
              buffer: pcmData,
              timestamp: Date.now()
            },
            'system'
          )
        }
      }

      systemSource.connect(this.systemProcessor)
      this.systemProcessor.connect(this.audioContext!.destination)

      console.log('System audio capture started')
    } catch (error) {
      console.warn('System audio capture not available:', error)
      // Don't throw - system audio is optional, mic audio is enough to proceed
    }
  }

  private convertToPCM16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp values to [-1, 1] range
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      // Convert to 16-bit PCM
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return int16Array
  }

  async stop(): Promise<void> {
    this.isCapturing = false

    // Stop microphone
    if (this.micProcessor) {
      this.micProcessor.disconnect()
      this.micProcessor.onaudioprocess = null
      this.micProcessor = null
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }

    // Stop system audio
    if (this.systemProcessor) {
      this.systemProcessor.disconnect()
      this.systemProcessor.onaudioprocess = null
      this.systemProcessor = null
    }

    if (this.systemStream) {
      this.systemStream.getTracks().forEach((track) => track.stop())
      this.systemStream = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.onAudioDataCallback = null
    console.log('Audio capture stopped')
  }

  isRunning(): boolean {
    return this.isCapturing
  }

  getConfig(): AudioCaptureConfig {
    return { ...this.config }
  }
}
