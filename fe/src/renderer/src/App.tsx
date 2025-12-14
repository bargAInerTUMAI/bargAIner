import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { AudioCapture, AudioData } from './services/audioCapture'
import { ElevenLabsWebSocket } from './services/elevenLabsWebSocket'

const BACKEND_URL = 'http://localhost:3000'

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState<boolean>(false)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [, setPartialTranscript] = useState<string>('')
  const [, setCommittedTranscripts] = useState<string[]>([])
  const [agentMessages, setAgentMessages] = useState<string[]>([])
  const [position, setPosition] = useState({ x: 0, y: -450 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
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

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y

        // Prevent dragging above the screen (minimum y is 0 so drag handle stays visible)
        const minY = -450
        const constrainedY = Math.max(minY, newY)

        setPosition({
          x: newX,
          y: constrainedY
        })
      }
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart])

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

  const handleAudioData = (data: AudioData, source: 'mic' | 'system' | 'mixed'): void => {
    // Send mixed audio data to ElevenLabs WebSocket
    if (source === 'mixed' && elevenLabsWsRef.current?.connected) {
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

  const handleMouseEnter = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    // Only enable mouse events if hovering over interactive elements
    if (
      target.closest('.audio-toggle-btn') ||
      target.closest('.drag-handle') ||
      target.closest('.response-section')
    ) {
      window.electron.send('set-ignore-mouse', false)
    } else {
      window.electron.send('set-ignore-mouse', true)
    }
  }

  const handleMouseLeave = (): void => {
    window.electron.send('set-ignore-mouse', true)
  }

  const handleDragStart = (e: React.MouseEvent): void => {
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
    setIsDragging(true)
  }

  return (
    <div className="app-root">
      <div
        ref={cardRef}
        className="assistant-card"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="dialog"
        aria-label="Sales Assistant"
      >
        {/* Drag handle at top right */}
        <div className="drag-handle" onMouseDown={handleDragStart} aria-label="Drag to move" />

        {/* Top control bar - single line */}
        <div className="control-bar">
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isListening ? (
                <>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </>
              ) : (
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" />
              )}
            </svg>
          </button>

          <div className="assistant-body">
            {isListening ? 'Listening...' : !isReady ? 'Initializing...' : 'Click the mic to start'}
          </div>
        </div>

        {/* Response section - expands when there are messages */}
        {agentMessages.length > 0 && (
          <div className="response-section">
            <div className="markdown-content">
              <ReactMarkdown>{agentMessages[agentMessages.length - 1]}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
