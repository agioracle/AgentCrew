import { useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { X } from 'lucide-react'

export function ChannelSettingsModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const modalData = useAppStore(s => s.modalData) as string
  const channels = useAppStore(s => s.channels)
  const deleteChannel = useAppStore(s => s.deleteChannel)

  const channel = channels.find(ch => ch.id === modalData)
  const [name, setName] = useState(channel?.name ?? '')
  const [description, setDescription] = useState(channel?.description ?? '')
  const [workingDir, setWorkingDir] = useState(channel?.workingDir ?? '')
  const [loading, setLoading] = useState(false)

  if (!channel) return null

  const handleSave = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await window.api.channels.update(channel.id, {
        name: name.trim(),
        description: description.trim() || null,
        workingDir: workingDir.trim() || null,
      })
      await useAppStore.getState().refreshChannels()
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirm(`Delete channel #${channel.name}? This cannot be undone.`)) {
      await deleteChannel(channel.id)
      closeModal()
    }
  }

  const isDm = channel.isDm

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">CHANNEL SETTINGS</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="form-group">
          <label className="form-label">NAME <span className="required">*</span></label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isDm}
          />
        </div>

        <div className="form-group">
          <label className="form-label">DESCRIPTION <span className="optional">(optional)</span></label>
          <textarea
            className="form-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        {!isDm && (
          <div className="form-group">
            <label className="form-label">WORKING DIRECTORY</label>
            <input
              className="form-input"
              placeholder="~/projects/my-app"
              value={workingDir}
              onChange={e => setWorkingDir(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              All agents in this channel will operate within this directory.
            </p>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">INFO</label>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Type: {isDm ? 'Direct Message' : 'Group Channel'}<br />
            Members: {channel.memberIds.length} agent{channel.memberIds.length !== 1 ? 's' : ''} + you<br />
            Messages: {channel.messageCount}
          </p>
        </div>

        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-default" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || loading}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
