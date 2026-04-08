import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { AgentCrewRepository } from './database/repository'
import type { PtyManager } from './pty-manager'
import type { MessageRouter } from './message-router'
import type { CliDetector } from './cli-detector'
import type { AgentDraft, ChannelDraft, MessageDraft, McpServerDraft, SkillDraft, CliRuntime } from '../shared/types'

export interface IpcContext {
  repository: AgentCrewRepository
  ptyManager: PtyManager
  messageRouter: MessageRouter
  cliDetector: CliDetector
  getMainWindow: () => import('electron').BrowserWindow | null
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { repository, ptyManager, messageRouter, cliDetector, getMainWindow } = ctx

  // Bootstrap
  ipcMain.handle(IPC.BOOTSTRAP, () => {
    const data = repository.getBootstrap()
    console.log('[IPC] bootstrap:', data.channels.length, 'channels,', data.agents.length, 'agents')
    return data
  })

  // Agents
  ipcMain.handle(IPC.AGENTS_LIST, () => repository.listAgents())
  ipcMain.handle(IPC.AGENTS_GET, (_e, id: string) => repository.getAgent(id))
  ipcMain.handle(IPC.AGENTS_CREATE, (_e, draft: AgentDraft) => repository.createAgent(draft))
  ipcMain.handle(IPC.AGENTS_UPDATE, (_e, id: string, draft: Partial<AgentDraft>) => repository.updateAgent(id, draft))
  ipcMain.handle(IPC.AGENTS_DELETE, (_e, id: string) => {
    // Destroy PTY if running
    const ptyId = ptyManager.findByAgentId(id)
    if (ptyId) ptyManager.destroy(ptyId)
    repository.deleteAgent(id)
  })

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

  // Messages — routed through MessageRouter
  ipcMain.handle(IPC.MESSAGES_LIST, (_e, channelId: string, limit?: number, before?: string) =>
    repository.listMessages(channelId, limit, before)
  )
  ipcMain.handle(IPC.MESSAGES_CREATE, async (_e, draft: MessageDraft) => {
    // routeMessage creates the message, broadcasts via MESSAGES_STREAM, and dispatches to agents
    await messageRouter.routeMessage(draft)
  })

  // PTY
  ipcMain.handle(IPC.PTY_CREATE, (_e, workingDir: string, shell?: string, command?: string[], env?: Record<string, string>) => {
    const win = getMainWindow()
    if (!win) throw new Error('No main window')
    return ptyManager.create(workingDir, win.webContents, 'manual', shell, command, env)
  })
  ipcMain.on(IPC.PTY_WRITE, (_e, ptyId: string, data: string) => ptyManager.write(ptyId, data))
  ipcMain.on(IPC.PTY_RESIZE, (_e, ptyId: string, cols: number, rows: number) => ptyManager.resize(ptyId, cols, rows))
  ipcMain.on(IPC.PTY_DESTROY, (_e, ptyId: string) => ptyManager.destroy(ptyId))
  ipcMain.handle(IPC.PTY_REATTACH, (_e, ptyId: string) => {
    const win = getMainWindow()
    if (!win) return { ok: false }
    return ptyManager.reattach(ptyId, win.webContents)
  })
  ipcMain.handle(IPC.PTY_LIST, () => ptyManager.list())

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

  // CLI Detection
  ipcMain.handle(IPC.CLI_DETECT_ALL, () => cliDetector.detectAll())
  ipcMain.handle(IPC.CLI_DETECT, (_e, runtime: CliRuntime) => cliDetector.detect(runtime))

  // CLI Session pre-launch
  ipcMain.handle(IPC.CLI_START_SESSION, (_e, agentId: string, channelId: string) => {
    const agent = repository.getAgent(agentId)
    if (agent.type === 'cli') {
      messageRouter.ensureCliSession(agent, channelId)
    }
  })

  // Settings
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => repository.getSetting(key))
  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: string) => repository.setSetting(key, value))
  ipcMain.handle(IPC.SETTINGS_DELETE, (_e, key: string) => repository.deleteSetting(key))
}
