import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatView } from './components/ChatView/ChatView'
import { CreateChannelModal } from './components/Modals/CreateChannelModal'
import { CreateAgentModal } from './components/Modals/CreateAgentModal'
import { ChannelMembersModal } from './components/Modals/ChannelMembersModal'
import { ChannelSettingsModal } from './components/Modals/ChannelSettingsModal'
import { AgentDetailModal } from './components/Modals/AgentDetailModal'
import { SettingsPage } from './components/Settings/SettingsPage'

export default function App() {
  const initialized = useAppStore(s => s.initialized)
  const initialize = useAppStore(s => s.initialize)
  const activeModal = useAppStore(s => s.activeModal)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Subscribe to agent message stream + PTY events
  useEffect(() => {
    if (!window.api?.messages?.onStream) return
    const unsub = window.api.messages.onStream((msg: any) => {
      if (msg.type === 'pty-created') {
        const store = useAppStore.getState()
        store.setAgentPty(msg.agentId, msg.ptyId)
        store.setActiveTerminalAgent(msg.agentId)
        // Auto-open terminal panel when a CLI agent starts
        if (!store.terminalOpen) {
          store.toggleTerminal()
        }
      } else if (msg.type === 'terminal-focus') {
        useAppStore.getState().setActiveTerminalAgent(msg.agentId)
      } else if (msg.type === 'agent-thinking') {
        useAppStore.getState().setAgentThinking(msg.agentId, msg.verb)
      } else if (msg.type === 'agent-stream-chunk') {
        // API streaming chunks — handled elsewhere
      } else {
        useAppStore.getState().appendMessage(msg)
      }
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

  return (
    <div className="workspace-shell">
      <Sidebar />
      <main className="workspace-main">
        <ChatView />
      </main>

      {/* Modals */}
      {activeModal === 'createChannel' && <CreateChannelModal />}
      {activeModal === 'createAgent' && <CreateAgentModal />}
      {activeModal === 'channelMembers' && <ChannelMembersModal />}
      {activeModal === 'channelSettings' && <ChannelSettingsModal />}
      {activeModal === 'agentDetail' && <AgentDetailModal />}
      {activeModal === 'settings' && <SettingsPage />}
    </div>
  )
}
