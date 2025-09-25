import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'
import { createDb, migrateToLatest } from '../src/db'
import { sql } from 'kysely'

// Backfill follower counts into author_stats using the public API.
// This lets you filter by FEEDGEN_MIN_FOLLOWERS accurately immediately.

async function run() {
  dotenv.config()
  const db = createDb(process.env.FEEDGEN_SQLITE_LOCATION || 'data.sqlite')
  await migrateToLatest(db)

  const agent = new AtpAgent({ service: 'https://public.api.bsky.app' })

  // Choose stalest authors first (those missing history/updatedAt or oldest updatedAt)
  const trickle = (process.env.FEEDGEN_BACKFILL_FOLLOWERS_TRICKLE || '').toLowerCase() === 'true'
  const maxAuthors = trickle
    ? Number.MAX_SAFE_INTEGER
    : parseInt(process.env.FEEDGEN_BACKFILL_FOLLOWERS_MAX_AUTHORS || '5000', 10)
  const sleepMs = parseInt(process.env.FEEDGEN_BACKFILL_FOLLOWERS_SLEEP_MS || '0', 10)
  const maxRunMinutes = parseInt(process.env.FEEDGEN_BACKFILL_FOLLOWERS_MAX_RUN_MINUTES || '0', 10)
  const timeBudgetMs = maxRunMinutes > 0 ? maxRunMinutes * 60 * 1000 : 0
  const startedAt = Date.now()
  const authors = await db
    .selectFrom('post as p')
    .leftJoin('author_stats as s', 's.did', 'p.author')
    .select([sql`p.author`.as('author'), 's.updatedAt'])
    .groupBy(['p.author', 's.updatedAt'])
    .orderBy(sql`COALESCE(s.updatedAt, '1970-01-01T00:00:00.000Z')`, 'asc')
    .limit(maxAuthors)
    .execute()

  const dids = authors.map((a: any) => a.author as string).filter(Boolean)
  if (dids.length === 0) {
    console.log('No authors in post table yet. Run for later or seed posts first.')
    return
  }

  console.log(`Fetching follower counts for ~${dids.length} authors ...`)
  let updated = 0
  const chunk = 25 // app.bsky.actor.getProfiles supports batching
  for (let i = 0; i < dids.length; i += chunk) {
    const batch = dids.slice(i, i + chunk)
    try {
      const res = await agent.api.app.bsky.actor.getProfiles({ actors: batch as any })
      for (const p of res.data.profiles) {
        const did = p.did
        const followers = p.followersCount ?? 0
        await db
          .insertInto('author_stats')
          .values({ did, followers, updatedAt: new Date().toISOString() })
          .onConflict((oc) => oc.column('did').doUpdateSet({ followers, updatedAt: new Date().toISOString() }))
          .execute()
        // snapshot history for growth feeds
        await db
          .insertInto('author_stats_history')
          .values({ did, followers, recordedAt: new Date().toISOString() })
          .execute()
        updated++
      }
    } catch (err) {
      console.warn('Batch failed:', (err as Error).message)
    }
    if (sleepMs > 0) {
      await new Promise((r) => setTimeout(r, sleepMs))
    }
    if (timeBudgetMs > 0 && Date.now() - startedAt >= timeBudgetMs) {
      console.log('Time budget reached; stopping early to trickle updates.')
      break
    }
    if ((i / chunk) % 20 === 0) {
      console.log(`Processed ${Math.min(i + chunk, dids.length)}/${dids.length}`)
    }
  }

  console.log(`Done. Updated ${updated} author follower counts.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})


