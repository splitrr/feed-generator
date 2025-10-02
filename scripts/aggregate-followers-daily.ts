import dotenv from 'dotenv'
import { sql } from 'kysely'
import { createDb, migrateToLatest } from '../src/db'

async function main() {
  dotenv.config()
  const sqlitePath = process.env.FEEDGEN_SQLITE_LOCATION ?? 'data.sqlite'
  const db = createDb(sqlitePath)
  await migrateToLatest(db)

  // Check if history table exists; if not, nothing to do
  try {
    await db.selectFrom('author_stats_history').select(sql`1`.as('one')).limit(1).execute()
  } catch {
    console.log('author_stats_history table not found. Nothing to aggregate.')
    await (db as any).destroy?.()
    return
  }

  // Aggregate per did per day into author_stats_daily
  // day is derived from recordedAt's date part
  const rows = await db
    .selectFrom('author_stats_history as h')
    .select([
      'h.did as did',
      sql<string>`substr(h.recordedAt, 1, 10)`.as('day'),
      sql<number>`min(h.followers)`.as('minFollowers'),
      sql<number>`max(h.followers)`.as('maxFollowers'),
    ])
    .groupBy('h.did')
    .groupBy(sql`substr(h.recordedAt, 1, 10)`)
    .execute()

  let upserts = 0
  for (const r of rows as any[]) {
    const existing = await db
      .selectFrom('author_stats_daily')
      .select(['minFollowers', 'maxFollowers'])
      .where('did', '=', r.did)
      .where('day', '=', r.day)
      .executeTakeFirst()
    if (!existing) {
      await db
        .insertInto('author_stats_daily')
        .values({ did: r.did, day: r.day, minFollowers: r.minFollowers, maxFollowers: r.maxFollowers })
        .execute()
    } else {
      await db
        .updateTable('author_stats_daily')
        .set({
          minFollowers: Math.min(existing.minFollowers, r.minFollowers),
          maxFollowers: Math.max(existing.maxFollowers, r.maxFollowers),
        })
        .where('did', '=', r.did)
        .where('day', '=', r.day)
        .execute()
    }
    upserts++
  }

  console.log(`Aggregated ${upserts} daily follower rows into author_stats_daily.`)
  await (db as any).destroy?.()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


