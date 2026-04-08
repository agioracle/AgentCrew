// ─── Enums ───────────────────────────────────────────────

export type AgentType = 'cli' | 'api'
export type AgentStatus = 'idle' | 'running' | 'error'
export type SenderType = 'human' | 'agent'
export type CliRuntime = 'claude-code' | 'codex' | 'gemini-cli' | 'custom-cli'

// ─── CLI Detection ──────────────────────────────────────

export interface CliRuntimeInfo {
  runtime: CliRuntime
  label: string
  command: string
  available: boolean
  path: string | null
  version: string | null
}

// ─── Agent ───────────────────────────────────────────────

export interface AgentRecord {
  id: string
  name: string
  description: string | null
  type: AgentType
  // CLI fields
  runtime: CliRuntime | null
  cliCommand: string | null
  model: string | null
  workingDir: string | null
  envVars: Record<string, string>
  // API fields
  apiEndpoint: string | null
  apiKey: string | null
  systemPrompt: string | null
  // Common
  memoryCapsuleId: string | null
  icon: string
  status: AgentStatus
  createdAt: string
  updatedAt: string
}

export interface AgentDraft {
  name: string
  description?: string | null
  type: AgentType
  runtime?: CliRuntime | null
  cliCommand?: string | null
  model?: string | null
  workingDir?: string | null
  envVars?: Record<string, string>
  apiEndpoint?: string | null
  apiKey?: string | null
  systemPrompt?: string | null
  icon?: string
}

// ─── Channel ─────────────────────────────────────────────

export interface ChannelRecord {
  id: string
  name: string
  description: string | null
  isDm: boolean
  workingDir: string | null
  memoryCapsuleId: string | null
  createdAt: string
  updatedAt: string
}

export interface ChannelWithMembers extends ChannelRecord {
  memberIds: string[]
  messageCount: number
}

export interface ChannelDraft {
  name: string
  description?: string | null
  isDm?: boolean
  workingDir?: string | null
  memberIds?: string[]
}

// ─── Message ─────────────────────────────────────────────

export interface MessageRecord {
  id: string
  channelId: string
  senderType: SenderType
  senderId: string | null
  content: string
  mentions: string[]
  createdAt: string
}

export interface MessageDraft {
  channelId: string
  senderType: SenderType
  senderId?: string | null
  content: string
  mentions?: string[]
}

// ─── MCP Server ──────────────────────────────────────────

export interface McpServerRecord {
  id: string
  name: string
  command: string
  args: string[]
  envVars: Record<string, string>
  allowedAgents: string[]
  createdAt: string
  updatedAt: string
}

export interface McpServerDraft {
  name: string
  command: string
  args?: string[]
  envVars?: Record<string, string>
  allowedAgents?: string[]
}

// ─── Skill ───────────────────────────────────────────────

export interface SkillRecord {
  id: string
  name: string
  description: string | null
  source: string
  allowedAgents: string[]
  createdAt: string
  updatedAt: string
}

export interface SkillDraft {
  name: string
  description?: string | null
  source: string
  allowedAgents?: string[]
}

// ─── Bootstrap ───────────────────────────────────────────

export interface BootstrapPayload {
  agents: AgentRecord[]
  channels: ChannelWithMembers[]
  mcpServers: McpServerRecord[]
  skills: SkillRecord[]
}
