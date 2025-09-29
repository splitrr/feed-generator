import dotenv from 'dotenv'
import { sql } from 'kysely'
import { createDb } from '../src/db'

async function main() {
  dotenv.config()
  const sqlitePath = process.env.FEEDGEN_SQLITE_LOCATION ?? 'data.sqlite'
  const db = createDb(sqlitePath)
  try {
    // Probe if table exists
    try {
      await db.selectFrom('author_stats_history').select(sql`1`.as('one')).limit(1).execute()
    } catch (err) {
      console.log('author_stats_history table not found. Nothing to clean.')
      await (db as any).destroy?.()
      return
    }

    const before = await db
      .selectFrom('author_stats_history')
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirst()

    await db.deleteFrom('author_stats_history').execute()
    await sql`VACUUM`.execute(db)

    const deleted = before?.count ?? 0
    console.log(`Removed ${deleted} rows from author_stats_history and vacuumed database.`)
  } finally {
    await (db as any).destroy?.()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})




