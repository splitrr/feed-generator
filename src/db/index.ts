import SqliteDb from 'better-sqlite3'
import { Kysely, Migrator, SqliteDialect } from 'kysely'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

export const createDb = (location: string): Database => {
  // Configure better-sqlite3 for concurrent read/write and resilience
  const sqlite = new SqliteDb(location, { timeout: 15000 })
  // Persistent and connection-level pragmas to improve concurrency
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('temp_store = MEMORY')
  sqlite.pragma('mmap_size = 134217728')
  sqlite.pragma('cache_size = -20000')
  // Redundant with constructor timeout, but explicit for clarity
  sqlite.pragma('busy_timeout = 15000')

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>
