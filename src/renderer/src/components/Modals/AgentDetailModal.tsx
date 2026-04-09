import { useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { CliRuntime } from '@shared/types'
import { X } from 'lucide-react'
import { IconPicker } from '../IconPicker'

const CLI_RUNTIMES: { value: CliRuntime; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'custom-cli', label: 'Custom CLI' },
]

export function AgentDetailModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const modalData = useAppStore(s => s.modalData) as string
  const agents = useAppStore(s => s.agents)
  const updateAgent = useAppStore(s => s.updateAgent)
  const deleteAgent = useAppStore(s => s.deleteAgent)

  const agent = agents.find(a => a.id === modalData)

  const [name, setName] = useState(agent?.name ?? '')
  const [icon, setIcon] = useState(agent?.icon ?? 'bot')
  const [description, setDescription] = useState(agent?.description ?? '')
  // CLI
  const [runtime, setRuntime] = useState<CliRuntime | ''>(agent?.runtime ?? '')
  const [cliCommand, setCliCommand] = useState(agent?.cliCommand ?? '')
  const [workingDir, setWorkingDir] = useState(agent?.workingDir ?? '')
  // API
  const [apiEndpoint, setApiEndpoint] = useState(agent?.apiEndpoint ?? '')
  const [apiKey, setApiKey] = useState(agent?.apiKey ?? '')
  const [apiModel, setApiModel] = useState(agent?.model ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')

  const [loading, setLoading] = useState(false)

  if (!agent) return null

  const isCli = agent.type === 'cli'

  const handleSave = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await updateAgent(agent.id, {
        name: name.trim(),
        description: description.trim() || null,
        type: agent.type,
        icon,
        ...(isCli ? {
          runtime: runtime as CliRuntime || null,
          cliCommand: cliCommand.trim() || null,
          workingDir: workingDir.trim() || null,
        } : {
          apiEndpoint: apiEndpoint.trim() || null,
          apiKey: apiKey.trim() || null,
          model: apiModel.trim() || null,
          systemPrompt: systemPrompt.trim() || null,
        }),
      })
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
      await deleteAgent(agent.id)
      closeModal()
    }
  }

  const runtimeLabel = CLI_RUNTIMES.find(r => r.value === agent.runtime)?.label ?? agent.runtime ?? ''

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">AGENT: {agent.name}</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        {/* Type badge */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span className={`tag tag-${agent.type}`}>{agent.type.toUpperCase()}</span>
          {isCli && runtimeLabel && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{runtimeLabel}</span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">NAME <span className="required">*</span></label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">ICON</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div className="form-group">
          <label className="form-label">DESCRIPTION <span className="required">*</span></label>
          <textarea className="form-input" placeholder="Briefly describe this agent's role, expertise, and capabilities" value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ resize: 'none', overflow: 'hidden' }} onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }} />
        </div>

        {isCli ? (
          <>
            <div className="form-group">
              <label className="form-label">RUNTIME</label>
              <select className="form-input" value={runtime} onChange={e => setRuntime(e.target.value as CliRuntime)}>
                <option value="" disabled>Select a runtime...</option>
                {CLI_RUNTIMES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">CLI COMMAND PATH</label>
              <input
                className={`form-input ${cliCommand.trim() && !cliCommand.trim().startsWith('/') ? 'input-error' : ''}`}
                placeholder="/usr/local/bin/claude"
                value={cliCommand}
                onChange={e => setCliCommand(e.target.value)}
              />
              {cliCommand.trim() && !cliCommand.trim().startsWith('/') && (
                <p className="form-error">Must be an absolute path (starting with /)</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">WORKING DIRECTORY</label>
              <input className="form-input" placeholder="~/projects/my-app" value={workingDir} onChange={e => setWorkingDir(e.target.value)} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Used in DM conversations. Group channels override this with their own directory.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">API ENDPOINT</label>
              <input className="form-input" placeholder="https://api.openai.com/v1" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">API KEY</label>
              <input className="form-input" type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">MODEL</label>
              <input className="form-input" placeholder="gpt-4o" value={apiModel} onChange={e => setApiModel(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">SYSTEM PROMPT <span className="optional">(optional)</span></label>
              <textarea className="form-input" placeholder="You are a code reviewer..." value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3} />
            </div>
          </>
        )}

        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-danger" onClick={handleDelete}>Delete Agent</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-default" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || !description.trim() || loading}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
