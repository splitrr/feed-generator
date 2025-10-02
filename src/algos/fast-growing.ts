import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'fast-growing'

// Feed: authors whose follower count increased by >= cfg.growthMinDailyIncrease
// over the last cfg.growthLookbackDays days. Returns their recent posts.
export const handler = async (ctx: AppContext, params: QueryParams) => {
  const limit = params.limit
  const minIncrease = ctx.cfg.growthMinDailyIncrease
  const lookbackDays = ctx.cfg.growthLookbackDays
  const windowAgo = sql<string>`datetime('now', '-' || ${lookbackDays} || ' days')`
  const windowStartDay = sql<string>`date(${windowAgo})`

  // Authors whose follower growth within the window meets threshold
  // Use daily aggregates to reduce row scans
  // growth = max(maxFollowers) - min(minFollowers) over lookback window days
  const growthAuthorDids = ctx.db
    .selectFrom('author_stats_daily as d')
    .where('d.day', '>=', windowStartDay)
    .groupBy('d.did')
    .having(sql`max(d.maxFollowers) - min(d.minFollowers)`, '>=', minIncrease)
    .select('d.did')

  // Recent posts from growing authors
  const rows = await ctx.db
    .selectFrom('post as p')
    .where('p.createdAt', '>=', windowAgo)
    .where('p.author', 'in', growthAuthorDids)
    .orderBy('p.indexedAt', 'desc')
    .orderBy('p.cid', 'desc')
    .select(['p.uri as uri', 'p.indexedAt as indexedAt', 'p.cid as cid'])
    .limit(limit)
    .execute()

  const feed = rows.map((row) => ({ post: row.uri }))

  let cursor: string | undefined
  const last = rows.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return { cursor, feed }
}


