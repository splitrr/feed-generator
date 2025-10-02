import dotenv from 'dotenv'
import { sql } from 'kysely'
import { createDb } from '../src/db'

async function main() {
  dotenv.config()
  const sqlitePath = process.env.FEEDGEN_SQLITE_LOCATION ?? 'data.sqlite'
  const db = createDb(sqlitePath)
  try {
    // if table absent, nothing to prune
    try {
      await db.selectFrom('author_stats_history').select(sql`1`.as('one')).limit(1).execute()
    } catch {
      console.log('author_stats_history not found; nothing to prune.')
      await (db as any).destroy?.()
      return
    }

    // Optional retention days, default 7
    const days = parseInt(process.env.FEEDGEN_HISTORY_RETENTION_DAYS || '7', 10)
    const cutoff = sql<string>`datetime('now', '-' || ${days} || ' days')`

    const before = await db
      .selectFrom('author_stats_history')
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirst()

    await db.deleteFrom('author_stats_history').where('recordedAt', '<', cutoff).execute()

    // Reclaim space
    await sql`PRAGMA optimize`.execute(db)
    await sql`VACUUM`.execute(db)

    const after = await db
      .selectFrom('author_stats_history')
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirst()

    const deleted = (before?.count ?? 0) - (after?.count ?? 0)
    console.log(`Pruned ${deleted} old author_stats_history rows; ran optimize and VACUUM.`)
  } finally {
    await (db as any).destroy?.()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


