import { useAppStore } from '../../store/app-store'
import { Hash, Plus, User, Bot, Terminal, Cpu, MessageSquare, Settings } from 'lucide-react'
import { AgentIcon } from '../AgentIcon'
import './Sidebar.css'

export function Sidebar() {
  const channels = useAppStore(s => s.channels)
  const agents = useAppStore(s => s.agents)
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const setActiveChannel = useAppStore(s => s.setActiveChannel)
  const openModal = useAppStore(s => s.openModal)
  const userName = useAppStore(s => s.userName)

  const groupChannels = channels.filter(ch => !ch.isDm)
  const dmChannels = channels.filter(ch => ch.isDm)

  // Find the agent for a DM channel
  const getDmAgent = (ch: typeof channels[0]) => {
    if (ch.memberIds.length === 1) {
      return agents.find(a => a.id === ch.memberIds[0])
    }
    return undefined
  }

  const handleAgentDm = (agentId: string) => {
    // Find existing DM channel for this agent
    const existing = dmChannels.find(
      ch => ch.memberIds.length === 1 && ch.memberIds[0] === agentId
    )
    if (existing) {
      setActiveChannel(existing.id)
      // Pre-launch CLI session if agent is CLI type
      const agent = agents.find(a => a.id === agentId)
      if (agent?.type === 'cli') {
        window.api.cli.startSession(agentId, existing.id)
      }
      return
    }
    // Create DM channel — use agent's workingDir
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return
    window.api.channels.create({
      name: agent.name,
      description: `DM with ${agent.name}`,
      isDm: true,
      workingDir: agent.workingDir,
      memberIds: [agentId]
    }).then(ch => {
      useAppStore.getState().refreshChannels().then(() => {
        setActiveChannel(ch.id)
        // Pre-launch CLI session for new DM
        if (agent.type === 'cli') {
          window.api.cli.startSession(agentId, ch.id)
        }
      })
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-name">AgentCrew</span>
        <span className="brand-slogan">local Slack for your Agents.</span>
      </div>

      <div className="sidebar-scroll">
        {/* Direct Messages */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>DIRECT MESSAGES</span>
          </div>
          {dmChannels.length === 0 && (
            <div className="sidebar-empty">Click an agent to start a DM</div>
          )}
          {dmChannels.map(ch => {
            const agent = getDmAgent(ch)
            return (
              <div
                key={ch.id}
                className={`sidebar-item ${ch.id === activeChannelId ? 'active' : ''}`}
                onClick={() => {
                  setActiveChannel(ch.id)
                  if (agent?.type === 'cli') {
                    window.api.cli.startSession(agent.id, ch.id)
                  }
                }}
              >
                {agent ? (
                  <AgentIcon icon={agent.icon ?? 'bot'} size={14} />
                ) : (
                  <MessageSquare size={14} className="item-icon" />
                )}
                <span className="item-label">{ch.name}</span>
              </div>
            )
          })}
        </div>

        {/* Channels (group) */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>CHANNELS {groupChannels.length}</span>
            <button className="icon-btn" onClick={() => openModal('createChannel')} title="Create Channel">
              <Plus size={14} />
            </button>
          </div>
          {groupChannels.map(ch => (
            <div
              key={ch.id}
              className={`sidebar-item ${ch.id === activeChannelId ? 'active' : ''}`}
              onClick={() => setActiveChannel(ch.id)}
            >
              <Hash size={14} className="item-icon" />
              <span className="item-label">{ch.name}</span>
            </div>
          ))}
        </div>

        {/* Agents */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>AGENTS {agents.length}</span>
            <button className="icon-btn" onClick={() => openModal('createAgent')} title="Create Agent">
              <Plus size={14} />
            </button>
          </div>
          {agents.length === 0 && (
            <div className="sidebar-empty">No agents yet</div>
          )}
          {agents.map(agent => (
            <div
              key={agent.id}
              className="sidebar-item"
              onClick={() => handleAgentDm(agent.id)}
            >
              <AgentIcon icon={agent.icon ?? 'bot'} size={14} />
              <span className="item-label">{agent.name}</span>
              <button
                className="icon-btn sidebar-item-action"
                onClick={(e) => { e.stopPropagation(); openModal('agentDetail', agent.id) }}
                title="Agent Settings"
              >
                <Settings size={11} />
              </button>
            </div>
          ))}
        </div>

        {/* Humans */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>HUMANS 1</span>
          </div>
          <div className="sidebar-item">
            <User size={14} className="item-icon" />
            <span className="item-label">{userName}</span>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="footer-user">
          <User size={16} />
          <span>{userName}</span>
        </div>
        <button className="icon-btn" onClick={() => openModal('settings')} title="Settings">
          <Settings size={14} />
        </button>
      </div>
    </aside>
  )
}
