/**
 * Feature flags e secrets do bot conversacional.
 */

export const isTelegramBotEnabled = () => {
  const raw = typeof process.env.TELEGRAM_BOT_ENABLED === 'string' ? process.env.TELEGRAM_BOT_ENABLED.trim().toLowerCase() : ''
  if (raw === 'false' || raw === '0' || raw === 'off') return false
  // default: ligado (token pode vir do admin/DB mesmo sem TELEGRAM_BOT_TOKEN no env)
  return true
}

export const getWebhookSecret = () => {
  const s = typeof process.env.TELEGRAM_WEBHOOK_SECRET === 'string' ? process.env.TELEGRAM_WEBHOOK_SECRET.trim() : ''
  return s
}

export const getAppUrl = () => {
  const u = typeof process.env.APP_URL === 'string' ? process.env.APP_URL.trim().replace(/\/$/, '') : ''
  return u
}

export const isPremiumOrAdmin = (type) => type === 'admin' || type === 'premium'
