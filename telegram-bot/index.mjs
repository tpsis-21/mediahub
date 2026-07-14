/**
 * Bot Telegram — vínculo (webhook) + ponte de tickets.
 * Envio de conteúdo: rotas web `/api/telegram/send*` (mesmo token).
 * Padrão: delivery. Conversacional só com TELEGRAM_BOT_CONVERSATIONAL=true.
 */
import { createBotApi } from './lib/bot-api.mjs'
import { createBannerRenderer } from './lib/banner-render.mjs'
import {
  isTelegramBotEnabled,
  isTelegramConversationalEnabled,
  getWebhookSecret,
  getAppUrl,
} from './lib/config.mjs'
import { createDispatch } from './lib/dispatch.mjs'
import { createPairingService } from './lib/pairing.mjs'
import { createSessionStore } from './lib/session.mjs'
import { createBotServices } from './lib/services.mjs'
import { createTicketTelegramBridge } from './lib/ticket-notify.mjs'
import { BOT_COMMANDS } from './lib/format.mjs'
import { createHandlers } from './handlers/index.mjs'
import { createDeliveryHandlers, DELIVERY_BOT_COMMANDS } from './handlers/delivery.mjs'

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

  const conversational = isTelegramConversationalEnabled()
  const sessions = createSessionStore({ query, deactivateExpiredPremiumByUserId })
  const pairing = createPairingService({ query })
  const api = createBotApi({ getTelegramBotToken })
  const ticketTelegram = createTicketTelegramBridge({ query, getTelegramBotToken })

  let handlers
  if (conversational) {
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
    handlers = createHandlers({
      api,
      sessions,
      pairing,
      services,
      banners,
      ticketNotify: ticketTelegram,
    })
  } else {
    handlers = createDeliveryHandlers({ api, sessions, pairing })
  }

  const { handleUpdate } = createDispatch(handlers)
  const botCommands = conversational ? BOT_COMMANDS : DELIVERY_BOT_COMMANDS

  const syncBotCommands = async () => {
    try {
      if (!(await getTelegramBotToken())) return
      await api.setMyCommands(botCommands)
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

  app.post('/api/telegram/webhook', async (req, res) => {
    if (!isTelegramBotEnabled()) {
      res.status(503).json({ message: 'Bot Telegram desativado.' })
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

  app.post('/api/telegram/bot/link-code', requireAuth, rateLimitTelegram, async (req, res) => {
    try {
      if (!isTelegramBotEnabled()) {
        res.status(503).json({ message: 'Bot Telegram desativado.' })
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
        mode: conversational ? 'conversational' : 'delivery',
      })
    } catch (e) {
      console.error('[telegram-bot] link-code', e)
      res.status(500).json({ message: 'Não foi possível gerar o código.' })
    }
  })

  /** Status do código de vínculo (polling da Minha Área). */
  app.get('/api/telegram/bot/link-status', requireAuth, rateLimitTelegram, async (req, res) => {
    try {
      const raw = typeof req.query?.code === 'string' ? req.query.code : ''
      const code = pairing.normalizeCode(raw)
      if (!code) {
        res.status(400).json({ message: 'Código inválido.' })
        return
      }

      const pending = await query(
        `
        select code, expires_at
        from telegram_link_codes
        where user_id = $1
          and (code = $2 or code = $3)
        order by expires_at desc
        limit 1
        `,
        [req.auth.userId, code, `USED_${code}`],
      )
      const row = pending.rows[0]
      if (row) {
        if (String(row.code).startsWith('USED_')) {
          const userRes = await query(
            `select telegram_chat_id from app_users where id = $1 limit 1`,
            [req.auth.userId],
          )
          const chatId =
            typeof userRes.rows[0]?.telegram_chat_id === 'string'
              ? userRes.rows[0].telegram_chat_id.trim()
              : ''
          res.json({
            status: chatId ? 'linked' : 'expired',
            linked: Boolean(chatId),
            chatId: chatId || null,
          })
          return
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
          await query(`delete from telegram_link_codes where code = $1`, [code])
          res.json({ status: 'expired', linked: false, chatId: null })
          return
        }
        res.json({ status: 'waiting', linked: false, chatId: null })
        return
      }

      res.json({ status: 'expired', linked: false, chatId: null })
    } catch (e) {
      console.error('[telegram-bot] link-status', e)
      res.status(500).json({ message: 'Falha ao consultar vínculo.' })
    }
  })

  app.get('/api/telegram/bot/status', requireAuth, async (_req, res) => {
    try {
      const token = await getTelegramBotToken()
      res.json({
        enabled: isTelegramBotEnabled(),
        mode: conversational ? 'conversational' : 'delivery',
        tokenConfigured: Boolean(token),
        webhookSecretConfigured: Boolean(getWebhookSecret()),
        appUrl: getAppUrl() || null,
      })
    } catch {
      res.status(500).json({ message: 'Falha ao ler status.' })
    }
  })

  console.info(
    `[telegram-bot] mode=${conversational ? 'conversational' : 'delivery'} — envio de conteúdo via /api/telegram/send*`,
  )

  return {
    handleUpdate,
    processUpdateSafe,
    sessions,
    pairing,
    api,
    ticketTelegram,
    mode: conversational ? 'conversational' : 'delivery',
  }
}

export {
  isTelegramBotEnabled,
  isTelegramConversationalEnabled,
  getWebhookSecret,
  getAppUrl,
}
