import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { initializeSchema } from './schema'

export function createDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  initializeSchema(db)
  return db
}
