import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as sparseDaily from './sparse-daily-by-big-accounts'
import * as fastGrowing from './fast-growing'

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [sparseDaily.shortname]: sparseDaily.handler,
  [fastGrowing.shortname]: fastGrowing.handler,
}

export default algos
