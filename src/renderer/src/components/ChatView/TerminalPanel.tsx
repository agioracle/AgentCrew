import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  ptyId: string
  active: boolean
}

export function TerminalPanel({ ptyId, active }: TerminalPanelProps) {
  const termRef = useRef<Terminal | null>(null)
  const divRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!divRef.current) return

    const term = new Terminal({
      fontSize: 12,
      fontFamily: "'SF Mono', Menlo, Monaco, monospace",
      cursorBlink: true,
      scrollback: 5000,
      convertEol: true,
      theme: {
        background: '#0a1018',
        foreground: '#f4f7fb',
        cursor: '#8ee8d8',
        selectionBackground: 'rgba(142, 232, 216, 0.25)',
        black: '#1a2030',
        red: '#ff8e82',
        green: '#8ee8d8',
        yellow: '#f0c060',
        blue: '#82b0ff',
        magenta: '#d8a0f0',
        cyan: '#8ee8d8',
        white: '#f4f7fb',
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(divRef.current)

    // Fit after a tick to ensure the container has rendered
    setTimeout(() => fitAddon.fit(), 50)

    // Resize observer
    const observer = new ResizeObserver(() => {
      try { fitAddon.fit() } catch { /* ignore */ }
    })
    observer.observe(divRef.current)

    // Subscribe to PTY data
    const unsub = window.api.pty.onData(ptyId, (data) => {
      term.write(data)
    })

    // Forward user input to PTY
    term.onData((data) => {
      window.api.pty.write(ptyId, data)
    })

    // Reattach to get replay buffer
    window.api.pty.reattach(ptyId).then(res => {
      if (res.ok && res.replay) {
        term.write(res.replay)
      }
    })

    termRef.current = term
    fitRef.current = fitAddon

    return () => {
      unsub()
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [ptyId])

  // Refit + focus when becoming active
  useEffect(() => {
    if (active) {
      setTimeout(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      }, 50)
    }
  }, [active])

  return (
    <div
      ref={divRef}
      className="terminal-container"
      style={{
        height: '100%',
        visibility: active ? 'visible' : 'hidden',
        position: active ? 'relative' : 'absolute',
      }}
    />
  )
}
