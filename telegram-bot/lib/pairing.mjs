import crypto from 'node:crypto'

/**
 * Códigos de vínculo web → Telegram (`/start link_XXXX`).
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }} deps
 */
export const createPairingService = (deps) => {
  const { query } = deps

  const normalizeCode = (raw) =>
    String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/^LINK[_-]?/i, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12)

  const createLinkCode = async (userId, { ttlMinutes = 10 } = {}) => {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    const expiresAt = new Date(Date.now() + Math.max(1, ttlMinutes) * 60_000)
    await query(`delete from telegram_link_codes where user_id = $1 or expires_at < now()`, [userId])
    await query(
      `insert into telegram_link_codes (code, user_id, expires_at) values ($1, $2, $3)`,
      [code, userId, expiresAt.toISOString()],
    )
    return { code, expiresAt: expiresAt.toISOString(), startPayload: `link_${code}` }
  }

  const consumeLinkCode = async (rawCode) => {
    const code = normalizeCode(rawCode)
    if (!code) return { ok: false, reason: 'invalid' }

    const result = await query(
      `
      select c.code, c.user_id, c.expires_at, u.is_active, u.email, u.name, u.type
      from telegram_link_codes c
      join app_users u on u.id = c.user_id
      where c.code = $1
      limit 1
      `,
      [code],
    )
    const row = result.rows[0]
    if (!row) return { ok: false, reason: 'not_found' }
    if (!row.is_active) return { ok: false, reason: 'inactive' }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await query(`delete from telegram_link_codes where code = $1`, [code])
      return { ok: false, reason: 'expired' }
    }

    await query(`delete from telegram_link_codes where code = $1 or user_id = $2`, [code, row.user_id])
    return {
      ok: true,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      type: row.type,
    }
  }

  const linkChatToUser = async ({ chatId, userId }) => {
    const chat = String(chatId)
    await query(
      `
      update app_users
      set telegram_chat_id = $1, updated_at = now()
      where id = $2
      `,
      [chat, userId],
    )
    // Um chat = uma conta; remove outras sessões deste chat
    await query(`delete from telegram_bot_sessions where chat_id = $1`, [chat])
    await query(
      `
      insert into telegram_bot_sessions (chat_id, user_id, state, context, updated_at)
      values ($1, $2, 'linked', '{}'::jsonb, now())
      `,
      [chat, userId],
    )
  }

  const unlinkChat = async ({ chatId }) => {
    const chat = String(chatId)
    await query(
      `
      update app_users
      set telegram_chat_id = null, updated_at = now()
      where telegram_chat_id = $1
      `,
      [chat],
    )
    await query(`delete from telegram_bot_sessions where chat_id = $1`, [chat])
  }

  return { createLinkCode, consumeLinkCode, linkChatToUser, unlinkChat, normalizeCode }
}
