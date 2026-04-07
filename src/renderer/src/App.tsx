import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatView } from './components/ChatView/ChatView'
import { CreateChannelModal } from './components/Modals/CreateChannelModal'
import { CreateAgentModal } from './components/Modals/CreateAgentModal'
import { ChannelMembersModal } from './components/Modals/ChannelMembersModal'

export default function App() {
  const initialized = useAppStore(s => s.initialized)
  const initialize = useAppStore(s => s.initialize)
  const activeModal = useAppStore(s => s.activeModal)

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
    </div>
  )
}
