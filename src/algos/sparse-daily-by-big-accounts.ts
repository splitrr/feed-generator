import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'big-sparse'

// Feed: posts from authors with >minFollowers followers who posted no more than
// cfg.maxPostsInWindow times in the last cfg.maxPostsWindowDays days.
// Returns recent posts by those authors.
export const handler = async (ctx: AppContext, params: QueryParams) => {
  const limit = params.limit
  const minFollowers = ctx.cfg.minFollowers
  const days = ctx.cfg.maxPostsWindowDays
  const maxPosts = ctx.cfg.maxPostsInWindow
  const windowAgo = sql<string>`datetime('now', '-' || ${days} || ' days')`

  // Subquery: authors with >500 followers
  const popularAuthors = ctx.db
    .selectFrom('follow')
    .select((eb) => eb.ref('subjectDid').as('authorDid'))
    .groupBy('subjectDid')
    .having(sql`count(*)`, '>', minFollowers)

  // Subquery: authors who made no more than maxPosts posts in the window
  const monthCounts = ctx.db
    .selectFrom('post')
    .where('createdAt', '>=', windowAgo)
    .select([
      'author',
      sql<number>`count(*)`.as('numPosts30d'),
    ])
    .groupBy('author')
    .having(sql`count(*)`, '<=', maxPosts)

  let qb = ctx.db
    .selectFrom('post as p')
    .innerJoin(monthCounts.as('mc'), (join) =>
      join.onRef('mc.author', '=', 'p.author'),
    )
    .where('p.createdAt', '>=', windowAgo)
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


