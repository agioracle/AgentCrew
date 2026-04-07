import { useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { AgentType, CliRuntime } from '@shared/types'
import { X } from 'lucide-react'

const CLI_RUNTIMES: { value: CliRuntime; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'opencode', label: 'opencode' },
  { value: 'custom-cli', label: 'Custom CLI' },
]

export function CreateAgentModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const createAgent = useAppStore(s => s.createAgent)

  const [type, setType] = useState<AgentType>('cli')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // CLI fields
  const [runtime, setRuntime] = useState<CliRuntime>('claude-code')
  const [model, setModel] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  // API fields
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiModel, setApiModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const envObj: Record<string, string> = {}
      for (const { key, value } of envVars) {
        if (key.trim()) envObj[key.trim()] = value
      }

      await createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        ...(type === 'cli' ? {
          runtime,
          model: model.trim() || undefined,
          workingDir: workingDir.trim() || undefined,
          envVars: envObj,
        } : {
          apiEndpoint: apiEndpoint.trim(),
          apiKey: apiKey.trim(),
          model: apiModel.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
          envVars: envObj,
        }),
      })
      closeModal()
    } finally {
      setLoading(false)
    }
  }

  const addEnvVar = () => setEnvVars(prev => [...prev, { key: '', value: '' }])
  const removeEnvVar = (i: number) => setEnvVars(prev => prev.filter((_, idx) => idx !== i))
  const updateEnvVar = (i: number, field: 'key' | 'value', val: string) => {
    setEnvVars(prev => prev.map((ev, idx) => idx === i ? { ...ev, [field]: val } : ev))
  }

  const canSubmit = name.trim() && (
    type === 'cli' ? true : (apiEndpoint.trim() && apiKey.trim() && apiModel.trim())
  )

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">CREATE AGENT</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="form-group">
          <label className="form-label">NAME <span className="required">*</span></label>
          <input className="form-input" placeholder="e.g. Coder" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div className="form-group">
          <label className="form-label">DESCRIPTION <span className="optional">(optional)</span></label>
          <input className="form-input" placeholder="What does this agent do?" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">TYPE <span className="required">*</span></label>
          <div className="type-toggle">
            <button className={`type-btn ${type === 'cli' ? 'active' : ''}`} onClick={() => setType('cli')}>CLI Tool</button>
            <button className={`type-btn ${type === 'api' ? 'active' : ''}`} onClick={() => setType('api')}>API Model</button>
          </div>
        </div>

        {type === 'cli' ? (
          <>
            <div className="form-group">
              <label className="form-label">RUNTIME <span className="required">*</span></label>
              <select className="form-input" value={runtime} onChange={e => setRuntime(e.target.value as CliRuntime)}>
                {CLI_RUNTIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">MODEL <span className="optional">(optional)</span></label>
              <input className="form-input" placeholder="e.g. opus, sonnet" value={model} onChange={e => setModel(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">WORKING DIRECTORY <span className="required">*</span></label>
              <input className="form-input" placeholder="~/projects/my-app" value={workingDir} onChange={e => setWorkingDir(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">API ENDPOINT <span className="required">*</span></label>
              <input className="form-input" placeholder="https://api.openai.com/v1" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">API KEY <span className="required">*</span></label>
              <input className="form-input" type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">MODEL <span className="required">*</span></label>
              <input className="form-input" placeholder="gpt-4o" value={apiModel} onChange={e => setApiModel(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">SYSTEM PROMPT <span className="optional">(optional)</span></label>
              <textarea className="form-input" placeholder="You are a code reviewer..." value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3} />
            </div>
          </>
        )}

        {/* Advanced */}
        <div className="form-group">
          <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? '▾' : '▸'} ADVANCED
          </button>
          {showAdvanced && (
            <div className="advanced-section">
              <label className="form-label" style={{ marginTop: 12 }}>ENVIRONMENT VARIABLES</label>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                These will be injected into the runtime command environment.
              </p>
              {envVars.map((ev, i) => (
                <div key={i} className="env-var-row">
                  <input className="form-input" placeholder="KEY" value={ev.key} onChange={e => updateEnvVar(i, 'key', e.target.value)} style={{ flex: 1 }} />
                  <input className="form-input" placeholder="VALUE" value={ev.value} onChange={e => updateEnvVar(i, 'value', e.target.value)} style={{ flex: 2 }} />
                  <button className="icon-btn" onClick={() => removeEnvVar(i)}><X size={12} /></button>
                </div>
              ))}
              <button className="add-link" onClick={addEnvVar}>+ Add Variable</button>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button className="btn btn-default" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || loading}>
            Create Agent
          </button>
        </div>
      </div>
    </div>
  )
}
