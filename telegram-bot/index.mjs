/**
 * Bot Telegram conversacional — ponto de entrada.
 * Monta rotas na API Express sem misturar com telegram-routes (envio outbound).
 */
import { createBotApi } from './lib/bot-api.mjs'
import { createBannerRenderer } from './lib/banner-render.mjs'
import { isTelegramBotEnabled, getWebhookSecret, getAppUrl } from './lib/config.mjs'
import { createDispatch } from './lib/dispatch.mjs'
import { createPairingService } from './lib/pairing.mjs'
import { createSessionStore } from './lib/session.mjs'
import { createBotServices } from './lib/services.mjs'
import { createTicketTelegramBridge } from './lib/ticket-notify.mjs'
import { BOT_COMMANDS } from './lib/format.mjs'
import { createHandlers } from './handlers/index.mjs'

/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerTelegramBot = (app, deps) => {
  const {
    requireAuth,
    query,
    pool,
    getTelegramBotToken,
    rateLimitTelegram,
    assertAndIncrementDailySearchQuota,
    getSearchProviderSettingsKeys,
    getSearchProviderImageBaseUrl,
    fetchSearchProviderJson,
    getSearchProviderCache,
    setSearchProviderCache,
    getStableObjectKey,
    uniqStrings,
    getSearchProviderErrorMessage,
    ensureSearchHistorySchema,
    getFootballSettings,
    getZonedNowParts,
    getDefaultFootballScheduleDate,
    refreshFootballSchedule,
    parseClockTime,
    normalizeFootballCrestUrl,
    normalizeFootballSearchText,
    isPlaceholderFootballTeamCrestUrl,
    getTicketsEnabled,
    deactivateExpiredPremiumByUserId,
    normalizeTrendingPayload,
    createCanvas,
    loadImage,
    GlobalFonts,
    normalizeEmail,
    createPasswordDigest,
    verifyPassword,
    getAllowRegistrations,
    resolveTrailerUrlFromProvider,
  } = deps

  const sessions = createSessionStore({ query, deactivateExpiredPremiumByUserId })
  const pairing = createPairingService({ query })
  const api = createBotApi({ getTelegramBotToken })
  const ticketTelegram = createTicketTelegramBridge({ query, getTelegramBotToken })
  const banners =
    typeof createCanvas === 'function'
      ? createBannerRenderer({ createCanvas, loadImage, GlobalFonts })
      : null
  const services = createBotServices({
    query,
    pool,
    assertAndIncrementDailySearchQuota,
    getSearchProviderSettingsKeys,
    getSearchProviderImageBaseUrl,
    fetchSearchProviderJson,
    getSearchProviderCache,
    setSearchProviderCache,
    getStableObjectKey,
    uniqStrings,
    getSearchProviderErrorMessage,
    ensureSearchHistorySchema,
    getFootballSettings,
    getZonedNowParts,
    getDefaultFootballScheduleDate,
    refreshFootballSchedule,
    parseClockTime,
    normalizeFootballCrestUrl,
    normalizeFootballSearchText,
    isPlaceholderFootballTeamCrestUrl,
    getTicketsEnabled,
    deactivateExpiredPremiumByUserId,
    normalizeTrendingPayload,
    normalizeEmail,
    createPasswordDigest,
    verifyPassword,
    getAllowRegistrations,
    resolveTrailerUrlFromProvider,
  })
  const handlers = createHandlers({
    api,
    sessions,
    pairing,
    services,
    banners,
    ticketNotify: ticketTelegram,
  })
  const { handleUpdate } = createDispatch(handlers)

  const syncBotCommands = async () => {
    try {
      if (!(await getTelegramBotToken())) return
      await api.setMyCommands(BOT_COMMANDS)
    } catch (e) {
      console.warn('[telegram-bot] setMyCommands', e?.message || e)
    }
  }
  void syncBotCommands()

  const processUpdateSafe = async (update) => {
    try {
      await handleUpdate(update)
    } catch (e) {
      console.error('[telegram-bot] update error', e?.message || e)
    }
  }

  /** Webhook Telegram */
  app.post('/api/telegram/webhook', async (req, res) => {
    if (!isTelegramBotEnabled()) {
      res.status(503).json({ message: 'Bot conversacional desativado.' })
      return
    }

    const secret = getWebhookSecret()
    if (secret) {
      const header = req.get('X-Telegram-Bot-Api-Secret-Token') || ''
      if (header !== secret) {
        res.status(401).json({ message: 'Unauthorized.' })
        return
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[telegram-bot] TELEGRAM_WEBHOOK_SECRET ausente em produção')
      res.status(503).json({ message: 'Webhook sem secret configurado.' })
      return
    }

    res.status(200).json({ ok: true })
    void processUpdateSafe(req.body)
  })

  /** Gera código + deep link (Minha Área) */
  app.post('/api/telegram/bot/link-code', requireAuth, rateLimitTelegram, async (req, res) => {
    try {
      if (!isTelegramBotEnabled()) {
        res.status(503).json({ message: 'Bot conversacional desativado.' })
        return
      }
      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: 'Telegram não configurado.' })
        return
      }

      const created = await pairing.createLinkCode(req.auth.userId)
      let botUsername = ''
      try {
        const me = await api.getMe()
        botUsername = me?.result?.username || ''
      } catch {
        botUsername = ''
      }

      const deepLink = botUsername
        ? `https://t.me/${botUsername}?start=${created.startPayload}`
        : ''

      res.json({
        code: created.code,
        expiresAt: created.expiresAt,
        startPayload: created.startPayload,
        botUsername,
        deepLink,
        startCommand: `/start ${created.startPayload}`,
        appUrl: getAppUrl() || null,
      })
    } catch (e) {
      console.error('[telegram-bot] link-code', e)
      res.status(500).json({ message: 'Não foi possível gerar o código.' })
    }
  })

  /** Status simples (admin / debug) */
  app.get('/api/telegram/bot/status', requireAuth, async (req, res) => {
    try {
      const enabled = isTelegramBotEnabled()
      const token = await getTelegramBotToken()
      res.json({
        enabled,
        tokenConfigured: Boolean(token),
        webhookSecretConfigured: Boolean(getWebhookSecret()),
        appUrl: getAppUrl() || null,
      })
    } catch {
      res.status(500).json({ message: 'Falha ao ler status.' })
    }
  })

  return { handleUpdate, processUpdateSafe, sessions, pairing, api, ticketTelegram }
}

export { isTelegramBotEnabled, getWebhookSecret, getAppUrl }
