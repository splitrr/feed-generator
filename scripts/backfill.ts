import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'
import { createDb, migrateToLatest, Database } from '../src/db'
import { sql } from 'kysely'

// Backfill recent posts into local SQLite so frequency filters are accurate.
// Strategy: find popular authors from local 'follow' table, then fetch their
// recent posts from the public Bluesky API and insert minimal metadata.

type BackfillConfig = {
  sqliteLocation: string
  minFollowers: number
  windowDays: number
  maxAuthors: number
  maxPostsPerAuthor: number
}

const nowIso = () => new Date().toISOString()

async function getPopularAuthors(db: Database, minFollowers: number, limit: number): Promise<string[]> {
  const rows = await db
    .selectFrom('follow')
    .select((eb) => [eb.ref('subjectDid').as('authorDid'), sql<number>`count(*)`.as('numFollowers')])
    .groupBy('subjectDid')
    .having(sql`count(*)`, '>', minFollowers)
    .orderBy(sql`count(*)`, 'desc')
    .limit(limit)
    .execute()
  return rows.map((r: any) => r.authorDid as string)
}

async function backfillAuthor(
  agent: AtpAgent,
  db: Database,
  authorDid: string,
  windowDays: number,
  maxPosts: number,
): Promise<number> {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  let cursor: string | undefined = undefined
  let inserted = 0

  while (true) {
    const res = await agent.api.app.bsky.feed.getAuthorFeed({ actor: authorDid, limit: 100, cursor, filter: 'posts_no_replies' as any })
    const feed = res.data.feed
    if (!feed?.length) break

    for (const item of feed) {
      const post = item.post
      // Ensure required fields exist
      const uri = post?.uri
      const cid = post?.cid
      const createdAt = (post as any)?.record?.createdAt as string | undefined
      const author = post?.author?.did

      if (!uri || !cid || !createdAt || !author) continue
      const createdMs = Date.parse(createdAt)
      if (isNaN(createdMs)) continue
      if (createdMs < cutoffMs) {
        // We've reached outside the window; stop for this author
        return inserted
      }

      try {
        await db
          .insertInto('post')
          .values({ uri, cid, author, createdAt, indexedAt: nowIso() })
          .onConflict((oc) => oc.doNothing())
          .execute()
        inserted++
        if (inserted >= maxPosts) return inserted
      } catch {
        // ignore row-level errors
      }
    }

    cursor = res.data.cursor
    if (!cursor) break
  }

  return inserted
}

async function run() {
  dotenv.config()
  const cfg: BackfillConfig = {
    sqliteLocation: process.env.FEEDGEN_SQLITE_LOCATION || 'data.sqlite',
    minFollowers: parseInt(process.env.FEEDGEN_MIN_FOLLOWERS || '500', 10),
    windowDays: parseInt(process.env.FEEDGEN_MAX_POSTS_WINDOW_DAYS || '30', 10),
    maxAuthors: parseInt(process.env.FEEDGEN_BACKFILL_MAX_AUTHORS || '200', 10),
    maxPostsPerAuthor: parseInt(process.env.FEEDGEN_BACKFILL_MAX_POSTS_PER_AUTHOR || '200', 10),
  }

  const db = createDb(cfg.sqliteLocation)
  await migrateToLatest(db)

  const agent = new AtpAgent({ service: 'https://public.api.bsky.app' })

  const authors = await getPopularAuthors(db, cfg.minFollowers, cfg.maxAuthors)
  if (authors.length === 0) {
    console.log('No authors meet the minFollowers threshold yet. Try lowering FEEDGEN_MIN_FOLLOWERS or wait for more follow data to index.')
    process.exit(0)
  }

  console.log(`Backfilling last ${cfg.windowDays} days for ${authors.length} authors (cap ${cfg.maxPostsPerAuthor} posts/author) ...`)
  let total = 0
  for (const [i, did] of authors.entries()) {
    try {
      const n = await backfillAuthor(agent, db, did, cfg.windowDays, cfg.maxPostsPerAuthor)
      total += n
      if ((i + 1) % 10 === 0) console.log(`Processed ${i + 1}/${authors.length} authors; inserted so far: ${total}`)
    } catch (err) {
      console.warn(`Backfill failed for ${did}:`, (err as Error).message)
    }
  }
  console.log(`Done. Inserted approximately ${total} posts.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})


