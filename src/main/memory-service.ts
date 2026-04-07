import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

interface MemoryEntry {
  id: string
  content: string
  scope: 'agent' | 'shared'
  agentId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  uri: string
}

interface CapsulePayload {
  entries: MemoryEntry[]
}

interface RecallItem {
  id: string
  content: string
  scope: 'agent' | 'shared'
  score: number
  createdAt: string
}

interface RetainInput {
  capsuleId: string
  channelId: string
  content: string
  scope: 'agent' | 'shared'
  agentId?: string | null
  metadata?: Record<string, unknown>
}

interface RecallInput {
  channelCapsuleId: string
  agentCapsuleId: string
  agentId: string
  query: string
}

function now(): string {
  return new Date().toISOString()
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9_:-]+/).filter(Boolean)
}

function scoreEntry(entry: MemoryEntry, query: string, agentId: string): number {
  const haystack = [entry.content, entry.uri, ...Object.values(entry.metadata).map(String)].join(' ').toLowerCase()
  let score = entry.scope === 'shared' ? 0.18 : 0.24
  for (const token of tokenize(query)) {
    if (haystack.includes(token)) score += 0.17
  }
  if (entry.agentId === agentId) score += 0.08
  const ageHours = Math.max(0, (Date.now() - Date.parse(entry.createdAt)) / 3_600_000)
  score += Math.max(0, 0.06 - ageHours * 0.001)
  return Number(score.toFixed(3))
}

/**
 * Simplified MemvidService using JSON shim capsules.
 * When @memvid/sdk is available, it can be upgraded to use native .mv2 files.
 * For now, this provides the dual-capsule topology with lexical recall.
 */
export class MemoryService {
  private readonly capsuleDir: string

  constructor(capsuleDir?: string) {
    this.capsuleDir = capsuleDir ?? path.join(homedir(), '.agentcrew', 'memvid', 'capsules')
    mkdirSync(this.capsuleDir, { recursive: true })
  }

  /** Ensure a capsule file exists */
  ensureCapsule(capsuleId: string): void {
    const filePath = this.capsulePath(capsuleId)
    if (!existsSync(filePath)) {
      this.writeCapsule(filePath, { entries: [] })
    }
  }

  /** Write a memory entry to a capsule */
  retain(input: RetainInput): void {
    this.ensureCapsule(input.capsuleId)
    const filePath = this.capsulePath(input.capsuleId)
    const capsule = this.readCapsule(filePath)

    const entryId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const entry: MemoryEntry = {
      id: entryId,
      content: input.content,
      scope: input.scope,
      agentId: input.scope === 'agent' ? (input.agentId ?? null) : null,
      metadata: {
        ...input.metadata,
        channelId: input.channelId,
        capsuleId: input.capsuleId,
      },
      createdAt: now(),
      uri: input.scope === 'shared'
        ? `mv2://channels/${input.channelId}/${entryId}`
        : `mv2://agents/${input.agentId ?? 'unknown'}/${entryId}`,
    }

    capsule.entries.unshift(entry)
    capsule.entries = capsule.entries.slice(0, 500) // cap at 500 entries
    this.writeCapsule(filePath, capsule)
  }

  /** Recall relevant memories for an agent in a channel context */
  recall(input: RecallInput): RecallItem[] {
    this.ensureCapsule(input.agentCapsuleId)
    this.ensureCapsule(input.channelCapsuleId)

    const agentCapsule = this.readCapsule(this.capsulePath(input.agentCapsuleId))
    const channelCapsule = this.readCapsule(this.capsulePath(input.channelCapsuleId))

    // Score agent private entries
    const agentHits = agentCapsule.entries
      .filter(e => e.scope === 'agent' && e.agentId === input.agentId)
      .map(e => ({
        id: e.id,
        content: e.content,
        scope: e.scope,
        score: scoreEntry(e, input.query, input.agentId),
        createdAt: e.createdAt
      }))

    // Score channel shared entries
    const channelHits = channelCapsule.entries
      .filter(e => e.scope === 'shared')
      .map(e => ({
        id: e.id,
        content: e.content,
        scope: e.scope,
        score: scoreEntry(e, input.query, input.agentId),
        createdAt: e.createdAt
      }))

    // Merge, deduplicate, sort by score, take top 3
    const all = [...agentHits, ...channelHits]
      .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))

    const seen = new Set<string>()
    const result: RecallItem[] = []
    for (const item of all) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      result.push(item)
      if (result.length >= 3) break
    }

    return result
  }

  /** Get capsule entry count */
  getEntryCount(capsuleId: string): number {
    const filePath = this.capsulePath(capsuleId)
    if (!existsSync(filePath)) return 0
    return this.readCapsule(filePath).entries.length
  }

  /** Remove a capsule file */
  removeCapsule(capsuleId: string): void {
    const filePath = this.capsulePath(capsuleId)
    rmSync(filePath, { force: true })
  }

  private capsulePath(capsuleId: string): string {
    return path.join(this.capsuleDir, `${capsuleId}.json`)
  }

  private readCapsule(filePath: string): CapsulePayload {
    if (!existsSync(filePath)) return { entries: [] }
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as CapsulePayload
    } catch {
      return { entries: [] }
    }
  }

  private writeCapsule(filePath: string, payload: CapsulePayload): void {
    writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  }
}
