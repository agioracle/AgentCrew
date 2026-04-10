import { existsSync, mkdirSync, readdirSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import { create, use } from '@memvid/sdk'
// Memvid type — re-exported via @memvid/sdk index
type Memvid = Awaited<ReturnType<typeof create>>

// ── Types (public interface unchanged) ──────────────────

export interface RetainInput {
  capsuleId: string
  channelId: string
  content: string
  scope: 'agent' | 'shared'
  agentId?: string | null
  metadata?: Record<string, unknown>
}

export interface RecallInput {
  channelCapsuleId: string
  agentCapsuleId: string
  agentId: string
  query: string
}

export interface RecallItem {
  id: string
  content: string
  scope: 'agent' | 'shared'
  score: number
  createdAt: string
}

// ── Model detection ─────────────────────────────────────

// Map: model directory prefix → memvid embeddingModel name
// Directory names follow HuggingFace cache convention: models--{org}--{model}
const KNOWN_EMBEDDING_MODELS: Array<{ dirPrefix: string; name: string }> = [
  { dirPrefix: 'models--Xenova--bge-small-en',     name: 'bge-small' },
  { dirPrefix: 'models--Xenova--bge-base-en',      name: 'bge-base' },
  { dirPrefix: 'models--nomic-ai--nomic-embed',    name: 'nomic' },
  { dirPrefix: 'models--Xenova--gte-large',        name: 'gte-large' },
]

/**
 * Scan a directory for known embedding model directories.
 * Returns the first matching model name, or null if none found.
 */
function detectEmbeddingModel(modelsDir: string): string | null {
  let dirs: string[]
  try {
    dirs = readdirSync(modelsDir)
  } catch {
    return null
  }
  for (const known of KNOWN_EMBEDDING_MODELS) {
    if (dirs.some(d => d.startsWith(known.dirPrefix))) {
      return known.name
    }
  }
  return null
}

// ── Service ─────────────────────────────────────────────

export class MemoryService {
  private readonly capsuleDir: string
  private readonly modelsDir: string
  private embeddingModel: string | null = null // null = lex only
  private capsules = new Map<string, Memvid>()

  constructor(capsuleDir?: string, modelsDir?: string) {
    this.capsuleDir = capsuleDir ?? path.join(homedir(), '.agentcrew', 'memvid', 'capsules')
    this.modelsDir = modelsDir ?? path.join(homedir(), '.agentcrew', 'models')
    mkdirSync(this.capsuleDir, { recursive: true })
    mkdirSync(this.modelsDir, { recursive: true })

    // Prevent auto-download; models must be pre-installed
    process.env.MEMVID_OFFLINE = '1'
    process.env.MEMVID_MODELS_DIR = this.modelsDir
  }

  /** Detect locally available embedding model. */
  async probeModels(): Promise<void> {
    this.embeddingModel = detectEmbeddingModel(this.modelsDir)
    if (this.embeddingModel) {
      console.log(`[Memory] Embedding model found: ${this.embeddingModel}, search mode: lex+sem`)
    } else {
      console.log('[Memory] No local embedding model found, search mode: lex')
    }
  }

  get hasEmbedding(): boolean {
    return this.embeddingModel !== null
  }

  // ── Public API ──────────────────────────────────────────

  async ensureCapsule(capsuleId: string): Promise<void> {
    await this.openCapsule(capsuleId)
  }

  async retain(input: RetainInput): Promise<void> {
    const mem = await this.openCapsule(input.capsuleId)
    const title = input.scope === 'agent'
      ? `agent-${input.agentId ?? 'unknown'}`
      : `channel-${input.channelId}`

    await mem.put({
      text: input.content,
      title,
      label: input.scope,
      metadata: {
        channelId: input.channelId,
        agentId: input.agentId ?? null,
        capsuleId: input.capsuleId,
        ...input.metadata,
      },
      ...(this.embeddingModel ? {
        enableEmbedding: true,
        embeddingModel: this.embeddingModel,
      } : {}),
    })
  }

  async recall(input: RecallInput): Promise<RecallItem[]> {
    const agentMem = await this.openCapsule(input.agentCapsuleId)
    const channelMem = await this.openCapsule(input.channelCapsuleId)

    const agentScope = `agent-${input.agentId}`

    // Build search tasks — always lex; add sem if embedding model is available.
    // Strategy: sem results first (higher quality), lex fills remaining slots.
    // This ensures both old entries (no embedding) and new entries are searchable.
    const lexTasks = [
      { mem: agentMem, scope: 'agent' as const, filterScope: agentScope },
      { mem: channelMem, scope: 'shared' as const, filterScope: undefined },
    ]
    const semTasks = this.embeddingModel ? [
      { mem: agentMem, scope: 'agent' as const, filterScope: agentScope },
      { mem: channelMem, scope: 'shared' as const, filterScope: undefined },
    ] : []

    // Execute all searches in parallel
    const [lexResults, semResults] = await Promise.all([
      Promise.all(lexTasks.map(({ mem, filterScope }) =>
        mem.find(input.query, { k: 3, mode: 'lex' as const, ...(filterScope ? { scope: filterScope } : {}) })
          .catch(() => null)
      )),
      Promise.all(semTasks.map(({ mem, filterScope }) =>
        mem.find(input.query, { k: 3, mode: 'sem' as const, ...(filterScope ? { scope: filterScope } : {}) })
          .catch(() => null)
      )),
    ])

    // Merge: sem first, lex fills remaining — deduplicate by (scope + frame_id)
    const TOP_K = 3
    const items: RecallItem[] = []
    const seen = new Set<string>()

    const addHits = (result: Awaited<ReturnType<Memvid['find']>> | null, scope: 'agent' | 'shared') => {
      if (!result) return
      for (const hit of result.hits) {
        if (items.length >= TOP_K) return
        const key = `${scope}:${hit.frame_id}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({
          id: String(hit.frame_id),
          content: hit.snippet || hit.title,
          scope,
          score: hit.score,
          createdAt: hit.created_at,
        })
      }
    }

    // 1. sem results first (higher quality)
    for (let i = 0; i < semTasks.length; i++) {
      addHits(semResults[i], semTasks[i].scope)
    }
    // 2. lex fills remaining slots
    for (let i = 0; i < lexTasks.length; i++) {
      addHits(lexResults[i], lexTasks[i].scope)
    }

    return items
  }

  async getEntryCount(capsuleId: string): Promise<number> {
    try {
      const mem = await this.openCapsule(capsuleId)
      const stats = await mem.stats()
      return (stats as any).frame_count ?? 0
    } catch {
      return 0
    }
  }

  async removeCapsule(capsuleId: string): Promise<void> {
    const mem = this.capsules.get(capsuleId)
    if (mem) {
      try { await mem.seal() } catch { /* ignore */ }
      this.capsules.delete(capsuleId)
    }
    const filePath = this.capsulePath(capsuleId)
    try {
      const { rmSync } = await import('fs')
      rmSync(filePath, { force: true })
    } catch { /* ignore */ }
  }

  async closeAll(): Promise<void> {
    for (const [id, mem] of this.capsules) {
      try {
        await mem.seal()
      } catch (err) {
        console.error(`[Memory] Failed to seal capsule ${id}:`, err)
      }
    }
    this.capsules.clear()
    console.log('[Memory] All capsules sealed')
  }

  // ── Internal ────────────────────────────────────────────

  private capsulePath(capsuleId: string): string {
    return path.join(this.capsuleDir, `${capsuleId}.mv2`)
  }

  private async openCapsule(capsuleId: string): Promise<Memvid> {
    const existing = this.capsules.get(capsuleId)
    if (existing) return existing

    const filePath = this.capsulePath(capsuleId)
    let mem: Memvid
    if (existsSync(filePath)) {
      mem = await use('basic', filePath)
    } else {
      mem = await create(filePath, 'basic')
    }
    this.capsules.set(capsuleId, mem)
    return mem
  }
}
