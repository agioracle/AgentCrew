import { useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { X } from 'lucide-react'

export function CreateChannelModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const createChannel = useAppStore(s => s.createChannel)
  const agents = useAppStore(s => s.agents)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createChannel({
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: selectedAgents
      })
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">CREATE CHANNEL</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="form-group">
          <label className="form-label">NAME <span className="required">*</span></label>
          <input
            className="form-input"
            placeholder="e.g. ai-research"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">DESCRIPTION <span className="optional">(optional)</span></label>
          <textarea
            className="form-input"
            placeholder="What is this channel about?"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">MEMBERS <span className="optional">(optional)</span></label>
          {agents.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 12 }}>No agents available</p>
          ) : (
            <div className="checkbox-list">
              {agents.map(agent => (
                <label key={agent.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <span>{agent.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button className="btn btn-default" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || loading}>
            Create Channel
          </button>
        </div>
      </div>
    </div>
  )
}
