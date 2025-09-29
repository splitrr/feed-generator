import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Record as FollowRecord } from './lexicon/types/app/bsky/graph/follow'
import { Record as LikeRecord } from './lexicon/types/app/bsky/feed/like'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    // Index follows
    const followsToDelete = ops.follows.deletes.map((del) => del.uri)
    const followsToCreate = ops.follows.creates.map((create) => {
      const record = create.record as FollowRecord
      return {
        uri: create.uri,
        followerDid: create.author,
        subjectDid: record.subject,
        createdAt: record.createdAt,
      }
    })

    if (followsToDelete.length > 0) {
      await this.db.deleteFrom('follow').where('uri', 'in', followsToDelete).execute()
    }
    if (followsToCreate.length > 0) {
      await this.db
        .insertInto('follow')
        .values(followsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .map((create) => {
        const record = create.record as PostRecord
        // Skip replies to avoid threading; only index top-level posts
        if ((record as any)?.reply) {
          return undefined
        }
        return {
          uri: create.uri,
          cid: create.cid,
          indexedAt: new Date().toISOString(),
          author: create.author,
          createdAt: record.createdAt,
        }
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v))

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    // Index likes
    const likesToDelete = ops.likes.deletes.map((del) => del.uri)
    const likesToCreate = ops.likes.creates.map((create) => {
      const record = create.record as LikeRecord
      return {
        uri: create.uri,
        likerDid: create.author,
        subjectUri: record.subject?.uri as string,
        createdAt: (record as any)?.createdAt as string,
      }
    }).filter((v) => v.subjectUri && v.createdAt)

    if (likesToDelete.length > 0) {
      await this.db.deleteFrom('like').where('uri', 'in', likesToDelete).execute()
    }
    if (likesToCreate.length > 0) {
      await this.db
        .insertInto('like')
        .values(likesToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
