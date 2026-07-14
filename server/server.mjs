import dotenv from 'dotenv'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import dns from 'node:dns'
import fs from 'node:fs'
import net from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnvPort } from '../scripts/read-env-port.mjs'

const __rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__rootDir, '.env') })
}

try {
  // Evita timeout em ambientes que resolvem IPv6 primeiro sem rota válida.
  dns.setDefaultResultOrder('ipv4first')
} catch {
  void 0
}

import express from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import multer from 'multer'
import nodemailer from 'nodemailer'

const { Pool } = pg
import { isSafeExternalHttpUrl } from './lib/safe-url.mjs'
import { createRequestIdMiddleware } from './lib/request-id.mjs'
import { runMigrations } from './db/migrate.mjs'
import {
  runProcess,
  resolveVideoBrandingFonts,
  hasBinary,
  resolveFfmpegCommand,
  resolveYtdl,
  resolveYtdlpExec,
  resolveBundledYtdlpCommand,
  isYouTubeTrailerUrl,
  isYouTubeTrailerId,
  buildYouTubeTrailerUrlFromId,
  stripYouTubeUrlsFromText,
  resolveTrailerUrlFromProvider as resolveTrailerUrlFromProviderCore,
  downloadToFile,
  escapeFfmpegText,
  escapeFfmpegPath,
  resolveFfmpegDrawtextFont,
  safeRm,
  cleanupStaleTempFiles,
} from './lib/media-tools.mjs'
import {
  FOOTBALL_SETTINGS_KEYS,
  DEFAULT_FOOTBALL_TIME_ZONE,
  DEFAULT_FOOTBALL_READ_TIME,
  DEFAULT_FOOTBALL_READ_WINDOW_START,
  DEFAULT_FOOTBALL_READ_WINDOW_END,
  DEFAULT_FOOTBALL_EXCLUDED_CHANNELS,
  DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS,
  normalizeFootballFilterToken,
  parseFootballSettingList,
  getZonedNowParts,
  addDaysToIsoDate,
  parseClockTime,
  parseFootballLine,
  parseFutebolNaTvSchedule,
  prettifyFootballTeamFromSlug,
  normalizeFootballCompetitionLabel,
  extractFootballCompetitionFromHref,
  normalizeFootballSearchText,
  isPlaceholderFootballTeamCrestUrl,
  normalizeFootballCrestUrl,
  parseFutebolNaTvBrSchedule,
  parseFutebolNaTvBrMarkdownSchedule,
  parseFootballScheduleFromSource,
  parseOneFootballMarkdownSchedule,
  isLikelyBlockedHtml,
  stripHtml,
  toJinaReaderUrl,
  fetchTextWithHeaders,
  resolveFootballSourceFetchUrl,
  resolveOneFootballFetchUrl,
} from './lib/football-parse.mjs'
import { createFootballScheduleService } from './lib/football-schedule.mjs'
import {
  createSearchProviderService,
  getSearchProviderErrorMessage,
  getStableObjectKey,
  normalizeTrendingPayload,
  uniqStrings,
  SEARCH_PROVIDER_SETTINGS_KEYS,
} from './lib/search-provider.mjs'

import { clientIp, createRateLimiter } from './lib/rate-limit.mjs'
import { createPasswordDigest, generateRandomPassword, verifyPassword } from './lib/password.mjs'
import { evaluateFreeDailySearchQuota } from './lib/search-quota.mjs'
import { createAuthMiddleware, publicUserFromRow } from './lib/auth-middleware.mjs'
import { createAppSettingsService } from './lib/app-settings.mjs'
import { createFootballCrestProxy, setFootballCrestCorsHeaders } from './lib/football-crest.mjs'
import { createIsAllowedOrigin } from './lib/cors.mjs'
import { createTelegramConfigService } from './lib/telegram-config.mjs'
import { bootstrapCanvasRuntime } from './lib/canvas-runtime.mjs'
import { createDebugSession } from './lib/debug-session.mjs'
import { registerAuthRoutes } from './routes/auth-routes.mjs'
import { registerSearchRoutes } from './routes/search-routes.mjs'
import { registerFootballRoutes } from './routes/football-routes.mjs'
import { registerHealthRoutes } from './routes/health-routes.mjs'
import { registerHistoryRoutes } from './routes/history-routes.mjs'
import { registerTicketRoutes } from './routes/ticket-routes.mjs'
import { registerMeRoutes } from './routes/me-routes.mjs'
import { registerTelegramRoutes } from './routes/telegram-routes.mjs'
import { registerTelegramBot } from '../telegram-bot/index.mjs'
import { registerAdminRoutes } from './routes/admin-routes.mjs'
import { registerVideoRoutes } from './routes/video-routes.mjs'
import { registerDebugRoutes } from './routes/debug-routes.mjs'
const require = createRequire(import.meta.url)

const {
  appendDebugNdjsonToSessionFiles,
  appendFootballDebugNdjson,
  clearSessionDebugRing,
  getSessionDebugSnapshot,
  apiBootAt: __apiBootAt,
} = createDebugSession({ rootDir: __rootDir })

const canvasRuntime = bootstrapCanvasRuntime({ rootDir: __rootDir, require })
let {
  createCanvas,
  GlobalFonts,
  loadImage,
} = canvasRuntime
let isCanvasRuntimeHealthy = canvasRuntime.isCanvasRuntimeHealthy

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

const isProductionEnv = process.env.NODE_ENV === 'production'
const rawPort = String(process.env.PORT || '').trim()
const resolvedListenPort = rawPort ? Number(rawPort) : readEnvPort()
const stripEnvQuotes = (value) => {
  const s = String(value || '').trim()
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1).trim()
  }
  return s
}

const PORT =
  Number.isFinite(resolvedListenPort) && resolvedListenPort > 0 ? resolvedListenPort : 8081
const HOST = process.env.HOST || '0.0.0.0'
/** URL direta do Postgres (obrigatória). Com Supabase em rede só IPv4, use também pooler — ver `getPgConnectionForPool`. */
const DATABASE_URL_DIRECT = stripEnvQuotes(process.env.DATABASE_URL || '')
const JWT_SECRET = stripEnvQuotes(process.env.JWT_SECRET || '')
const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGIN || ''
const ALLOWED_ORIGINS = String(ALLOWED_ORIGINS_RAW)
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v.length > 0)
const decodeBase64Utf8 = (value) => Buffer.from(String(value || '').trim(), 'base64').toString('utf8').trim()
const validateUserId = (sub) => {
  if (typeof sub === 'number' && Number.isFinite(sub) && sub > 0) return sub
  if (typeof sub === 'string') {
    const trimmed = sub.trim()
    if (trimmed.length === 0) return null
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    return trimmed
  }
  return null
}
const DEFAULT_SEARCH_PROVIDER_BASE_URL = decodeBase64Utf8('aHR0cHM6Ly9hcGkudGhlbW92aWVkYi5vcmcvMw==')
const DEFAULT_SEARCH_PROVIDER_IMAGE_BASE_URL = decodeBase64Utf8('aHR0cHM6Ly9pbWFnZS50bWRiLm9yZy90L3A=')
const SEARCH_PROVIDER_BASE_URL = process.env.SEARCH_PROVIDER_BASE_URL || process.env.SEARCH_API_BASE_URL || DEFAULT_SEARCH_PROVIDER_BASE_URL
const SEARCH_PROVIDER_IMAGE_BASE_URL =
  process.env.SEARCH_PROVIDER_IMAGE_BASE_URL || process.env.SEARCH_IMAGE_BASE_URL || DEFAULT_SEARCH_PROVIDER_IMAGE_BASE_URL
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT || 0)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || ''
const APP_URL = stripEnvQuotes(process.env.APP_URL || '')

if (!DATABASE_URL_DIRECT) {
  throw new Error('DATABASE_URL não configurado')
}

/**
 * Supabase: `db.<ref>.supabase.co` costuma resolver só em IPv6. O modo Session do Supavisor usa host `aws-0-<região>.pooler.supabase.com` (IPv4).
 * Opções no .env: `DATABASE_POOLER_URL` (URI completa do painel, modo Session) ou `SUPABASE_POOLER_REGION=sa-east-1` ou `SUPABASE_POOLER_HOST=aws-0-....pooler.supabase.com`.
 */
const tryBuildSupabaseSessionPoolerUrl = (directUrl) => {
  const hostOverride = String(process.env.SUPABASE_POOLER_HOST || '').trim()
  const region = String(process.env.SUPABASE_POOLER_REGION || '').trim().replace(/^["']|["']$/g, '')
  const poolerHostname = hostOverride || (region ? `aws-0-${region}.pooler.supabase.com` : '')
  if (!directUrl || !poolerHostname) return null
  try {
    const u = new URL(directUrl)
    const hn = u.hostname.toLowerCase()
    const m = hn.match(/^db\.([a-z0-9]+)\.supabase\.co$/)
    if (!m) return null
    const ref = m[1]
    const nu = new URL('postgresql://127.0.0.1/postgres')
    nu.protocol = 'postgresql:'
    nu.username = `postgres.${ref}`
    nu.password = u.password
    nu.hostname = poolerHostname
    nu.port = '5432'
    nu.pathname = u.pathname && u.pathname !== '/' ? u.pathname : '/postgres'
    return nu.toString()
  } catch {
    return null
  }
}

const getPgConnectionForPool = () => {
  const poolerOpt = String(process.env.DATABASE_POOLER_URL || process.env.SUPABASE_DB_POOLER_URL || '').trim()
  if (poolerOpt) return { url: poolerOpt, label: 'DATABASE_POOLER_URL' }
  const built = tryBuildSupabaseSessionPoolerUrl(DATABASE_URL_DIRECT)
  if (built) return { url: built, label: 'SUPABASE_POOLER_HOST|REGION' }
  return { url: DATABASE_URL_DIRECT, label: 'DATABASE_URL' }
}

const pgConnectionForPool = getPgConnectionForPool()
const PG_POOL_CONNECTION_STRING = pgConnectionForPool.url

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado')
}

if (isProductionEnv && rawPort.length === 0) {
  throw new Error('PORT não configurado em produção')
}

if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error('PORT inválida')
}

const resolvePgSsl = (connectionUrl = PG_POOL_CONNECTION_STRING) => {
  const sslModeRaw = String(process.env.PGSSLMODE || process.env.PGSSL || '').trim().toLowerCase()
  if (sslModeRaw) {
    if (['disable', 'off', 'false', '0'].includes(sslModeRaw)) return false
    if (['require', 'verify-ca', 'verify-full', 'on', 'true', '1'].includes(sslModeRaw)) {
      return { rejectUnauthorized: false }
    }
  }

  try {
    const url = new URL(connectionUrl)
    const host = String(url.hostname || '').toLowerCase()
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    if (isLocalHost) return false
  } catch {
    return false
  }

  return { rejectUnauthorized: false }
}

/** Força IPv4 no host do Postgres quando possível (evita ETIMEDOUT em AAAA sem rota, comum no Windows). */
const parsePgConnectionString = require('pg-connection-string')

const buildPgPoolConfigAsync = async () => {
  const connUrl = PG_POOL_CONNECTION_STRING
  const sslFromHelper = resolvePgSsl(connUrl)
  const fallback = { connectionString: connUrl, ssl: sslFromHelper }

  const resolveHostnameToIpv4 = async (hostname) => {
    const h = String(hostname || '').trim()
    if (!h) return ''
    try {
      const records = await dns.promises.resolve4(h)
      const first = Array.isArray(records) ? records[0] : ''
      return first ? String(first).trim() : ''
    } catch {
      try {
        const r = await dns.promises.lookup(h, { family: 4 })
        return String(r?.address || '').trim()
      } catch {
        return ''
      }
    }
  }

  try {
    const cfg = parsePgConnectionString.parseIntoClientConfig(connUrl)
    const hostname = typeof cfg.host === 'string' ? cfg.host.trim() : ''
    if (hostname.startsWith('/')) {
      return { ...cfg, ssl: cfg.ssl !== undefined ? cfg.ssl : sslFromHelper }
    }
    const lower = hostname.toLowerCase()
    const isLocalHost = lower === 'localhost' || lower === '127.0.0.1' || lower === '::1'
    if (!hostname || isLocalHost) {
      return { ...cfg, ssl: cfg.ssl !== undefined ? cfg.ssl : sslFromHelper }
    }
    const ipKind = net.isIP(hostname)
    if (ipKind === 4 || ipKind === 6) {
      return { ...cfg, ssl: cfg.ssl !== undefined ? cfg.ssl : sslFromHelper }
    }

    const ipv4 = await resolveHostnameToIpv4(hostname)
    if (!ipv4 || net.isIP(ipv4) !== 4) return fallback

    const next = { ...cfg, host: ipv4 }
    const baseSsl = cfg.ssl !== undefined ? cfg.ssl : sslFromHelper
    if (baseSsl && typeof baseSsl === 'object') {
      next.ssl = { ...baseSsl, servername: hostname }
    } else if (baseSsl === true) {
      next.ssl = { rejectUnauthorized: false, servername: hostname }
    } else {
      next.ssl = baseSsl
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[pg] conexão Postgres via IPv4 (TLS servername = hostname do .env)')
    }
    return next
  } catch {
    void 0
  }

  try {
    const url = new URL(connUrl)
    const hostname = String(url.hostname || '').trim()
    const lower = hostname.toLowerCase()
    const isLocalHost = lower === 'localhost' || lower === '127.0.0.1' || lower === '::1'
    if (!hostname || isLocalHost || net.isIP(hostname)) return fallback

    const ipv4 = await resolveHostnameToIpv4(hostname)
    if (!ipv4 || net.isIP(ipv4) !== 4) return fallback

    url.hostname = ipv4
    const ssl = sslFromHelper
    const next = { connectionString: url.toString(), ssl }
    if (ssl && typeof ssl === 'object') {
      next.ssl = { ...ssl, servername: hostname }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[pg] conexão Postgres via IPv4 (connection string reescrita)')
    }
    return next
  } catch {
    return fallback
  }
}

const pool = new Pool(await buildPgPoolConfigAsync())

if (process.env.NODE_ENV !== 'production') {
  try {
    const u = new URL(PG_POOL_CONNECTION_STRING)
    if (pgConnectionForPool.label !== 'DATABASE_URL') {
      console.log(`[pg] usando ${pgConnectionForPool.label} → ${u.hostname}:${u.port || '5432'}`)
    }
  } catch {
    void 0
  }
  try {
    const directHost = new URL(DATABASE_URL_DIRECT).hostname.toLowerCase()
    const isDirectSb = /^db\.[a-z0-9]+\.supabase\.co$/.test(directHost)
    if (isDirectSb && pgConnectionForPool.label === 'DATABASE_URL') {
      console.warn(
        '[pg] Supabase em host direto (db.*.supabase.co) = só IPv6. Sem IPv6 na rede → ETIMEDOUT e falha no login/banner futebol. ' +
          'Corrija o .env: SUPABASE_POOLER_REGION=sa-east-1 (região em Project Settings → Infrastructure) ou DATABASE_POOLER_URL com a URI do modo Session (Connect → Session pooler). ' +
          'Docs: https://supabase.com/docs/guides/database/connecting-to-postgres'
      )
    }
  } catch {
    void 0
  }
}

const initDb = async () => {
  try {
    const result = await runMigrations(
      { query: (text, params) => pool.query(text, params) },
      { logger: console },
    )
    console.log(
      `DB migrate: ${result.applied.length} novas, ${result.skipped.length} já aplicadas`,
    )
  } catch (e) {
    console.error('DB migrate error:', e)
  }
}
void initDb()

const app = express()
app.disable('x-powered-by')
app.use(createRequestIdMiddleware({ slowMs: Number(process.env.HTTP_SLOW_MS) || 3000 }))
app.use(
  helmet({
    contentSecurityPolicy: false,
    // Padrão same-origin impede `<img crossorigin>` no canvas quando o front está em outro host que o da API.
    crossOriginResourcePolicy: false,
  })
)
app.use(express.json({ limit: '6mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))

// SPA em /app com proxy que encaminha /app/api/* sem remover o prefixo: alinha com as rotas /api/* do Express.
app.use((req, res, next) => {
  const raw = typeof req.url === 'string' ? req.url : ''
  if (/^\/app\/api(\/|\?|$)/.test(raw)) {
    req.url = raw.slice(4)
  }
  next()
})

const isDev = process.env.NODE_ENV !== 'production'
if (isDev) {
  process.on('uncaughtException', (err) => {
    console.error('[MediaHub] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[MediaHub] unhandledRejection:', reason)
  })
}

const isAllowedOrigin = createIsAllowedOrigin({ allowedOrigins: ALLOWED_ORIGINS, isDev })

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    // `Accept` customizado no fetch (ex.: escudos) dispara preflight; sem isto o browser bloqueia antes do GET.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Request-Id')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
})

registerDebugRoutes(app, {
  isDev,
  appendDebugNdjsonToSessionFiles,
  appendFootballDebugNdjson,
  getSessionDebugSnapshot,
  clearSessionDebugRing,
})

const query = async (text, params) => {
  const result = await pool.query(text, params)
  return result
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const rateLimitAuth = createRateLimiter({ windowMs: 15 * 60_000, max: 40, prefix: 'auth' })
const rateLimitSearch = createRateLimiter({ windowMs: 60_000, max: 90, prefix: 'search' })
const rateLimitFootball = createRateLimiter({ windowMs: 60_000, max: 120, prefix: 'football' })
const rateLimitTelegram = createRateLimiter({ windowMs: 60_000, max: 30, prefix: 'telegram' })
const rateLimitVideo = createRateLimiter({ windowMs: 60_000, max: 20, prefix: 'video' })

const sendResetEmail = async ({ to, url }) => {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error('SMTP não configurado')
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Recuperação de senha',
    text: `Use este link para redefinir sua senha: ${url}`,
    html: `<p>Use este link para redefinir sua senha:</p><p><a href="${url}">${url}</a></p>`,
  })
}

const {
  clearSearchProviderSettingsCache,
  migrateSearchProviderSettingsKeysIfNeeded,
  getSearchProviderSettingsKeys,
  getSearchProviderBaseUrl,
  getSearchProviderImageBaseUrl,
  getSearchProviderCache,
  setSearchProviderCache,
  fetchSearchProviderJson,
} = createSearchProviderService({
  query,
  baseUrl: SEARCH_PROVIDER_BASE_URL,
  imageBaseUrl: SEARCH_PROVIDER_IMAGE_BASE_URL,
})

const resolveTrailerUrlFromProvider = (args) =>
  resolveTrailerUrlFromProviderCore({
    ...args,
    fetchSearchProviderJson,
    getSearchProviderSettingsKeys,
    uniqStrings,
  })

const {
  getAppSettingValue,
  setAppSettingValue,
  getAllowRegistrations,
  getTicketsEnabled,
} = createAppSettingsService({ query })

let ensureSearchHistorySchemaPromise = null
let ensureSearchHistorySchemaOk = false
const ensureSearchHistorySchema = async () => {
  if (ensureSearchHistorySchemaOk) return true
  if (ensureSearchHistorySchemaPromise) return ensureSearchHistorySchemaPromise
  ensureSearchHistorySchemaPromise = (async () => {
    try {
      await query(`
        create table if not exists app_search_history (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references app_users(id) on delete cascade,
          query text not null,
          results jsonb not null,
          timestamp bigint not null,
          type text not null check (type in ('individual','bulk')),
          created_at timestamptz not null default now()
        )
      `)
      await query(`create index if not exists idx_app_search_history_user_time on app_search_history (user_id, timestamp desc)`)
      ensureSearchHistorySchemaOk = true
      return true
    } catch {
      return false
    } finally {
      ensureSearchHistorySchemaPromise = null
    }
  })()
  return ensureSearchHistorySchemaPromise
}


const {
  getFootballSettings,
  getDefaultFootballScheduleDate,
  enrichFutebolNaTvMatchesWithCrests,
  enrichFutebolNaTvMatchesWithCompetition,
  enrichFootballMatchesWithTeamNameBadges,
  inlineFootballCrestUrlsAsDataUrls,
  refreshFootballSchedule,
  shouldRefreshFootballScheduleBecauseTooFew,
  shouldRefreshFootballScheduleBecauseCrestsMissing,
  footballScheduleCrestDebugLogCache,
  sniffImageMimeFromBuffer,
} = createFootballScheduleService({
  query,
  getAppSettingValue,
  setAppSettingValue,
  isSafeExternalHttpUrl,
  FOOTBALL_SETTINGS_KEYS,
  DEFAULT_FOOTBALL_TIME_ZONE,
  DEFAULT_FOOTBALL_READ_TIME,
  DEFAULT_FOOTBALL_READ_WINDOW_START,
  DEFAULT_FOOTBALL_READ_WINDOW_END,
  DEFAULT_FOOTBALL_EXCLUDED_CHANNELS,
  DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS,
  parseClockTime,
  parseFootballSettingList,
  normalizeFootballFilterToken,
  normalizeFootballSearchText,
  normalizeFootballCrestUrl,
  isPlaceholderFootballTeamCrestUrl,
  stripHtml,
  parseFootballScheduleFromSource,
  parseFutebolNaTvBrMarkdownSchedule,
  parseFutebolNaTvBrSchedule,
  parseOneFootballMarkdownSchedule,
  isLikelyBlockedHtml,
  getZonedNowParts,
  addDaysToIsoDate,
  resolveFootballSourceFetchUrl,
  resolveOneFootballFetchUrl,
  toJinaReaderUrl,
  fetchTextWithHeaders,
  uniqStrings,
})

let footballSchedulerTimer = null
const startFootballScheduler = () => {
  if (footballSchedulerTimer) return
  let isRunning = false

  const tick = async () => {
    if (isRunning) return
    isRunning = true
    try {
      const settings = await getFootballSettings()
      const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
      const nowTime = parseClockTime(nowParts.time)
      const nowMinutes = toMinutes(nowTime)
      if (!nowTime || nowMinutes === null) return

      const ensureDate = getDefaultFootballScheduleDate({ nowDateIso: nowParts.date, nowTime: nowParts.time, readTime: settings.readWindowEnd || settings.readTime })
      const ensureCacheKey = `ensure:${ensureDate}`
      const ensureLast = footballScheduleAutoRefreshCache.get(ensureCacheKey) || 0
      if (Date.now() - ensureLast > 15 * 60_000) {
        footballScheduleAutoRefreshCache.set(ensureCacheKey, Date.now())
        try {
          const result = await query(
            `
            select distinct on (fs.source_id) fs.matches, fs.fetched_at
            from football_schedules fs
            join football_sources s on s.id = fs.source_id
            where fs.schedule_date = $1
              and s.is_active = true
            order by fs.source_id, fs.fetched_at desc nulls last
            `,
            [ensureDate]
          )
          const mergedMap = new Map()
          for (const row of result.rows) {
            const list = Array.isArray(row.matches) ? row.matches : []
            for (const item of list) {
              const time = parseClockTime(item?.time)
              const home = typeof item?.home === 'string' ? item.home.trim() : ''
              const away = typeof item?.away === 'string' ? item.away.trim() : ''
              const channels = Array.isArray(item?.channels) ? item.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
              const homeCrestUrl = typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : ''
              const awayCrestUrl = typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : ''
              if (!time || !home || !away) continue
              const key = `${time}::${normalizeFootballSearchText(home)}::${normalizeFootballSearchText(away)}`
              const existing = mergedMap.get(key)
              if (!existing) {
                mergedMap.set(key, { time, home, away, channels, homeCrestUrl, awayCrestUrl })
                continue
              }
              if (existing.channels.length === 0 && channels.length > 0) {
                existing.channels = channels
              } else if (channels.length > 0) {
                existing.channels = uniqStrings([...existing.channels, ...channels])
              }
              if ((!existing.homeCrestUrl || isPlaceholderFootballTeamCrestUrl(existing.homeCrestUrl)) && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
              if ((!existing.awayCrestUrl || isPlaceholderFootballTeamCrestUrl(existing.awayCrestUrl)) && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
            }
          }
          const merged = [...mergedMap.values()]
          merged.sort((a, b) => a.time.localeCompare(b.time))
          if (
            merged.length === 0 ||
            shouldRefreshFootballScheduleBecauseTooFew({ merged, scheduleDateIso: ensureDate }) ||
            shouldRefreshFootballScheduleBecauseCrestsMissing({ merged, scheduleDateIso: ensureDate })
          ) {
            await refreshFootballSchedule({ scheduleDateIso: ensureDate, timeZone: settings.timeZone })
          }
        } catch {
        }
      }

      if (settings.lastRunDate === nowParts.date) return
      const triggerMinute = getWindowTriggerMinute({
        dateIso: nowParts.date,
        windowStart: settings.readWindowStart || DEFAULT_FOOTBALL_READ_WINDOW_START,
        windowEnd: settings.readWindowEnd || DEFAULT_FOOTBALL_READ_WINDOW_END,
      })
      if (nowMinutes < triggerMinute) return

      const targetDate = addDaysToIsoDate(nowParts.date, 1)
      await refreshFootballSchedule({ scheduleDateIso: targetDate, timeZone: settings.timeZone })
      await setAppSettingValue({ key: FOOTBALL_SETTINGS_KEYS.lastRunDate, value: nowParts.date })
    } catch {
    } finally {
      isRunning = false
    }
  }

  void tick()
  footballSchedulerTimer = setInterval(() => void tick(), 60_000)
}

const {
  setTelegramTokenCache,
  getTelegramBotToken,
  hasTelegramChatIdColumn,
} = createTelegramConfigService({ query })

let searchIntegrationKeyColumnCache = { name: null, fetchedAt: 0 }
let ensureSearchIntegrationKeyColumnPromise = null

async function ensureSearchIntegrationKeyColumn() {
  if (ensureSearchIntegrationKeyColumnPromise) return ensureSearchIntegrationKeyColumnPromise
  ensureSearchIntegrationKeyColumnPromise = (async () => {
    try {
      await query(`alter table app_users add column if not exists search_api_key text`)
      try {
        const legacyResult = await query(
          `
          select column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'app_users'
            and column_name like '%\\_api\\_key' escape '\\'
            and column_name <> 'search_api_key'
          `
        )
        const legacyCandidates = legacyResult.rows.map((row) => row.column_name).filter((name) => typeof name === 'string')
        const legacyColumn = legacyCandidates.length === 1 ? legacyCandidates[0] : ''
        if (legacyColumn && /^[a-z_]+$/.test(legacyColumn)) {
          await query(
            `update app_users set search_api_key = ${legacyColumn} where search_api_key is null and ${legacyColumn} is not null`
          )
        }
      } catch {
      }
      searchIntegrationKeyColumnCache = { name: 'search_api_key', fetchedAt: Date.now() }
      return 'search_api_key'
    } catch {
      searchIntegrationKeyColumnCache = { name: null, fetchedAt: Date.now() }
      return null
    } finally {
      ensureSearchIntegrationKeyColumnPromise = null
    }
  })()
  return ensureSearchIntegrationKeyColumnPromise
}

async function getSearchIntegrationKeyColumn() {
  const now = Date.now()
  if (now - searchIntegrationKeyColumnCache.fetchedAt < 60_000) return searchIntegrationKeyColumnCache.name

  try {
    const result = await query(
      `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'app_users'
        and (column_name = 'search_api_key' or column_name like '%\\_api\\_key' escape '\\')
      `,
    )
    const names = new Set(result.rows.map((row) => row.column_name))
    const legacyCandidates = result.rows
      .map((row) => row.column_name)
      .filter((name) => typeof name === 'string' && name !== 'search_api_key')
    const legacyName = legacyCandidates.length === 1 ? legacyCandidates[0] : null
    if (names.has('search_api_key')) {
      const name = 'search_api_key'
      searchIntegrationKeyColumnCache = { name, fetchedAt: now }
      return name
    }

    if (legacyName) {
      return await ensureSearchIntegrationKeyColumn()
    }

    return await ensureSearchIntegrationKeyColumn()
  } catch {
    searchIntegrationKeyColumnCache = { name: null, fetchedAt: now }
    return null
  }
}

const {
  signToken,
  requireAuth,
  requireAdmin,
  requirePremiumOrAdmin,
  readOptionalAuthUserId,
  readOptionalAuthUserContext,
  deactivateExpiredPremiumByUserId,
  assertAndIncrementDailySearchQuota,
} = createAuthMiddleware({
  query,
  jwt,
  JWT_SECRET,
  validateUserId,
  evaluateFreeDailySearchQuota,
  getSearchIntegrationKeyColumn,
})

const {
  makeFootballCrestDbg,
  processFootballCrestProxy,
} = createFootballCrestProxy({
  normalizeFootballCrestUrl,
  isSafeExternalHttpUrl,
  sniffImageMimeFromBuffer,
  loadImage,
  createCanvas,
  isCanvasRuntimeHealthy: () => isCanvasRuntimeHealthy,
  appendDebugNdjsonToSessionFiles,
})

registerVideoRoutes(app, {
  buildYouTubeTrailerUrlFromId,
  cleanupStaleTempFiles,
  createCanvas,
  downloadToFile,
  escapeFfmpegPath,
  escapeFfmpegText,
  fetchSearchProviderJson,
  getSearchProviderImageBaseUrl,
  getSearchProviderSettingsKeys,
  hasBinary,
  isCanvasRuntimeHealthy,
  GlobalFonts,
  isYouTubeTrailerId,
  isYouTubeTrailerUrl,
  loadImage,
  query,
  rateLimitVideo,
  readOptionalAuthUserContext,
  requireAuth,
  requirePremiumOrAdmin,
  resolveBundledYtdlpCommand,
  resolveFfmpegCommand,
  resolveFfmpegDrawtextFont,
  resolveTrailerUrlFromProvider,
  resolveVideoBrandingFonts,
  resolveYtdl,
  resolveYtdlpExec,
  runProcess,
  safeRm,
  uniqStrings,
  isSafeExternalHttpUrl,
})

registerAdminRoutes(app, {
  requireAdmin,
  requireAuth,
  appendDebugNdjsonToSessionFiles,
  ensureSearchHistorySchema,
  getAllowRegistrations,
  getDefaultFootballScheduleDate,
  getFootballSettings,
  getSearchProviderBaseUrl,
  getSearchProviderSettingsKeys,
  getTicketsEnabled,
  getZonedNowParts,
  migrateSearchProviderSettingsKeysIfNeeded,
  clearSearchProviderSettingsCache,
  SEARCH_PROVIDER_SETTINGS_KEYS,
  setTelegramTokenCache,
  normalizeEmail,
  normalizeFootballCrestUrl,
  normalizeFootballFilterToken,
  parseClockTime,
  query,
  refreshFootballSchedule,
  setAppSettingValue,
  sniffImageMimeFromBuffer,
  uniqStrings,
  createPasswordDigest,
  generateRandomPassword,
  pool,
  FOOTBALL_SETTINGS_KEYS,
})

registerTelegramRoutes(app, {
  requireAuth,
  rateLimitTelegram,
  express,
  upload,
  query,
  hasTelegramChatIdColumn,
  getTelegramBotToken,
  getSearchProviderImageBaseUrl,
  getSearchProviderSettingsKeys,
  stripYouTubeUrlsFromText,
  isYouTubeTrailerId,
  isYouTubeTrailerUrl,
  buildYouTubeTrailerUrlFromId,
  resolveTrailerUrlFromProvider,
  fetchSearchProviderJson,
  readOptionalAuthUserContext,
  uniqStrings,
  resolveBundledYtdlpCommand,
  resolveFfmpegCommand,
  runProcess,
  safeRm,
  hasBinary,
})

registerTelegramBot(app, {
  requireAuth,
  rateLimitTelegram,
  query,
  pool,
  getTelegramBotToken,
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
})

registerMeRoutes(app, {
  rateLimitAuth,
  requireAuth,
  requireAdmin,
  normalizeEmail,
  query,
  crypto,
  APP_URL,
  sendResetEmail,
  createPasswordDigest,
  verifyPassword,
  publicUserFromRow,
  generateRandomPassword,
  hasTelegramChatIdColumn,
  getSearchIntegrationKeyColumn,
})

registerHealthRoutes(app, { query })

registerHistoryRoutes(app, {
  requireAuth,
  query,
  ensureSearchHistorySchema,
})

registerTicketRoutes(app, {
  requireAuth,
  requireAdmin,
  query,
  pool,
  getTicketsEnabled,
})

registerSearchRoutes(app, {
  requireAuth,
  rateLimitSearch,
  readOptionalAuthUserContext,
  getSearchProviderBaseUrl,
  getSearchProviderImageBaseUrl,
  getSearchProviderSettingsKeys,
  uniqStrings,
  getSearchProviderCache,
  setSearchProviderCache,
  getStableObjectKey,
  fetchSearchProviderJson,
  normalizeTrendingPayload,
  getSearchProviderErrorMessage,
  assertAndIncrementDailySearchQuota,
})

registerAuthRoutes(app, {
  rateLimitAuth,
  normalizeEmail,
  getAllowRegistrations,
  createPasswordDigest,
  verifyPassword,
  query,
  signToken,
  publicUserFromRow,
  deactivateExpiredPremiumByUserId,
})

registerFootballRoutes(app, {
  requireAuth,
  requirePremiumOrAdmin,
  rateLimitFootball,
  setFootballCrestCorsHeaders,
  processFootballCrestProxy,
  makeFootballCrestDbg,
  appendFootballDebugNdjson,
  getFootballSettings,
  getZonedNowParts,
  getDefaultFootballScheduleDate,
  refreshFootballSchedule,
  query,
  parseClockTime,
  normalizeFootballCrestUrl,
  normalizeFootballSearchText,
  uniqStrings,
  isPlaceholderFootballTeamCrestUrl,
  normalizeFootballFilterToken,
  addDaysToIsoDate,
  shouldRefreshFootballScheduleBecauseCrestsMissing,
  shouldRefreshFootballScheduleBecauseTooFew,
  enrichFutebolNaTvMatchesWithCrests,
  enrichFootballMatchesWithTeamNameBadges,
  inlineFootballCrestUrlsAsDataUrls,
  footballScheduleCrestDebugLogCache,
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, '..', 'dist')
const anexosDir = path.join(__dirname, '..', 'anexos')

if (fs.existsSync(anexosDir)) {
  app.use('/anexos', express.static(anexosDir))
}

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        return
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }))
  app.get('*', (req, res) => {
    if (req.path && req.path.startsWith('/api/')) {
      res.status(404).json({ message: 'Rota não encontrada.' })
      return
    }
    if (path.extname(req.path || '')) {
      res.status(404).type('text/plain').send('Not found')
      return
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

/** Em dev, libera PORT antes de ouvir (predev:api não roda em reinícios do node --watch). Produção: desativado. */
const freeProjectListenPort = () => {
  if (process.env.NODE_ENV === 'production') return
  if (process.env.MEDIAHUB_SKIP_FREE_PORT === '1') return
  try {
    const script = path.join(__dirname, '..', 'scripts', 'free-api-port.mjs')
    if (!fs.existsSync(script)) return
    execFileSync(process.execPath, [script], {
      cwd: path.join(__dirname, '..'),
      stdio: 'ignore',
      env: { ...process.env, PORT: String(PORT) },
    })
  } catch {
    void 0
  }
}

let server
let listenRecoveryAttempts = 0
const maxListenRecoveries = 3

const attachHttpServer = () => {
  freeProjectListenPort()
  const runtimeBuildTag = 'video-branding-fallback-v10'
  server = app.listen(PORT, HOST, () => {
    startFootballScheduler()
    console.log(`API pronta em http://${HOST}:${PORT} (${runtimeBuildTag})`)
    if (isDev) {
      console.log(`[debug-3ee3aa] apiBootAt=${__apiBootAt} — comparar com o campo apiBootAt em GET /api/debug/session-ring`)
    }
  })
  // Geração de vídeo pode levar vários minutos sem enviar o primeiro byte; timeouts padrão do Node podem derrubar o socket.
  try {
    server.requestTimeout = 0
    server.headersTimeout = 0
    server.timeout = 0
  } catch {
    void 0
  }

  server.on('error', (err) => {
    if (
      err &&
      err.code === 'EADDRINUSE' &&
      process.env.NODE_ENV !== 'production' &&
      listenRecoveryAttempts < maxListenRecoveries
    ) {
      listenRecoveryAttempts += 1
      console.warn(
        `[MediaHub] Porta ${PORT} ocupada — liberando processo antigo (tentativa ${listenRecoveryAttempts}/${maxListenRecoveries})…`
      )
      freeProjectListenPort()
      const retry = () => attachHttpServer()
      try {
        server.close(() => setTimeout(retry, 500))
      } catch {
        setTimeout(retry, 500)
      }
      return
    }
    if (err && err.code === 'EADDRINUSE') {
      console.error(
        `[MediaHub] Porta ${PORT} já em uso. Feche o outro processo (outro terminal com npm run dev:api) ou libere a porta.`
      )
      console.error(
        'PowerShell: Get-NetTCPConnection -LocalPort ' +
          PORT +
          ' -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'
      )
      process.exit(1)
    }
    throw err
  })
}

attachHttpServer()

const gracefulShutdown = (signal) => {
  console.log(`[MediaHub] Sinal ${signal}: encerrando servidor…`)
  if (!server) {
    process.exit(0)
    return
  }
  server.close(() => {
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
