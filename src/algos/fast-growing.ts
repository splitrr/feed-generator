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

  // Authors whose follower growth within the window meets threshold
  // growth = max(followers) - min(followers) over the lookback window
  const growthAuthorDids = ctx.db
    .selectFrom('author_stats_history as h')
    .where('h.recordedAt', '>=', windowAgo)
    .groupBy('h.did')
    .having(sql`max(h.followers) - min(h.followers)`, '>=', minIncrease)
    .select('h.did')

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


