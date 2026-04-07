import { useAppStore } from '../../store/app-store'
import { Hash, Plus, User, Bot, Terminal, Cpu } from 'lucide-react'
import './Sidebar.css'

export function Sidebar() {
  const channels = useAppStore(s => s.channels)
  const agents = useAppStore(s => s.agents)
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const setActiveChannel = useAppStore(s => s.setActiveChannel)
  const openModal = useAppStore(s => s.openModal)

  const handleAgentClick = (agentId: string) => {
    // Find or auto-create DM channel for this agent
    const dmChannel = channels.find(
      ch => ch.memberIds.length === 1 && ch.memberIds[0] === agentId
    )
    if (dmChannel) {
      setActiveChannel(dmChannel.id)
    } else {
      // Create DM channel
      const agent = agents.find(a => a.id === agentId)
      if (!agent) return
      window.api.channels.create({
        name: agent.name,
        description: `DM with ${agent.name}`,
        memberIds: [agentId]
      }).then(ch => {
        useAppStore.getState().refreshChannels().then(() => {
          setActiveChannel(ch.id)
        })
      })
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-name">AgentCrew</span>
      </div>

      <div className="sidebar-scroll">
        {/* Channels */}
        <div className="sidebar-section">
          <div className="section-header">
            <span>CHANNELS {channels.length}</span>
            <button className="icon-btn" onClick={() => openModal('createChannel')} title="Create Channel">
              <Plus size={14} />
            </button>
          </div>
          {channels.map(ch => (
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
              onClick={() => handleAgentClick(agent.id)}
            >
              {agent.type === 'cli' ? (
                <Terminal size={14} className="item-icon" />
              ) : (
                <Cpu size={14} className="item-icon" />
              )}
              <span className="item-label">{agent.name}</span>
              <span className={`status-dot ${agent.status}`} />
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
            <span className="item-label">you</span>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="footer-user">
          <User size={16} />
          <span>user</span>
        </div>
        <button className="icon-btn" onClick={() => openModal('settings')} title="Settings">
          <Bot size={14} />
        </button>
      </div>
    </aside>
  )
}
