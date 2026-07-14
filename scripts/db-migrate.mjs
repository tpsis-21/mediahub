import 'dotenv/config'
import pg from 'pg'
import { runMigrations } from '../server/db/migrate.mjs'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Defina DATABASE_URL')
  process.exit(2)
}

const pool = new pg.Pool({ connectionString: url })
try {
  const result = await runMigrations(
    {
      query: (text, params) => pool.query(text, params),
    },
    { logger: console },
  )
  console.log(
    `Migrations: ${result.applied.length} aplicadas, ${result.skipped.length} já existentes`,
  )
} finally {
  await pool.end()
}
