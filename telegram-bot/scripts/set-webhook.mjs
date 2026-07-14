/**
 * Registra o webhook na Bot API.
 * Uso: node --env-file=.env telegram-bot/scripts/set-webhook.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { createTelegramConfigService } from '../../server/lib/telegram-config.mjs'
import { getAppUrl, getWebhookSecret } from '../lib/config.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(root, '.env') })

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const query = (text, params) => pool.query(text, params)
const { getTelegramBotToken } = createTelegramConfigService({ query })

const main = async () => {
  const token = await getTelegramBotToken()
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN (ou token no admin) ausente.')
    process.exit(1)
  }
  const appUrl = getAppUrl()
  if (!appUrl || !/^https:\/\//i.test(appUrl)) {
    console.error('APP_URL deve ser HTTPS público (ex.: https://api.seudominio.com).')
    process.exit(1)
  }
  const secret = getWebhookSecret()
  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`
  const body = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  }
  if (secret) body.secret_token = secret

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  console.log(JSON.stringify({ webhookUrl, ok: data.ok, description: data.description }, null, 2))
  if (!data.ok) process.exit(1)

  const { isTelegramConversationalEnabled } = await import('../lib/config.mjs')
  const { BOT_COMMANDS } = await import('../lib/format.mjs')
  const { DELIVERY_BOT_COMMANDS } = await import('../handlers/delivery.mjs')
  const commands = isTelegramConversationalEnabled() ? BOT_COMMANDS : DELIVERY_BOT_COMMANDS
  const cmdsRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  })
  const cmdsData = await cmdsRes.json()
  console.log(
    JSON.stringify(
      {
        setMyCommands: cmdsData.ok,
        mode: isTelegramConversationalEnabled() ? 'conversational' : 'delivery',
        count: commands.length,
        description: cmdsData.description,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => pool.end())
