import pg from 'pg'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const url = String(process.env.DATABASE_URL || '')
  .trim()
  .replace(/^["']|["']$/g, '')
const chatId = process.argv[2] || '1656282192'
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 })

try {
  const u = await pool.query(
    `select id, email from app_users where telegram_chat_id = $1 limit 1`,
    [chatId],
  )
  if (!u.rows[0]) {
    console.log('NO_USER_FOR_CHAT', chatId)
    process.exit(1)
  }
  await pool.query(
    `
    insert into telegram_bot_sessions (chat_id, user_id, state, context, updated_at)
    values ($1, $2, 'linked', '{}'::jsonb, now())
    on conflict (chat_id) do update set
      user_id = excluded.user_id,
      state = 'linked',
      updated_at = now()
    `,
    [chatId, u.rows[0].id],
  )
  console.log('SESSION_OK', u.rows[0].email, chatId)

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (token) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'MediaHub: vínculo reconhecido. Envie /menu no bot.',
      }),
    })
    const j = await r.json()
    console.log('TG_MSG', j.ok, j.description || '')
  }
} finally {
  await pool.end()
}
