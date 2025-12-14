export interface AudioCaptureConfig {
  sampleRate: number
  channelCount: number
  mixRatio?: number // 0-1, how much system audio to mix (0 = mic only, 1 = equal mix)
}

export interface AudioData {
  buffer: Int16Array
  timestamp: number
}

export class AudioCapture {
  private audioContext: AudioContext | null = null
  private micStream: MediaStream | null = null
  private systemStream: MediaStream | null = null
  private mixedProcessor: ScriptProcessorNode | null = null
  private micGainNode: GainNode | null = null
  private systemGainNode: GainNode | null = null
  private isCapturing = false
  private onAudioDataCallback:
    | ((data: AudioData, source: 'mic' | 'system' | 'mixed') => void)
    | null = null

  constructor(
    private config: AudioCaptureConfig = { sampleRate: 16000, channelCount: 1, mixRatio: 0.7 }
  ) {}

  async start(
    onAudioData: (data: AudioData, source: 'mic' | 'system' | 'mixed') => void
  ): Promise<void> {
    if (this.isCapturing) {
      console.warn('Audio capture already running')
      return
    }

    this.onAudioDataCallback = onAudioData
    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate })

    try {
      // Get microphone stream
      this.micStream = await this.getMicrophoneStream()

      // Attempt to get system audio stream
      this.systemStream = await this.getSystemAudioStream()

      // Set up audio processing with mixing
      this.setupAudioProcessing()

      this.isCapturing = true
      console.log('Audio capture started successfully')
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      await this.stop()
      throw error
    }
  }

  private async getMicrophoneStream(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: this.config.sampleRate
        }
      })
      console.log('Microphone stream acquired')
      return stream
    } catch (error) {
      console.error('Failed to get microphone stream:', error)
      throw new Error('Microphone access denied or unavailable')
    }
  }

  private async getSystemAudioStream(): Promise<MediaStream | null> {
    try {
      // In Electron, getDisplayMedia with audio: true and the setDisplayMediaRequestHandler
      // configured in main process will capture system audio via loopback
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Minimal video constraints - we only want audio but video is required
          width: 1,
          height: 1,
          frameRate: 1
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      // Check if we got an audio track
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.warn('No system audio track available - system audio capture not supported')
        stream.getVideoTracks().forEach((track) => track.stop())
        return null
      }

      // Stop video tracks - we only need audio
      stream.getVideoTracks().forEach((track) => track.stop())

      console.log('System audio stream acquired (loopback)')
      return new MediaStream(audioTracks)
    } catch (error) {
      console.warn('System audio capture not available:', error)
      return null
    }
  }

  private micProcessor: ScriptProcessorNode | null = null
  private systemProcessor: ScriptProcessorNode | null = null

  private setupAudioProcessing(): void {
    const ctx = this.audioContext!
    const mixRatio = this.config.mixRatio ?? 0.7

    // Create gain nodes for mixing
    this.micGainNode = ctx.createGain()
    this.micGainNode.gain.value = 1.0 // Full mic volume

    // Create mic source and connect to gain
    const micSource = ctx.createMediaStreamSource(this.micStream!)
    micSource.connect(this.micGainNode)

    // Create a mixer node (using a gain node as a summing point)
    const mixerNode = ctx.createGain()
    mixerNode.gain.value = 1.0

    // Connect mic to mixer
    this.micGainNode.connect(mixerNode)

    // Create separate processor for mic audio
    this.micProcessor = ctx.createScriptProcessor(4096, 1, 1)
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
    this.micGainNode.connect(this.micProcessor)
    this.micProcessor.connect(ctx.destination)

    // If we have system audio, add it to the mix and create separate processor
    if (this.systemStream) {
      this.systemGainNode = ctx.createGain()
      this.systemGainNode.gain.value = mixRatio // Adjustable system audio level

      const systemSource = ctx.createMediaStreamSource(this.systemStream)
      systemSource.connect(this.systemGainNode)
      this.systemGainNode.connect(mixerNode)

      // Create separate processor for system audio
      this.systemProcessor = ctx.createScriptProcessor(4096, 1, 1)
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
      this.systemGainNode.connect(this.systemProcessor)
      this.systemProcessor.connect(ctx.destination)
    }

    // Create processor for the mixed output
    this.mixedProcessor = ctx.createScriptProcessor(4096, 1, 1)

    this.mixedProcessor.onaudioprocess = (e) => {
      if (this.onAudioDataCallback) {
        const inputData = e.inputBuffer.getChannelData(0)
        const pcmData = this.convertToPCM16(inputData)
        this.onAudioDataCallback(
          {
            buffer: pcmData,
            timestamp: Date.now()
          },
          'mixed'
        )
      }
    }

    // Connect mixer to processor
    mixerNode.connect(this.mixedProcessor)
    this.mixedProcessor.connect(ctx.destination)

    console.log(
      `Audio processing setup complete. Mix ratio: ${mixRatio}, System audio: ${this.systemStream ? 'enabled' : 'disabled'}`
    )
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

  /**
   * Adjust the system audio mix level (0 = muted, 1 = full volume)
   */
  setSystemAudioLevel(level: number): void {
    if (this.systemGainNode) {
      this.systemGainNode.gain.value = Math.max(0, Math.min(1, level))
      console.log(`System audio level set to ${level}`)
    }
  }

  /**
   * Adjust the microphone mix level (0 = muted, 1 = full volume)
   */
  setMicLevel(level: number): void {
    if (this.micGainNode) {
      this.micGainNode.gain.value = Math.max(0, Math.min(1, level))
      console.log(`Mic level set to ${level}`)
    }
  }

  async stop(): Promise<void> {
    this.isCapturing = false

    // Stop processors
    if (this.mixedProcessor) {
      this.mixedProcessor.disconnect()
      this.mixedProcessor.onaudioprocess = null
      this.mixedProcessor = null
    }

    if (this.micProcessor) {
      this.micProcessor.disconnect()
      this.micProcessor.onaudioprocess = null
      this.micProcessor = null
    }

    if (this.systemProcessor) {
      this.systemProcessor.disconnect()
      this.systemProcessor.onaudioprocess = null
      this.systemProcessor = null
    }

    // Disconnect gain nodes
    if (this.micGainNode) {
      this.micGainNode.disconnect()
      this.micGainNode = null
    }

    if (this.systemGainNode) {
      this.systemGainNode.disconnect()
      this.systemGainNode = null
    }

    // Stop streams
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
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

  hasSystemAudio(): boolean {
    return this.systemStream !== null
  }

  getConfig(): AudioCaptureConfig {
    return { ...this.config }
  }
}
