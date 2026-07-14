/**
 * Token do bot Telegram + coluna telegram_chat_id em app_users.
 * @param {{ query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }} deps
 */
export const createTelegramConfigService = (deps) => {
  const { query } = deps

  let telegramTokenCache = { token: '', fetchedAt: 0 }
  let telegramChatIdColumnCache = { exists: false, fetchedAt: 0 }
  let ensureTelegramChatIdColumnPromise = null

  const setTelegramTokenCache = ({ token, fetchedAt }) => {
    telegramTokenCache = {
      token: typeof token === 'string' ? token : '',
      fetchedAt: typeof fetchedAt === 'number' ? fetchedAt : Date.now(),
    }
  }

  const getTelegramBotToken = async () => {
    const envToken =
      typeof process.env.TELEGRAM_BOT_TOKEN === 'string' ? process.env.TELEGRAM_BOT_TOKEN.trim() : ''
    if (envToken) return envToken

    const now = Date.now()
    if (now - telegramTokenCache.fetchedAt < 30_000) return telegramTokenCache.token

    try {
      const result = await query('select value from app_settings where key = $1 limit 1', [
        'telegram_bot_token',
      ])
      const row = result.rows[0]
      const token = row && typeof row.value === 'string' ? row.value.trim() : ''
      telegramTokenCache = { token, fetchedAt: now }
      return token
    } catch {
      telegramTokenCache = { token: '', fetchedAt: now }
      return ''
    }
  }

  const ensureTelegramChatIdColumn = async () => {
    if (ensureTelegramChatIdColumnPromise) return ensureTelegramChatIdColumnPromise
    ensureTelegramChatIdColumnPromise = (async () => {
      try {
        await query(`alter table app_users add column if not exists telegram_chat_id text`)
        telegramChatIdColumnCache = { exists: true, fetchedAt: Date.now() }
        return true
      } catch {
        telegramChatIdColumnCache = { exists: false, fetchedAt: Date.now() }
        return false
      } finally {
        ensureTelegramChatIdColumnPromise = null
      }
    })()
    return ensureTelegramChatIdColumnPromise
  }

  const hasTelegramChatIdColumn = async () => {
    const now = Date.now()
    if (now - telegramChatIdColumnCache.fetchedAt < 60_000) return telegramChatIdColumnCache.exists

    try {
      const result = await query(
        `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'app_users'
        and column_name = 'telegram_chat_id'
      limit 1
      `,
      )
      const exists = result.rows.length > 0
      if (!exists) {
        return await ensureTelegramChatIdColumn()
      }
      telegramChatIdColumnCache = { exists, fetchedAt: now }
      return exists
    } catch {
      telegramChatIdColumnCache = { exists: false, fetchedAt: now }
      return false
    }
  }

  return {
    setTelegramTokenCache,
    getTelegramBotToken,
    hasTelegramChatIdColumn,
    ensureTelegramChatIdColumn,
  }
}
