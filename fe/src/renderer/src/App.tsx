import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { AudioCapture, AudioData } from './services/audioCapture'
import { ElevenLabsWebSocket } from './services/elevenLabsWebSocket'

const BACKEND_URL = 'http://localhost:3000'

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [, setPartialTranscript] = useState<string>('')
  const [, setCommittedTranscripts] = useState<string[]>([])
  const [agentMessages, setAgentMessages] = useState<string[]>([])
  const [actionItems, setActionItems] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isLoadingFeedback, setIsLoadingFeedback] = useState<boolean>(false)
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
            setAgentMessages((prev) => {
              const updated = [...prev, data.result]
              // Keep only the last 3 messages
              return updated.slice(-3)
            })
          }
          console.log('Polled agent result:', data.result)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [])

  const isPausedRef = useRef<boolean>(false)

  useEffect(() => {
    isPausedRef.current = isPaused
    console.log('isPausedRef updated to:', isPaused)
  }, [isPaused])

  const handleAudioData = (data: AudioData, source: 'mic' | 'system' | 'mixed'): void => {
    // Send mixed audio data to ElevenLabs WebSocket only if not paused
    if (source === 'mixed' && elevenLabsWsRef.current?.connected) {
      if (!isPausedRef.current) {
        elevenLabsWsRef.current.sendAudioChunk(data.buffer)
      }
    }
  }

  const exportActionItemsToPdf = (content: string): void => {
    // Create HTML content for the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Action Items - BargAIner</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
              color: #333;
            }
            h1 {
              color: #3b82f6;
              border-bottom: 2px solid #3b82f6;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            h2, strong {
              color: #1e40af;
            }
            ul {
              padding-left: 20px;
            }
            li {
              margin-bottom: 8px;
            }
            .timestamp {
              color: #666;
              font-size: 12px;
              margin-top: 30px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <h1>Action Items</h1>
          ${content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>').replace(/•/g, '&bull;')}
          <div class="timestamp">Generated by BargAIner on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    iframe.style.left = '-9999px'
    document.body.appendChild(iframe)

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      alert('Failed to create print document')
      document.body.removeChild(iframe)
      return
    }

    iframeDoc.open()
    iframeDoc.write(htmlContent)
    iframeDoc.close()

    // Wait for content to load, then print
    setTimeout(() => {
      iframe.contentWindow?.print()
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }, 250)
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
      // Just pause/unpause - don't stop the connection
      const newPausedState = !isPaused
      console.log('Toggling pause state from', isPaused, 'to', newPausedState)
      setIsPaused(newPausedState)
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
          onWrapUpDetected: async (allTranscripts) => {
            console.log('🎯 Wrap-up detected! Fetching action items...', allTranscripts.length, 'transcripts')
            try {
              const response = await fetch('http://localhost:3000/agent/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcripts: allTranscripts })
              })
              const data = await response.json()
              console.log('📋 Action items:', data.actionItems)
              setActionItems(data.actionItems)
            } catch (error) {
              console.error('Failed to fetch action items:', error)
            }
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
        setIsPaused(false)
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

  const stopAndGetFeedback = async (): Promise<void> => {
    // Stop listening if currently active
    if (isListening && audioCaptureRef.current) {
      await audioCaptureRef.current.stop()
      if (elevenLabsWsRef.current) {
        elevenLabsWsRef.current.disconnect()
        elevenLabsWsRef.current = null
      }
      setIsListening(false)
      elevenLabsTokenRef.current = null
      setPartialTranscript('')
    }

    // Fetch feedback from the backend
    setIsLoadingFeedback(true)
    setFeedback(null)
    try {
      const response = await fetch(`${BACKEND_URL}/agent/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = (await response.json()) as { feedback: string; conversationLength: number }
      setFeedback(data.feedback)
      console.log('Feedback received:', data)
    } catch (error) {
      console.error('Failed to get feedback:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setFeedback(`Error getting feedback: ${errorMessage}`)
    } finally {
      setIsLoadingFeedback(false)
      // Pre-fetch new token for next session
      if (!isReady) {
        prefetchToken()
      }
    }
  }

  const handleMouseEnter = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    // Only enable mouse events if hovering over interactive elements
    if (
      target.closest('.audio-toggle-btn') ||
      target.closest('.drag-handle') ||
      target.closest('.response-section') ||
      target.closest('.feedback-btn') ||
      target.closest('.feedback-section') ||
      target.closest('.action-items-section') ||
      target.closest('.export-pdf-btn')
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
            className={`audio-toggle-btn ${isListening && !isPaused ? 'listening' : ''} ${!isReady && !isListening ? 'loading' : ''} ${isPaused ? 'paused' : ''}`}
            onClick={toggleListening}
            disabled={!isReady && !isListening}
            aria-label={
              isListening ? (isPaused ? 'Resume listening' : 'Pause listening') : 'Start listening'
            }
            title={
              !isReady && !isListening
                ? 'Initializing...'
                : isListening
                  ? isPaused
                    ? 'Resume audio capture'
                    : 'Pause audio capture'
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
                isPaused ? (
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" />
                ) : (
                  <>
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </>
                )
              ) : (
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" />
              )}
            </svg>
          </button>

          <div className="assistant-body">
            {isListening
              ? isPaused
                ? 'Paused'
                : 'Listening...'
              : !isReady
                ? 'Initializing...'
                : 'Click the mic to start'}
          </div>
        </div>

        {/* Response section - expands when there are messages */}
        {agentMessages.length > 0 && (
          <div className="response-section">
            {agentMessages.map((message, index) => (
              <div key={index} className="markdown-content">
                <ReactMarkdown>{message}</ReactMarkdown>
              </div>
            ))}
          </div>
        )}

        {/* Action items section - shown when wrap-up detected */}
        {actionItems && (
          <div className="action-items-section">
            <div className="action-items-header-row">
              <div className="action-items-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span>Action Items</span>
              </div>
              <button
                className="export-pdf-btn"
                onClick={() => exportActionItemsToPdf(actionItems)}
                title="Export action items as PDF"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                PDF
              </button>
            </div>
            <div className="action-items-content">
              <div className="markdown-content">
                <ReactMarkdown>{actionItems}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Feedback button - below the drag handle area */}
        <button
          className={`feedback-btn ${isLoadingFeedback ? 'loading' : ''}`}
          onClick={stopAndGetFeedback}
          disabled={isLoadingFeedback}
          aria-label="End conversation and get feedback"
          title="Stop conversation and get AI feedback on your negotiation"
        >
          {isLoadingFeedback ? (
            <>
              <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M12 7v2" />
                <path d="M12 13h.01" />
              </svg>
              End &amp; Get Feedback
            </>
          )}
        </button>

        {/* Feedback section - shows when feedback is available */}
        {feedback && (
          <div className="feedback-section">
            <div className="feedback-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>Negotiation Feedback</span>
              <button 
                className="close-feedback-btn" 
                onClick={() => setFeedback(null)}
                aria-label="Close feedback"
              >
                ×
              </button>
            </div>
            <div className="feedback-content">
              <ReactMarkdown>{feedback}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
