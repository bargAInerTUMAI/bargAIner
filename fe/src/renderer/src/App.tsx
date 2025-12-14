import React, { useState, useEffect, useRef } from 'react'
import { AudioCapture, AudioData } from './services/audioCapture'
import { ElevenLabsWebSocket } from './services/elevenLabsWebSocket'

const BACKEND_URL = 'http://localhost:3000'

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState<boolean>(false)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [, setPartialTranscript] = useState<string>('')
  const [, setCommittedTranscripts] = useState<string[]>([])
  const [agentMessages, setAgentMessages] = useState<string[]>([])
  const [audioDebug, setAudioDebug] = useState<{
    mic: string
    system: string
  }>({
    mic: 'No mic data',
    system: 'No system data'
  })
  const audioCaptureRef = useRef<AudioCapture | null>(null)
  const elevenLabsTokenRef = useRef<string | null>(null)
  const elevenLabsWsRef = useRef<ElevenLabsWebSocket | null>(null)

  // Pre-fetch token on mount
  const prefetchToken = async (): Promise<void> => {
    try {
      const token = await fetchElevenLabsToken()
      elevenLabsTokenRef.current = token
      setIsReady(true)
      console.log('Token pre-fetched and ready')
    } catch (error) {
      console.error('Failed to pre-fetch token:', error)
      // Retry after 2 seconds
      setTimeout(prefetchToken, 2000)
    }
  }

  useEffect(() => {
    // Initially set to ignore mouse events
    window.electron.send('set-ignore-mouse', true)

    // Initialize audio capture
    audioCaptureRef.current = new AudioCapture({ sampleRate: 16000, channelCount: 1 })

    // Pre-fetch ElevenLabs token
    prefetchToken()

    return () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop()
      }
      if (elevenLabsWsRef.current) {
        elevenLabsWsRef.current.disconnect()
      }
    }
  }, [])

  // Poll for agent messages
  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/agent/poll`)
        if (response.ok) {
          const data = await response.json()
          if (data.result) {
            setAgentMessages((prev) => [...prev, data.result])
          }
          console.log('Polled agent result:', data.result)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 1000)

    return () => clearInterval(intervalId)
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

    // Send audio data to ElevenLabs WebSocket (only mic audio for STT)
    if (source === 'mic' && elevenLabsWsRef.current?.connected) {
      elevenLabsWsRef.current.sendAudioChunk(data.buffer)
    }
  }

  const fetchElevenLabsToken = async (): Promise<string> => {
    const url = `${BACKEND_URL}/scribe-token`
    console.log('Fetching token from:', url)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log('Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error response:', errorData)
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as { token: string }
      console.log('Token received successfully')
      return data.token
    } catch (error) {
      console.error('Failed to fetch ElevenLabs token:', error)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: Could not connect 
          to backend at ${url}. Make sure the backend server is running on ${BACKEND_URL}`)
      }
      throw error
    }
  }

  const toggleListening = async (): Promise<void> => {
    if (!audioCaptureRef.current) return

    if (isListening) {
      // Stop listening
      await audioCaptureRef.current.stop()
      if (elevenLabsWsRef.current) {
        elevenLabsWsRef.current.disconnect()
        elevenLabsWsRef.current = null
      }
      setIsListening(false)
      elevenLabsTokenRef.current = null
      setPartialTranscript('')
      setAudioDebug({ mic: 'Stopped', system: 'Stopped' })
      // Pre-fetch new token for next use (tokens are single-use)
      setIsReady(false)
      prefetchToken()
    } else {
      // Start listening - use pre-fetched token
      if (!elevenLabsTokenRef.current) {
        alert('Token not ready yet. Please wait a moment and try again.')
        return
      }
      try {
        const token = elevenLabsTokenRef.current
        console.log('Using pre-fetched token:', token.substring(0, 20) + '...')

        // Connect to ElevenLabs WebSocket
        const ws = new ElevenLabsWebSocket()
        elevenLabsWsRef.current = ws

        await ws.connect(token, {
          onPartialTranscript: (text) => {
            console.log('Partial transcript:', text)
            setPartialTranscript(text)
          },
          onCommittedTranscript: (text) => {
            console.log('Committed transcript:', text)
            setCommittedTranscripts((prev) => [...prev, text])
            setPartialTranscript('') // Clear partial when committed
          },
          onCommittedTranscriptWithTimestamps: (text, words) => {
            console.log('Committed transcript with timestamps:', text, words)
            setCommittedTranscripts((prev) => [...prev, text])
            setPartialTranscript('')
          },
          onError: (error) => {
            console.error('ElevenLabs WebSocket error:', error)
            alert(`ElevenLabs WebSocket error: ${error.message}`)
          },
          onClose: () => {
            console.log('ElevenLabs WebSocket closed')
          }
        })

        // Start audio capture
        await audioCaptureRef.current.start(handleAudioData)
        setIsListening(true)
      } catch (error) {
        console.error('Failed to start audio capture:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        alert(
          `Failed to start audio capture:\n\n${errorMessage}\n\n` +
            'Please ensure:\n' +
            '- Backend server is running\n' +
            '- Microphone permissions are granted\n' +
            '- For system audio: Share your screen/tab with audio when prompted'
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
          <div className="suggestion-text">
            {agentMessages.length > 0 ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {agentMessages[agentMessages.length - 1]}
              </div>
            ) : isListening ? (
              'Listening...'
            ) : !isReady ? (
              'Initializing...'
            ) : (
              'Click the mic to start recording'
            )}
          </div>
          {isListening && (
            <div className="audio-debug">
              <div className="audio-source">{audioDebug.mic}</div>
              <div className="audio-source">{audioDebug.system}</div>
            </div>
          )}
        </div>
        <button
          className={`audio-toggle-btn ${isListening ? 'listening' : ''} ${!isReady && !isListening ? 'loading' : ''}`}
          onClick={toggleListening}
          disabled={!isReady && !isListening}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          title={
            !isReady && !isListening
              ? 'Initializing...'
              : isListening
                ? 'Stop audio capture'
                : 'Start audio capture'
          }
        >
          {isListening ? '⏸' : '🎤'}
        </button>
      </div>
    </div>
  )
}

export default App
