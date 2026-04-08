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
  onDataCallbacks: Array<(data: string) => void>
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
    env?: Record<string, string>,
    initialWrite?: string
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
        // Ensure common binary paths are available (Electron may strip PATH)
        PATH: [
          '/opt/homebrew/bin',
          '/opt/homebrew/sbin',
          '/usr/local/bin',
          `${process.env.HOME}/.local/bin`,
          `${process.env.HOME}/.cargo/bin`,
          process.env.PATH || '/usr/bin:/bin',
        ].join(':'),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...env,
        AGENTCREW_PTY_ID: id,
        AGENTCREW_AGENT_ID: agentId,
      } as Record<string, string>
    })

    console.log(`[PtyManager] Spawned ${id}: file=${file}, args=${args.length}, cwd=${workingDir}, pid=${proc.pid}`)

    const instance: PtyInstance = {
      process: proc,
      webContents,
      outputSeq: 0,
      replayChunks: [],
      replayChars: 0,
      agentId,
      onExitCallbacks: [],
      onDataCallbacks: []
    }

    // Write initial command on first output (shell is ready) — same pattern as Constellagent
    let pendingWrite = initialWrite
    proc.onData((data) => {
      instance.outputSeq += data.length
      appendReplayChunk(instance, data)
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data)
      }
      for (const cb of instance.onDataCallbacks) cb(data)
      // Write initial command on first output (shell is ready)
      if (pendingWrite) {
        const toWrite = pendingWrite
        pendingWrite = undefined
        proc.write(toWrite)
      }
    })

    proc.onExit(({ exitCode }) => {
      // Delay exit callback to allow final onData events to arrive
      // (node-pty may fire onExit before all onData events are dispatched)
      setTimeout(() => {
        console.log(`[PtyManager] Exit ${id}: code=${exitCode}`)
        for (const cb of instance.onExitCallbacks) cb(exitCode)
        // Keep the instance in the map for a while so reattach/replay still works
        // after the process exits (terminal panel may mount after exit)
        setTimeout(() => {
          this.ptys.delete(id)
        }, 30_000)
      }, 200)
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

  onData(ptyId: string, callback: (data: string) => void): void {
    this.ptys.get(ptyId)?.onDataCallbacks.push(callback)
  }

  offData(ptyId: string, callback: (data: string) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      const idx = instance.onDataCallbacks.indexOf(callback)
      if (idx !== -1) instance.onDataCallbacks.splice(idx, 1)
    }
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
