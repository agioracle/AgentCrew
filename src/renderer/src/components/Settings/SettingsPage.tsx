import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app-store'
import { X, ChevronRight, ChevronDown } from 'lucide-react'
import './Settings.css'

const DEFAULT_SUMMARIZER_PROMPT = `You are a concise summarizer. Given raw CLI tool output, extract and present the raw information clearly. Remove any terminal noise, ANSI artifacts, or redundant content. Keep your summary brief and actionable.
Only output the response text.
Examples:
1. if your summarized text is:
"""
Ran \`hi\`: Assistant greeted user ("Hi! How can I help you today?") and awaits input.
"""
Your output should be like:
"""
Hi! How can I help you today?
"""

2. if your summarized text is:
"""
User greeted the AI; AI responded with "Hi. What do you need help with?" User then requested "Explain this codebase". Status: gpt-5.4 high model active, 100% context remaining, working directory ~/Documents/agentspace/tmp.
"""
Your output should be like:
"""
Hi. What do you need help with?
"""

3. if your summarized text is:
"""
› hi
• Hi. What do you need help with?
› Use /skills to list available skills
  gpt-5.4 high · 100% left · ~/Documents/agentspace/tmp
"""
Your output should be like:
"""
Hi. What do you need help with?
"""

4. if your summarized text is:
"""
User greeted the assistant with "hi". Assistant responded: "Hello. How can I help you today?"

**Environment:** Gemini-3.1-Pro model | ~/.../agentspace/tmp | no sandbox | 7 MCP servers, 3 skills active | shortcuts available via ?
"""
Your output should be like:
"""
Hello. How can I help you today?
"""`

export function SettingsPage() {
  const closeModal = useAppStore(s => s.closeModal)
  const [tab, setTab] = useState<'account' | 'summarizer'>('account')

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={closeModal}><X size={14} /></button>
        </div>

        <div className="tab-row" style={{ padding: 0, marginBottom: 16 }}>
          <button className={`tab-btn ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
            ACCOUNT
          </button>
          <button className={`tab-btn ${tab === 'summarizer' ? 'active' : ''}`} onClick={() => setTab('summarizer')}>
            SUMMARIZER
          </button>
        </div>

        {tab === 'account' && <AccountTab />}
        {tab === 'summarizer' && <SummarizerTab />}
      </div>
    </div>
  )
}

function AccountTab() {
  const userName = useAppStore(s => s.userName)
  const setUserName = useAppStore(s => s.setUserName)
  const [name, setName] = useState(userName)

  const handleSave = () => {
    const trimmed = name.trim() || 'You'
    setUserName(trimmed)
    setName(trimmed)
  }

  return (
    <div>
      <div className="form-group">
        <label className="form-label">DISPLAY NAME</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="You" />
      </div>
      <button className="btn btn-primary" onClick={handleSave}>Save Profile</button>
    </div>
  )
}

function SummarizerTab() {
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SUMMARIZER_PROMPT)
  const [showPrompt, setShowPrompt] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.settings.get('summarizer.endpoint'),
      window.api.settings.get('summarizer.apiKey'),
      window.api.settings.get('summarizer.model'),
      window.api.settings.get('summarizer.systemPrompt'),
    ]).then(([ep, key, mdl, sp]) => {
      setEndpoint(ep ?? '')
      setApiKey(key ?? '')
      setModel(mdl ?? '')
      setSystemPrompt(sp || DEFAULT_SUMMARIZER_PROMPT)
      // If user has customized the prompt, expand the section
      if (sp && sp !== DEFAULT_SUMMARIZER_PROMPT) setShowPrompt(true)
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaved(false)
    setCleared(false)
    const pairs: [string, string][] = [
      ['summarizer.endpoint', endpoint.trim()],
      ['summarizer.apiKey', apiKey.trim()],
      ['summarizer.model', model.trim()],
      ['summarizer.systemPrompt', systemPrompt.trim()],
    ]
    for (const [k, v] of pairs) {
      if (v) {
        await window.api.settings.set(k, v)
      } else {
        await window.api.settings.delete(k)
      }
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = async () => {
    setSaved(false)
    setCleared(false)
    const keys = ['summarizer.endpoint', 'summarizer.apiKey', 'summarizer.model', 'summarizer.systemPrompt']
    for (const k of keys) {
      await window.api.settings.delete(k)
    }
    setEndpoint('')
    setApiKey('')
    setModel('')
    setSystemPrompt(DEFAULT_SUMMARIZER_PROMPT)
    setShowPrompt(false)
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading...</div>

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Configure an LLM to summarize CLI agent output before displaying in chat.
        If not configured, raw output (last 20 lines) will be shown instead.
      </p>

      <div className="form-group">
        <label className="form-label">API ENDPOINT</label>
        <input className="form-input" placeholder="https://api.openai.com/v1/chat/completions" value={endpoint} onChange={e => setEndpoint(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">API KEY</label>
        <input className="form-input" type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">MODEL</label>
        <input className="form-input" placeholder="gpt-4o-mini" value={model} onChange={e => setModel(e.target.value)} />
      </div>

      <div className="form-group">
        <button
          type="button"
          onClick={() => setShowPrompt(!showPrompt)}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
          }}
        >
          {showPrompt ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          SYSTEM PROMPT
          <span style={{ fontWeight: 400, color: 'var(--muted)', textTransform: 'none' as const, letterSpacing: 0 }}>
            — do not modify unless necessary
          </span>
        </button>
        {showPrompt && (
          <textarea
            className="form-input"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={4}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave}>Save</button>
        <button className="btn btn-secondary" onClick={handleClear}>Clear</button>
        {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>Saved!</span>}
        {cleared && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Cleared!</span>}
      </div>
    </div>
  )
}
