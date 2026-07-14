import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const r = await pool.query(
    `select email, type, is_active, created_at::date as created
     from app_users
     order by created_at asc nulls last
     limit 50`,
  )
  console.log(`total_rows=${r.rows.length}`)
  for (const row of r.rows) {
    console.log(
      [row.email, row.type, row.is_active ? 'active' : 'inactive', String(row.created)].join(' | '),
    )
  }
} finally {
  await pool.end()
}
