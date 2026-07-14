/**
 * Feature flags e secrets do bot Telegram.
 * Modo padrão: delivery (vínculo + receber envios da web).
 */

export const isTelegramBotEnabled = () => {
  const raw =
    typeof process.env.TELEGRAM_BOT_ENABLED === 'string'
      ? process.env.TELEGRAM_BOT_ENABLED.trim().toLowerCase()
      : ''
  if (raw === 'false' || raw === '0' || raw === 'off') return false
  return true
}

/**
 * Modo conversacional completo (legado bot-first).
 * Só com TELEGRAM_BOT_CONVERSATIONAL=true|1|on.
 * Padrão: desligado — operação na web; bot só entrega.
 */
export const isTelegramConversationalEnabled = () => {
  const raw =
    typeof process.env.TELEGRAM_BOT_CONVERSATIONAL === 'string'
      ? process.env.TELEGRAM_BOT_CONVERSATIONAL.trim().toLowerCase()
      : ''
  return raw === 'true' || raw === '1' || raw === 'on'
}

export const getWebhookSecret = () => {
  const s =
    typeof process.env.TELEGRAM_WEBHOOK_SECRET === 'string'
      ? process.env.TELEGRAM_WEBHOOK_SECRET.trim()
      : ''
  return s
}

export const getAppUrl = () => {
  const u =
    typeof process.env.APP_URL === 'string'
      ? process.env.APP_URL.trim().replace(/\/$/, '')
      : ''
  return u
}

export const isPremiumOrAdmin = (type) => type === 'admin' || type === 'premium'
