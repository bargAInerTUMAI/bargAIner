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
    <div className="w-full h-full flex items-center justify-center">
      <div
        className="backdrop-blur-md bg-black/30 border border-white/20 rounded-lg p-4 shadow-lg max-w-sm"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <h2 className="text-white text-lg font-semibold mb-2">Sales Assistant</h2>
        <p className="text-white/80">{suggestion || 'Listening...'}</p>
      </div>
    </div>
  )
}

export default App
