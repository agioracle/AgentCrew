import type Database from 'better-sqlite3'

export function seedDefaultData(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number }).count
  if (count > 0) return

  const ts = new Date().toISOString()
  const id = 'channel-default-all'

  db.prepare(`
    INSERT INTO channels (id, name, description, memory_capsule_id, created_at, updated_at)
    VALUES (@id, @name, @description, @memory_capsule_id, @created_at, @updated_at)
  `).run({
    id,
    name: 'all',
    description: 'General channel for all members',
    memory_capsule_id: `channel-${id}`,
    created_at: ts,
    updated_at: ts
  })
}
