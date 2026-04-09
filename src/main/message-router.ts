import type { BrowserWindow } from 'electron'
import type { AgentCrewRepository } from './database/repository'
import type { PtyManager } from './pty-manager'
import type { MemoryService } from './memory-service'
import type { MessageDraft, AgentRecord, MessageAttachment } from '../shared/types'
import { IPC } from '../shared/ipc-channels'
import { ApiClient } from './api-client'
import { homedir } from 'os'
import { resolve } from 'path'
import pkg from '@xterm/headless'
const { Terminal } = pkg

function resolveWorkingDir(dir: string | null): string {
  if (!dir) return homedir()
  return dir.startsWith('~') ? resolve(homedir(), dir.slice(2)) : resolve(dir)
}

const THINKING_VERBS = [
  'Thinking', 'Musing', 'Pondering', 'Processing', 'Crafting',
  'Reasoning', 'Analyzing', 'Composing', 'Manifesting', 'Spinning',
  'Reflecting', 'Synthesizing', 'Contemplating', 'Generating', 'Weaving',
]

function randomThinkingVerb(): string {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\].*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP.*?\x1b\\/g, '')
    .replace(/\r/g, '')
}

function summarizeOutput(raw: string, maxLines = 20): string {
  const clean = stripAnsi(raw).trim()
  if (!clean) return '(No output)'
  const lines = clean.split('\n').filter(l => l.trim())
  if (lines.length <= maxLines) return lines.join('\n')
  // Take the last N lines
  const tail = lines.slice(-maxLines).join('\n')
  return '...\n' + tail + '\n\n(See terminal for full output)'
}

/**
 * Extract the final visible screen content from raw PTY data using xterm-headless.
 * This properly handles TUI rendering, ANSI cursor movement, screen redraws, etc.
 * Returns clean text representing what the user would see in the terminal.
 * Note: term.write() is async, so we must read the buffer inside the write callback.
 */
function extractScreenContent(rawPtyData: string, cols = 120, rows = 50): Promise<string> {
  return new Promise((resolve) => {
    const term = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true })
    term.write(rawPtyData, () => {
      // Read all lines from the buffer (scrollback + visible viewport)
      const totalRows = term.buffer.active.length
      const lines: string[] = []
      for (let i = 0; i < totalRows; i++) {
        const line = term.buffer.active.getLine(i)
        if (line) {
          lines.push(line.translateToString(true))
        }
      }
      term.dispose()

      // Trim trailing empty lines
      while (lines.length > 0 && !lines[lines.length - 1].trim()) {
        lines.pop()
      }

      // Trim leading empty lines
      while (lines.length > 0 && !lines[0].trim()) {
        lines.shift()
      }

      resolve(lines.join('\n'))
    })
  })
}

export interface MessageRouterContext {
  repository: AgentCrewRepository
  ptyManager: PtyManager
  memoryService: MemoryService
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

    // Extract image attachments info for agent dispatch
    const imageAttachments = (draft.attachments ?? []).filter(a => a.type === 'image')
    console.log('[MessageRouter] routeMessage attachments:', { total: draft.attachments?.length ?? 0, images: imageAttachments.length, paths: imageAttachments.map(a => a.data) })

    for (const agentId of agentIds) {
      try {
        const agent = this.ctx.repository.getAgent(agentId)
        // Strip @mentions from content before dispatching to agents
        const cleanContent = this.stripMentions(draft.content, agentIds, draft.channelId)
        if (agent.type === 'cli') {
          this.dispatchCli(agent, draft.channelId, cleanContent, imageAttachments)
        } else if (agent.type === 'api') {
          this.dispatchApi(agent, draft.channelId, cleanContent, imageAttachments)
        }
      } catch (err) {
        this.postError(draft.channelId, agentId, err)
      }
    }
  }

  /**
   * Strip @mentions from message content before sending to agents.
   * Removes @AgentName patterns and cleans up extra whitespace.
   */
  private stripMentions(content: string, agentIds: string[], channelId: string): string {
    let clean = content
    for (const agentId of agentIds) {
      try {
        const agent = this.ctx.repository.getAgent(agentId)
        // Remove @AgentName (case-insensitive)
        clean = clean.replace(new RegExp(`@${agent.name}\\b`, 'gi'), '')
      } catch { /* agent not found, skip */ }
    }
    return clean.replace(/\s+/g, ' ').trim()
  }

  private recallContext(agent: AgentRecord, channelId: string, prompt: string): string {
    try {
      const channel = this.ctx.repository.getChannel(channelId)
      const recalls = this.ctx.memoryService.recall({
        channelCapsuleId: channel.memoryCapsuleId ?? `channel-${channelId}`,
        agentCapsuleId: agent.memoryCapsuleId ?? `agent-${agent.id}`,
        agentId: agent.id,
        query: prompt,
      })
      if (recalls.length === 0) return prompt
      const memoryBlock = recalls.map(r => `[Memory/${r.scope}] ${r.content}`).join('\n')
      return `<context>\n${memoryBlock}\n</context>\n\n${prompt}`
    } catch (err) {
      console.error('[Memory] recall failed:', err)
      return prompt
    }
  }

  private retainMemory(agent: AgentRecord, channelId: string, content: string): void {
    // Don't retain error messages or empty output to memory
    if (!content || content === '(No output)' || content.startsWith('Error:') || content.startsWith('CLI agent exited')) return
    try {
      const channel = this.ctx.repository.getChannel(channelId)
      // Retain to agent private capsule
      this.ctx.memoryService.retain({
        capsuleId: agent.memoryCapsuleId ?? `agent-${agent.id}`,
        channelId,
        content: content.slice(0, 500),
        scope: 'agent',
        agentId: agent.id,
      })
      // Retain to channel shared capsule
      this.ctx.memoryService.retain({
        capsuleId: channel.memoryCapsuleId ?? `channel-${channelId}`,
        channelId,
        content: content.slice(0, 500),
        scope: 'shared',
        agentId: agent.id,
      })
    } catch (err) {
      console.error('[Memory] retain failed:', err)
    }
  }

  // Track active CLI agent sessions — keyed by "agentId:channelId" for isolation
  // Each agent in each channel gets its own independent PTY session.
  private agentSessions = new Map<string, { ptyId: string; ready: boolean }>()
  // Queue of messages waiting for CLI tool to be ready
  private pendingMessages = new Map<string, Array<{ agent: AgentRecord; channelId: string; prompt: string }>>()

  private sessionKey(agentId: string, channelId: string): string {
    return `${agentId}:${channelId}`
  }
  /**
   * Ensure a CLI session is running for the given agent.
   * If no session exists, spawns a shell + CLI tool.
   * Called both from sidebar click (pre-launch) and from dispatchCli.
   */
  ensureCliSession(agent: AgentRecord, channelId: string): { ptyId: string; isNew: boolean } | null {
    const win = this.ctx.getMainWindow()
    if (!win) return null

    const key = this.sessionKey(agent.id, channelId)

    // Check existing session
    const existing = this.agentSessions.get(key)
    if (existing && this.ctx.ptyManager.list().includes(existing.ptyId)) {
      return { ptyId: existing.ptyId, isNew: false }
    }

    // Resolve working directory
    const channel = this.ctx.repository.getChannel(channelId)
    const rawWorkingDir = channel.isDm ? agent.workingDir : (channel.workingDir ?? agent.workingDir)
    if (!rawWorkingDir) return null

    const workingDir = resolveWorkingDir(rawWorkingDir)
    const env: Record<string, string> = { ...agent.envVars }
    const launchCmd = this.buildLaunchCommand(agent)
    const initialWrite = `${launchCmd}\r`

    const ptyId = this.ctx.ptyManager.create(
      workingDir, win.webContents, agent.id,
      process.env.SHELL || '/bin/zsh', undefined, env, initialWrite
    )

    const session = { ptyId, ready: false }
    this.agentSessions.set(key, session)

    // Notify renderer of the new PTY
    this.broadcast({ type: 'pty-created', agentId: agent.id, ptyId, channelId })

    console.log('[MessageRouter] Launched CLI session:', { ptyId, launchCmd, agentName: agent.name, channelId })

    // Detect when the CLI tool is ready to accept input, then flush pending messages
    this.waitForCliReady(agent, channelId, ptyId)

    // Handle CLI tool or shell exit
    this.ctx.ptyManager.onExit(ptyId, (_exitCode) => {
      console.log(`[MessageRouter] CLI session ${ptyId} exited`)
      this.agentSessions.delete(key)
      this.pendingMessages.delete(key)
      // Clean up persistent turn detection listener
      const cb = this.turnDetectionCallbacks.get(ptyId)
      if (cb) {
        this.ctx.ptyManager.offData(ptyId, cb)
        this.turnDetectionCallbacks.delete(ptyId)
      }
      this.ctx.repository.updateAgentStatus(agent.id, 'idle')
    })

    return { ptyId, isNew: true }
  }

  /**
   * Wait for the CLI tool to output its input prompt (indicating it's ready),
   * then mark session as ready and flush any queued messages.
   */
  private waitForCliReady(agent: AgentRecord, channelId: string, ptyId: string): void {
    let startupOutput = ''
    let ready = false

    const readyCallback = (data: string) => {
      startupOutput += data
      if (ready) return

      // Detect CLI tool's input prompt to know it's truly ready.
      // Claude Code shows "❯" or ">" prompt; Codex shows ">"; Gemini shows ">".
      // Also check for common prompt indicators at end of output.
      const cleaned = stripAnsi(startupOutput)
      const lastChars = cleaned.slice(-50)

      // Check for input prompt indicators
      const hasPrompt =
        lastChars.includes('❯') ||           // Claude Code prompt
        /[>›»]\s*$/.test(lastChars) ||        // Common CLI prompts
        lastChars.includes('How can I help')   // Claude Code ready text

      if (hasPrompt && startupOutput.length > 200) {
        ready = true
        this.ctx.ptyManager.offData(ptyId, readyCallback)
        // Small delay to let the prompt fully render
        setTimeout(() => this.markSessionReady(agent, channelId, ptyId), 300)
      }
    }
    this.ctx.ptyManager.onData(ptyId, readyCallback)

    // Fallback: if tool doesn't show a prompt within 15 seconds, mark ready anyway
    setTimeout(() => {
      if (!ready) {
        ready = true
        this.ctx.ptyManager.offData(ptyId, readyCallback)
        this.markSessionReady(agent, channelId, ptyId)
      }
    }, 15000)
  }

  private markSessionReady(agent: AgentRecord, channelId: string, ptyId: string): void {
    const key = this.sessionKey(agent.id, channelId)
    const session = this.agentSessions.get(key)
    if (session) {
      session.ready = true
      console.log(`[MessageRouter] CLI session ready: ${ptyId}`)
    }

    // Flush any pending messages — with extra delay for first message after startup
    const pending = this.pendingMessages.get(key)
    if (pending && pending.length > 0) {
      this.pendingMessages.delete(key)
      // Wait 5 seconds after ready to ensure the CLI tool's TUI is fully initialized
      setTimeout(() => {
        for (const msg of pending) {
          console.log(`[MessageRouter] Flushing pending message for ${agent.name}`)
          this.sendUserMessage(msg.agent, msg.channelId, ptyId, msg.prompt, true)
        }
      }, 5000)
    }
  }

  private dispatchCli(agent: AgentRecord, channelId: string, prompt: string, images: Omit<MessageAttachment, 'id'>[] = []): void {
    // Append image file paths to the prompt so CLI tools can read them
    let fullPrompt = prompt
    const imagePaths = images.map(img => img.data).filter(Boolean) as string[]
    if (imagePaths.length > 0) {
      fullPrompt = `${prompt} ${imagePaths.join(' ')}`
    }
    console.log('[MessageRouter] dispatchCli:', { promptLength: fullPrompt.length, imageCount: images.length, imagePaths })

    // Ensure session is running (may have been pre-launched from sidebar click)
    const session = this.ensureCliSession(agent, channelId)
    if (!session) {
      this.postError(channelId, agent.id, new Error('Failed to start CLI session'))
      return
    }

    // Always notify renderer to switch terminal tab to this agent
    this.broadcast({ type: 'terminal-focus', agentId: agent.id, channelId })

    // Show thinking indicator
    this.startThinking(agent.id, channelId)

    this.ctx.repository.updateAgentStatus(agent.id, 'running')

    // Check if the session is ready to accept messages
    const key = this.sessionKey(agent.id, channelId)
    const sessionState = this.agentSessions.get(key)
    if (sessionState && !sessionState.ready) {
      // CLI tool still starting up — queue the message
      console.log(`[MessageRouter] CLI not ready, queuing message for ${agent.name}`)
      let queue = this.pendingMessages.get(key)
      if (!queue) {
        queue = []
        this.pendingMessages.set(key, queue)
      }
      queue.push({ agent, channelId, prompt: fullPrompt })
      return
    }

    // Session is ready — send immediately
    this.sendUserMessage(agent, channelId, session.ptyId, fullPrompt)
  }

  /**
   * Send a user message to a running interactive CLI tool.
   * The message is typed into the PTY as if the user typed it, followed by Enter.
   * Turn detection is started once per PTY session and persists across messages.
   */
  private sendUserMessage(agent: AgentRecord, channelId: string, ptyId: string, prompt: string, isFirstMessage = false): void {
    this.ctx.repository.updateAgentStatus(agent.id, 'running')

    // Write text in small chunks to simulate typing. This is the most
    // universally compatible approach — works with all CLI tools regardless
    // of their TUI framework (ink, blessed, raw readline, etc.).
    // Bracketed paste mode is not universally supported, and writing large
    // text at once can cause TUI input buffers to drop content.
    this.writeChunked(ptyId, prompt, isFirstMessage)

    console.log('[MessageRouter] Sent message to CLI:', { ptyId, runtime: agent.runtime, promptLength: prompt.length })

    // Start persistent turn detection if not already running for this PTY
    if (!this.turnDetectionCallbacks.has(ptyId)) {
      this.detectTurnCompletion(agent, channelId, ptyId)
    }
  }

  /**
   * Write text to PTY in small chunks with delays, then send Enter.
   * This simulates typing and is universally compatible with all CLI tools.
   */
  private writeChunked(ptyId: string, text: string, isFirstMessage: boolean): void {
    const CHUNK_SIZE = 10
    const CHUNK_DELAY = 20 // ms between chunks
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE))
    }

    let i = 0
    const writeNext = () => {
      if (i < chunks.length) {
        this.ctx.ptyManager.write(ptyId, chunks[i])
        i++
        setTimeout(writeNext, CHUNK_DELAY)
      } else {
        // All chunks written — send Enter
        const enterDelay = isFirstMessage ? 1000 : 200
        setTimeout(() => {
          this.ctx.ptyManager.write(ptyId, '\r')
        }, enterDelay)
      }
    }
    writeNext()
  }

  /**
   * Continuously monitor CLI tool output for turn completion.
   *
   * A "turn" ends when the CLI tool shows its input prompt (❯, >, etc.),
   * meaning it's waiting for user input. At that point we extract the screen
   * content accumulated since the last turn and post it as a chat reply.
   *
   * After posting, monitoring continues — if the user confirms a permission
   * prompt (y/n) in the terminal, the tool resumes outputting and the next
   * prompt appearance triggers another reply.
   *
   * The listener is removed only when the PTY session exits (handled by onExit
   * in ensureCliSession).
   *
   * Fallback: 10 seconds of silence also triggers a turn completion.
   */
  private detectTurnCompletion(agent: AgentRecord, channelId: string, ptyId: string): void {
    let rawOutput = ''
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let turnActive = false // true once we've seen output after the user's message / last turn
    let lastScreenText = '' // track last summarized screen content to avoid duplicate replies
    const SILENCE_MS = 10000      // 10 seconds of silence = turn complete (fallback)
    const PROMPT_SETTLE_MS = 500  // wait 500ms after prompt detection to ensure rendering is done

    const completeTurn = async () => {
      if (!turnActive) return
      turnActive = false
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }

      const snapshot = rawOutput
      rawOutput = '' // reset for next turn

      // Use xterm-headless to extract clean screen content
      const screenText = await extractScreenContent(snapshot)
      if (!screenText) {
        this.stopThinking(agent.id, channelId)
        this.ctx.repository.updateAgentStatus(agent.id, 'idle')
        return
      }

      // Skip if screen content is identical to last turn (no new output)
      if (screenText === lastScreenText) {
        this.stopThinking(agent.id, channelId)
        this.ctx.repository.updateAgentStatus(agent.id, 'idle')
        return
      }
      lastScreenText = screenText

      // Keep thinking indicator running during summarization — it will be
      // stopped inside summarizeCliOutput / postCliReply when done.
      this.summarizeCliOutput(screenText, agent, channelId)
    }

    const dataCallback = (data: string) => {
      rawOutput += data
      turnActive = true

      // Check if CLI tool's input prompt has appeared (turn/sub-turn complete)
      const cleaned = stripAnsi(rawOutput)
      const lastChars = cleaned.slice(-50)
      const hasPrompt =
        lastChars.includes('❯') ||           // Claude Code prompt
        /[>›»]\s*$/.test(lastChars) ||        // Common CLI prompts
        lastChars.includes('How can I help')   // Claude Code ready text

      if (hasPrompt && rawOutput.length > 100) {
        // Wait a short settle time for trailing rendering, then complete this turn
        if (silenceTimer) clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => completeTurn(), PROMPT_SETTLE_MS)
        return
      }

      // Reset silence timer on each new data (fallback detection)
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => completeTurn(), SILENCE_MS)
    }

    // Store the callback reference so it can be cleaned up when PTY exits
    this.turnDetectionCallbacks.set(ptyId, dataCallback)
    this.ctx.ptyManager.onData(ptyId, dataCallback)
  }

  // Track turn detection callbacks per PTY for cleanup on exit
  private turnDetectionCallbacks = new Map<string, (data: string) => void>()

  /**
   * Build the command to launch a CLI tool in interactive mode.
   * This is the command that starts the tool — NOT the prompt.
   */
  private buildLaunchCommand(agent: AgentRecord): string {
    if (!agent.cliCommand) {
      throw new Error(`CLI agent "${agent.name}" has no command path configured`)
    }
    const cmd = agent.cliCommand

    switch (agent.runtime) {
      case 'claude-code':
        // Launch claude in interactive mode (no --print)
        return cmd
      case 'codex':
        return cmd
      case 'gemini-cli':
        return cmd
      case 'custom-cli':
        return cmd
      default:
        return cmd
    }
  }

  /**
   * Summarize CLI output using the configured summarizer LLM.
   * Falls back to truncation (last 20 lines) if summarizer is not configured or fails.
   */
  private summarizeCliOutput(cleanText: string, agent: AgentRecord, channelId: string): void {
    const endpoint = this.ctx.repository.getSetting('summarizer.endpoint')
    const apiKey = this.ctx.repository.getSetting('summarizer.apiKey')
    const model = this.ctx.repository.getSetting('summarizer.model')

    if (!endpoint || !apiKey || !model) {
      // No summarizer configured — fallback to truncation
      this.postCliReply(agent, channelId, summarizeOutput(cleanText))
      return
    }

    const defaultSystemPrompt = `You are a concise summarizer. Given raw CLI tool output, extract and present the raw information clearly. Remove any terminal noise, ANSI artifacts, or redundant content. Keep your summary brief and actionable.
Only output the response text.
Examples:
1. if your summarized text is:
"""
Ran \`hi\`: Assistant greeted user ("Hi! How can I help you today?") and awaits input.
"""
Your output should be like:
"""
Hi! How can I help you today?
"""

2. if your summarized text is:
"""
User greeted the AI; AI responded with "Hi. What do you need help with?" User then requested "Explain this codebase". Status: gpt-5.4 high model active, 100% context remaining, working directory ~/Documents/agentspace/tmp.
"""
Your output should be like:
"""
Hi. What do you need help with?
"""

3. if your summarized text is:
"""
› hi
• Hi. What do you need help with?
› Use /skills to list available skills
  gpt-5.4 high · 100% left · ~/Documents/agentspace/tmp
"""
Your output should be like:
"""
Hi. What do you need help with?
"""

4. if your summarized text is:
"""
User greeted the assistant with "hi". Assistant responded: "Hello. How can I help you today?"

**Environment:** Gemini-3.1-Pro model | ~/.../agentspace/tmp | no sandbox | 7 MCP servers, 3 skills active | shortcuts available via ?
"""
Your output should be like:
"""
Hello. How can I help you today?
"""`
    const systemPrompt = this.ctx.repository.getSetting('summarizer.systemPrompt') || defaultSystemPrompt

    console.log('[MessageRouter] Summarizing CLI output via LLM...')

    ApiClient.streamChat(
      { endpoint, apiKey, model, systemPrompt },
      [{ role: 'user', content: `Summarize the following CLI tool output:\n\n${cleanText}` }],
      () => {}, // onChunk — we don't stream the summary
      (fullText) => {
        // Success — use LLM summary
        const summary = fullText?.trim() || summarizeOutput(cleanText)
        this.postCliReply(agent, channelId, summary)
      },
      (err) => {
        // Summarizer failed — fallback to truncation
        console.error('[MessageRouter] Summarizer failed, falling back:', err.message)
        this.postCliReply(agent, channelId, summarizeOutput(cleanText))
      }
    )
  }

  private postCliReply(agent: AgentRecord, channelId: string, content: string): void {
    this.stopThinking(agent.id, channelId)
    const replyMsg = this.ctx.repository.createMessage({
      channelId,
      senderType: 'agent',
      senderId: agent.id,
      content,
    })
    this.broadcast(replyMsg)
    this.retainMemory(agent, channelId, content)
    this.ctx.repository.updateAgentStatus(agent.id, 'idle')
  }

  private dispatchApi(agent: AgentRecord, channelId: string, prompt: string, images: Omit<MessageAttachment, 'id'>[] = []): void {
    if (!agent.apiEndpoint || !agent.apiKey || !agent.model) {
      this.postError(channelId, agent.id, new Error('API agent missing endpoint, key, or model configuration'))
      return
    }

    // Enrich prompt with memory context
    const enrichedPrompt = this.recallContext(agent, channelId, prompt)

    this.ctx.repository.updateAgentStatus(agent.id, 'running')

    // Show thinking indicator
    this.startThinking(agent.id, channelId)

    // Build conversation context from recent channel messages
    const recentMessages = this.ctx.repository.listMessages(channelId, 20)
    const chatMessages: { role: 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }[] = recentMessages.map(m => ({
      role: (m.senderType === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content
    }))

    // Replace last user message with enriched version, and add images if present
    if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'user') {
      if (images.length > 0) {
        // Build multimodal content array for Vision API
        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: enrichedPrompt }
        ]
        for (const img of images) {
          if (img.url) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: img.url } // base64 data URL
            })
          }
        }
        chatMessages[chatMessages.length - 1].content = contentParts
      } else {
        chatMessages[chatMessages.length - 1].content = enrichedPrompt
      }
    }

    // Create a placeholder message that will be updated with streaming content
    let fullResponse = ''
    let replyMsgId: string | null = null

    ApiClient.streamChat(
      {
        endpoint: agent.apiEndpoint,
        apiKey: agent.apiKey,
        model: agent.model,
        systemPrompt: agent.systemPrompt ?? undefined
      },
      chatMessages,
      // onChunk
      (chunk) => {
        // Stop thinking on first chunk — streaming has started
        this.stopThinking(agent.id, channelId)
        fullResponse += chunk
        // Stream partial updates to renderer
        this.broadcast({ type: 'agent-stream-chunk', agentId: agent.id, channelId, chunk, fullText: fullResponse })
      },
      // onDone
      (fullText) => {
        const replyMsg = this.ctx.repository.createMessage({
          channelId,
          senderType: 'agent',
          senderId: agent.id,
          content: fullText || '(No response)',
        })
        this.broadcast(replyMsg)
        this.ctx.repository.updateAgentStatus(agent.id, 'idle')
        // Retain memory
        this.retainMemory(agent, channelId, fullText || '')
      },
      // onError
      (err) => {
        this.stopThinking(agent.id, channelId)
        this.postError(channelId, agent.id, err)
        this.ctx.repository.updateAgentStatus(agent.id, 'error')
      }
    )
  }

  // ─── Thinking indicator ──────────────────────────────────
  private thinkingTimers = new Map<string, ReturnType<typeof setInterval>>()

  private startThinking(agentId: string, channelId: string): void {
    const key = `${agentId}:${channelId}`
    this.stopThinking(agentId, channelId) // clear any existing
    // Send initial verb
    const verb = randomThinkingVerb()
    this.broadcast({ type: 'agent-thinking', agentId, channelId, verb })
    // Rotate verb every 3 seconds
    const timer = setInterval(() => {
      this.broadcast({ type: 'agent-thinking', agentId, channelId, verb: randomThinkingVerb() })
    }, 3000)
    this.thinkingTimers.set(key, timer)
  }

  private stopThinking(agentId: string, channelId: string): void {
    const key = `${agentId}:${channelId}`
    const timer = this.thinkingTimers.get(key)
    if (timer) {
      clearInterval(timer)
      this.thinkingTimers.delete(key)
    }
    this.broadcast({ type: 'agent-thinking', agentId, channelId, verb: null })
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
