import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'

export default function App() {
  const initialized = useAppStore(s => s.initialized)
  const initialize = useAppStore(s => s.initialize)
  const activeChannelId = useAppStore(s => s.activeChannelId)
  const channels = useAppStore(s => s.channels)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Subscribe to agent message stream
  useEffect(() => {
    const unsub = window.api.messages.onStream((msg) => {
      useAppStore.getState().appendMessage(msg)
    })
    return unsub
  }, [])

  if (!initialized) {
    return (
      <div className="loading">
        <span>Loading AgentCrew...</span>
      </div>
    )
  }

  const activeChannel = channels.find(ch => ch.id === activeChannelId)

  return (
    <div className="workspace-shell">
      <Sidebar />
      <main className="workspace-main">
        {activeChannel ? (
          <div className="main-content">
            <div className="channel-header">
              <div className="channel-title">
                <span className="channel-hash">#</span>
                <span className="channel-name">{activeChannel.name}</span>
                {activeChannel.description && (
                  <span className="channel-desc"> — {activeChannel.description}</span>
                )}
              </div>
            </div>
            <div className="chat-placeholder">
              <p>Select a channel to start chatting</p>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2>Welcome to AgentCrew</h2>
            <p>Create a channel or agent to get started.</p>
          </div>
        )}
      </main>
    </div>
  )
}
