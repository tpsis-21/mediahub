/**
 * Sessões conversacionais (chat_id → user + FSM).
 * @param {{
 *   query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>,
 *   deactivateExpiredPremiumByUserId?: (userId: string) => Promise<void>,
 * }} deps
 */
export const createSessionStore = (deps) => {
  const { query, deactivateExpiredPremiumByUserId } = deps

  const mapRow = (row) => {
    if (!row || !row.is_active) return null
    return {
      chatId: row.chat_id || row.telegram_chat_id,
      userId: row.user_id || row.id,
      state: typeof row.state === 'string' ? row.state : 'linked',
      context: row.context && typeof row.context === 'object' ? row.context : {},
      user: {
        id: row.user_id || row.id,
        email: row.email,
        name: row.name,
        type: row.type,
        subscriptionEnd: row.subscription_end,
        telegramChatId: row.telegram_chat_id,
      },
    }
  }

  const upsert = async ({ chatId, userId, state = 'linked', context = {} }) => {
    await query(
      `
      insert into telegram_bot_sessions (chat_id, user_id, state, context, updated_at)
      values ($1, $2, $3, $4::jsonb, now())
      on conflict (chat_id) do update set
        user_id = excluded.user_id,
        state = excluded.state,
        context = excluded.context,
        updated_at = now()
      `,
      [String(chatId), userId, state, JSON.stringify(context || {})],
    )
  }

  /**
   * Se já existe telegram_chat_id no perfil (vínculo manual na Minha Área),
   * cria a sessão do bot automaticamente.
   */
  const ensureFromUserChatId = async (chatId) => {
    const id = String(chatId || '').trim()
    if (!id) return null
    const result = await query(
      `
      select id as user_id, email, name, type, is_active, subscription_end, telegram_chat_id
      from app_users
      where telegram_chat_id = $1
        and is_active = true
      order by updated_at desc nulls last
      limit 1
      `,
      [id],
    )
    const row = result.rows[0]
    if (!row) return null
    await upsert({ chatId: id, userId: row.user_id, state: 'linked', context: {} })
    return getByChatId(id)
  }

  const getByChatId = async (chatId) => {
    const id = String(chatId || '').trim()
    if (!id) return null
    const result = await query(
      `
      select s.chat_id, s.user_id, s.state, s.context, s.updated_at,
             u.email, u.name, u.type, u.is_active, u.subscription_end, u.telegram_chat_id
      from telegram_bot_sessions s
      join app_users u on u.id = s.user_id
      where s.chat_id = $1
      limit 1
      `,
      [id],
    )
    let row = result.rows[0]
    if (row?.user_id && typeof deactivateExpiredPremiumByUserId === 'function') {
      await deactivateExpiredPremiumByUserId(row.user_id)
      const refreshed = await query(
        `
        select s.chat_id, s.user_id, s.state, s.context, s.updated_at,
               u.email, u.name, u.type, u.is_active, u.subscription_end, u.telegram_chat_id
        from telegram_bot_sessions s
        join app_users u on u.id = s.user_id
        where s.chat_id = $1
        limit 1
        `,
        [id],
      )
      row = refreshed.rows[0] || row
    }
    const mapped = mapRow(row)
    if (mapped) return mapped
    return ensureFromUserChatId(id)
  }

  const patch = async (chatId, { state, context, mergeContext = true }) => {
    const current = await getByChatId(chatId)
    if (!current) return null
    const nextState = typeof state === 'string' ? state : current.state
    const nextContext =
      context === undefined
        ? current.context
        : mergeContext
          ? { ...current.context, ...context }
          : context
    await upsert({
      chatId,
      userId: current.userId,
      state: nextState,
      context: nextContext,
    })
    return getByChatId(chatId)
  }

  const remove = async (chatId) => {
    await query(`delete from telegram_bot_sessions where chat_id = $1`, [String(chatId)])
  }

  return { getByChatId, upsert, patch, remove, ensureFromUserChatId }
}
