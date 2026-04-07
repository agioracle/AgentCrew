import * as pty from 'node-pty'
import type { WebContents } from 'electron'
import { IPC } from '../shared/ipc-channels'

const PTY_REPLAY_BUFFER_MAX = 4_000_000

interface PtyInstance {
  process: pty.IPty
  webContents: WebContents
  outputSeq: number
  replayChunks: string[]
  replayChars: number
  agentId: string
  onExitCallbacks: Array<(exitCode: number) => void>
}

function appendReplayChunk(instance: PtyInstance, chunk: string): void {
  if (!chunk) return
  instance.replayChunks.push(chunk)
  instance.replayChars += chunk.length
  while (instance.replayChars > PTY_REPLAY_BUFFER_MAX && instance.replayChunks.length > 0) {
    const removed = instance.replayChunks.shift()
    if (removed) instance.replayChars -= removed.length
  }
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private nextId = 0

  create(
    workingDir: string,
    webContents: WebContents,
    agentId: string,
    shell?: string,
    command?: string[],
    env?: Record<string, string>
  ): string {
    const id = `pty-${++this.nextId}`

    let file: string
    let args: string[]
    if (command && command.length > 0) {
      file = command[0]
      args = command.slice(1)
    } else {
      file = (shell && shell.trim()) || process.env.SHELL || '/bin/zsh'
      args = []
    }

    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...env,
        AGENTCREW_PTY_ID: id,
        AGENTCREW_AGENT_ID: agentId,
      } as Record<string, string>
    })

    const instance: PtyInstance = {
      process: proc,
      webContents,
      outputSeq: 0,
      replayChunks: [],
      replayChars: 0,
      agentId,
      onExitCallbacks: []
    }

    proc.onData((data) => {
      instance.outputSeq += data.length
      appendReplayChunk(instance, data)
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data)
      }
    })

    proc.onExit(({ exitCode }) => {
      for (const cb of instance.onExitCallbacks) cb(exitCode)
      this.ptys.delete(id)
    })

    this.ptys.set(id, instance)
    return id
  }

  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.process.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    this.ptys.get(ptyId)?.process.resize(cols, rows)
  }

  destroy(ptyId: string): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      instance.process.kill()
      this.ptys.delete(ptyId)
    }
  }

  onExit(ptyId: string, callback: (exitCode: number) => void): void {
    this.ptys.get(ptyId)?.onExitCallbacks.push(callback)
  }

  reattach(ptyId: string, webContents: WebContents): { ok: boolean; replay?: string } {
    const instance = this.ptys.get(ptyId)
    if (!instance) return { ok: false }
    instance.webContents = webContents
    const replay = instance.replayChunks.join('')
    return { ok: true, replay }
  }

  list(): string[] {
    return Array.from(this.ptys.keys())
  }

  getAgentId(ptyId: string): string | undefined {
    return this.ptys.get(ptyId)?.agentId
  }

  findByAgentId(agentId: string): string | undefined {
    for (const [id, inst] of this.ptys) {
      if (inst.agentId === agentId) return id
    }
    return undefined
  }

  destroyAll(): void {
    for (const [id] of this.ptys) this.destroy(id)
  }
}
