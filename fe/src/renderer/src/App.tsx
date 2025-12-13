import React, { useState, useEffect, useRef } from 'react'
import { AudioCapture, AudioData } from './services/audioCapture'

function App(): React.JSX.Element {
  const [suggestion, setSuggestion] = useState<string>('')
  const [isListening, setIsListening] = useState<boolean>(false)
  const [audioDebug, setAudioDebug] = useState<{
    mic: string
    system: string
  }>({
    mic: 'No mic data',
    system: 'No system data'
  })
  const audioCaptureRef = useRef<AudioCapture | null>(null)

  useEffect(() => {
    // Listen for AI suggestions (only args forwarded)
    const onSuggestion = (...args: unknown[]): void => {
      const txt = typeof args[0] === 'string' ? (args[0] as string) : String(args[0] ?? '')
      setSuggestion(txt)
    }
    window.electron.on('ai-suggestion', onSuggestion)

    // Initially set to ignore mouse events
    window.electron.send('set-ignore-mouse', true)

    // Initialize audio capture
    audioCaptureRef.current = new AudioCapture({ sampleRate: 16000, channelCount: 1 })

    return () => {
      if (window.electron.off) window.electron.off('ai-suggestion', onSuggestion)
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop()
      }
    }
  }, [])

  const handleAudioData = (data: AudioData, source: 'mic' | 'system'): void => {
    // Calculate audio level for visualization
    const sum = data.buffer.reduce((acc, val) => acc + Math.abs(val), 0)
    const average = sum / data.buffer.length
    const level = Math.round((average / 32768) * 100)

    // Update debug info
    setAudioDebug((prev) => ({
      ...prev,
      [source]: `${source === 'mic' ? 'Mic' : 'System'}: ${level}% | ${data.buffer.length} samples`
    }))

    // TODO: Send audio data to Eleven Labs
    // The audio data is already in the correct format:
    // - Format: PCM 16-bit, little-endian (Int16Array)
    // - Sample Rate: 16kHz (pcm_16000)
    // - Channels: Mono
    //
    // To integrate with Eleven Labs:
    // 1. Import: import { sendToElevenLabs, pcmToBase64 } from './services/elevenLabsIntegration'
    // 2. Call: await sendToElevenLabs(data.buffer, source, { apiKey: 'your-api-key' })
    //
    // See elevenLabsIntegration.ts for implementation details

    console.log(`${source} audio:`, {
      level,
      sampleCount: data.buffer.length,
      timestamp: data.timestamp,
      format: 'pcm_16000 (16-bit PCM, 16kHz, mono)'
    })
  }

  const toggleListening = async (): Promise<void> => {
    if (!audioCaptureRef.current) return

    if (isListening) {
      // Stop listening
      await audioCaptureRef.current.stop()
      setIsListening(false)
      setAudioDebug({ mic: 'Stopped', system: 'Stopped' })
    } else {
      // Start listening
      try {
        await audioCaptureRef.current.start(handleAudioData)
        setIsListening(true)
      } catch (error) {
        console.error('Failed to start audio capture:', error)
        alert(
          'Failed to start audio capture. Please ensure microphone permissions are granted.\n\n' +
            'For system audio: You need to share your screen/tab with audio when prompted.'
        )
      }
    }
  }

  const handleMouseEnter = (): void => {
    window.electron.send('set-ignore-mouse', false)
  }

  const handleMouseLeave = (): void => {
    window.electron.send('set-ignore-mouse', true)
  }

  return (
    <div className="app-root">
      <div
        className="assistant-card"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="dialog"
        aria-label="Sales Assistant"
      >
        <div className="assistant-body">
          <div className="suggestion-text">{suggestion || 'Listening...'}</div>
          {isListening && (
            <div className="audio-debug">
              <div className="audio-source">{audioDebug.mic}</div>
              <div className="audio-source">{audioDebug.system}</div>
            </div>
          )}
        </div>
        <button
          className={`audio-toggle-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          title={isListening ? 'Stop audio capture' : 'Start audio capture'}
        >
          {isListening ? '⏸' : '🎤'}
        </button>
      </div>
    </div>
  )
}

export default App
