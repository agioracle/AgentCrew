import { useState } from 'react'
import { useAppStore } from '../../store/app-store'
import { X, Plus, Trash2 } from 'lucide-react'
import './Settings.css'

export function SettingsPage() {
  const closeModal = useAppStore(s => s.closeModal)
  const settingsTab = useAppStore(s => s.settingsTab)
  const setSettingsTab = useAppStore(s => s.setSettingsTab)

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="tab-row" style={{ padding: 0, marginBottom: 16 }}>
          <button className={`tab-btn ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
            ACCOUNT
          </button>
          <button className={`tab-btn ${settingsTab === 'mcp' ? 'active' : ''}`} onClick={() => setSettingsTab('mcp')}>
            MCP
          </button>
          <button className={`tab-btn ${settingsTab === 'skills' ? 'active' : ''}`} onClick={() => setSettingsTab('skills')}>
            SKILLS
          </button>
        </div>

        {settingsTab === 'account' && <AccountTab />}
        {settingsTab === 'mcp' && <McpTab />}
        {settingsTab === 'skills' && <SkillsTab />}
      </div>
    </div>
  )
}

function AccountTab() {
  return (
    <div>
      <div className="form-group">
        <label className="form-label">NAME</label>
        <input className="form-input" defaultValue="user" />
      </div>
      <div className="form-group">
        <label className="form-label">DISPLAY NAME</label>
        <input className="form-input" defaultValue="user" />
      </div>
      <button className="btn btn-primary">Save Profile</button>
    </div>
  )
}

function McpTab() {
  const mcpServers = useAppStore(s => s.mcpServers)
  const agents = useAppStore(s => s.agents)
  const createMcpServer = useAppStore(s => s.createMcpServer)
  const deleteMcpServer = useAppStore(s => s.deleteMcpServer)
  const updateMcpServer = useAppStore(s => s.updateMcpServer)

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [envKey, setEnvKey] = useState('')
  const [envVal, setEnvVal] = useState('')

  const handleAdd = async () => {
    if (!name.trim() || !command.trim()) return
    const envVars: Record<string, string> = {}
    if (envKey.trim()) envVars[envKey.trim()] = envVal
    await createMcpServer({ name: name.trim(), command: command.trim(), envVars })
    setName('')
    setCommand('')
    setEnvKey('')
    setEnvVal('')
    setShowAdd(false)
  }

  const toggleAgent = async (serverId: string, agentId: string, currentAllowed: string[]) => {
    const newAllowed = currentAllowed.includes(agentId)
      ? currentAllowed.filter(a => a !== agentId)
      : [...currentAllowed, agentId]
    await updateMcpServer(serverId, { allowedAgents: newAllowed })
  }

  return (
    <div>
      {mcpServers.map(server => (
        <div key={server.id} className="settings-card">
          <div className="card-header">
            <strong>{server.name}</strong>
            <button className="icon-btn" onClick={() => deleteMcpServer(server.id)}>
              <Trash2 size={12} />
            </button>
          </div>
          <div className="card-detail">{server.command}</div>
          <div className="card-detail">
            Agents: {server.allowedAgents.length === 0
              ? 'All'
              : agents.filter(a => server.allowedAgents.includes(a.id)).map(a => a.name).join(', ')
            }
          </div>
          {agents.length > 0 && (
            <div className="card-agents">
              {agents.map(a => (
                <label key={a.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={server.allowedAgents.length === 0 || server.allowedAgents.includes(a.id)}
                    onChange={() => toggleAgent(server.id, a.id, server.allowedAgents)}
                  />
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="settings-card">
          <div className="form-group">
            <label className="form-label">NAME <span className="required">*</span></label>
            <input className="form-input" placeholder="e.g. github" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">COMMAND <span className="required">*</span></label>
            <input className="form-input" placeholder="npx @mcp/server-github" value={command} onChange={e => setCommand(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ENV VAR <span className="optional">(optional)</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" placeholder="KEY" value={envKey} onChange={e => setEnvKey(e.target.value)} style={{ flex: 1 }} />
              <input className="form-input" placeholder="VALUE" value={envVal} onChange={e => setEnvVal(e.target.value)} style={{ flex: 2 }} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-default" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!name.trim() || !command.trim()}>Add</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add MCP Server
        </button>
      )}
    </div>
  )
}

function SkillsTab() {
  const skills = useAppStore(s => s.skills)
  const agents = useAppStore(s => s.agents)
  const createSkill = useAppStore(s => s.createSkill)
  const deleteSkill = useAppStore(s => s.deleteSkill)
  const updateSkill = useAppStore(s => s.updateSkill)

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')

  const handleAdd = async () => {
    if (!name.trim() || !source.trim()) return
    await createSkill({ name: name.trim(), description: description.trim() || undefined, source: source.trim() })
    setName('')
    setDescription('')
    setSource('')
    setShowAdd(false)
  }

  const toggleAgent = async (skillId: string, agentId: string, currentAllowed: string[]) => {
    const newAllowed = currentAllowed.includes(agentId)
      ? currentAllowed.filter(a => a !== agentId)
      : [...currentAllowed, agentId]
    await updateSkill(skillId, { allowedAgents: newAllowed })
  }

  return (
    <div>
      {skills.map(skill => (
        <div key={skill.id} className="settings-card">
          <div className="card-header">
            <strong>{skill.name}</strong>
            <button className="icon-btn" onClick={() => deleteSkill(skill.id)}>
              <Trash2 size={12} />
            </button>
          </div>
          {skill.description && <div className="card-detail">{skill.description}</div>}
          <div className="card-detail">{skill.source}</div>
          <div className="card-detail">
            Agents: {skill.allowedAgents.length === 0 ? 'All' : agents.filter(a => skill.allowedAgents.includes(a.id)).map(a => a.name).join(', ')}
          </div>
          {agents.length > 0 && (
            <div className="card-agents">
              {agents.map(a => (
                <label key={a.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={skill.allowedAgents.length === 0 || skill.allowedAgents.includes(a.id)}
                    onChange={() => toggleAgent(skill.id, a.id, skill.allowedAgents)}
                  />
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="settings-card">
          <div className="form-group">
            <label className="form-label">NAME <span className="required">*</span></label>
            <input className="form-input" placeholder="e.g. code-review" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">DESCRIPTION <span className="optional">(optional)</span></label>
            <input className="form-input" placeholder="What does this skill do?" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">SOURCE <span className="required">*</span></label>
            <input className="form-input" placeholder="~/.skills/code-review or https://..." value={source} onChange={e => setSource(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn btn-default" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={!name.trim() || !source.trim()}>Add</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Skill
        </button>
      )}
    </div>
  )
}
