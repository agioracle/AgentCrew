import { useRef, useEffect, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { MessageTimeline } from './MessageTimeline'
import { MessageInput } from './MessageInput'
import { Terminal, Settings, Users } from 'lucide-react'
import './ChatView.css'

export function ChatView() {
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const channels = useAppStore(s => s.channels)
  const agents = useAppStore(s => s.agents)
  const messages = useAppStore(s => s.messages)
  const openModal = useAppStore(s => s.openModal)
  const terminalOpen = useAppStore(s => s.terminalOpen)
  const toggleTerminal = useAppStore(s => s.toggleTerminal)

  const [tab, setTab] = useState<'chat' | 'agents'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeChannel = channels.find(ch => ch.id === activeChannelId)
  const channelAgents = agents.filter(a => activeChannel?.memberIds.includes(a.id))
  const hasCliAgent = channelAgents.some(a => a.type === 'cli')

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (!activeChannel) {
    return (
      <div className="empty-state">
        <h2>Welcome to AgentCrew</h2>
        <p>Create a channel or agent to get started.</p>
      </div>
    )
  }

  return (
    <div className="chat-view">
      {/* Header */}
      <div className="channel-header">
        <div className="channel-title">
          <span className="channel-hash">#</span>
          <span className="channel-name">{activeChannel.name}</span>
          {activeChannel.description && (
            <span className="channel-desc"> — {activeChannel.description}</span>
          )}
        </div>
        <div className="header-actions">
          {hasCliAgent && (
            <button
              className={`icon-btn ${terminalOpen ? 'active' : ''}`}
              onClick={toggleTerminal}
              title="Toggle Terminal"
            >
              <Terminal size={14} />
            </button>
          )}
          <button className="icon-btn" title="Channel Settings">
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
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
          CHAT
        </button>
        <button className={`tab-btn ${tab === 'agents' ? 'active' : ''}`} onClick={() => setTab('agents')}>
          AGENTS
        </button>
      </div>

      {/* Content */}
      {tab === 'chat' ? (
        <>
          <div className="timeline-scroll" ref={scrollRef}>
            <MessageTimeline />
          </div>
          <MessageInput />
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
    </div>
  )
}
