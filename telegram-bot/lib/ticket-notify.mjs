/**
 * Bridge Telegram ↔ tickets (reuso bot + rotas HTTP).
 */
export const createTicketTelegramBridge = (deps) => {
  const { query, getTelegramBotToken } = deps

  const sendHtml = async (chatId, text, reply_markup) => {
    const token = await getTelegramBotToken()
    if (!token || !chatId) return false
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  const listAdminChats = async () => {
    const result = await query(
      `
      select distinct chat_id from (
        select s.chat_id
        from telegram_bot_sessions s
        join app_users u on u.id = s.user_id
        where u.type = 'admin' and u.is_active = true
        union
        select trim(u.telegram_chat_id) as chat_id
        from app_users u
        where u.type = 'admin'
          and u.is_active = true
          and u.telegram_chat_id is not null
          and length(trim(u.telegram_chat_id)) > 0
      ) t
      where chat_id is not null and length(trim(chat_id)) > 0
      `,
    )
    return result.rows.map((r) => String(r.chat_id).trim())
  }

  const getUserChat = async (userId) => {
    const result = await query(
      `
      select coalesce(
        (select s.chat_id from telegram_bot_sessions s where s.user_id = $1 limit 1),
        (select trim(u.telegram_chat_id) from app_users u where u.id = $1 limit 1)
      ) as chat_id
      `,
      [userId],
    )
    const c = result.rows[0]?.chat_id
    return c ? String(c).trim() : ''
  }

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const notifyAdminsNewTicket = async ({ ticketId, subject, message, userName, userEmail }) => {
    const targets = await listAdminChats()
    const text = [
      '<b>Novo chamado</b>',
      `#${ticketId} · ${esc(subject)}`,
      `De: ${esc(userName || '—')} · ${esc(userEmail || '')}`,
      '',
      esc(String(message || '').slice(0, 500)),
    ].join('\n')
    const reply_markup = {
      inline_keyboard: [
        [{ text: 'Abrir chamado', callback_data: `tkt:admin:${ticketId}` }],
        [{ text: 'Fila', callback_data: 'admin:tickets' }],
      ],
    }
    for (const chatId of targets) {
      await sendHtml(chatId, text, reply_markup)
    }
  }

  const notifyUserTicketUpdate = async ({ userId, ticketId, message, statusLabel }) => {
    const chatId = await getUserChat(userId)
    if (!chatId) return
    const text = [
      `<b>Atualização do chamado #${ticketId}</b>`,
      statusLabel ? `Status: ${esc(statusLabel)}` : '',
      message ? `\n${esc(String(message).slice(0, 800))}` : '',
      '',
      'Responda pelo bot em Suporte → Meus chamados.',
    ]
      .filter(Boolean)
      .join('\n')
    await sendHtml(chatId, text, {
      inline_keyboard: [[{ text: 'Ver chamado', callback_data: `tkt:view:${ticketId}` }]],
    })
  }

  return { notifyAdminsNewTicket, notifyUserTicketUpdate, listAdminChats, getUserChat, sendHtml }
}
