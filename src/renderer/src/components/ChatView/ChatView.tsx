import { useRef, useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { MessageTimeline } from './MessageTimeline'
import { MessageInput } from './MessageInput'
import { TerminalPanel } from './TerminalPanel'
import { Terminal, Settings, Users } from 'lucide-react'
import './ChatView.css'

const DEFAULT_TERMINAL_HEIGHT = 260
const MIN_TERMINAL_HEIGHT = 120
const MIN_CHAT_HEIGHT = 150

export function ChatView() {
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const channels = useAppStore(s => s.channels)
  const agents = useAppStore(s => s.agents)
  const messages = useAppStore(s => s.messages)
  const openModal = useAppStore(s => s.openModal)
  const terminalOpenMap = useAppStore(s => s.terminalOpen)
  const toggleTerminal = useAppStore(s => s.toggleTerminal)

  const terminalOpen = activeChannelId ? !!terminalOpenMap[activeChannelId] : false

  const agentPtyMap = useAppStore(s => s.agentPtyMap)
  const activeTerminalAgentId = useAppStore(s => s.activeTerminalAgentId)
  const setActiveTerminalAgent = useAppStore(s => s.setActiveTerminalAgent)

  const [tab, setTab] = useState<'chat' | 'agents'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Per-channel terminal height (persisted in state during session)
  const [terminalHeights, setTerminalHeights] = useState<Record<string, number>>({})
  const terminalHeight = activeChannelId ? (terminalHeights[activeChannelId] ?? DEFAULT_TERMINAL_HEIGHT) : DEFAULT_TERMINAL_HEIGHT

  // Drag state
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))
  const hasCliAgent = channelAgents.some(a => a.type === 'cli')
  const cliAgentPtyIds = channelAgents
    .filter(a => a.type === 'cli' && activeChannelId && agentPtyMap[`${a.id}:${activeChannelId}`])
    .map(a => ({ agentId: a.id, agentName: a.name, ptyId: agentPtyMap[`${a.id}:${activeChannelId}`] }))

  // Build ALL pty entries from the full agentPtyMap so TerminalPanel instances
  // stay mounted across channel switches (preserving xterm state).
  const allPtyEntries = Object.entries(agentPtyMap).map(([key, ptyId]) => {
    const [agentId, channelId] = key.split(':')
    return { agentId, channelId, ptyId }
  })

  const isDm = activeChannel?.isDm ?? false

  // Reset tab to chat when switching to DM
  useEffect(() => {
    if (isDm && tab === 'agents') setTab('chat')
  }, [isDm, activeChannelId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Drag handler for resizing terminal
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const startY = e.clientY
    const startHeight = terminalHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const delta = startY - ev.clientY
      let newHeight = startHeight + delta
      // Clamp
      newHeight = Math.max(MIN_TERMINAL_HEIGHT, newHeight)
      newHeight = Math.min(containerRect.height - MIN_CHAT_HEIGHT, newHeight)
      if (activeChannelId) {
        setTerminalHeights(prev => ({ ...prev, [activeChannelId]: newHeight }))
      }
    }

    const onMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [terminalHeight, activeChannelId])

  if (!activeChannel) {
    return (
      <div className="empty-state">
        <h2>Welcome to AgentCrew</h2>
        <p>Create a channel or agent to get started.</p>
      </div>
    )
  }

  return (
    <div className="chat-view" ref={containerRef}>
      {/* Header */}
      <div className="channel-header">
        <div className="channel-title">
          <span className="channel-hash">{isDm ? '@' : '#'}</span>
          <span className="channel-name">{activeChannel.name}</span>
          {activeChannel.description && !isDm && (
            <span className="channel-desc"> — {activeChannel.description}</span>
          )}
          {activeChannel.workingDir && (
            <span className="channel-workdir" title={activeChannel.workingDir}>{activeChannel.workingDir}</span>
          )}
        </div>
        <div className="header-actions">
          {hasCliAgent && (
            <button
              className={`icon-btn ${terminalOpen ? 'active' : ''}`}
              onClick={() => activeChannelId && toggleTerminal(activeChannelId)}
              title="Toggle Terminal"
            >
              <Terminal size={14} />
            </button>
          )}
          {!isDm && (
            <>
              <button
                className="icon-btn"
                onClick={() => openModal('channelSettings', activeChannel.id)}
                title="Channel Settings"
              >
                <Settings size={14} />
              </button>
              <button
                className="icon-btn"
                onClick={() => openModal('channelMembers', activeChannel.id)}
                title="Members"
              >
                <Users size={14} />
                <span style={{ fontSize: 11, marginLeft: 2 }}>{activeChannel.memberIds.length + 1}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs — only show for group channels */}
      {!isDm && (
        <div className="tab-row">
          <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
            CHAT
          </button>
          <button className={`tab-btn ${tab === 'agents' ? 'active' : ''}`} onClick={() => setTab('agents')}>
            AGENTS
          </button>
        </div>
      )}

      {/* Content */}
      {tab === 'chat' ? (
        <>
          <div className="timeline-scroll" ref={scrollRef} style={{ flex: 1, minHeight: MIN_CHAT_HEIGHT }}>
            <MessageTimeline />
          </div>
          <MessageInput />

          {/* Drag handle + tabs — only when terminal is open */}
          {terminalOpen && hasCliAgent && (
            <>
              {/* Drag handle */}
              <div className="terminal-drag-handle" onMouseDown={handleDragStart}>
                <div className="terminal-drag-line" />
              </div>

              {/* Tab bar for multiple CLI agents */}
              {cliAgentPtyIds.length > 1 && (
                <div className="terminal-tabs">
                  {cliAgentPtyIds.map(({ agentId, agentName }) => (
                    <button
                      key={agentId}
                      className={`terminal-tab ${(activeTerminalAgentId ?? cliAgentPtyIds[0].agentId) === agentId ? 'active' : ''}`}
                      onClick={() => setActiveTerminalAgent(agentId)}
                    >
                      {agentName}
                    </button>
                  ))}
                </div>
              )}

              {cliAgentPtyIds.length === 0 && (
                <div className="terminal-empty" style={{ height: terminalHeight }}>
                  Agent terminal will appear here when a CLI agent is running
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="agents-tab">
          <div className="agents-tab-section">
            <div className="agents-tab-header">HUMANS</div>
            <div className="agents-tab-item">
              <span>you</span>
              <span className="tag tag-owner">owner</span>
            </div>
          </div>
          <div className="agents-tab-section">
            <div className="agents-tab-header">AGENTS ({channelAgents.length})</div>
            {channelAgents.map(agent => (
              <div key={agent.id} className="agents-tab-item">
                <span>{agent.name}</span>
                <span className={`tag tag-${agent.type}`}>{agent.type}</span>
                <span className={`status-dot ${agent.status}`} />
              </div>
            ))}
            {channelAgents.length === 0 && (
              <p className="agents-tab-empty">No agents in this channel</p>
            )}
          </div>
          <div className="agents-tab-actions">
            <button className="btn btn-primary" onClick={() => openModal('channelMembers', activeChannel.id)}>
              + Add Agent
            </button>
          </div>
        </div>
      )}

      {/* Terminal panels — ALL entries always mounted OUTSIDE tab conditional.
          Hidden panels are stacked at 0×0 with overflow:hidden so xterm never
          sees a zero-size container (the inner div keeps a fixed size).
          Only the active channel's panel is shown at full size. */}
      <div style={{ position: 'relative' }}>
        {allPtyEntries.map(({ agentId, channelId, ptyId }) => {
          const belongsToActiveChannel = channelId === activeChannelId
          const isVisible = belongsToActiveChannel && terminalOpen && tab === 'chat'
          const isActiveTab = isVisible && (activeTerminalAgentId ?? cliAgentPtyIds[0]?.agentId) === agentId
          return (
            <div
              key={ptyId}
              style={isVisible ? {
                height: terminalHeight,
              } : {
                // Keep the inner container at real dimensions inside a 0-height
                // clipped wrapper so xterm canvas is never destroyed, but the
                // wrapper takes no layout space and is invisible.
                height: 0,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <div style={{ height: terminalHeight, width: '100%' }}>
                <TerminalPanel
                  ptyId={ptyId}
                  active={isActiveTab}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
