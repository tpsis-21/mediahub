/**
 * Cliente fino da Bot API (JSON).
 * @param {{ getTelegramBotToken: () => Promise<string> }} deps
 */
export const createBotApi = (deps) => {
  const { getTelegramBotToken } = deps

  const call = async (method, body) => {
    const token = await getTelegramBotToken()
    if (!token) {
      const err = new Error('Telegram não configurado.')
      err.code = 'TELEGRAM_NOT_CONFIGURED'
      throw err
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.description || `Bot API ${method} falhou`)
      err.code = 'TELEGRAM_API_ERROR'
      err.status = res.status
      err.payload = data
      throw err
    }
    return data
  }

  const sendMessage = (chatId, text, extra = {}) =>
    call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: extra.parse_mode || 'HTML',
      disable_web_page_preview: extra.disable_web_page_preview !== false,
      reply_markup: extra.reply_markup,
    })

  const sendPhoto = (chatId, photo, extra = {}) =>
    call('sendPhoto', {
      chat_id: chatId,
      photo,
      caption: extra.caption,
      parse_mode: extra.parse_mode || 'HTML',
      reply_markup: extra.reply_markup,
    })

  const answerCallbackQuery = (callbackQueryId, text) =>
    call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text || undefined,
      show_alert: false,
    })

  const getMe = () => call('getMe', {})

  return { call, sendMessage, sendPhoto, answerCallbackQuery, getMe }
}
