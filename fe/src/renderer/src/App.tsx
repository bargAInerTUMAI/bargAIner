import React, { useState, useEffect, useRef } from 'react'

function App(): React.JSX.Element {
  const [suggestion, setSuggestion] = useState<string>('')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 380, height: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const cardRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        })
      } else if (isResizing) {
        const newWidth = Math.max(200, resizeStart.width + (e.clientX - resizeStart.x))
        const newHeight = Math.max(100, resizeStart.height + (e.clientY - resizeStart.y))
        setSize({ width: newWidth, height: newHeight })
      }
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, isResizing, dragStart, resizeStart])

  const handleMouseEnter = (): void => {
    window.electron.send('set-ignore-mouse', false)
  }

  const handleMouseLeave = (): void => {
    window.electron.send('set-ignore-mouse', true)
  }

  const handleCardMouseDown = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      return
    }
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect()
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setIsDragging(true)
    }
  }

  const handleResizeMouseDown = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    })
    setIsResizing(true)
  }

  return (
    <div className="app-root">
      <div
        ref={cardRef}
        className="assistant-card"
        style={{
          width: `${size.width}px`,
          minHeight: `${size.height}px`,
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleCardMouseDown}
        role="dialog"
        aria-label="Sales Assistant"
      >
        <div className="assistant-body">{suggestion || 'Listening...'}</div>
        <div
          className="resize-handle"
          onMouseDown={handleResizeMouseDown}
          aria-label="Resize handle"
        />
      </div>
    </div>
  )
}

export default App
