import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  AgentRecord, AgentDraft,
  ChannelRecord, ChannelWithMembers, ChannelDraft,
  MessageRecord, MessageDraft,
  McpServerRecord, McpServerDraft,
  SkillRecord, SkillDraft,
  BootstrapPayload
} from '../../shared/types'

function now(): string {
  return new Date().toISOString()
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

// ─── Row Mappers ─────────────────────────────────────────

function mapAgent(row: Record<string, unknown>): AgentRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    type: row.type as AgentRecord['type'],
    runtime: (row.runtime as AgentRecord['runtime']) ?? null,
    cliCommand: (row.cli_command as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    workingDir: (row.working_dir as string | null) ?? null,
    envVars: parseJson(row.env_vars as string, {}),
    apiEndpoint: (row.api_endpoint as string | null) ?? null,
    apiKey: (row.api_key as string | null) ?? null,
    systemPrompt: (row.system_prompt as string | null) ?? null,
    memoryCapsuleId: (row.memory_capsule_id as string | null) ?? null,
    icon: (row.icon as string | null) ?? 'bot',
    status: row.status as AgentRecord['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

function mapChannel(row: Record<string, unknown>): ChannelRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    isDm: (row.is_dm as number) === 1,
    workingDir: (row.working_dir as string | null) ?? null,
    memoryCapsuleId: (row.memory_capsule_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    senderType: row.sender_type as MessageRecord['senderType'],
    senderId: (row.sender_id as string | null) ?? null,
    content: row.content as string,
    mentions: parseJson(row.mentions as string, []),
    attachments: parseJson(row.attachments as string, []),
    createdAt: row.created_at as string
  }
}

function mapMcpServer(row: Record<string, unknown>): McpServerRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    command: row.command as string,
    args: parseJson(row.args as string, []),
    envVars: parseJson(row.env_vars as string, {}),
    allowedAgents: parseJson(row.allowed_agents as string, []),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

function mapSkill(row: Record<string, unknown>): SkillRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    source: row.source as string,
    allowedAgents: parseJson(row.allowed_agents as string, []),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

// ─── Repository ──────────────────────────────────────────

export class AgentCrewRepository {
  constructor(private db: Database.Database) {}

  // ── Bootstrap ──
  getBootstrap(): BootstrapPayload {
    return {
      agents: this.listAgents(),
      channels: this.listChannels(),
      mcpServers: this.listMcpServers(),
      skills: this.listSkills()
    }
  }

  // ── Agents ──
  listAgents(): AgentRecord[] {
    return this.db.prepare('SELECT * FROM agents ORDER BY created_at').all().map(r => mapAgent(r as Record<string, unknown>))
  }

  getAgent(id: string): AgentRecord {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    if (!row) throw new Error(`Agent not found: ${id}`)
    return mapAgent(row as Record<string, unknown>)
  }

  createAgent(draft: AgentDraft): AgentRecord {
    const id = randomUUID()
    const ts = now()
    this.db.prepare(`
      INSERT INTO agents (id, name, description, type, runtime, cli_command, model, working_dir, env_vars, api_endpoint, api_key, system_prompt, memory_capsule_id, icon, status, created_at, updated_at)
      VALUES (@id, @name, @description, @type, @runtime, @cli_command, @model, @working_dir, @env_vars, @api_endpoint, @api_key, @system_prompt, @memory_capsule_id, @icon, 'idle', @created_at, @updated_at)
    `).run({
      id,
      name: draft.name,
      description: draft.description ?? null,
      type: draft.type,
      runtime: draft.runtime ?? null,
      cli_command: draft.cliCommand ?? null,
      model: draft.model ?? null,
      working_dir: draft.workingDir ?? null,
      env_vars: JSON.stringify(draft.envVars ?? {}),
      api_endpoint: draft.apiEndpoint ?? null,
      api_key: draft.apiKey ?? null,
      system_prompt: draft.systemPrompt ?? null,
      memory_capsule_id: `agent-${id}`,
      icon: draft.icon ?? 'bot',
      created_at: ts,
      updated_at: ts
    })
    return this.getAgent(id)
  }

  updateAgent(id: string, draft: Partial<AgentDraft>): AgentRecord {
    const existing = this.getAgent(id)
    const ts = now()
    this.db.prepare(`
      UPDATE agents SET
        name = @name, description = @description, type = @type, runtime = @runtime,
        cli_command = @cli_command, model = @model, working_dir = @working_dir, env_vars = @env_vars,
        api_endpoint = @api_endpoint, api_key = @api_key, system_prompt = @system_prompt,
        icon = @icon, updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      name: draft.name ?? existing.name,
      description: draft.description !== undefined ? draft.description : existing.description,
      type: draft.type ?? existing.type,
      runtime: draft.runtime !== undefined ? draft.runtime : existing.runtime,
      cli_command: draft.cliCommand !== undefined ? draft.cliCommand : existing.cliCommand,
      model: draft.model !== undefined ? draft.model : existing.model,
      working_dir: draft.workingDir !== undefined ? draft.workingDir : existing.workingDir,
      env_vars: draft.envVars ? JSON.stringify(draft.envVars) : JSON.stringify(existing.envVars),
      api_endpoint: draft.apiEndpoint !== undefined ? draft.apiEndpoint : existing.apiEndpoint,
      api_key: draft.apiKey !== undefined ? draft.apiKey : existing.apiKey,
      system_prompt: draft.systemPrompt !== undefined ? draft.systemPrompt : existing.systemPrompt,
      icon: draft.icon !== undefined ? draft.icon : existing.icon,
      updated_at: ts
    })
    return this.getAgent(id)
  }

  updateAgentStatus(id: string, status: AgentRecord['status']): void {
    this.db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
  }

  deleteAgent(id: string): void {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }

  // ── Channels ──
  listChannels(): ChannelWithMembers[] {
    const channels = this.db.prepare('SELECT * FROM channels ORDER BY created_at').all().map(r => mapChannel(r as Record<string, unknown>))
    return channels.map(ch => {
      const members = this.db.prepare('SELECT agent_id FROM channel_members WHERE channel_id = ?').all(ch.id)
      const msgCount = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ?').get(ch.id) as { count: number }
      return {
        ...ch,
        memberIds: members.map(m => (m as { agent_id: string }).agent_id),
        messageCount: msgCount.count
      }
    })
  }

  getChannel(id: string): ChannelWithMembers {
    const row = this.db.prepare('SELECT * FROM channels WHERE id = ?').get(id)
    if (!row) throw new Error(`Channel not found: ${id}`)
    const ch = mapChannel(row as Record<string, unknown>)
    const members = this.db.prepare('SELECT agent_id FROM channel_members WHERE channel_id = ?').all(ch.id)
    const msgCount = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ?').get(ch.id) as { count: number }
    return {
      ...ch,
      memberIds: members.map(m => (m as { agent_id: string }).agent_id),
      messageCount: msgCount.count
    }
  }

  createChannel(draft: ChannelDraft): ChannelWithMembers {
    const id = randomUUID()
    const ts = now()
    this.db.prepare(`
      INSERT INTO channels (id, name, description, is_dm, working_dir, memory_capsule_id, created_at, updated_at)
      VALUES (@id, @name, @description, @is_dm, @working_dir, @memory_capsule_id, @created_at, @updated_at)
    `).run({
      id,
      name: draft.name,
      description: draft.description ?? null,
      is_dm: draft.isDm ? 1 : 0,
      working_dir: draft.workingDir ?? null,
      memory_capsule_id: `channel-${id}`,
      created_at: ts,
      updated_at: ts
    })
    if (draft.memberIds?.length) {
      const insertMember = this.db.prepare('INSERT INTO channel_members (channel_id, agent_id, joined_at) VALUES (?, ?, ?)')
      for (const agentId of draft.memberIds) {
        insertMember.run(id, agentId, ts)
      }
    }
    return this.getChannel(id)
  }

  updateChannel(id: string, draft: Partial<ChannelDraft>): ChannelWithMembers {
    const existing = this.getChannel(id)
    const ts = now()
    this.db.prepare(`
      UPDATE channels SET name = @name, description = @description, working_dir = @working_dir, updated_at = @updated_at WHERE id = @id
    `).run({
      id,
      name: draft.name ?? existing.name,
      description: draft.description !== undefined ? draft.description : existing.description,
      working_dir: draft.workingDir !== undefined ? draft.workingDir : existing.workingDir,
      updated_at: ts
    })
    return this.getChannel(id)
  }

  deleteChannel(id: string): void {
    this.db.prepare('DELETE FROM channels WHERE id = ?').run(id)
  }

  addChannelMember(channelId: string, agentId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, agent_id, joined_at) VALUES (?, ?, ?)').run(channelId, agentId, now())
  }

  removeChannelMember(channelId: string, agentId: string): void {
    this.db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND agent_id = ?').run(channelId, agentId)
  }

  // ── Messages ──
  listMessages(channelId: string, limit = 100, before?: string): MessageRecord[] {
    if (before) {
      return this.db.prepare('SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
        .all(channelId, before, limit).map(r => mapMessage(r as Record<string, unknown>)).reverse()
    }
    return this.db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(channelId, limit).map(r => mapMessage(r as Record<string, unknown>)).reverse()
  }

  createMessage(draft: MessageDraft): MessageRecord {
    const id = randomUUID()
    const ts = now()
    
    // Generate IDs for attachments if provided
    const attachments = (draft.attachments ?? []).map(att => ({
      ...att,
      id: randomUUID()
    }))
    
    this.db.prepare(`
      INSERT INTO messages (id, channel_id, sender_type, sender_id, content, mentions, attachments, created_at)
      VALUES (@id, @channel_id, @sender_type, @sender_id, @content, @mentions, @attachments, @created_at)
    `).run({
      id,
      channel_id: draft.channelId,
      sender_type: draft.senderType,
      sender_id: draft.senderId ?? null,
      content: draft.content,
      mentions: JSON.stringify(draft.mentions ?? []),
      attachments: JSON.stringify(attachments),
      created_at: ts
    })
    return mapMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>)
  }
  clearMessages(channelId: string): void {
    this.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId)
  }

  // ── MCP Servers ──
  listMcpServers(): McpServerRecord[] {
    return this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all().map(r => mapMcpServer(r as Record<string, unknown>))
  }

  createMcpServer(draft: McpServerDraft): McpServerRecord {
    const id = randomUUID()
    const ts = now()
    this.db.prepare(`
      INSERT INTO mcp_servers (id, name, command, args, env_vars, allowed_agents, created_at, updated_at)
      VALUES (@id, @name, @command, @args, @env_vars, @allowed_agents, @created_at, @updated_at)
    `).run({
      id, name: draft.name, command: draft.command,
      args: JSON.stringify(draft.args ?? []),
      env_vars: JSON.stringify(draft.envVars ?? {}),
      allowed_agents: JSON.stringify(draft.allowedAgents ?? []),
      created_at: ts, updated_at: ts
    })
    return mapMcpServer(this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown>)
  }

  updateMcpServer(id: string, draft: Partial<McpServerDraft>): McpServerRecord {
    const existing = mapMcpServer(this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown>)
    const ts = now()
    this.db.prepare(`
      UPDATE mcp_servers SET name = @name, command = @command, args = @args, env_vars = @env_vars, allowed_agents = @allowed_agents, updated_at = @updated_at WHERE id = @id
    `).run({
      id,
      name: draft.name ?? existing.name,
      command: draft.command ?? existing.command,
      args: JSON.stringify(draft.args ?? existing.args),
      env_vars: JSON.stringify(draft.envVars ?? existing.envVars),
      allowed_agents: JSON.stringify(draft.allowedAgents ?? existing.allowedAgents),
      updated_at: ts
    })
    return mapMcpServer(this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown>)
  }

  deleteMcpServer(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  }

  // ── Skills ──
  listSkills(): SkillRecord[] {
    return this.db.prepare('SELECT * FROM skills ORDER BY created_at').all().map(r => mapSkill(r as Record<string, unknown>))
  }

  createSkill(draft: SkillDraft): SkillRecord {
    const id = randomUUID()
    const ts = now()
    this.db.prepare(`
      INSERT INTO skills (id, name, description, source, allowed_agents, created_at, updated_at)
      VALUES (@id, @name, @description, @source, @allowed_agents, @created_at, @updated_at)
    `).run({
      id, name: draft.name, description: draft.description ?? null,
      source: draft.source,
      allowed_agents: JSON.stringify(draft.allowedAgents ?? []),
      created_at: ts, updated_at: ts
    })
    return mapSkill(this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown>)
  }

  updateSkill(id: string, draft: Partial<SkillDraft>): SkillRecord {
    const existing = mapSkill(this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown>)
    const ts = now()
    this.db.prepare(`
      UPDATE skills SET name = @name, description = @description, source = @source, allowed_agents = @allowed_agents, updated_at = @updated_at WHERE id = @id
    `).run({
      id,
      name: draft.name ?? existing.name,
      description: draft.description !== undefined ? draft.description : existing.description,
      source: draft.source ?? existing.source,
      allowed_agents: JSON.stringify(draft.allowedAgents ?? existing.allowedAgents),
      updated_at: ts
    })
    return mapSkill(this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown>)
  }

  deleteSkill(id: string): void {
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  }

  // ─── Settings ──────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}
