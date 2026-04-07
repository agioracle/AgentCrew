import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AgentRecord, AgentDraft,
  ChannelWithMembers, ChannelDraft,
  MessageRecord, MessageDraft,
  McpServerRecord, McpServerDraft,
  SkillRecord, SkillDraft,
  BootstrapPayload
} from '../shared/types'

const api = {
  bootstrap: (): Promise<BootstrapPayload> =>
    ipcRenderer.invoke(IPC.BOOTSTRAP),

  agents: {
    list: (): Promise<AgentRecord[]> =>
      ipcRenderer.invoke(IPC.AGENTS_LIST),
    get: (id: string): Promise<AgentRecord> =>
      ipcRenderer.invoke(IPC.AGENTS_GET, id),
    create: (draft: AgentDraft): Promise<AgentRecord> =>
      ipcRenderer.invoke(IPC.AGENTS_CREATE, draft),
    update: (id: string, draft: Partial<AgentDraft>): Promise<AgentRecord> =>
      ipcRenderer.invoke(IPC.AGENTS_UPDATE, id, draft),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AGENTS_DELETE, id),
  },

  channels: {
    list: (): Promise<ChannelWithMembers[]> =>
      ipcRenderer.invoke(IPC.CHANNELS_LIST),
    get: (id: string): Promise<ChannelWithMembers> =>
      ipcRenderer.invoke(IPC.CHANNELS_GET, id),
    create: (draft: ChannelDraft): Promise<ChannelWithMembers> =>
      ipcRenderer.invoke(IPC.CHANNELS_CREATE, draft),
    update: (id: string, draft: Partial<ChannelDraft>): Promise<ChannelWithMembers> =>
      ipcRenderer.invoke(IPC.CHANNELS_UPDATE, id, draft),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.CHANNELS_DELETE, id),
    addMember: (channelId: string, agentId: string): Promise<ChannelWithMembers> =>
      ipcRenderer.invoke(IPC.CHANNELS_ADD_MEMBER, channelId, agentId),
    removeMember: (channelId: string, agentId: string): Promise<ChannelWithMembers> =>
      ipcRenderer.invoke(IPC.CHANNELS_REMOVE_MEMBER, channelId, agentId),
  },

  messages: {
    list: (channelId: string, limit?: number, before?: string): Promise<MessageRecord[]> =>
      ipcRenderer.invoke(IPC.MESSAGES_LIST, channelId, limit, before),
    create: (draft: MessageDraft): Promise<MessageRecord> =>
      ipcRenderer.invoke(IPC.MESSAGES_CREATE, draft),
    onStream: (callback: (msg: MessageRecord) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, msg: MessageRecord) => callback(msg)
      ipcRenderer.on(IPC.MESSAGES_STREAM, listener)
      return () => ipcRenderer.removeListener(IPC.MESSAGES_STREAM, listener)
    },
  },

  mcp: {
    list: (): Promise<McpServerRecord[]> =>
      ipcRenderer.invoke(IPC.MCP_LIST),
    create: (draft: McpServerDraft): Promise<McpServerRecord> =>
      ipcRenderer.invoke(IPC.MCP_CREATE, draft),
    update: (id: string, draft: Partial<McpServerDraft>): Promise<McpServerRecord> =>
      ipcRenderer.invoke(IPC.MCP_UPDATE, id, draft),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MCP_DELETE, id),
  },

  skills: {
    list: (): Promise<SkillRecord[]> =>
      ipcRenderer.invoke(IPC.SKILLS_LIST),
    create: (draft: SkillDraft): Promise<SkillRecord> =>
      ipcRenderer.invoke(IPC.SKILLS_CREATE, draft),
    update: (id: string, draft: Partial<SkillDraft>): Promise<SkillRecord> =>
      ipcRenderer.invoke(IPC.SKILLS_UPDATE, id, draft),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SKILLS_DELETE, id),
  },

  pty: {
    create: (workingDir: string, shell?: string, command?: string[], env?: Record<string, string>): Promise<string> =>
      ipcRenderer.invoke(IPC.PTY_CREATE, workingDir, shell, command, env),
    write: (ptyId: string, data: string): void =>
      ipcRenderer.send(IPC.PTY_WRITE, ptyId, data),
    resize: (ptyId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.PTY_RESIZE, ptyId, cols, rows),
    destroy: (ptyId: string): void =>
      ipcRenderer.send(IPC.PTY_DESTROY, ptyId),
    onData: (ptyId: string, callback: (data: string) => void): (() => void) => {
      const channel = `${IPC.PTY_DATA}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    reattach: (ptyId: string): Promise<{ ok: boolean; replay?: string }> =>
      ipcRenderer.invoke(IPC.PTY_REATTACH, ptyId),
    list: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.PTY_LIST),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
