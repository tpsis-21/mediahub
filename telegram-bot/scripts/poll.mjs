/**
 * Long polling local: repassa updates para a API (`POST /api/telegram/webhook`).
 * Suba antes: `npm run dev:api`
 *
 * Uso: node --env-file=.env telegram-bot/scripts/poll.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { createTelegramConfigService } from '../../server/lib/telegram-config.mjs'
import { getWebhookSecret } from '../lib/config.mjs'
import { readEnvPort } from '../../scripts/read-env-port.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(root, '.env') })

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const query = (text, params) => pool.query(text, params)
const { getTelegramBotToken } = createTelegramConfigService({ query })

const apiPort = Number(process.env.PORT || readEnvPort() || 8081) || 8081
const webhookUrl = `http://127.0.0.1:${apiPort}/api/telegram/webhook`
const secret = getWebhookSecret()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const main = async () => {
  const token = await getTelegramBotToken()
  if (!token) {
    console.error('Token Telegram ausente.')
    process.exit(1)
  }

  const base = `https://api.telegram.org/bot${token}`
  await fetch(`${base}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  })

  console.log(`[poll] encaminhando updates → ${webhookUrl}`)
  let offset = 0

  for (;;) {
    try {
      const res = await fetch(`${base}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        console.error('[poll] getUpdates', data.description)
        await sleep(3000)
        continue
      }
      for (const update of data.result || []) {
        offset = Math.max(offset, (update.update_id || 0) + 1)
        const headers = { 'Content-Type': 'application/json' }
        if (secret) headers['X-Telegram-Bot-Api-Secret-Token'] = secret
        const fwd = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(update),
        })
        if (!fwd.ok) {
          console.error('[poll] webhook local', fwd.status, await fwd.text().catch(() => ''))
        } else {
          console.log('[poll] update', update.update_id)
        }
      }
    } catch (e) {
      console.error('[poll]', e?.message || e)
      await sleep(2000)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
