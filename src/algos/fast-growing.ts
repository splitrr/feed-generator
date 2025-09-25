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

  // Compute growth per author from history: latest - earliest in window
  const growth = ctx.db
    .selectFrom('author_stats_history as h1')
    .innerJoin('author_stats_history as h0', (join) =>
      join
        .onRef('h0.did', '=', 'h1.did')
        .on(sql`h0.recordedAt <= ${windowAgo}`),
    )
    .select([
      'h1.did as did',
      sql<number>`max(h1.followers) - min(h0.followers)`.as('growth'),
    ])
    .groupBy('h1.did')
    .having(sql`max(h1.followers) - min(h0.followers)`, '>=', minIncrease)

  // Recent posts from growing authors
  const rows = await ctx.db
    .selectFrom('post as p')
    .where('p.createdAt', '>=', windowAgo)
    .where('p.author', 'in', growth)
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


