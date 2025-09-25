export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  follow: Follow
  author_stats: AuthorStats
  author_stats_history: AuthorStatsHistory
}

export type Post = {
  uri: string
  cid: string
  indexedAt: string
  author: string
  createdAt: string
}

export type SubState = {
  service: string
  cursor: number
}

export type Follow = {
  uri: string
  followerDid: string
  subjectDid: string
  createdAt: string
}

export type AuthorStats = {
  did: string
  followers: number
  updatedAt: string
}

export type AuthorStatsHistory = {
  did: string
  followers: number
  recordedAt: string
}