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
        const key = `${msg.agentId}:${msg.channelId}`
        store.setAgentPty(key, msg.ptyId)
        // Only switch terminal tab if the event is for the active channel
        if (msg.channelId === store.activeChannelId) {
          store.setActiveTerminalAgent(msg.agentId)
        }
      } else if (msg.type === 'terminal-focus') {
        const store = useAppStore.getState()
        if (msg.channelId === store.activeChannelId) {
          store.setActiveTerminalAgent(msg.agentId)
        }
      } else if (msg.type === 'agent-thinking') {
        const key = `${msg.agentId}:${msg.channelId}`
        useAppStore.getState().setAgentThinking(key, msg.verb)
      } else if (msg.type === 'agent-stream-chunk') {
        const key = `${msg.agentId}:${msg.channelId}`
        useAppStore.getState().setStreamingMessage(key, msg.agentId, msg.channelId, msg.fullText)
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
