import React, { useState, useEffect } from 'react'

function App(): React.JSX.Element {
  const [suggestion, setSuggestion] = useState<string>('')

  useEffect(() => {
    // Listen for AI suggestions (only args forwarded)
    const onSuggestion = (...args: unknown[]): void => {
      const txt = typeof args[0] === 'string' ? (args[0] as string) : String(args[0] ?? '')
      setSuggestion(txt)
    }
    window.electron.on('ai-suggestion', onSuggestion)

    // Initially set to ignore mouse events
    window.electron.send('set-ignore-mouse', true)

    return () => {
      if (window.electron.off) window.electron.off('ai-suggestion', onSuggestion)
    }
  }, [])

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
        {/* <div className="assistant-header">
          <h2>Sales Assistant</h2>
        </div> */}
        <div className="assistant-body">{suggestion || 'Listening...'}</div>
      </div>
    </div>
  )
}

export default App
