import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'big-sparse'

// Feed: posts from authors with >minFollowers followers who posted no more than
// 30 times in the last 30 days. Returns recent posts by those authors.
export const handler = async (ctx: AppContext, params: QueryParams) => {
  const limit = params.limit
  const minFollowers = ctx.cfg.minFollowers
  const thirtyDaysAgo = sql<string>`datetime('now', '-30 days')`

  // Subquery: authors with >500 followers
  const popularAuthors = ctx.db
    .selectFrom('follow')
    .select((eb) => eb.ref('subjectDid').as('authorDid'))
    .groupBy('subjectDid')
    .having(sql`count(*)`, '>', minFollowers)

  // Subquery: authors who made no more than 30 posts in the last 30 days
  const monthCounts = ctx.db
    .selectFrom('post')
    .where('createdAt', '>=', thirtyDaysAgo)
    .select([
      'author',
      sql<number>`count(*)`.as('numPosts30d'),
    ])
    .groupBy('author')
    .having(sql`count(*)`, '<=', 30)

  let qb = ctx.db
    .selectFrom('post as p')
    .innerJoin(monthCounts.as('mc'), (join) =>
      join.onRef('mc.author', '=', 'p.author'),
    )
    .where('p.createdAt', '>=', thirtyDaysAgo)
    .where('p.author', 'in', popularAuthors)
    .orderBy('p.indexedAt', 'desc')
    .orderBy('p.cid', 'desc')
    .select([
      'p.uri as uri',
      'p.indexedAt as indexedAt',
      'p.cid as cid',
    ])
    .limit(limit)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    qb = qb.where('p.indexedAt', '<', timeStr)
  }

  const rows = await qb.execute()

  const feed = rows.map((row) => ({ post: row.uri }))

  let cursor: string | undefined
  const last = rows.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}


