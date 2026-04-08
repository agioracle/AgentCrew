import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CliRuntime, CliRuntimeInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

const RUNTIME_DEFS: Array<{ runtime: CliRuntime; label: string; command: string; altCommands?: string[] }> = [
  { runtime: 'claude-code', label: 'Claude Code', command: 'claude', altCommands: ['claude-internal', 'claude-code'] },
  { runtime: 'codex', label: 'Codex', command: 'codex' },
  { runtime: 'gemini-cli', label: 'Gemini CLI', command: 'gemini' },
]

const DETECT_TIMEOUT = 5_000 // 5 seconds

/**
 * Detects locally installed CLI tools by resolving their paths and versions.
 * Results are cached to avoid repeated shell invocations.
 */
export class CliDetector {
  private cache: Map<CliRuntime, CliRuntimeInfo> = new Map()

  /**
   * Detect all known CLI runtimes. Returns cached results if available.
   */
  async detectAll(): Promise<CliRuntimeInfo[]> {
    if (this.cache.size === RUNTIME_DEFS.length) {
      return Array.from(this.cache.values())
    }

    const results = await Promise.all(
      RUNTIME_DEFS.map(def => this.detectOne(def))
    )

    for (const info of results) {
      this.cache.set(info.runtime, info)
    }

    console.log('[CliDetector] Detection results:',
      results.map(r => `${r.command}=${r.available ? r.path : 'not found'}`).join(', ')
    )

    return results
  }

  /**
   * Detect a single CLI runtime. Returns cached result if available.
   */
  async detect(runtime: CliRuntime): Promise<CliRuntimeInfo> {
    const cached = this.cache.get(runtime)
    if (cached) return cached

    const def = RUNTIME_DEFS.find(d => d.runtime === runtime)
    if (!def) {
      return {
        runtime,
        label: runtime,
        command: runtime,
        available: false,
        path: null,
        version: null,
      }
    }

    const info = await this.detectOne(def)
    this.cache.set(runtime, info)
    return info
  }

  /**
   * Returns the full path for a runtime if detected, otherwise the bare command name.
   * This is synchronous and uses the cache — call detectAll() first.
   */
  resolveCommand(runtime: CliRuntime): string {
    const cached = this.cache.get(runtime)
    if (cached?.available && cached.path) return cached.path

    // Fallback to bare command name
    const def = RUNTIME_DEFS.find(d => d.runtime === runtime)
    return def?.command ?? runtime
  }

  /**
   * Clear cached detection results. Next detectAll/detect will re-scan.
   */
  invalidateCache(): void {
    this.cache.clear()
  }

  private async detectOne(
    def: { runtime: CliRuntime; label: string; command: string; altCommands?: string[] }
  ): Promise<CliRuntimeInfo> {
    const base: CliRuntimeInfo = {
      runtime: def.runtime,
      label: def.label,
      command: def.command,
      available: false,
      path: null,
      version: null,
    }

    // Try primary command, then alternatives
    const candidates = [def.command, ...(def.altCommands ?? [])]

    for (const cmd of candidates) {
      try {
        const { stdout: whichOut } = await execFileAsync('which', [cmd], {
          timeout: DETECT_TIMEOUT,
          env: this.getShellEnv(),
        })
        const fullPath = whichOut.trim()
        if (!fullPath) continue

        base.path = fullPath
        base.command = cmd
        base.available = true

        // Try to get version
        try {
          const { stdout: versionOut } = await execFileAsync(fullPath, ['--version'], {
            timeout: DETECT_TIMEOUT,
            env: this.getShellEnv(),
          })
          const versionLine = versionOut.trim().split('\n')[0]
          const match = versionLine.match(/v?(\d+\.\d+[\.\d]*)/)
          base.version = match ? match[1] : versionLine.slice(0, 50)
        } catch {
          // Version detection failed — tool is still available
        }

        break // Found a working command
      } catch {
        // `which` failed for this candidate — try next
      }
    }

    return base
  }

  /**
   * Build env for child processes, ensuring common PATH locations are included.
   * Electron may strip PATH in some cases.
   */
  private getShellEnv(): Record<string, string> {
    const env = { ...process.env } as Record<string, string>
    const extraPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.cargo/bin`,
      `${process.env.HOME}/.nvm/current/bin`,
      '/usr/bin',
      '/bin',
    ]
    const currentPath = env.PATH || ''
    const missing = extraPaths.filter(p => !currentPath.includes(p))
    if (missing.length > 0) {
      env.PATH = [...missing, currentPath].join(':')
    }
    return env
  }
}
