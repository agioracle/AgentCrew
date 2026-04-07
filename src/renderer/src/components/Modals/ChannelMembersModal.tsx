import { useAppStore } from '../../store/app-store'
import { X, UserPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'

export function ChannelMembersModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const modalData = useAppStore(s => s.modalData) as string
  const channels = useAppStore(s => s.channels)
  const agents = useAppStore(s => s.agents)
  const addChannelMember = useAppStore(s => s.addChannelMember)
  const removeChannelMember = useAppStore(s => s.removeChannelMember)
  const deleteChannel = useAppStore(s => s.deleteChannel)

  const [showAddMenu, setShowAddMenu] = useState(false)

  const channel = channels.find(ch => ch.id === modalData)
  if (!channel) return null

  const memberAgents = agents.filter(a => channel.memberIds.includes(a.id))
  const availableAgents = agents.filter(a => !channel.memberIds.includes(a.id))

  const handleAdd = async (agentId: string) => {
    await addChannelMember(channel.id, agentId)
    setShowAddMenu(false)
  }

  const handleRemove = async (agentId: string) => {
    await removeChannelMember(channel.id, agentId)
  }

  const handleDelete = async () => {
    if (confirm(`Delete channel #${channel.name}? This cannot be undone.`)) {
      await deleteChannel(channel.id)
      closeModal()
    }
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">MEMBERS ({memberAgents.length + 1})</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="members-section">
          <div className="members-group-header">HUMANS</div>
          <div className="members-item">
            <span>you</span>
          </div>
        </div>

        {memberAgents.length > 0 && (
          <div className="members-section">
            <div className="members-group-header">AGENTS</div>
            {memberAgents.map(agent => (
              <div key={agent.id} className="members-item">
                <span>{agent.name}</span>
                <span className={`tag tag-${agent.type}`}>{agent.type}</span>
                <button className="icon-btn" onClick={() => handleRemove(agent.id)} title="Remove">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary" onClick={() => setShowAddMenu(!showAddMenu)} disabled={availableAgents.length === 0}>
              <UserPlus size={14} /> Add Member
            </button>
            {showAddMenu && availableAgents.length > 0 && (
              <div className="mention-popup" style={{ bottom: '100%', left: 0 }}>
                {availableAgents.map(agent => (
                  <div key={agent.id} className="mention-item" onClick={() => handleAdd(agent.id)}>
                    {agent.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-danger" onClick={handleDelete}>
            <Trash2 size={14} /> Delete Channel
          </button>
        </div>
      </div>
    </div>
  )
}
