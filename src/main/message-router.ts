import type { BrowserWindow } from 'electron'
import type { AgentCrewRepository } from './database/repository'
import type { PtyManager } from './pty-manager'
import type { MessageDraft, AgentRecord } from '../shared/types'
import { IPC } from '../shared/ipc-channels'
import { homedir } from 'os'
import { resolve } from 'path'

function resolveWorkingDir(dir: string | null): string {
  if (!dir) return homedir()
  return dir.startsWith('~') ? resolve(homedir(), dir.slice(2)) : resolve(dir)
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\].*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP.*?\x1b\\/g, '')
    .replace(/\r/g, '')
}

function summarizeOutput(raw: string, maxLen = 800): string {
  const clean = stripAnsi(raw).trim()
  if (!clean) return '(No output)'
  if (clean.length <= maxLen) return clean
  return clean.slice(0, maxLen) + '\n...\n(See terminal for full output)'
}

export interface MessageRouterContext {
  repository: AgentCrewRepository
  ptyManager: PtyManager
  getMainWindow: () => BrowserWindow | null
}

export class MessageRouter {
  constructor(private ctx: MessageRouterContext) {}

  async routeMessage(draft: MessageDraft): Promise<void> {
    const msg = this.ctx.repository.createMessage(draft)
    this.broadcast(msg)

    if (draft.senderType !== 'human') return

    let agentIds = draft.mentions ?? []
    if (agentIds.length === 0) {
      const channel = this.ctx.repository.getChannel(draft.channelId)
      if (channel.memberIds.length === 1) {
        agentIds = [channel.memberIds[0]]
      }
    }

    for (const agentId of agentIds) {
      try {
        const agent = this.ctx.repository.getAgent(agentId)
        if (agent.type === 'cli') {
          this.dispatchCli(agent, draft.channelId, draft.content)
        }
        // API agent: Phase 7
      } catch (err) {
        this.postError(draft.channelId, agentId, err)
      }
    }
  }

  private dispatchCli(agent: AgentRecord, channelId: string, prompt: string): void {
    const win = this.ctx.getMainWindow()
    if (!win) return

    this.ctx.repository.updateAgentStatus(agent.id, 'running')

    const workingDir = resolveWorkingDir(agent.workingDir)
    const env: Record<string, string> = { ...agent.envVars }

    // Build command for the agent runtime
    const command = this.buildCommand(agent, prompt)

    // Destroy old PTY if exists, create fresh one per task
    const oldPty = this.ctx.ptyManager.findByAgentId(agent.id)
    if (oldPty) this.ctx.ptyManager.destroy(oldPty)

    const ptyId = this.ctx.ptyManager.create(workingDir, win.webContents, agent.id, undefined, command, env)

    // Collect PTY output
    let output = ''
    const origOnData = this.ctx.ptyManager as any
    // Use a simpler approach: intercept via webContents
    const dataChannel = `${IPC.PTY_DATA}:${ptyId}`
    const collector = (_e: unknown, data: string) => { output += data }
    win.webContents.on(dataChannel as any, collector as any)

    this.ctx.ptyManager.onExit(ptyId, (exitCode) => {
      win.webContents.removeListener(dataChannel as any, collector as any)
      const summary = summarizeOutput(output)
      const replyMsg = this.ctx.repository.createMessage({
        channelId,
        senderType: 'agent',
        senderId: agent.id,
        content: summary,
      })
      this.broadcast(replyMsg)
      this.ctx.repository.updateAgentStatus(agent.id, exitCode === 0 ? 'idle' : 'error')
    })
  }

  private buildCommand(agent: AgentRecord, prompt: string): string[] {
    switch (agent.runtime) {
      case 'claude-code': {
        const args = ['claude', '--print']
        if (agent.model) args.push('--model', agent.model)
        args.push(prompt)
        return args
      }
      case 'codex':
        return ['codex', '--quiet', prompt]
      case 'gemini-cli':
        return ['gemini', prompt]
      case 'opencode':
        return ['opencode', prompt]
      default:
        return [process.env.SHELL || '/bin/zsh', '-c', prompt]
    }
  }

  private broadcast(msg: unknown): void {
    const win = this.ctx.getMainWindow()
    if (win && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC.MESSAGES_STREAM, msg)
    }
  }

  private postError(channelId: string, agentId: string, err: unknown): void {
    const errorMsg = this.ctx.repository.createMessage({
      channelId,
      senderType: 'agent',
      senderId: agentId,
      content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
    this.broadcast(errorMsg)
  }
}
