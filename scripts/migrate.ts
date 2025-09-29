import dotenv from 'dotenv'
import { createDb, migrateToLatest } from '../src/db'

async function main() {
  dotenv.config()
  const sqlitePath = process.env.FEEDGEN_SQLITE_LOCATION || ':memory:'
  const db = createDb(sqlitePath)
  await migrateToLatest(db)
  // @ts-ignore - destroy on dialect
  await (db as any).destroy?.()
  console.log('Migrations complete for', sqlitePath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})


