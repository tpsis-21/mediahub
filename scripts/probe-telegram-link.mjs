import pg from 'pg'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const raw = String(process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '')
const pool = new pg.Pool({
  connectionString: raw,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

try {
  const sessions = await pool.query(`
    select s.chat_id, s.state, s.updated_at, u.email, u.type, u.telegram_chat_id
    from telegram_bot_sessions s
    join app_users u on u.id = s.user_id
    order by s.updated_at desc
    limit 10
  `)
  console.log('SESSIONS', JSON.stringify(sessions.rows, null, 2))

  const users = await pool.query(`
    select email, type, telegram_chat_id, updated_at
    from app_users
    where telegram_chat_id is not null and trim(telegram_chat_id) <> ''
    order by updated_at desc nulls last
    limit 10
  `)
  console.log('USERS_WITH_CHAT', JSON.stringify(users.rows, null, 2))

  const tables = await pool.query(`
    select to_regclass('public.telegram_bot_sessions') as sessions,
           to_regclass('public.telegram_link_codes') as links
  `)
  console.log('TABLES', tables.rows[0])
} catch (e) {
  console.log('ERR', e.code || '', e.message)
} finally {
  await pool.end()
}
