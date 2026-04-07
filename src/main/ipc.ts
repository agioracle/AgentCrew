import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { AgentCrewRepository } from './database/repository'
import type { AgentDraft, ChannelDraft, MessageDraft, McpServerDraft, SkillDraft } from '../shared/types'

export interface IpcContext {
  repository: AgentCrewRepository
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { repository } = ctx

  // Bootstrap
  ipcMain.handle(IPC.BOOTSTRAP, () => repository.getBootstrap())

  // Agents
  ipcMain.handle(IPC.AGENTS_LIST, () => repository.listAgents())
  ipcMain.handle(IPC.AGENTS_GET, (_e, id: string) => repository.getAgent(id))
  ipcMain.handle(IPC.AGENTS_CREATE, (_e, draft: AgentDraft) => repository.createAgent(draft))
  ipcMain.handle(IPC.AGENTS_UPDATE, (_e, id: string, draft: Partial<AgentDraft>) => repository.updateAgent(id, draft))
  ipcMain.handle(IPC.AGENTS_DELETE, (_e, id: string) => repository.deleteAgent(id))

  // Channels
  ipcMain.handle(IPC.CHANNELS_LIST, () => repository.listChannels())
  ipcMain.handle(IPC.CHANNELS_GET, (_e, id: string) => repository.getChannel(id))
  ipcMain.handle(IPC.CHANNELS_CREATE, (_e, draft: ChannelDraft) => repository.createChannel(draft))
  ipcMain.handle(IPC.CHANNELS_UPDATE, (_e, id: string, draft: Partial<ChannelDraft>) => repository.updateChannel(id, draft))
  ipcMain.handle(IPC.CHANNELS_DELETE, (_e, id: string) => repository.deleteChannel(id))
  ipcMain.handle(IPC.CHANNELS_ADD_MEMBER, (_e, channelId: string, agentId: string) => {
    repository.addChannelMember(channelId, agentId)
    return repository.getChannel(channelId)
  })
  ipcMain.handle(IPC.CHANNELS_REMOVE_MEMBER, (_e, channelId: string, agentId: string) => {
    repository.removeChannelMember(channelId, agentId)
    return repository.getChannel(channelId)
  })

  // Messages
  ipcMain.handle(IPC.MESSAGES_LIST, (_e, channelId: string, limit?: number, before?: string) =>
    repository.listMessages(channelId, limit, before)
  )
  ipcMain.handle(IPC.MESSAGES_CREATE, (_e, draft: MessageDraft) => repository.createMessage(draft))

  // MCP
  ipcMain.handle(IPC.MCP_LIST, () => repository.listMcpServers())
  ipcMain.handle(IPC.MCP_CREATE, (_e, draft: McpServerDraft) => repository.createMcpServer(draft))
  ipcMain.handle(IPC.MCP_UPDATE, (_e, id: string, draft: Partial<McpServerDraft>) => repository.updateMcpServer(id, draft))
  ipcMain.handle(IPC.MCP_DELETE, (_e, id: string) => repository.deleteMcpServer(id))

  // Skills
  ipcMain.handle(IPC.SKILLS_LIST, () => repository.listSkills())
  ipcMain.handle(IPC.SKILLS_CREATE, (_e, draft: SkillDraft) => repository.createSkill(draft))
  ipcMain.handle(IPC.SKILLS_UPDATE, (_e, id: string, draft: Partial<SkillDraft>) => repository.updateSkill(id, draft))
  ipcMain.handle(IPC.SKILLS_DELETE, (_e, id: string) => repository.deleteSkill(id))
}
