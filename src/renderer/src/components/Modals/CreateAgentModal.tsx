import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app-store'
import type { AgentType, CliRuntime, CliRuntimeInfo } from '@shared/types'
import { X } from 'lucide-react'
import { IconPicker } from '../IconPicker'

const CLI_RUNTIMES: { value: CliRuntime; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'custom-cli', label: 'Custom CLI' },
]

export function CreateAgentModal() {
  const closeModal = useAppStore(s => s.closeModal)
  const createAgent = useAppStore(s => s.createAgent)

  const [type, setType] = useState<AgentType>('cli')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('bot')
  const [description, setDescription] = useState('')
  // CLI fields
  const [runtime, setRuntime] = useState<CliRuntime | ''>('')
  const [workingDir, setWorkingDir] = useState('')
  const [cliCommand, setCliCommand] = useState('')
  // API fields
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiModel, setApiModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  // Advanced
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [loading, setLoading] = useState(false)

  // CLI detection
  const [detectionResults, setDetectionResults] = useState<CliRuntimeInfo[]>([])
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    if (type !== 'cli') return
    if (!window.api?.cli?.detectAll) return
    setDetecting(true)
    window.api.cli.detectAll()
      .then(results => setDetectionResults(results))
      .catch(err => console.error('[CreateAgent] CLI detection failed:', err))
      .finally(() => setDetecting(false))
  }, [type])

  const getDetectionInfo = (rt: CliRuntime): CliRuntimeInfo | undefined =>
    detectionResults.find(d => d.runtime === rt)

  const isRuntimeDisabled = (rt: CliRuntime): boolean => {
    if (rt === 'custom-cli') return false
    const info = getDetectionInfo(rt)
    if (detecting && !info) return false
    return info ? !info.available : true
  }

  // When runtime changes, auto-fill cliCommand from detection result
  const handleRuntimeChange = (value: string) => {
    const rt = value as CliRuntime | ''
    setRuntime(rt)
    if (!rt) {
      setCliCommand('')
      return
    }
    if (rt === 'custom-cli') {
      setCliCommand('')
      return
    }
    const info = getDetectionInfo(rt)
    setCliCommand(info?.path ?? '')
  }

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
        icon,
        ...(type === 'cli' ? {
          runtime: runtime as CliRuntime,
          cliCommand: cliCommand.trim(),
          workingDir: workingDir.trim(),
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

  const cliCommandValid = cliCommand.trim().startsWith('/')
  const cliCommandTouched = cliCommand.trim().length > 0

  const canSubmit = name.trim() && (
    type === 'cli'
      ? (runtime !== '' && cliCommandValid && workingDir.trim().length > 0)
      : (apiEndpoint.trim() && apiKey.trim() && apiModel.trim())
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
          <label className="form-label">ICON</label>
          <IconPicker value={icon} onChange={setIcon} />
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
              <label className="form-label">
                RUNTIME <span className="required">*</span>
                {detecting && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>detecting...</span>}
              </label>
              <select
                className="form-input"
                value={runtime}
                onChange={e => handleRuntimeChange(e.target.value)}
              >
                <option value="" disabled>Select a runtime...</option>
                {CLI_RUNTIMES.map(r => {
                  const info = getDetectionInfo(r.value)
                  const disabled = isRuntimeDisabled(r.value)
                  const isCustom = r.value === 'custom-cli'
                  let label = r.label
                  if (!isCustom && info) {
                    if (info.available) {
                      label += info.version ? ` (v${info.version})` : ' (installed)'
                    } else {
                      label += ' (not installed)'
                    }
                  }
                  return (
                    <option key={r.value} value={r.value} disabled={disabled}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </div>

            {runtime !== '' && (
              <div className="form-group">
                <label className="form-label">CLI COMMAND PATH <span className="required">*</span></label>
                <input
                  className={`form-input ${cliCommandTouched && !cliCommandValid ? 'input-error' : ''}`}
                  placeholder="/usr/local/bin/claude"
                  value={cliCommand}
                  onChange={e => setCliCommand(e.target.value)}
                />
                {cliCommandTouched && !cliCommandValid && (
                  <p className="form-error">Must be an absolute path (starting with /)</p>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">WORKING DIRECTORY <span className="required">*</span></label>
              <input className="form-input" placeholder="~/projects/my-app" value={workingDir} onChange={e => setWorkingDir(e.target.value)} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Agent will only operate within this directory.
              </p>
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
            {showAdvanced ? '\u25BE' : '\u25B8'} ADVANCED
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
