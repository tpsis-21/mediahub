/**
 * Cliente fino da Bot API (JSON + multipart para arquivos).
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

  const callMultipart = async (method, form) => {
    const token = await getTelegramBotToken()
    if (!token) {
      const err = new Error('Telegram não configurado.')
      err.code = 'TELEGRAM_NOT_CONFIGURED'
      throw err
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: form,
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

  /** Envia PNG/JPEG a partir de Buffer (Fase 2 banners). */
  const sendPhotoBuffer = async (chatId, buffer, extra = {}) => {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append('photo', new Blob([buffer], { type: 'image/png' }), extra.filename || 'banner.png')
    if (extra.caption) form.append('caption', extra.caption)
    if (extra.parse_mode) form.append('parse_mode', extra.parse_mode)
    if (extra.reply_markup) form.append('reply_markup', JSON.stringify(extra.reply_markup))
    return callMultipart('sendPhoto', form)
  }

  const sendDocumentBuffer = async (chatId, buffer, extra = {}) => {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    form.append(
      'document',
      new Blob([buffer], { type: extra.contentType || 'application/octet-stream' }),
      extra.filename || 'file.bin',
    )
    if (extra.caption) form.append('caption', extra.caption)
    if (extra.parse_mode) form.append('parse_mode', extra.parse_mode)
    return callMultipart('sendDocument', form)
  }

  const answerCallbackQuery = (callbackQueryId, text) =>
    call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text || undefined,
      show_alert: false,
    })

  const deleteMessage = async (chatId, messageId) => {
    try {
      await call('deleteMessage', { chat_id: chatId, message_id: messageId })
    } catch {
      /* bot sem permissão ou mensagem antiga */
    }
  }

  const getMe = () => call('getMe', {})

  return {
    call,
    sendMessage,
    sendPhoto,
    sendPhotoBuffer,
    sendDocumentBuffer,
    answerCallbackQuery,
    deleteMessage,
    getMe,
  }
}
