import { create } from 'zustand'
import type {
  AgentRecord, AgentDraft,
  ChannelWithMembers, ChannelDraft,
  MessageRecord, MessageDraft,
  McpServerRecord, McpServerDraft,
  SkillRecord, SkillDraft
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
  | 'agentDetail'
  | 'settings'
  | null

export interface AppState {
  // Data
  agents: AgentRecord[]
  channels: ChannelWithMembers[]
  messages: MessageRecord[]
  mcpServers: McpServerRecord[]
  skills: SkillRecord[]

  // UI
  activeChannelId: string | null
  activeModal: ModalType
  modalData: unknown
  settingsTab: 'account' | 'mcp' | 'skills'
  terminalOpen: boolean
  agentPtyMap: Record<string, string> // agentId -> ptyId
  initialized: boolean

  // Actions
  initialize: () => Promise<void>
  refreshAgents: () => Promise<void>
  refreshChannels: () => Promise<void>
  loadMessages: (channelId: string) => Promise<void>
  setActiveChannel: (id: string) => void
  openModal: (modal: ModalType, data?: unknown) => void
  closeModal: () => void
  setSettingsTab: (tab: 'account' | 'mcp' | 'skills') => void
  toggleTerminal: () => void
  setAgentPty: (agentId: string, ptyId: string) => void

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

  // MCP actions
  createMcpServer: (draft: McpServerDraft) => Promise<void>
  updateMcpServer: (id: string, draft: Partial<McpServerDraft>) => Promise<void>
  deleteMcpServer: (id: string) => Promise<void>

  // Skill actions
  createSkill: (draft: SkillDraft) => Promise<void>
  updateSkill: (id: string, draft: Partial<SkillDraft>) => Promise<void>
  deleteSkill: (id: string) => Promise<void>
}

// ─── Store ───────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  agents: [],
  channels: [],
  messages: [],
  mcpServers: [],
  skills: [],
  activeChannelId: null,
  activeModal: null,
  modalData: null,
  settingsTab: 'account',
  terminalOpen: false,
  agentPtyMap: {},
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
        mcpServers: data.mcpServers,
        skills: data.skills,
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
    const messages = await window.api.messages.list(channelId, 100)
    set({ messages })
  },

  setActiveChannel: (id: string) => {
    set({ activeChannelId: id, messages: [] })
    get().loadMessages(id)
  },

  openModal: (modal, data) => set({ activeModal: modal, modalData: data ?? null }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  toggleTerminal: () => set(s => ({ terminalOpen: !s.terminalOpen })),
  setAgentPty: (agentId, ptyId) => set(s => ({ agentPtyMap: { ...s.agentPtyMap, [agentId]: ptyId } })),

  // Agent
  createAgent: async (draft) => {
    const agent = await window.api.agents.create(draft)
    await get().refreshAgents()
    return agent
  },
  updateAgent: async (id, draft) => {
    await window.api.agents.update(id, draft)
    await get().refreshAgents()
  },
  deleteAgent: async (id) => {
    await window.api.agents.delete(id)
    await get().refreshAgents()
    await get().refreshChannels()
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
    const msg = await window.api.messages.create(draft)
    set(s => ({ messages: [...s.messages, msg] }))
    return msg
  },
  appendMessage: (msg) => {
    set(s => {
      if (msg.channelId !== s.activeChannelId) return s
      if (s.messages.some(m => m.id === msg.id)) return s
      return { messages: [...s.messages, msg] }
    })
  },

  // MCP
  createMcpServer: async (draft) => {
    await window.api.mcp.create(draft)
    set({ mcpServers: await window.api.mcp.list() })
  },
  updateMcpServer: async (id, draft) => {
    await window.api.mcp.update(id, draft)
    set({ mcpServers: await window.api.mcp.list() })
  },
  deleteMcpServer: async (id) => {
    await window.api.mcp.delete(id)
    set({ mcpServers: await window.api.mcp.list() })
  },

  // Skills
  createSkill: async (draft) => {
    await window.api.skills.create(draft)
    set({ skills: await window.api.skills.list() })
  },
  updateSkill: async (id, draft) => {
    await window.api.skills.update(id, draft)
    set({ skills: await window.api.skills.list() })
  },
  deleteSkill: async (id) => {
    await window.api.skills.delete(id)
    set({ skills: await window.api.skills.list() })
  },
}))
