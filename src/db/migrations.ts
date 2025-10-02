import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      // added in 002; included here for fresh databases
      .addColumn('author', 'varchar')
      .addColumn('createdAt', 'varchar')
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
    // create follow table for fresh databases (added in 002)
    await db.schema
      .createTable('follow')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('followerDid', 'varchar', (col) => col.notNull())
      .addColumn('subjectDid', 'varchar', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute()

    // author_stats table for follower count backfill (created if not exists)
    await db.schema
      .createTable('author_stats')
      .ifNotExists()
      .addColumn('did', 'varchar', (col) => col.primaryKey())
      .addColumn('followers', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('updatedAt', 'varchar', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropTable('follow').execute()
    await db.schema.dropTable('author_stats').execute()
  },
}

// Create author_stats for existing databases
migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('author_stats')
      .ifNotExists()
      .addColumn('did', 'varchar', (col) => col.primaryKey())
      .addColumn('followers', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('updatedAt', 'varchar', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('author_stats').execute()
  },
}

// Follower history snapshots for growth-based feeds
migrations['003'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('author_stats_history')
      .ifNotExists()
      .addColumn('did', 'varchar', (col) => col.notNull())
      .addColumn('followers', 'integer', (col) => col.notNull())
      .addColumn('recordedAt', 'varchar', (col) => col.notNull())
      .execute()

    // Helpful indexes
    await db.schema
      .createIndex('author_stats_history_did_recordedAt_idx')
      .ifNotExists()
      .on('author_stats_history')
      .columns(['did', 'recordedAt'])
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('author_stats_history_did_recordedAt_idx').ifExists().execute()
    await db.schema.dropTable('author_stats_history').ifExists().execute()
  },
}

// Likes persistence for future ranking/filters
migrations['004'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('like')
      .ifNotExists()
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('likerDid', 'varchar', (col) => col.notNull())
      .addColumn('subjectUri', 'varchar', (col) => col.notNull())
      .addColumn('createdAt', 'varchar', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('like_subjectUri_idx')
      .ifNotExists()
      .on('like')
      .column('subjectUri')
      .execute()

    await db.schema
      .createIndex('like_createdAt_idx')
      .ifNotExists()
      .on('like')
      .column('createdAt')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('like_createdAt_idx').ifExists().execute()
    await db.schema.dropIndex('like_subjectUri_idx').ifExists().execute()
    await db.schema.dropTable('like').ifExists().execute()
  },
}

// Backfill changes for existing databases
// No 002 migration required for fresh local dev; 001 creates needed schema.

// Daily aggregation for follower history to reduce storage
migrations['005'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('author_stats_daily')
      .ifNotExists()
      .addColumn('did', 'varchar', (col) => col.notNull())
      .addColumn('day', 'varchar', (col) => col.notNull()) // ISO date YYYY-MM-DD
      .addColumn('minFollowers', 'integer', (col) => col.notNull())
      .addColumn('maxFollowers', 'integer', (col) => col.notNull())
      .execute()

    // Ensure did+day uniqueness for safe upserts
    await db.schema
      .createIndex('author_stats_daily_did_day_unique')
      .unique()
      .ifNotExists()
      .on('author_stats_daily')
      .columns(['did', 'day'])
      .execute()

    // Helpful lookup indexes
    await db.schema
      .createIndex('author_stats_daily_day_idx')
      .ifNotExists()
      .on('author_stats_daily')
      .column('day')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('author_stats_daily_day_idx').ifExists().execute()
    await db.schema.dropIndex('author_stats_daily_did_day_unique').ifExists().execute()
    await db.schema.dropTable('author_stats_daily').ifExists().execute()
  },
}
