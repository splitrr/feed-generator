import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'big-sparse'

// Feed: posts from authors with >500 followers who post at most once per day.
export const handler = async (ctx: AppContext, params: QueryParams) => {
  const limit = params.limit
  const minFollowers = ctx.cfg.minFollowers

  // Subquery: authors with >500 followers
  const popularAuthors = ctx.db
    .selectFrom('follow')
    .select((eb) => eb.ref('subjectDid').as('authorDid'))
    .groupBy('subjectDid')
    .having(sql`count(*)`, '>', minFollowers)

  // Subquery: posts where the author made at most 1 post in the day of the post
  // We compute a per-author, per-day count and filter to rows where that count == 1
  const perDayCounts = ctx.db
    .selectFrom('post')
    .select([
      'author',
      sql<string>`date(createdAt)`.as('day'),
      sql<number>`count(*)`.as('numPosts'),
    ])
    .groupBy('author')
    .groupBy(sql`date(createdAt)`)
    .having(sql`count(*)`, '=', 1)

  let qb = ctx.db
    .selectFrom('post as p')
    .innerJoin(perDayCounts.as('pc'), (join) =>
      join
        .onRef('pc.author', '=', 'p.author')
        .on(sql`pc.day = date(p.createdAt)`),
    )
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


