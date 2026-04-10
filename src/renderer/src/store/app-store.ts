import { create } from 'zustand'
import type {
  AgentRecord, AgentDraft,
  ChannelWithMembers, ChannelDraft,
  MessageRecord, MessageDraft,
} from '@shared/types'

declare global {
  interface Window {
    api: import('../../../preload/index').ElectronAPI
  }
}

// ─── Types ───────────────────────────────────────────────

export type ModalType =
  | 'createChannel'
  | 'createAgent'
  | 'channelMembers'
  | 'channelSettings'
  | 'agentDetail'
  | 'settings'
  | null

export interface AppState {
  // Data
  agents: AgentRecord[]
  channels: ChannelWithMembers[]
  messages: MessageRecord[]
  hasMoreMessages: boolean
  loadingOlder: boolean

  // UI
  activeChannelId: string | null
  activeModal: ModalType
  modalData: unknown
  userName: string
  terminalOpen: Record<string, boolean> // channelId -> open state
  agentPtyMap: Record<string, string> // "agentId:channelId" -> ptyId
  activeTerminalAgentId: string | null
  thinkingAgents: Record<string, string> // "agentId:channelId" -> thinking verb
  streamingMessages: Record<string, { agentId: string; channelId: string; content: string }> // "agentId:channelId" -> streaming content
  initialized: boolean

  // Actions
  initialize: () => Promise<void>
  refreshAgents: () => Promise<void>
  refreshChannels: () => Promise<void>
  loadMessages: (channelId: string) => Promise<void>
  loadOlderMessages: () => Promise<void>
  setActiveChannel: (id: string) => void
  openModal: (modal: ModalType, data?: unknown) => void
  closeModal: () => void
  setUserName: (name: string) => void
  toggleTerminal: (channelId: string) => void
  setAgentPty: (key: string, ptyId: string) => void
  setActiveTerminalAgent: (agentId: string) => void
  setAgentThinking: (key: string, verb: string | null) => void
  setStreamingMessage: (key: string, agentId: string, channelId: string, content: string) => void
  clearStreamingMessage: (key: string) => void

  // Agent actions
  createAgent: (draft: AgentDraft) => Promise<AgentRecord>
  updateAgent: (id: string, draft: Partial<AgentDraft>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>

  // Channel actions
  createChannel: (draft: ChannelDraft) => Promise<ChannelWithMembers>
  deleteChannel: (id: string) => Promise<void>
  addChannelMember: (channelId: string, agentId: string) => Promise<void>
  removeChannelMember: (channelId: string, agentId: string) => Promise<void>

  // Message actions
  sendMessage: (draft: MessageDraft) => Promise<MessageRecord>
  appendMessage: (msg: MessageRecord) => void
  clearMessages: (channelId: string) => Promise<void>
}

// ─── Store ───────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  agents: [],
  channels: [],
  messages: [],
  hasMoreMessages: false,
  loadingOlder: false,
  activeChannelId: null,
  activeModal: null,
  modalData: null,
  userName: 'You',
  terminalOpen: {},
  agentPtyMap: {},
  activeTerminalAgentId: null,
  thinkingAgents: {},
  streamingMessages: {},
  initialized: false,

  initialize: async () => {
    try {
      if (!window.api?.bootstrap) {
        console.warn('[AgentCrew] window.api not available, running in browser preview mode')
        set({ initialized: true })
        return
      }
      const data = await window.api.bootstrap()
      const activeChannelId = data.channels[0]?.id ?? null
      set({
        agents: data.agents,
        channels: data.channels,
        activeChannelId,
        initialized: true
      })
      if (activeChannelId) {
        get().loadMessages(activeChannelId)
      }
    } catch (err) {
      console.error('[AgentCrew] Initialize failed:', err)
      set({ initialized: true })
    }
  },

  refreshAgents: async () => {
    const agents = await window.api.agents.list()
    set({ agents })
  },

  refreshChannels: async () => {
    const channels = await window.api.channels.list()
    set({ channels })
  },

  loadMessages: async (channelId: string) => {
    const PAGE_SIZE = 20
    const messages = await window.api.messages.list(channelId, PAGE_SIZE)
    set({ messages, hasMoreMessages: messages.length >= PAGE_SIZE })
  },

  loadOlderMessages: async () => {
    const { activeChannelId, messages, hasMoreMessages, loadingOlder } = get()
    if (!activeChannelId || !hasMoreMessages || messages.length === 0 || loadingOlder) return
    const PAGE_SIZE = 20
    const oldest = messages[0]
    set({ loadingOlder: true })
    try {
      const older = await window.api.messages.list(activeChannelId, PAGE_SIZE, oldest.createdAt)
      if (older.length === 0) {
        set({ hasMoreMessages: false, loadingOlder: false })
        return
      }
      set(s => ({
        messages: [...older, ...s.messages],
        hasMoreMessages: older.length >= PAGE_SIZE,
        loadingOlder: false,
      }))
    } catch {
      set({ loadingOlder: false })
    }
  },

  setActiveChannel: (id: string) => {
    set({ activeChannelId: id, messages: [], hasMoreMessages: false })
    get().loadMessages(id)
  },

  openModal: (modal, data) => set({ activeModal: modal, modalData: data ?? null }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  setUserName: (name) => set({ userName: name }),
  toggleTerminal: (channelId) => set(s => ({ terminalOpen: { ...s.terminalOpen, [channelId]: !s.terminalOpen[channelId] } })),
  setAgentPty: (key, ptyId) => set(s => ({ agentPtyMap: { ...s.agentPtyMap, [key]: ptyId } })),
  setActiveTerminalAgent: (agentId) => set({ activeTerminalAgentId: agentId }),
  setAgentThinking: (key, verb) => set(s => {
    if (verb === null) {
      const { [key]: _, ...rest } = s.thinkingAgents
      return { thinkingAgents: rest }
    }
    return { thinkingAgents: { ...s.thinkingAgents, [key]: verb } }
  }),
  setStreamingMessage: (key, agentId, channelId, content) => set(s => ({
    streamingMessages: { ...s.streamingMessages, [key]: { agentId, channelId, content } }
  })),
  clearStreamingMessage: (key) => set(s => {
    const { [key]: _, ...rest } = s.streamingMessages
    return { streamingMessages: rest }
  }),

  // Agent
  createAgent: async (draft) => {
    const agent = await window.api.agents.create(draft)
    await get().refreshAgents()
    return agent
  },
  updateAgent: async (id, draft) => {
    await window.api.agents.update(id, draft)
    await get().refreshAgents()
    // Sync DM channel name if agent name changed
    if (draft.name) {
      const dmChannel = get().channels.find(ch => ch.isDm && ch.memberIds.length === 1 && ch.memberIds[0] === id)
      if (dmChannel && dmChannel.name !== draft.name) {
        await window.api.channels.update(dmChannel.id, { name: draft.name })
        await get().refreshChannels()
      }
    }
  },
  deleteAgent: async (id) => {
    // Delete DM channels for this agent before deleting the agent
    const dmChannels = get().channels.filter(ch => ch.isDm && ch.memberIds.length === 1 && ch.memberIds[0] === id)
    for (const dm of dmChannels) {
      await window.api.channels.delete(dm.id)
    }
    await window.api.agents.delete(id)
    await get().refreshAgents()
    await get().refreshChannels()
    // If active channel was deleted, switch to first available
    if (dmChannels.some(dm => dm.id === get().activeChannelId)) {
      const { channels } = get()
      if (channels.length > 0) {
        get().setActiveChannel(channels[0].id)
      } else {
        set({ activeChannelId: null, messages: [] })
      }
    }
  },

  // Channel
  createChannel: async (draft) => {
    const ch = await window.api.channels.create(draft)
    await get().refreshChannels()
    set({ activeChannelId: ch.id })
    get().loadMessages(ch.id)
    return ch
  },
  deleteChannel: async (id) => {
    await window.api.channels.delete(id)
    await get().refreshChannels()
    const { channels } = get()
    if (channels.length > 0) {
      get().setActiveChannel(channels[0].id)
    } else {
      set({ activeChannelId: null, messages: [] })
    }
  },
  addChannelMember: async (channelId, agentId) => {
    await window.api.channels.addMember(channelId, agentId)
    await get().refreshChannels()
  },
  removeChannelMember: async (channelId, agentId) => {
    await window.api.channels.removeMember(channelId, agentId)
    await get().refreshChannels()
  },

  // Message
  sendMessage: async (draft) => {
    // routeMessage creates the message and broadcasts it via MESSAGES_STREAM,
    // which appendMessage picks up — no need to reload or manually append here.
    await window.api.messages.create(draft)
    return get().messages[get().messages.length - 1]
  },
  appendMessage: (msg) => {
    set(s => {
      if (msg.channelId !== s.activeChannelId) return s
      if (s.messages.some(m => m.id === msg.id)) return s
      // Clear streaming message for this agent+channel when final message arrives
      const streamKey = msg.senderId ? `${msg.senderId}:${msg.channelId}` : ''
      const { [streamKey]: _, ...restStreaming } = s.streamingMessages
      return {
        messages: [...s.messages, msg],
        streamingMessages: streamKey ? restStreaming : s.streamingMessages,
      }
    })
  },
  clearMessages: async (channelId) => {
    await window.api.messages.clear(channelId)
    if (get().activeChannelId === channelId) {
      set({ messages: [], hasMoreMessages: false })
    }
  },
}))
