export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  follow: Follow
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