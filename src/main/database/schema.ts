import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id                TEXT PRIMARY KEY,
      name              TEXT UNIQUE NOT NULL,
      description       TEXT,
      type              TEXT NOT NULL,
      runtime           TEXT,
      cli_command       TEXT,
      model             TEXT,
      working_dir       TEXT,
      env_vars          TEXT NOT NULL DEFAULT '{}',
      api_endpoint      TEXT,
      api_key           TEXT,
      system_prompt     TEXT,
      memory_capsule_id TEXT,
      status            TEXT NOT NULL DEFAULT 'idle',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      description       TEXT,
      is_dm             INTEGER NOT NULL DEFAULT 0,
      working_dir       TEXT,
      memory_capsule_id TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id        TEXT NOT NULL,
      agent_id          TEXT NOT NULL,
      joined_at         TEXT NOT NULL,
      PRIMARY KEY (channel_id, agent_id),
      FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                TEXT PRIMARY KEY,
      channel_id        TEXT NOT NULL,
      sender_type       TEXT NOT NULL,
      sender_id         TEXT,
      content           TEXT NOT NULL,
      mentions          TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id                TEXT PRIMARY KEY,
      name              TEXT UNIQUE NOT NULL,
      command           TEXT NOT NULL,
      args              TEXT NOT NULL DEFAULT '[]',
      env_vars          TEXT NOT NULL DEFAULT '{}',
      allowed_agents    TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id                TEXT PRIMARY KEY,
      name              TEXT UNIQUE NOT NULL,
      description       TEXT,
      source            TEXT NOT NULL,
      allowed_agents    TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members (channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_members_agent ON channel_members (agent_id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migrations for existing databases
  migrateIfNeeded(db)
}

/**
 * Add missing columns to existing tables.
 * Each ALTER TABLE is wrapped in try/catch so it's safe to run repeatedly
 * (SQLite throws "duplicate column name" if column already exists).
 */
function migrateIfNeeded(db: Database.Database): void {
  const migrations = [
    'ALTER TABLE agents ADD COLUMN cli_command TEXT',
    'ALTER TABLE channels ADD COLUMN is_dm INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE channels ADD COLUMN working_dir TEXT',
    "ALTER TABLE agents ADD COLUMN icon TEXT DEFAULT 'bot'",
  ]
  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }
}
