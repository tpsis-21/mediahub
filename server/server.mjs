import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import multer from 'multer'
import nodemailer from 'nodemailer'

const { Pool } = pg
const require = createRequire(import.meta.url)
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

const PORT = Number(process.env.PORT || 8080)
const DATABASE_URL = process.env.DATABASE_URL || ''
const JWT_SECRET = process.env.JWT_SECRET || ''
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
const APP_URL = process.env.APP_URL || ''

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL não configurado')
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado')
}

const pool = new Pool({ connectionString: DATABASE_URL })

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id),
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES app_users(id),
        message TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB
      );
      
      INSERT INTO app_settings (key, value) VALUES ('tickets_enabled', 'true') ON CONFLICT DO NOTHING;
    `)
    console.log('DB Init: Tabelas de tickets verificadas.')
  } catch (e) {
    console.error('DB Init Error:', e)
  }
}
initDb()

const app = express()
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '6mb' }))

const isDev = process.env.NODE_ENV !== 'production'
const isAllowedOrigin = (origin) => {
  if (!origin) return false
  if (ALLOWED_ORIGINS.length === 0) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (!isDev) return false
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true
  return false
}

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
})

const query = async (text, params) => {
  const result = await pool.query(text, params)
  return result
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const createPasswordDigest = async (password) => {
  const salt = crypto.randomBytes(16)
  const iterations = 120000
  const hash = await crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64')
  return {
    hash,
    salt: salt.toString('base64'),
    iterations,
  }
}

const generateRandomPassword = (length = 14) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

const verifyPassword = async ({ password, digest }) => {
  const salt = Buffer.from(digest.salt, 'base64')
  const hash = crypto.pbkdf2Sync(String(password), salt, digest.iterations, 32, 'sha256').toString('base64')
  return hash === digest.hash
}

const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '30d' })

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

const requireAuth = async (req, res, next) => {
  const readHeaderToken = () => {
    const auth = req.headers.authorization || ''
    const raw = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    return String(raw || '').trim()
  }
  const readCookieToken = () => {
    const cookie = req.headers.cookie || ''
    if (!cookie) return ''
    const parts = cookie.split(';').map((s) => s.trim())
    const match = parts.find((p) => p.toLowerCase().startsWith('auth_token='))
    if (!match) return ''
    const value = match.slice('auth_token='.length)
    try {
      return decodeURIComponent(value || '').trim()
    } catch {
      return String(value || '').trim()
    }
  }
  let token = readHeaderToken()
  if (!token) token = readCookieToken()
  if (!token) {
    console.log('requireAuth: Token ausente', { headers: req.headers })
    res.status(401).json({ message: 'Não autenticado.' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if (!decoded || typeof decoded !== 'object') {
      console.log('requireAuth: Token decodificado inválido', decoded)
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }
    const sub = (decoded && typeof decoded === 'object') ? decoded.sub : null
    const userId = validateUserId(sub)
    if (!userId) {
      console.log('requireAuth: UserId inválido no token', sub)
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }
    const result = await query('select is_active from app_users where id = $1 limit 1', [userId])
    const row = result.rows[0]
    if (!row || !row.is_active) {
      console.log('requireAuth: Usuário inativo ou não encontrado', userId)
      res.status(403).json({ message: 'Acesso negado.' })
      return
    }
    req.auth = { userId }
    next()
  } catch (err) {
    console.log('requireAuth: Erro na verificação do token', err.message)
    res.status(401).json({ message: 'Não autenticado.' })
  }
}

const readOptionalAuthUserId = (req) => {
  const readHeaderToken = () => {
    const auth = req.headers.authorization || ''
    const raw = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    return String(raw || '').trim()
  }
  const readCookieToken = () => {
    const cookie = req.headers.cookie || ''
    if (!cookie) return ''
    const parts = cookie.split(';').map((s) => s.trim())
    const match = parts.find((p) => p.toLowerCase().startsWith('auth_token='))
    if (!match) return ''
    const value = match.slice('auth_token='.length)
    try {
      return decodeURIComponent(value || '').trim()
    } catch {
      return String(value || '').trim()
    }
  }
  let token = readHeaderToken()
  if (!token) token = readCookieToken()
  if (!token) return null
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    if (!decoded || typeof decoded !== 'object') return null
    const sub = (decoded && typeof decoded === 'object') ? decoded.sub : null
    return validateUserId(sub)
  } catch {
    return null
  }
}

const readOptionalAuthUserContext = async (req) => {
  const userId = validateUserId(readOptionalAuthUserId(req))
  if (!userId) return { userId: null, userType: null, userKey: '' }

  try {
    const searchKeyColumn = await getSearchIntegrationKeyColumn()
    const searchKeySelect = searchKeyColumn ? `${searchKeyColumn} as search_api_key` : `null::text as search_api_key`
    const result = await query(
      `select ${searchKeySelect}, type, is_active from app_users where id = $1 limit 1`,
      [userId]
    )
    const row = result.rows[0]

    if (!row || !row.is_active) return { userId: null, userType: null, userKey: '' }

    const userKey = typeof row.search_api_key === 'string' ? row.search_api_key.trim() : ''
    const userType = typeof row.type === 'string' ? row.type : null
    return { userId, userType, userKey }
  } catch {
    return { userId, userType: null, userKey: '' }
  }
}

const requirePremiumOrAdmin = async (req, res, next) => {
  try {
    const result = await query('select type, is_active, subscription_end from app_users where id = $1 limit 1', [req.auth.userId])
    const row = result.rows[0]
    if (!row || !row.is_active) {
      res.status(403).json({ message: 'Acesso negado.' })
      return
    }

    if (row.type === 'admin') {
      next()
      return
    }

    if (row.type !== 'premium') {
      res.status(403).json({ message: 'Acesso negado.' })
      return
    }

    const subscriptionEnd = row.subscription_end ? new Date(row.subscription_end) : null
    const now = new Date()
    if (!subscriptionEnd || Number.isNaN(subscriptionEnd.getTime()) || subscriptionEnd.getTime() < now.getTime()) {
      res.status(403).json({ message: 'Assinatura Premium expirada.' })
      return
    }
    next()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
}

const runProcess = async ({ command, args, cwd, timeoutMs }) => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''

    const timer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => child.kill('SIGKILL'), timeoutMs)
      : null

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr })
    })
  })
}

const hasBinary = async (name, args) => {
  try {
    const result = await runProcess({ command: name, args, timeoutMs: 4000 })
    return result.code === 0
  } catch {
    return false
  }
}

const safeRequire = (id) => {
  try {
    return require(id)
  } catch {
    return null
  }
}

const safeResolve = (id) => {
  try {
    return require.resolve(id)
  } catch {
    return ''
  }
}

const resolveFfmpegCommand = () => {
  const envPath = typeof process.env.FFMPEG_PATH === 'string' ? process.env.FFMPEG_PATH.trim() : ''
  if (envPath) return envPath
  const resolved = safeRequire('ffmpeg-static')
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : 'ffmpeg'
}

const resolveYtdl = () => {
  const resolved = safeRequire('ytdl-core')
  return resolved && typeof resolved === 'function' ? resolved : null
}

const resolveYtdlpExec = () => {
  const resolved = safeRequire('youtube-dl-exec')
  return resolved && typeof resolved === 'function' ? resolved : null
}

const resolveBundledYtdlpCommand = () => {
  const pkgPath = safeResolve('youtube-dl-exec/package.json')
  if (!pkgPath) return null
  const binDir = path.join(path.dirname(pkgPath), 'bin')
  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const fullPath = path.join(binDir, filename)
  if (fs.existsSync(fullPath)) return fullPath
  return null
}

const isYouTubeTrailerUrl = (value) => {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').trim()
      return Boolean(id)
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return url.pathname === '/watch' && Boolean(url.searchParams.get('v'))
    }
    return false
  } catch {
    return false
  }
}

const isYouTubeTrailerId = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return false
  return /^[a-zA-Z0-9_-]{6,32}$/.test(raw)
}

const buildYouTubeTrailerUrlFromId = (id) => {
  const raw = String(id || '').trim()
  if (!raw) return ''
  return `https://www.youtube.com/watch?v=${raw}`
}

const stripYouTubeUrlsFromText = (value) => {
  const raw = String(value || '')
  const stripped = raw.replace(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^\s]+|m\.youtube\.com\/watch\?v=[^\s]+|youtu\.be\/[^\s]+)[^\s]*/gi,
    ''
  )
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const downloadToFile = async ({ stream, filePath, timeoutMs }) => {
  return await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath)
    const timer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => {
          try {
            stream.destroy(new Error('timeout'))
          } catch {
            // ignore
          }
          try {
            out.destroy(new Error('timeout'))
          } catch {
            // ignore
          }
        }, timeoutMs)
      : null

    const done = (err) => {
      if (timer) clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    out.on('finish', () => done())
    out.on('error', done)
    stream.on('error', done)
    stream.pipe(out)
  })
}

const escapeFfmpegText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')

const safeRm = (targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

const getSearchProviderErrorMessage = (args) => {
  const userType = args?.userType || null
  const status = typeof args?.status === 'number' ? args.status : null
  const code = typeof args?.code === 'string' ? args.code : null

  const isNotConfigured = code === 'SEARCH_PROVIDER_NOT_CONFIGURED'
  const isInvalidKey = status === 401 || status === 403

  if (isNotConfigured) {
    if (userType === 'admin') return 'Integração de busca não configurada. Abra o Admin e salve a chave.'
    return 'Busca indisponível no momento.'
  }

  if (isInvalidKey) {
    if (userType === 'admin') return 'Integração de busca com credenciais inválidas.'
    return 'Busca indisponível no momento.'
  }

  return 'Busca temporariamente indisponível. Tente novamente mais tarde.'
}

const publicUserFromRow = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  phone: row.phone || undefined,
  website: row.website || undefined,
  type: row.type,
  brandName: row.brand_name || undefined,
  brandColors: row.brand_colors || undefined,
  brandLogo: row.brand_logo || undefined,
  telegramChatId: row.telegram_chat_id || undefined,
  brandNameChangedAt: row.brand_name_changed_at || undefined,
  logoChangedAt: row.logo_changed_at || undefined,
  brandChangeCount: row.brand_change_count ?? undefined,
  logoChangeCount: row.logo_change_count ?? undefined,
  subscriptionEnd: row.subscription_end || undefined,
  isActive: Boolean(row.is_active),
  dailySearches: row.daily_searches ?? undefined,
  lastSearchDate: row.last_search_date || undefined,
})

const uniqStrings = (items) => {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const value = typeof item === 'string' ? item.trim() : ''
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

const SEARCH_PROVIDER_SETTINGS_KEYS = {
  primary: 'search_provider_api_key_primary',
  secondary: 'search_provider_api_key_secondary',
}

let searchProviderSettingsCache = { keys: [], fetchedAt: 0 }

const migrateSearchProviderSettingsKeysIfNeeded = async () => {
  try {
    const current = await query(
      `select key, value from app_settings where key = any($1::text[])`,
      [[SEARCH_PROVIDER_SETTINGS_KEYS.primary, SEARCH_PROVIDER_SETTINGS_KEYS.secondary]]
    )
    const map = new Map(current.rows.map((row) => [row.key, row.value]))
    const primaryValue = typeof map.get(SEARCH_PROVIDER_SETTINGS_KEYS.primary) === 'string' ? map.get(SEARCH_PROVIDER_SETTINGS_KEYS.primary).trim() : ''
    const secondaryValue = typeof map.get(SEARCH_PROVIDER_SETTINGS_KEYS.secondary) === 'string' ? map.get(SEARCH_PROVIDER_SETTINGS_KEYS.secondary).trim() : ''
    if (primaryValue || secondaryValue) return { primaryValue, secondaryValue }

    const legacy = await query(
      `
      select key, value
      from app_settings
      where key like '%api_key_primary'
         or key like '%api_key_secondary'
      `
    )
    const legacyMap = new Map(legacy.rows.map((row) => [row.key, row.value]))
    const legacyPrimaryKey = legacy.rows.find((row) => typeof row?.key === 'string' && row.key.endsWith('api_key_primary') && row.key !== SEARCH_PROVIDER_SETTINGS_KEYS.primary)?.key
    const legacySecondaryKey = legacy.rows.find((row) => typeof row?.key === 'string' && row.key.endsWith('api_key_secondary') && row.key !== SEARCH_PROVIDER_SETTINGS_KEYS.secondary)?.key

    const legacyPrimary = legacyPrimaryKey && typeof legacyMap.get(legacyPrimaryKey) === 'string' ? legacyMap.get(legacyPrimaryKey).trim() : ''
    const legacySecondary = legacySecondaryKey && typeof legacyMap.get(legacySecondaryKey) === 'string' ? legacyMap.get(legacySecondaryKey).trim() : ''

    if (!legacyPrimary && !legacySecondary) return { primaryValue: '', secondaryValue: '' }

    await query(
      `
      insert into app_settings (key, value, updated_at)
      values
        ($1, $2, now()),
        ($3, $4, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      [SEARCH_PROVIDER_SETTINGS_KEYS.primary, legacyPrimary, SEARCH_PROVIDER_SETTINGS_KEYS.secondary, legacySecondary]
    )

    return { primaryValue: legacyPrimary, secondaryValue: legacySecondary }
  } catch {
    return { primaryValue: '', secondaryValue: '' }
  }
}

const getSearchProviderSettings = async () => {
  const now = Date.now()
  if (now - searchProviderSettingsCache.fetchedAt < 30_000) return searchProviderSettingsCache

  try {
    const { primaryValue, secondaryValue } = await migrateSearchProviderSettingsKeysIfNeeded()
    const primary = primaryValue
    const secondary = secondaryValue
    const keys = uniqStrings([primary, secondary])
    searchProviderSettingsCache = { keys, fetchedAt: now }
    return searchProviderSettingsCache
  } catch {
    searchProviderSettingsCache = { keys: [], fetchedAt: now }
    return searchProviderSettingsCache
  }
}

const getSearchProviderSettingsKeys = async () => (await getSearchProviderSettings()).keys
const getSearchProviderBaseUrl = async () => SEARCH_PROVIDER_BASE_URL
const getSearchProviderImageBaseUrl = async () => SEARCH_PROVIDER_IMAGE_BASE_URL

const searchProviderResponseCache = new Map()
const getStableObjectKey = (obj) => {
  const entries = Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

const getSearchProviderCache = (key) => {
  const hit = searchProviderResponseCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    searchProviderResponseCache.delete(key)
    return null
  }
  return hit.data
}

const setSearchProviderCache = (args) => {
  const key = args.key
  const data = args.data
  const ttlMs = args.ttlMs
  const maxEntries = args.maxEntries

  searchProviderResponseCache.set(key, { data, expiresAt: Date.now() + ttlMs })
  while (searchProviderResponseCache.size > maxEntries) {
    const firstKey = searchProviderResponseCache.keys().next().value
    if (!firstKey) break
    searchProviderResponseCache.delete(firstKey)
  }
}

const fetchSearchProviderJson = async ({ path, params, apiKeys }) => {
  const baseUrl = await getSearchProviderBaseUrl()
  if (!baseUrl) {
    const err = new Error('Integração de busca não configurada')
    err.code = 'SEARCH_PROVIDER_NOT_CONFIGURED'
    throw err
  }

  const safeKeys = uniqStrings(apiKeys)
  if (safeKeys.length === 0) {
    const err = new Error('Integração de busca não configurada')
    err.code = 'SEARCH_PROVIDER_NOT_CONFIGURED'
    throw err
  }

  let lastError = null
  for (let i = 0; i < safeKeys.length; i++) {
    const key = safeKeys[i]
    const url = new URL(`${baseUrl}${path}`)
    url.searchParams.set('api_key', key)
    for (const [k, v] of Object.entries(params || {})) {
      if (typeof v === 'string' && v.trim().length > 0) url.searchParams.set(k, v)
      if (typeof v === 'number' && Number.isFinite(v)) url.searchParams.set(k, String(v))
    }

    const res = await fetch(url.toString())
    if (res.status === 429) {
      lastError = { status: 429 }
      continue
    }
    if (res.status === 401 || res.status === 403) {
      lastError = { status: res.status }
      continue
    }
    if (!res.ok) {
      lastError = { status: res.status }
      break
    }
    return await res.json()
  }

  const err = new Error('Search provider request failed')
  err.status = lastError?.status || 502
  throw err
}

const getAllowRegistrations = async () => {
  let allow = process.env.ALLOW_REGISTRATIONS !== 'false'
  try {
    const result = await query('select value from app_settings where key = $1 limit 1', ['allow_registrations'])
    const row = result.rows[0]
    if (row && typeof row.value === 'string') {
      allow = row.value !== 'false'
    }
  } catch {
  }
  return allow
}

let telegramTokenCache = { token: '', fetchedAt: 0 }
const getTelegramBotToken = async () => {
  const envToken = typeof process.env.TELEGRAM_BOT_TOKEN === 'string' ? process.env.TELEGRAM_BOT_TOKEN.trim() : ''
  if (envToken) return envToken

  const now = Date.now()
  if (now - telegramTokenCache.fetchedAt < 30_000) return telegramTokenCache.token

  try {
    const result = await query('select value from app_settings where key = $1 limit 1', ['telegram_bot_token'])
    const row = result.rows[0]
    const token = row && typeof row.value === 'string' ? row.value.trim() : ''
    telegramTokenCache = { token, fetchedAt: now }
    return token
  } catch {
    telegramTokenCache = { token: '', fetchedAt: now }
    return ''
  }
}

let telegramChatIdColumnCache = { exists: false, fetchedAt: 0 }
let ensureTelegramChatIdColumnPromise = null

const ensureTelegramChatIdColumn = async () => {
  if (ensureTelegramChatIdColumnPromise) return ensureTelegramChatIdColumnPromise
  ensureTelegramChatIdColumnPromise = (async () => {
    try {
      await query(`alter table app_users add column if not exists telegram_chat_id text`)
      telegramChatIdColumnCache = { exists: true, fetchedAt: Date.now() }
      return true
    } catch {
      telegramChatIdColumnCache = { exists: false, fetchedAt: Date.now() }
      return false
    } finally {
      ensureTelegramChatIdColumnPromise = null
    }
  })()
  return ensureTelegramChatIdColumnPromise
}

const hasTelegramChatIdColumn = async () => {
  const now = Date.now()
  if (now - telegramChatIdColumnCache.fetchedAt < 60_000) return telegramChatIdColumnCache.exists

  try {
    const result = await query(
      `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'app_users'
        and column_name = 'telegram_chat_id'
      limit 1
      `
    )
    const exists = result.rows.length > 0
    if (!exists) {
      return await ensureTelegramChatIdColumn()
    }
    telegramChatIdColumnCache = { exists, fetchedAt: now }
    return exists
  } catch {
    telegramChatIdColumnCache = { exists: false, fetchedAt: now }
    return false
  }
}

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

const requireAdmin = async (req, res, next) => {
  try {
    const result = await query('select type from app_users where id = $1 limit 1', [req.auth.userId])
    const row = result.rows[0]
    if (!row || row.type !== 'admin') {
      res.status(403).json({ message: 'Acesso negado.' })
      return
    }
    next()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/search/status', async (req, res) => {
  const userContext = await readOptionalAuthUserContext(req)
  const baseUrl = await getSearchProviderBaseUrl()
  const settingsKeys = await getSearchProviderSettingsKeys()
  const hasUserKey = Boolean(userContext.userKey && userContext.userKey.trim())
  const hasSystemKey = settingsKeys.length > 0
  const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
  const configured = Boolean(baseUrl) && apiKeys.length > 0
  const scope = !baseUrl ? 'none' : hasUserKey ? 'user' : hasSystemKey ? 'system' : 'none'
  res.json({ configured, scope })
})

app.get('/api/search/trending', requireAuth, async (req, res) => {
  const mediaType = req.query?.mediaType === 'movie' || req.query?.mediaType === 'tv' ? req.query.mediaType : 'all'
  const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'
  const userContext = await readOptionalAuthUserContext(req)
  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])

  try {
    const cacheKey = `trending:${mediaType}:week:${language}`
    const cached = getSearchProviderCache(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const payload = await fetchSearchProviderJson({
      path: `/trending/${mediaType}/week`,
      params: { language },
      apiKeys,
    })
    setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 10 * 60_000, maxEntries: 50 })
    res.json(payload)
  } catch (e) {
    const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
    if (status === 429) {
      res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
      return
    }
    res.status(status).json({
      message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
    })
  }
})

app.get('/api/search/image', async (req, res) => {
  const sizeRaw = typeof req.query?.size === 'string' ? req.query.size.trim() : 'w780'
  const pathRaw = typeof req.query?.path === 'string' ? req.query.path.trim() : ''
  const download = req.query?.download === '1' || req.query?.download === 'true'
  const filenameRaw = typeof req.query?.filename === 'string' ? req.query.filename.trim() : ''

  const allowedSizes = new Set(['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'w1280', 'original'])
  const size = allowedSizes.has(sizeRaw) ? sizeRaw : 'w780'

  if (!pathRaw || !pathRaw.startsWith('/') || pathRaw.includes('..') || pathRaw.includes('\\')) {
    res.status(400).json({ message: 'Imagem inválida.' })
    return
  }

  const safeName = filenameRaw
    ? filenameRaw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
    : 'imagem.jpg'
  const filename = safeName.toLowerCase().endsWith('.jpg') || safeName.toLowerCase().endsWith('.jpeg') || safeName.toLowerCase().endsWith('.png')
    ? safeName
    : `${safeName}.jpg`

  try {
    const imageBaseUrl = await getSearchProviderImageBaseUrl()
    if (!imageBaseUrl) {
      res.status(503).json({ message: 'Imagem indisponível no momento.' })
      return
    }
    const url = `${imageBaseUrl}/${size}${pathRaw}`
    const upstream = await fetch(url)
    if (!upstream.ok) {
      res.status(502).json({ message: 'Não foi possível baixar a imagem agora.' })
      return
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.status(200).send(buffer)
  } catch {
    res.status(502).json({ message: 'Não foi possível baixar a imagem agora.' })
  }
})

app.post('/api/video-branding/trailer', requireAuth, requirePremiumOrAdmin, async (req, res) => {
  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const id = Number(req.body?.id)
  const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
  const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
  const trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const layoutRaw = typeof req.body?.layout === 'string' ? req.body.layout.trim() : ''
  const layout = layoutRaw === 'feed' ? 'feed' : 'portrait'
  const includeLogo = req.body?.includeLogo !== false
  const includeSynopsis = true
  const includeCta = req.body?.includeCta !== false
  const includePhone = req.body?.includePhone !== false
  const includeWebsite = req.body?.includeWebsite !== false
  const ctaText = typeof req.body?.ctaText === 'string' ? req.body.ctaText.replace(/\r/g, '').trim().slice(0, 40) : ''
  const synopsisTheme = typeof req.body?.synopsisTheme === 'string' ? req.body.synopsisTheme.trim().slice(0, 60) : ''
  const limitDuration = req.body?.limitDuration === true
  let preview = req.body?.preview === true
  const previewSecondsRaw = Number(req.body?.previewSeconds)
  let previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.round(previewSecondsRaw), 30) : 0
  const maxDurationRaw = Number(req.body?.maxDurationSeconds)
  const maxDurationSeconds = limitDuration
    ? 90
    : Number.isFinite(maxDurationRaw) && maxDurationRaw > 0
      ? Math.min(Math.max(Math.round(maxDurationRaw), 10), 180)
      : null
  if (limitDuration) {
    preview = false
    previewSeconds = 0
  }

  if (!Number.isFinite(id) || id <= 0 || !trailerUrl) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  if (!isYouTubeTrailerUrl(trailerUrl)) {
    res.status(400).json({ message: 'Trailer inválido.' })
    return
  }

  let userType = null
  let brandName = ''
  let brandColors = { primary: '#7c3aed', secondary: '#2563eb' }
  let brandLogo = ''
  let website = ''
  let phone = ''
  try {
    const result = await query(
      'select type, brand_name, brand_colors, brand_logo, website, phone from app_users where id = $1 limit 1',
      [req.auth.userId]
    )
    const row = result.rows[0]
    userType = row && typeof row.type === 'string' ? row.type : null
    brandName = row && typeof row.brand_name === 'string' ? row.brand_name.trim() : ''
    website = row && typeof row.website === 'string' ? row.website.trim() : ''
    phone = row && typeof row.phone === 'string' ? row.phone.trim() : ''
    brandLogo = row && typeof row.brand_logo === 'string' ? row.brand_logo.trim() : ''

    const colorsRaw = row ? row.brand_colors : null
    const colors =
      colorsRaw && typeof colorsRaw === 'object'
        ? colorsRaw
        : typeof colorsRaw === 'string'
          ? (() => {
              try {
                return JSON.parse(colorsRaw)
              } catch {
                return null
              }
            })()
          : null

    if (colors && typeof colors === 'object') {
      const primary = typeof colors.primary === 'string' ? colors.primary : ''
      const secondary = typeof colors.secondary === 'string' ? colors.secondary : ''
      brandColors = {
        primary: primary || brandColors.primary,
        secondary: secondary || brandColors.secondary,
      }
    }
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    return
  }

  let ffmpegCommand = resolveFfmpegCommand()
  if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
    ffmpegCommand = 'ffmpeg'
  }
  const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])
  if (!ffmpegOk) {
    if (userType === 'admin') {
      res.status(503).json({ message: 'Geração com trailer não configurada no servidor.' })
    } else {
      res.status(503).json({ message: 'Geração com trailer indisponível no momento.' })
    }
    return
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-vb-'))
  const cleanup = () => safeRm(tmpDir)
  res.on('close', cleanup)

  try {
    const formatPhoneForDisplay = (value) => {
      const raw = typeof value === 'string' ? value.trim() : ''
      if (!raw) return ''
      let digits = raw.replace(/\D/g, '')
      if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2)
      if (digits.length === 11) {
        const ddd = digits.slice(0, 2)
        const first = digits.slice(2, 7)
        const last = digits.slice(7)
        return `(${ddd}) ${first}-${last}`
      }
      if (digits.length === 10) {
        const ddd = digits.slice(0, 2)
        const first = digits.slice(2, 6)
        const last = digits.slice(6)
        return `(${ddd}) ${first}-${last}`
      }
      return raw
    }

    const getDurationSecondsFromFfmpegProbe = async (filePath) => {
      const result = await runProcess({ command: ffmpegCommand, args: ['-i', filePath], timeoutMs: 8000 })
      const out = `${result.stdout || ''}\n${result.stderr || ''}`
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out)
      if (!match) return null
      const h = Number(match[1])
      const m = Number(match[2])
      const s = Number(match[3])
      if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null
      return h * 3600 + m * 60 + s
    }

    let trailerFile = path.join(tmpDir, 'trailer.mp4')
    const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')

    const ytdl = resolveYtdl()
    if (ytdl) {
      try {
        if (!ytdl.validateURL(trailerUrl)) {
          res.status(400).json({ message: 'Trailer inválido.' })
          return
        }
        const info = await ytdl.getInfo(trailerUrl)
        const mp4Formats = info?.formats?.filter((f) => f && f.container === 'mp4' && f.hasVideo && f.hasAudio) || []
        const format = mp4Formats.length
          ? mp4Formats.sort((a, b) => (Number(b.bitrate || 0) - Number(a.bitrate || 0)))[0]
          : ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' })
        const stream = ytdl.downloadFromInfo(info, { format, requestOptions: { headers: { 'user-agent': 'Mozilla/5.0' } } })
        await downloadToFile({ stream, filePath: trailerFile, timeoutMs: 180_000 })
      } catch (e) {
        console.error('video-branding: ytdl-core failed, trying yt-dlp', { message: String(e?.message || '') })
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
    }

    if (!fs.existsSync(trailerFile)) {
      const ytdlpExec = resolveYtdlpExec()
      if (ytdlpExec) {
        try {
          console.log('video-branding: trying yt-dlp-exec for', trailerUrl)
          await ytdlpExec(trailerUrl, {
            output: trailerTemplate,
            format: 'bv*+ba/b',
            mergeOutputFormat: 'mp4',
            ffmpegLocation: ffmpegCommand,
            retries: 2,
          })
          console.log('video-branding: yt-dlp-exec completed')
        } catch (ee) {
          console.error('video-branding: yt-dlp-exec failed', {
            message: String(ee?.message || ''),
            stack: String(ee?.stack || ''),
            stderr: String(ee?.stderr || ''),
            stdout: String(ee?.stdout || '')
          })
        }
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
    }

    if (!fs.existsSync(trailerFile) && isYouTubeTrailerUrl(trailerUrl)) {
      const bundledYtdlpCommand = resolveBundledYtdlpCommand()
      if (bundledYtdlpCommand) {
        try {
          const downloadResult = await runProcess({
            command: bundledYtdlpCommand,
            args: [
              '--no-progress',
              '--no-playlist',
              '--retries',
              '2',
              '-f',
              'bv*+ba/b',
              '--merge-output-format',
              'mp4',
              '-o',
              trailerTemplate,
              trailerUrl,
            ],
            cwd: tmpDir,
            timeoutMs: 180_000,
          })
          if (downloadResult.code !== 0) {
            console.error('video-branding: bundled yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
          }
        } catch (e) {
          console.error('video-branding: bundled yt-dlp spawn failed', { message: String(e?.message || '') })
        }
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
    }

    if (!fs.existsSync(trailerFile)) {
      const command = (await hasBinary('yt-dlp', ['--version'])) ? 'yt-dlp' : null
      if (!command) {
        if (userType === 'admin') {
          res.status(503).json({ message: 'Geração com trailer não configurada no servidor.' })
        } else {
          res.status(503).json({ message: 'Geração com trailer indisponível no momento.' })
        }
        return
      }
      const downloadResult = await runProcess({
        command,
        args: [
          '--no-progress',
          '--no-playlist',
          '--retries',
          '2',
          '-f',
          'bv*+ba/b',
          '--merge-output-format',
          'mp4',
          '-o',
          trailerTemplate,
          trailerUrl,
        ],
        cwd: tmpDir,
        timeoutMs: 180_000,
      })
      if (downloadResult.code !== 0) {
        console.error('video-branding: yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
        res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
        return
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
    }

    if (!fs.existsSync(trailerFile)) {
      res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
      return
    }

    let trailerTrimEndSeconds = null
    if (!preview) {
      try {
        const durationSeconds = await getDurationSecondsFromFfmpegProbe(trailerFile)
        if (typeof durationSeconds === 'number' && durationSeconds > 6) {
          const end = durationSeconds - 5
          if (end >= 20) trailerTrimEndSeconds = Number(end.toFixed(3))
        }
      } catch {
        trailerTrimEndSeconds = null
      }
    }

    let trailerMaxEndSeconds = trailerTrimEndSeconds
    if (typeof maxDurationSeconds === 'number' && maxDurationSeconds > 0) {
      trailerMaxEndSeconds =
        typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 0
          ? Math.min(trailerMaxEndSeconds, maxDurationSeconds)
          : maxDurationSeconds
    }

    let posterFile = ''
    let synopsisText = ''
    let titleText = ''
    let yearText = ''
    let runtimeText = ''
    let genresText = ''
    let ratingValue = 0

    // Always fetch details for metadata and poster
    if (true) {
      const userContext = await readOptionalAuthUserContext(req)
      const settingsKeys = await getSearchProviderSettingsKeys()
      const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
      if (apiKeys.length > 0) {
        try {
          const payload = await fetchSearchProviderJson({
            path: `/${mediaType}/${id}`,
            params: { language: 'pt-BR' },
            apiKeys,
          })

          if (payload) {
             titleText = payload.title || payload.name || ''
             const date = payload.release_date || payload.first_air_date || ''
             yearText = date ? date.split('-')[0] : ''
             runtimeText = payload.runtime ? `${payload.runtime} min` : ''
             genresText = payload.genres?.map(g => g.name).slice(0, 2).join(', ') || ''
             ratingValue = typeof payload.vote_average === 'number' && Number.isFinite(payload.vote_average) ? payload.vote_average : 0

             if (includeSynopsis) {
               const overviewRaw = typeof payload.overview === 'string' ? payload.overview.trim() : ''
               const normalized = overviewRaw.replace(/\s+/g, ' ').trim()
              synopsisText = normalized || 'Sinopse não disponível para este conteúdo.'
             }

             // Always try to fetch poster for the card
             const posterPath = typeof payload.poster_path === 'string' ? payload.poster_path.trim() : ''
             if (posterPath) {
               const imageBaseUrl = await getSearchProviderImageBaseUrl()
               if (imageBaseUrl) {
                 const url = `${imageBaseUrl}/w500${posterPath}`
                 console.log('video-branding: fetching poster', url)
                 const upstream = await fetch(url)
                 if (upstream.ok) {
                   const buffer = Buffer.from(await upstream.arrayBuffer())
                   posterFile = path.join(tmpDir, 'poster.jpg')
                   fs.writeFileSync(posterFile, buffer)
                   console.log('video-branding: poster saved', posterFile, buffer.length)
                 } else {
                   console.error('video-branding: poster fetch failed', upstream.status, upstream.statusText)
                 }
               } else {
                 console.error('video-branding: no imageBaseUrl')
               }
             } else {
               console.log('video-branding: no posterPath in payload')
             }
          }
        } catch (e) {
          console.error('video-branding: search provider fetch failed', { message: String(e?.message || ''), stack: e?.stack })
        }
      }
    }

    let logoFile = ''
    if (includeLogo && brandLogo && brandLogo.startsWith('data:')) {
      try {
        const match = /^data:([^;]+);base64,(.+)$/.exec(brandLogo)
        if (match) {
          const base64 = match[2]
          const buffer = Buffer.from(base64, 'base64')
          logoFile = path.join(tmpDir, 'logo.png')
          fs.writeFileSync(logoFile, buffer)
          console.log('video-branding: logo saved', logoFile, buffer.length)
        } else {
          console.warn('video-branding: invalid logo data uri format')
        }
      } catch (e) {
        console.error('video-branding: logo save failed', e)
      }
    }

    // Font Logic
    let fontFile = ''
    let fontBoldFile = ''
    try {
      const isWin = process.platform === 'win32'
      const systemFontPath = isWin ? 'C:\\Windows\\Fonts\\segoeui.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
      const systemFontBoldPath = isWin ? 'C:\\Windows\\Fonts\\segoeuib.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
      const fallbackFontPath = isWin ? 'C:\\Windows\\Fonts\\arial.ttf' : ''
      const fallbackFontBoldPath = isWin ? 'C:\\Windows\\Fonts\\arialbd.ttf' : ''

      if (fs.existsSync(systemFontPath)) {
        const localFontPath = path.join(tmpDir, 'font.ttf')
        fs.copyFileSync(systemFontPath, localFontPath)
        fontFile = localFontPath.replace(/\\/g, '/').replace(':', '\\\\:')
      } else if (isWin && fs.existsSync(fallbackFontPath)) {
        const localFontPath = path.join(tmpDir, 'font.ttf')
        fs.copyFileSync(fallbackFontPath, localFontPath)
        fontFile = localFontPath.replace(/\\/g, '/').replace(':', '\\\\:')
      }

      if (fs.existsSync(systemFontBoldPath)) {
        const localFontBoldPath = path.join(tmpDir, 'font-bold.ttf')
        fs.copyFileSync(systemFontBoldPath, localFontBoldPath)
        fontBoldFile = localFontBoldPath.replace(/\\/g, '/').replace(':', '\\\\:')
      } else if (isWin && fs.existsSync(fallbackFontBoldPath)) {
        const localFontBoldPath = path.join(tmpDir, 'font-bold.ttf')
        fs.copyFileSync(fallbackFontBoldPath, localFontBoldPath)
        fontBoldFile = localFontBoldPath.replace(/\\/g, '/').replace(':', '\\\\:')
      } else {
        fontBoldFile = fontFile
      }
    } catch (e) {
      console.error('video-branding: font copy failed', e)
    }

    const outFile = path.join(tmpDir, 'out.mp4')
    const args = []
    args.push('-y')

    // Input 0: trailer
    args.push('-i', trailerFile)
    let inputIndex = 1

    // Input opcional: poster
    let posterIndex = -1
    if (posterFile) {
      args.push('-i', posterFile)
      posterIndex = inputIndex++
    }

    // Input opcional: logo
    let logoIndex = -1
    if (logoFile) {
      args.push('-i', logoFile)
      logoIndex = inputIndex++
    }

    // Input do Info Card (Canvas) - será adicionado após gerar a imagem
    let infoCardIndex = -1
    let headerIndex = -1

    const primary = brandColors?.primary || '#7c3aed'
    const secondary = brandColors?.secondary || '#2563eb'

    const normalizeSynopsisTheme = (value) => {
      const safe = String(value || '').trim().toLowerCase()
      if (safe === 'elegant-black' || safe === 'highlight-yellow' || safe === 'brand') {
        return safe
      }
      return 'brand'
    }

    const parseHexColor = (value) => {
      const raw = String(value || '').trim()
      if (!raw) return null
      const hex = raw.startsWith('#') ? raw.slice(1) : raw
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16)
        const g = parseInt(hex[1] + hex[1], 16)
        const b = parseInt(hex[2] + hex[2], 16)
        if ([r, g, b].some((n) => Number.isNaN(n))) return null
        return { r, g, b }
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        if ([r, g, b].some((n) => Number.isNaN(n))) return null
        return { r, g, b }
      }
      return null
    }

    const rgbaFromHex = (value, alpha) => {
      const rgb = parseHexColor(value)
      if (!rgb) return `rgba(255,255,255,${alpha})`
      const a = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
    }

    const resolvedTheme = normalizeSynopsisTheme(synopsisTheme)
    const themePrimary = brandColors?.primary || '#3b82f6'
    const themeSecondary = brandColors?.secondary || '#0ea5e9'
    const videoThemeConfig = (() => {
      if (resolvedTheme === 'elegant-black') {
        return {
          headerOverlayStops: ['rgba(0,0,0,0.90)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.84)'],
          headerColorWash: null,
          bgDarkenAlpha: 0.74,
          infoOverlayFill: 'rgba(0, 0, 0, 0.62)',
          infoFallbackFill: 'rgba(0, 0, 0, 0.88)',
          infoColorWash: null,
          infoBottomColorWashStops: null,
          infoPosterBlurPx: 7,
          infoPosterSharpAlpha: 0.24,
          tagsFill: 'rgba(255,255,255,0.90)',
          ctaBg: '#111827',
          ctaFg: '#ffffff',
          spacing: { posterY: 66, gap: 28, bottomPad: 60 },
        }
      }
      if (resolvedTheme === 'highlight-yellow') {
        return {
          headerOverlayStops: ['rgba(0,0,0,0.86)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.78)'],
          headerColorWash: 'rgba(251,191,36,0.08)',
          bgDarkenAlpha: 0.66,
          infoOverlayFill: 'rgba(0, 0, 0, 0.42)',
          infoFallbackFill: 'rgba(0, 0, 0, 0.84)',
          infoColorWash: 'rgba(251,191,36,0.24)',
          infoBottomColorWashStops: ['rgba(251,191,36,0.38)', 'rgba(217,119,6,0.32)'],
          infoPosterBlurPx: 5,
          infoPosterSharpAlpha: 0.28,
          tagsFill: '#fbbf24',
          ctaBg: '#fbbf24',
          ctaFg: '#111827',
          spacing: { posterY: 44, gap: 20, bottomPad: 46 },
        }
      }
      if (resolvedTheme === 'brand') {
        return {
          headerOverlayStops: ['rgba(0,0,0,0.86)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.78)'],
          headerColorWash: rgbaFromHex(themePrimary, 0.12),
          bgDarkenAlpha: 0.66,
          infoOverlayFill: 'rgba(0, 0, 0, 0.42)',
          infoFallbackFill: 'rgba(0, 0, 0, 0.84)',
          infoColorWash: rgbaFromHex(themePrimary, 0.24),
          infoBottomColorWashStops: [rgbaFromHex(themePrimary, 0.34), rgbaFromHex(themeSecondary, 0.28)],
          infoPosterBlurPx: 5,
          infoPosterSharpAlpha: 0.28,
          tagsFill: rgbaFromHex(themeSecondary, 0.95),
          ctaBg: themePrimary,
          ctaFg: '#ffffff',
          spacing: { posterY: 52, gap: 24, bottomPad: 52 },
        }
      }
      return {
        headerOverlayStops: ['rgba(0,0,0,0.90)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.84)'],
        headerColorWash: null,
        bgDarkenAlpha: 0.74,
        infoOverlayFill: 'rgba(0, 0, 0, 0.62)',
        infoFallbackFill: 'rgba(0, 0, 0, 0.88)',
        infoColorWash: null,
        infoBottomColorWashStops: null,
        infoPosterBlurPx: 7,
        infoPosterSharpAlpha: 0.24,
        tagsFill: 'rgba(255,255,255,0.90)',
        ctaBg: '#111827',
        ctaFg: '#ffffff',
        spacing: { posterY: 66, gap: 28, bottomPad: 60 },
      }
    })()

    // -----------------------------------------------------------------------
    // NOVO DESIGN "PROMPT USER" - V6 (COM CANVAS SUPREME)
    // -----------------------------------------------------------------------
    
    // Registrar fontes no Canvas
    const fontName = 'CustomFont'
    const fontBoldName = 'CustomFontBold'
    const fontFallbackStack = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
    const canvasFontRegular = `"${fontName}", ${fontFallbackStack}`
    const canvasFontBold = `"${fontBoldName}", ${fontFallbackStack}`
    
    // Normalizar caminhos para o canvas (remove prefixo file:// se existir, mas aqui são paths locais)
    // No Windows, GlobalFonts.registerFromPath precisa do caminho absoluto limpo.
    // As variáveis fontFile e fontBoldFile já são caminhos absolutos copiados para temp.
    // Mas elas têm formatação para o ffmpeg (escapes). Vamos usar as variáveis originais antes do escape se possível, 
    // ou limpar.
    
    // Recuperando caminhos limpos (sem escapes do ffmpeg)
    const cleanFontFile = fontFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep)
    const cleanFontBoldFile = fontBoldFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep)
    
    try {
        GlobalFonts.registerFromPath(cleanFontFile, fontName)
        GlobalFonts.registerFromPath(cleanFontBoldFile, fontBoldName)
    } catch (e) {
        console.error('Canvas font registration failed:', e)
    }

    const targetW = 1080
    const targetH = layout === 'feed' ? 1350 : 1920
    const isTallLayout = layout === 'portrait' || layout === 'feed'
    const headerH = isTallLayout ? 220 : Math.max(110, Math.min(160, Math.round(targetH * 0.115)))
    let videoH = isTallLayout ? 608 : Math.max(520, Math.min(640, Math.round(targetH * 0.56)))
    let videoW = Math.round((videoH * 16) / 9)
    if (videoW > targetW) {
      videoW = targetW
      videoH = Math.round((videoW * 9) / 16)
    }
    let videoX = Math.round((targetW - videoW) / 2)
    const videoY = headerH
    let infoY = videoY + videoH
    let infoH = targetH - infoY
    void includeSynopsis

    try {
      const headerCanvas = createCanvas(targetW, headerH)
      const hctx = headerCanvas.getContext('2d')

      try {
        const headerBgPath = path.resolve('anexos', 'bg.jpg')
        if (fs.existsSync(headerBgPath)) {
          const headerBg = await loadImage(headerBgPath)
          const iw = headerBg.width || targetW
          const ih = headerBg.height || headerH
          const scale = Math.max(targetW / iw, headerH / ih)
          const dw = iw * scale
          const dh = ih * scale
          const dx = (targetW - dw) / 2
          const dy = (headerH - dh) / 2
          hctx.drawImage(headerBg, dx, dy, dw, dh)
        } else {
          hctx.fillStyle = '#0b1220'
          hctx.fillRect(0, 0, targetW, headerH)
        }
      } catch (e) {
        hctx.fillStyle = '#0b1220'
        hctx.fillRect(0, 0, targetW, headerH)
      }

      const headerOverlay = hctx.createLinearGradient(0, 0, 0, headerH)
      headerOverlay.addColorStop(0, videoThemeConfig.headerOverlayStops[0])
      headerOverlay.addColorStop(0.55, videoThemeConfig.headerOverlayStops[1])
      headerOverlay.addColorStop(1, videoThemeConfig.headerOverlayStops[2])
      hctx.fillStyle = headerOverlay
      hctx.fillRect(0, 0, targetW, headerH)
      if (videoThemeConfig.headerColorWash) {
        hctx.fillStyle = videoThemeConfig.headerColorWash
        hctx.fillRect(0, 0, targetW, headerH)
      }

      const hasHeaderCta = includeCta
      const headerTitle = hasHeaderCta ? (String(ctaText || '').trim() || 'Dica de Conteúdo') : ''
      const headerPhone = ''

      const headerScale = Math.max(0.5, Math.min(1.25, headerH / 220))
      const headerCtaScale = hasHeaderCta ? 0.72 : 1
      const headerUiScale = headerScale * headerCtaScale
      const padX = Math.max(28, Math.round(64 * headerUiScale))
      const iconBox = Math.max(52, Math.round(92 * headerUiScale))
      const gap = Math.max(10, Math.round(18 * headerUiScale))
      const iconX = padX
      const iconY = Math.round((headerH - iconBox) / 2)
      const textX = iconX + iconBox + gap
      const headerLogoW = Math.max(160, Math.round(targetW * (190 / 1080)))
      const reservedRight = logoIndex >= 0 && hasHeaderCta ? 30 + headerLogoW + Math.round(38 * headerUiScale) : padX
      const textW = targetW - textX - reservedRight

      const wrapHeaderLines = (context, text, maxWidth, maxLines) => {
        const safe = String(text || '').replace(/\s+/g, ' ').trim()
        if (!safe) return []
        const words = safe.split(' ')
        const lines = []
        let line = ''
        for (let i = 0; i < words.length; i++) {
          const test = line ? `${line} ${words[i]}` : words[i]
          if (context.measureText(test).width > maxWidth && line) {
            lines.push(line)
            line = words[i]
            if (lines.length >= maxLines) break
          } else {
            line = test
          }
        }
        if (line && lines.length < maxLines) lines.push(line)
        return lines
      }

      let titleFontSize = Math.max(24, Math.round(58 * headerUiScale))
      let titleLines = []
      if (hasHeaderCta) {
        const titleFsMax = Math.max(24, Math.round(58 * headerUiScale))
        const titleFsMin = Math.max(18, Math.round(40 * headerUiScale))
        for (let fs = titleFsMax; fs >= titleFsMin; fs -= 2) {
          hctx.font = `800 ${fs}px ${canvasFontBold}`
          const lines = wrapHeaderLines(hctx, headerTitle, textW, 2)
          if (lines.length <= 2) {
            titleFontSize = fs
            titleLines = lines
            break
          }
        }
      }

      const titleLineHeight = Math.round(titleFontSize * 1.06)
      const phoneFontSize = Math.max(18, Math.round(34 * headerScale))
      const blockH = titleLines.length * titleLineHeight + (headerPhone ? 16 + phoneFontSize : 0)
      const startY = Math.round((headerH - blockH) / 2)

      if (hasHeaderCta) {
        try {
          const cx = iconX + iconBox / 2
          const cy = iconY + iconBox / 2
          const radius = Math.round(iconBox * 0.36)

          hctx.save()
          hctx.shadowColor = 'rgba(0,0,0,0.65)'
          hctx.shadowBlur = 18
          hctx.shadowOffsetY = 10

          hctx.strokeStyle = 'rgba(255,255,255,0.22)'
          hctx.lineWidth = 3
          hctx.beginPath()
          hctx.arc(cx, cy, radius, 0, Math.PI * 2)
          hctx.stroke()

          const roundedRectPath = (context, x, y, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)))
            context.beginPath()
            context.moveTo(x + rr, y)
            context.lineTo(x + w - rr, y)
            context.quadraticCurveTo(x + w, y, x + w, y + rr)
            context.lineTo(x + w, y + h - rr)
            context.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
            context.lineTo(x + rr, y + h)
            context.quadraticCurveTo(x, y + h, x, y + h - rr)
            context.lineTo(x, y + rr)
            context.quadraticCurveTo(x, y, x + rr, y)
            context.closePath()
          }

          const boardW = Math.round(iconBox * 0.60)
          const boardH = Math.round(iconBox * 0.42)
          const boardX = Math.round(cx - boardW / 2)
          const boardY = Math.round(cy - boardH / 2 + iconBox * 0.06)
          const topH = Math.max(10, Math.round(boardH * 0.32))
          const topW = Math.round(boardW * 0.98)
          const topX = Math.round(cx - topW / 2)
          const topY = Math.round(boardY - topH + iconBox * 0.05)
          const corner = Math.max(6, Math.round(iconBox * 0.07))

          hctx.fillStyle = 'rgba(255,255,255,0.18)'
          hctx.strokeStyle = 'rgba(255,255,255,0.92)'
          hctx.lineWidth = Math.max(3, Math.round(iconBox * 0.04))
          roundedRectPath(hctx, boardX, boardY, boardW, boardH, corner)
          hctx.fill()
          hctx.stroke()

          hctx.fillStyle = 'rgba(255,255,255,0.20)'
          roundedRectPath(hctx, topX, topY, topW, topH, corner)
          hctx.fill()
          hctx.stroke()

          const stripes = 4
          hctx.strokeStyle = 'rgba(0,0,0,0.30)'
          hctx.lineWidth = Math.max(2, Math.round(iconBox * 0.03))
          hctx.beginPath()
          for (let i = 0; i < stripes; i++) {
            const sx = topX + Math.round((i * topW) / stripes)
            hctx.moveTo(sx, topY + Math.round(topH * 0.15))
            hctx.lineTo(sx + Math.round(topW / stripes), topY + Math.round(topH * 0.85))
          }
          hctx.stroke()

          hctx.restore()
        } catch (e) {
          console.error('video-branding: header icon draw failed', e)
        }

        hctx.textAlign = 'left'
        hctx.textBaseline = 'top'
        hctx.shadowColor = 'rgba(0,0,0,0.70)'
        hctx.shadowBlur = 12
        hctx.shadowOffsetY = 6

        hctx.fillStyle = '#ffffff'
        hctx.font = `800 ${titleFontSize}px ${canvasFontBold}`
        for (let i = 0; i < titleLines.length; i++) {
          hctx.fillText(titleLines[i], textX, startY + i * titleLineHeight)
        }

        if (headerPhone) {
          hctx.fillStyle = 'rgba(255,255,255,0.92)'
          hctx.font = `800 ${phoneFontSize}px ${canvasFontBold}`
          hctx.fillText(headerPhone, textX, startY + titleLines.length * titleLineHeight + 16)
        }
      }

      const headerPng = path.join(tmpDir, 'header.png')
      fs.writeFileSync(headerPng, headerCanvas.toBuffer('image/png'))
      args.push('-loop', '1', '-i', headerPng)
      headerIndex = inputIndex++
    } catch (e) {
      console.error('video-branding: header canvas failed', { message: String(e?.message || '') })
    }

    const parts = []
    
    // 1. Background Geral (Dark Texture/Blur)
    // "Fundo escuro com textura/collage de filmes"
    if (posterIndex >= 0) {
        // Blur forte para textura
        parts.push(`[${posterIndex}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=80:5[bg_base]`)
        // Escurecer bem (Cinematic Dark)
        parts.push(`[bg_base]drawbox=color=black@${videoThemeConfig.bgDarkenAlpha}:t=fill[bg]`)
    } else {
        parts.push(`color=c=#0f172a:s=${targetW}x${targetH}[bg]`)
    }

    let vNext = 'bg'

    if (headerIndex >= 0) {
      parts.push(`[${headerIndex}:v]scale=${targetW}:${headerH}[v_header_img]`)
      parts.push(`[${vNext}][v_header_img]overlay=0:0[v_header_out]`)
      vNext = 'v_header_out'
    }

    // Logo da Marca (Topo Direito - Discreta)
    if (logoIndex >= 0) {
        const logoW = Math.max(160, Math.round(targetW * (190 / 1080)))
        parts.push(`[${logoIndex}:v]scale=${logoW}:-1:force_original_aspect_ratio=decrease[logo_scaled]`)
        const logoX = includeCta ? 'W-w-36' : '(W-w)/2'
        parts.push(`[${vNext}][logo_scaled]overlay=${logoX}:(${headerH}-h)/2[v_header_final]`)
        vNext = 'v_header_final'
    }

    // 3. Área Central (Trailer)
    // "Faixa horizontal central... Janela de reprodução"
    // Altura do vídeo 16:9 em 1080 width é ~608px.
    // Centralizado verticalmente no espaço livre?
    // Header acaba em 220. Footer deve ter uns 800px.
    // Vamos por o vídeo logo abaixo do Header com um espaçamento.
    if (typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1) {
      parts.push(`[0:v]trim=start=0:end=${trailerMaxEndSeconds},setpts=PTS-STARTPTS[v_trailer]`)
    } else {
      parts.push(`[0:v]setpts=PTS-STARTPTS[v_trailer]`)
    }
    const trailerScaleFilter =
      layout === 'feed'
        ? `scale=${videoW}:${videoH}:force_original_aspect_ratio=increase,crop=${videoW}:${videoH},setsar=1`
        : `scale=${videoW}:${videoH}:force_original_aspect_ratio=decrease,pad=${videoW}:${videoH}:(ow-iw)/2:(oh-ih)/2,setsar=1`
    parts.push(`[v_trailer]${trailerScaleFilter}[video_scaled]`)
    // Adicionar leve sombra/glow no vídeo? (Opcional, manter simples por compatibilidade)
    parts.push(`[${vNext}][video_scaled]overlay=${videoX}:${videoY}[v_mid]`)
    vNext = 'v_mid'

    // 4. Área Inferior de Informações (CANVAS TOTAL)
    // Substitui toda a geração manual de boxes e textos do ffmpeg por uma imagem única gerada via Canvas.
    
    const infoCanvas = createCanvas(targetW, infoH)
    const ctx = infoCanvas.getContext('2d')

    // Helper para rounded rect (compatibilidade)
    const drawRoundedRect = (ctx, x, y, w, h, r) => {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + r)
        ctx.lineTo(x + w, y + h - r)
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        ctx.lineTo(x + r, y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - r)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.closePath()
    }

    // Fundo Geral (Poster Esmaecido se possível)
    if (posterFile && fs.existsSync(posterFile)) {
        try {
            const bgPoster = await loadImage(posterFile)
            const blurPxRaw = Number(videoThemeConfig.infoPosterBlurPx)
            const blurPx = Number.isFinite(blurPxRaw) ? Math.max(0, Math.min(24, Math.round(blurPxRaw))) : 10
            const sharpAlphaRaw = Number(videoThemeConfig.infoPosterSharpAlpha)
            const sharpAlpha = Number.isFinite(sharpAlphaRaw) ? Math.max(0, Math.min(0.35, sharpAlphaRaw)) : 0.16

            ctx.save()
            ctx.filter = `blur(${blurPx}px)`
            ctx.globalAlpha = 1
            ctx.drawImage(bgPoster, -32, -32, targetW + 64, infoH + 64)
            ctx.restore()

            if (sharpAlpha > 0) {
              ctx.save()
              ctx.filter = 'none'
              ctx.globalAlpha = sharpAlpha
              ctx.drawImage(bgPoster, -16, -16, targetW + 32, infoH + 32)
              ctx.restore()
            }

        } catch (e) {
            console.error('Erro ao desenhar background poster:', e)
            ctx.fillStyle = '#0f172a' // Fallback
            ctx.fillRect(0, 0, targetW, infoH)
        }
    } else {
        ctx.fillStyle = videoThemeConfig.infoFallbackFill
        ctx.fillRect(0, 0, targetW, infoH)
    }

    const infoOverlay = ctx.createLinearGradient(0, 0, 0, infoH)
    infoOverlay.addColorStop(0, videoThemeConfig.headerOverlayStops[0])
    infoOverlay.addColorStop(0.55, videoThemeConfig.headerOverlayStops[1])
    infoOverlay.addColorStop(1, videoThemeConfig.headerOverlayStops[2])
    ctx.fillStyle = infoOverlay
    ctx.fillRect(0, 0, targetW, infoH)
    if (videoThemeConfig.headerColorWash) {
      ctx.fillStyle = videoThemeConfig.headerColorWash
      ctx.fillRect(0, 0, targetW, infoH)
    }
    
    const padX = Math.max(44, Math.round(targetW * 0.055))
    const isCompactInfo = infoH < 720
    const canShowPosterCard = !isCompactInfo && posterFile && fs.existsSync(posterFile)
    const posterW = canShowPosterCard ? Math.max(220, Math.round(targetW * (300 / 1080))) : 0
    const posterH = canShowPosterCard ? Math.max(280, Math.round(posterW * 1.4)) : 0
    const posterX = padX
    const posterY = canShowPosterCard ? videoThemeConfig.spacing.posterY : 0

    const wrapTextCanvas = (context, text, x, y, maxWidth, lineHeight) => {
      const words = String(text || '').split(/\s+/).filter(Boolean)
      let line = ''
      let currentY = y

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' '
        const metrics = context.measureText(testLine)
        const testWidth = metrics.width

        if (testWidth > maxWidth && n > 0) {
          context.fillText(line, x, currentY)
          line = words[n] + ' '
          currentY += lineHeight
        } else {
          line = testLine
        }
      }
      context.fillText(line, x, currentY)
      return currentY + lineHeight
    }

    const synopsisThemeConfig = (() => {
      if (resolvedTheme === 'elegant-black') {
        return {
          stripFrom: 'rgba(0,0,0,0.92)',
          stripTo: 'rgba(17,24,39,0.92)',
          boxFill: 'rgba(0,0,0,0.52)',
          boxStroke: 'rgba(255,255,255,0.18)',
          boxWashStops: null,
        }
      }
      if (resolvedTheme === 'highlight-yellow') {
        return {
          stripFrom: 'rgba(251,191,36,0.92)',
          stripTo: 'rgba(217,119,6,0.92)',
          boxFill: 'rgba(0,0,0,0.30)',
          boxStroke: 'rgba(255,255,255,0.18)',
          boxWashStops: ['rgba(251,191,36,0.30)', 'rgba(217,119,6,0.26)'],
        }
      }
      if (resolvedTheme === 'brand') {
        return {
          stripFrom: rgbaFromHex(themePrimary, 0.92),
          stripTo: rgbaFromHex(themeSecondary, 0.92),
          boxFill: 'rgba(0,0,0,0.30)',
          boxStroke: 'rgba(255,255,255,0.18)',
          boxWashStops: [rgbaFromHex(themePrimary, 0.30), rgbaFromHex(themeSecondary, 0.26)],
        }
      }
      return {
        stripFrom: 'rgba(0,0,0,0.92)',
        stripTo: 'rgba(17,24,39,0.92)',
        boxFill: 'rgba(0,0,0,0.52)',
        boxStroke: 'rgba(255,255,255,0.18)',
        boxWashStops: null,
      }
    })()

    const bottomPad = videoThemeConfig.spacing.bottomPad
    const gap = videoThemeConfig.spacing.gap
    const showPhone = Boolean(includePhone && phone)
    const showWebsite = !showPhone && Boolean(includeWebsite && website)
    const showCta = !showPhone && !showWebsite && Boolean(includeCta && ctaText)
    const footerKind = showPhone ? 'phone' : showWebsite ? 'website' : showCta ? 'cta' : 'none'
    const bottomPadResolved = Math.max(24, Math.min(bottomPad, Math.round(infoH * (isCompactInfo ? 0.09 : 0.12))))
    const footerH = footerKind === 'cta' ? (isCompactInfo ? 54 : 62) : footerKind === 'none' ? 0 : isCompactInfo ? 72 : 96
    const footerY = footerH ? infoH - footerH - bottomPadResolved : infoH - bottomPadResolved

    const titleX = canShowPosterCard ? posterX + posterW + Math.max(28, Math.round(targetW * (40 / 1080))) : padX
    const titleY = canShowPosterCard ? posterY + 6 : Math.max(24, Math.round(infoH * 0.08))
    const titleW = targetW - titleX - padX

    if (canShowPosterCard) {
      try {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.beginPath()
        drawRoundedRect(ctx, posterX + 6, posterY + 6, posterW, posterH, 20)
        ctx.fill()

        const posterImg = await loadImage(posterFile)
        ctx.save()
        ctx.beginPath()
        drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 20)
        ctx.clip()
        ctx.drawImage(posterImg, posterX, posterY, posterW, posterH)

        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 2
        drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 20)
        ctx.stroke()
        ctx.restore()
      } catch (e) {
        console.error('Erro ao carregar poster no canvas:', e)
      }
    }

    ctx.fillStyle = 'white'
    const titleFontSize = isCompactInfo ? 48 : 56
    const titleLineHeight = isCompactInfo ? 58 : 66
    ctx.font = `900 ${titleFontSize}px ${canvasFontBold}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2

    const endTitleY = wrapTextCanvas(ctx, titleText, titleX, titleY, titleW, titleLineHeight)
    ctx.shadowColor = 'transparent'

    const tagsY = endTitleY + (isCompactInfo ? 12 : 18)
    const genresList = genresText.split(',').slice(0, 2).join(', ')
    const typeText = mediaType === 'tv' ? 'SÉRIE' : 'FILME'
    const tagsText = `${typeText} • ${genresList} • ${yearText}`

    ctx.fillStyle = videoThemeConfig.tagsFill
    let tagsFontSize = 30
    for (let fs = 30; fs >= 20; fs--) {
      ctx.font = `800 ${fs}px ${canvasFontBold}`
      if (ctx.measureText(tagsText).width <= titleW) {
        tagsFontSize = fs
        break
      }
      tagsFontSize = fs
    }
    ctx.font = `800 ${tagsFontSize}px ${canvasFontBold}`
    const tagsMetrics = ctx.measureText(tagsText)
    const tagsTextW = Math.ceil(tagsMetrics.width)
    const tagsH = Number.isFinite(tagsMetrics?.actualBoundingBoxAscent) && Number.isFinite(tagsMetrics?.actualBoundingBoxDescent)
      ? Math.ceil(tagsMetrics.actualBoundingBoxAscent + tagsMetrics.actualBoundingBoxDescent)
      : Math.max(24, Math.round(tagsFontSize * 1.4))
    ctx.fillText(tagsText, titleX, tagsY)

    let ratingPillBottomY = 0
    if (typeof ratingValue === 'number' && ratingValue > 0) {
      const base = ratingValue.toFixed(1)
      const label = `NOTA ${base}${isCompactInfo ? '' : '/10'}`
      const pillH = isCompactInfo ? 44 : 48
      const pad = isCompactInfo ? 16 : 18
      const gapInline = isCompactInfo ? 12 : 14
      const ratingFontSize = isCompactInfo ? 22 : 24
      ctx.font = `900 ${ratingFontSize}px ${canvasFontBold}`
      const textW = Math.ceil(ctx.measureText(label).width)
      const pillW = Math.max(isCompactInfo ? 150 : 170, Math.min(titleW, textW + pad * 2))
      const pillXInline = titleX + tagsTextW + gapInline
      const canInline = pillXInline + pillW <= titleX + titleW
      const pillX = canInline ? pillXInline : titleX
      const pillY = canInline ? Math.round(tagsY + (tagsH - pillH) / 2) : tagsY + tagsH + (isCompactInfo ? 10 : 14)

      ctx.fillStyle = 'rgba(0,0,0,0.36)'
      ctx.beginPath()
      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, Math.round(pillH / 2))
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, pillX + pad, pillY + Math.round(pillH / 2))

      ratingPillBottomY = canInline ? 0 : pillY + pillH
    }

    const btnY = footerY
    const synTopGap = isCompactInfo ? 22 : 30

    const synBoxX = canShowPosterCard ? titleX : padX
    const synBoxW = canShowPosterCard ? targetW - synBoxX - padX : targetW - padX * 2
    const synBaseY = tagsY + tagsH
    const synBaseBottomY = ratingPillBottomY ? Math.max(synBaseY, ratingPillBottomY) : synBaseY
    const synBoxY = canShowPosterCard ? posterY + posterH + 30 : synBaseBottomY + synTopGap
    const synAvailableH = btnY - synBoxY - gap
    const synBoxH = Math.max(60, synAvailableH)

    const synopsisStripW = isCompactInfo
      ? Math.max(44, Math.min(72, Math.round(synBoxW * 0.14)))
      : Math.max(56, Math.min(96, Math.round(synBoxW * 0.16)))
    ctx.fillStyle = synopsisThemeConfig.boxFill
    ctx.beginPath()
    drawRoundedRect(ctx, synBoxX, synBoxY, synBoxW, synBoxH, 26)
    ctx.fill()

    if (Array.isArray(synopsisThemeConfig.boxWashStops) && synopsisThemeConfig.boxWashStops.length >= 2) {
      const boxG = ctx.createLinearGradient(0, synBoxY, 0, synBoxY + synBoxH)
      boxG.addColorStop(0, synopsisThemeConfig.boxWashStops[0])
      boxG.addColorStop(1, synopsisThemeConfig.boxWashStops[1])
      ctx.save()
      ctx.beginPath()
      drawRoundedRect(ctx, synBoxX, synBoxY, synBoxW, synBoxH, 26)
      ctx.clip()
      ctx.fillStyle = boxG
      ctx.fillRect(synBoxX, synBoxY, synBoxW, synBoxH)
      ctx.restore()
    }

    ctx.strokeStyle = synopsisThemeConfig.boxStroke
    ctx.lineWidth = 2
    ctx.stroke()

    const stripGradient = ctx.createLinearGradient(synBoxX, 0, synBoxX + synopsisStripW, 0)
    stripGradient.addColorStop(0, synopsisThemeConfig.stripFrom)
    stripGradient.addColorStop(1, synopsisThemeConfig.stripTo)
    ctx.fillStyle = stripGradient
    ctx.save()
    ctx.beginPath()
    drawRoundedRect(ctx, synBoxX, synBoxY, synopsisStripW, synBoxH, 26)
    ctx.clip()
    ctx.fillRect(synBoxX, synBoxY, synopsisStripW, synBoxH)
    ctx.restore()

    ctx.save()
    ctx.translate(synBoxX + synopsisStripW / 2, synBoxY + synBoxH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = `900 34px ${canvasFontBold}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SINOPSE', 0, 0)
    ctx.restore()

    const synTextPadY = isCompactInfo ? 18 : 28
    const synTextPadX = isCompactInfo ? 22 : 32
    const synTextX = synBoxX + synopsisStripW + synTextPadX
    const synTextY = synBoxY + synTextPadY
    const synTextW = synBoxW - synopsisStripW - synTextPadX * 2
    const synTextH = synBoxH - synTextPadY * 2

    const wrapLinesFull = (context, text, maxWidth) => {
      const safe = String(text || '').replace(/\s+/g, ' ').trim()
      if (!safe) return []
      const paragraphs = safe.split('\n').map(p => p.trim()).filter(Boolean)
      const out = []
      for (let p = 0; p < paragraphs.length; p++) {
        const words = paragraphs[p].split(' ').filter(Boolean)
        let line = ''
        for (let i = 0; i < words.length; i++) {
          const test = line ? `${line} ${words[i]}` : words[i]
          if (context.measureText(test).width > maxWidth && line) {
            out.push(line)
            line = words[i]
          } else {
            line = test
          }
        }
        if (line) out.push(line)
      }
      return out
    }

    const minSynFont = layout === 'feed' ? 7 : 8
    const maxSynFont = isCompactInfo ? 24 : 30
    const synColGap = isCompactInfo ? 16 : 20
    const synMaxCols = layout === 'feed' ? 3 : 2

    let synTextFontSize = minSynFont
    let synTextLineHeight = Math.max(minSynFont + 2, Math.round(minSynFont * 1.22))
    let synTextLines = []
    let synCols = 1
    let synColW = synTextW
    let synMaxLinesPerCol = Math.max(1, Math.floor(synTextH / synTextLineHeight))

    for (let fs = maxSynFont; fs >= minSynFont; fs--) {
      ctx.font = `600 ${fs}px ${canvasFontRegular}`
      const lh = Math.max(fs + 2, Math.round(fs * 1.22))
      const maxLinesPerCol = Math.max(1, Math.floor(synTextH / lh))
      for (let cols = 1; cols <= synMaxCols; cols++) {
        const colW = cols === 1 ? synTextW : Math.floor((synTextW - synColGap * (cols - 1)) / cols)
        if (colW < 120) continue
        const lines = wrapLinesFull(ctx, synopsisText, colW)
        if (lines.length <= maxLinesPerCol * cols) {
          synTextFontSize = fs
          synTextLineHeight = lh
          synTextLines = lines
          synCols = cols
          synColW = colW
          synMaxLinesPerCol = maxLinesPerCol
          break
        }
      }
      if (synTextLines.length) break
    }

    if (!synTextLines.length) {
      ctx.font = `600 ${minSynFont}px ${canvasFontRegular}`
      synTextFontSize = minSynFont
      synTextLineHeight = Math.max(minSynFont + 2, Math.round(minSynFont * 1.22))
      synCols = synMaxCols
      synColW = synCols === 1 ? synTextW : Math.floor((synTextW - synColGap * (synCols - 1)) / synCols)
      synTextLines = wrapLinesFull(ctx, synopsisText, synColW)
      synMaxLinesPerCol = Math.max(1, Math.floor(synTextH / synTextLineHeight))
    }

    ctx.fillStyle = 'rgba(248,250,252,0.95)'
    ctx.font = `600 ${synTextFontSize}px ${canvasFontRegular}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    if (synCols === 1) {
      for (let i = 0; i < synTextLines.length; i++) {
        ctx.fillText(synTextLines[i], synTextX, synTextY + i * synTextLineHeight, synTextW)
      }
    } else {
      for (let i = 0; i < synTextLines.length; i++) {
        const col = Math.floor(i / synMaxLinesPerCol)
        if (col >= synCols) break
        const row = i % synMaxLinesPerCol
        const x = synTextX + col * (synColW + synColGap)
        const y = synTextY + row * synTextLineHeight
        ctx.fillText(synTextLines[i], x, y, synColW)
      }
    }

    if (footerKind !== 'none') {
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 7

      ctx.shadowColor = 'transparent'
      if (footerKind === 'cta') {
        const btnColor = videoThemeConfig.ctaBg
        const btnText = String(ctaText || '').replace(/\r/g, '').trim()
        const isSmallCta = true
        const btnH = isCompactInfo ? 44 : 52
        let btnX = padX
        let btnW = isCompactInfo ? 320 : 420
        const by = footerY

        if (includeLogo && logoFile && fs.existsSync(logoFile)) {
          try {
            const logoImg = await loadImage(logoFile)
            const maxLogoH = btnH - 10
            const maxLogoW = isCompactInfo ? 120 : 150
            const scale = Math.min(maxLogoW / (logoImg.width || 1), maxLogoH / (logoImg.height || 1), 1)
            const lw = Math.max(1, Math.round((logoImg.width || 1) * scale))
            const lh = Math.max(1, Math.round((logoImg.height || 1) * scale))
            const lx = padX
            const ly = Math.round(by + (btnH - lh) / 2)
            ctx.save()
            ctx.globalAlpha = 1
            ctx.drawImage(logoImg, lx, ly, lw, lh)
            ctx.restore()

            const gap = 10
            btnX = lx + lw + gap
            const remaining = targetW - btnX - padX
            const minW = isCompactInfo ? 200 : 240
            btnW = Math.max(minW, Math.min(btnW, remaining))
          } catch (e) {
            void e
          }
        } else {
          btnW = Math.min(btnW, targetW - padX * 2)
          btnX = Math.round((targetW - btnW) / 2)
        }

        ctx.fillStyle = btnColor
        ctx.beginPath()
        drawRoundedRect(ctx, btnX, by, btnW, btnH, Math.round(btnH / 2))
        ctx.fill()

        ctx.fillStyle = videoThemeConfig.ctaFg
        const maxLines = 1
        const maxTextW = btnW - 48
        const rawLines = btnText.split('\n')
        const tokens = []
        for (let i = 0; i < rawLines.length; i++) {
          const words = rawLines[i].replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
          for (let j = 0; j < words.length; j++) tokens.push(words[j])
          if (i < rawLines.length - 1) tokens.push('\n')
        }

        const ellipsisCta = '…'
        const wrapTokensEllipsis = (context, nextTokens, maxWidth, linesCap) => {
          const lines = []
          let line = ''
          let truncated = false
          let i = 0
          for (; i < nextTokens.length; i++) {
            const t = nextTokens[i]
            if (t === '\n') {
              if (line) {
                lines.push(line)
                line = ''
              }
              if (lines.length >= linesCap) {
                truncated = true
                break
              }
              continue
            }
            const test = line ? `${line} ${t}` : t
            if (context.measureText(test).width > maxWidth && line) {
              lines.push(line)
              line = t
              if (lines.length >= linesCap) {
                truncated = true
                break
              }
            } else {
              line = test
            }
          }
          if (line && lines.length < linesCap) lines.push(line)
          if (!truncated && i < nextTokens.length - 1) truncated = true
          if (lines.length === 0) return { lines: [], truncated: Boolean(nextTokens.length) }

          const clampLine = (value) => {
            let next = value
            while (next.length > 0 && context.measureText(next).width > maxWidth) next = next.slice(0, -1).trimEnd()
            return next
          }

          for (let k = 0; k < lines.length; k++) lines[k] = clampLine(lines[k])
          if (truncated) {
            let last = lines[lines.length - 1]
            while (last.length > 0 && context.measureText(last + ellipsisCta).width > maxWidth) last = last.slice(0, -1).trimEnd()
            lines[lines.length - 1] = `${last}${ellipsisCta}`
          }
          return { lines, truncated }
        }

        let btnFontSize = isCompactInfo ? 14 : 16
        let btnLineHeight = isCompactInfo ? 18 : 20
        let btnLines = []
        for (let fs = isCompactInfo ? 14 : 16; fs >= 12; fs--) {
          ctx.font = `800 ${fs}px ${canvasFontBold}`
          const lh = Math.round(fs * 1.18)
          const { lines } = wrapTokensEllipsis(ctx, tokens, maxTextW, maxLines)
          if (!lines.length) continue
          if (lines.length * lh <= btnH - 10) {
            btnFontSize = fs
            btnLineHeight = lh
            btnLines = lines
            break
          }
        }

        if (!btnLines.length) {
          ctx.font = `800 ${btnFontSize}px ${canvasFontBold}`
          btnLines = [btnText.replace(/\s+/g, ' ').trim()].filter(Boolean)
        }

        ctx.font = `800 ${btnFontSize}px ${canvasFontBold}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const centerX = btnX + btnW / 2
        const midY = by + btnH / 2
        const startY = midY - ((btnLines.length - 1) * btnLineHeight) / 2
        for (let i = 0; i < btnLines.length; i++) {
          ctx.fillText(btnLines[i], centerX, startY + i * btnLineHeight)
        }
      } else {
        const footerText = footerKind === 'phone' ? formatPhoneForDisplay(phone) : String(website || '').trim()
        let fontSize = footerKind === 'phone' ? 40 : 32
        const maxW = Math.max(120, targetW - padX * 2)
        const measureGroup = (size) => {
          ctx.font = `800 ${size}px ${canvasFontBold}`
          const textW = ctx.measureText(footerText).width
          if (footerKind === 'phone') {
            const iconSize = Math.max(22, Math.round(size * 1.6))
            const iconGap = Math.max(12, Math.round(size * 0.6))
            return { total: iconSize + iconGap + textW, iconSize, iconGap, textW }
          }
          return { total: textW, iconSize: 0, iconGap: 0, textW }
        }

        let m = measureGroup(fontSize)
        while (m.total > maxW && fontSize > 12) {
          fontSize -= 1
          m = measureGroup(fontSize)
        }

        const startX = Math.round((targetW - m.total) / 2)
        const midY = Math.round(footerY + footerH / 2)

        let x = startX
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.font = `800 ${fontSize}px ${canvasFontBold}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'

        if (footerKind === 'phone') {
          try {
            const waIconPath = path.resolve('anexos', 'pngtree-whatsapp-icon-png-image_6315990.png')
            if (fs.existsSync(waIconPath)) {
              const waIcon = await loadImage(waIconPath)
              const iconY = Math.round(footerY + (footerH - m.iconSize) / 2)
              ctx.save()
              ctx.globalAlpha = 1
              ctx.drawImage(waIcon, x, iconY, m.iconSize, m.iconSize)
              ctx.restore()
            }
          } catch (e) {
            console.error('video-branding: failed to load whatsapp icon', e)
          }
          x += m.iconSize + m.iconGap
        }

        ctx.fillText(footerText, x, midY)
      }
    }

    // Salvar Info Card
    const infoCardPng = path.join(tmpDir, 'info_card.png')
    fs.writeFileSync(infoCardPng, infoCanvas.toBuffer('image/png'))
    
    // Adicionar Info Card como novo input de vídeo (loop estático)
    args.push('-loop', '1', '-i', infoCardPng)
    infoCardIndex = inputIndex++
    
    // Usar o input do Info Card no filter_complex
    parts.push(`[${infoCardIndex}:v]scale=${targetW}:${infoH}[v_info_card]`)
    parts.push(`[${vNext}][v_info_card]overlay=0:${infoY}[v_final_out]`)
    vNext = 'v_final_out'

    // Final output mapping
    parts.push(`[${vNext}]null[vout]`)

    const filterComplex = parts.join(';')
    args.push('-filter_complex', filterComplex)
    args.push('-map', `[vout]`)
    args.push('-map', '0:a?')
    args.push('-c:v', 'libx264')
    args.push('-profile:v', 'high')
    args.push('-pix_fmt', 'yuv420p')
    args.push('-preset', preview ? 'veryfast' : 'fast')
    args.push('-crf', preview ? '24' : '20')
    args.push('-c:a', 'aac')
    args.push('-b:a', '128k')
    args.push('-shortest')
    args.push('-movflags', '+faststart')
    const outputLimitSeconds = preview && previewSeconds > 0
      ? previewSeconds
      : typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1
        ? trailerMaxEndSeconds
        : 0
    if (outputLimitSeconds > 0) {
      args.push('-t', String(outputLimitSeconds))
    }
    args.push(outFile)
    console.log('video-branding: running ffmpeg', { command: ffmpegCommand, args })
    const renderResult = await runProcess({ command: ffmpegCommand, args, cwd: tmpDir, timeoutMs: preview ? 90_000 : 240_000 })
    if (renderResult.code !== 0 || !fs.existsSync(outFile)) {
      console.error('video-branding: ffmpeg failed', { code: renderResult.code, stderr: renderResult.stderr.slice(0, 5000) })
      res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
      return
    }

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200)
    fs.createReadStream(outFile).pipe(res)
  } catch (e) {
    console.error('video-branding: unexpected error', { message: String(e?.message || '') })
    res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
  }
})

app.post('/api/trailer/download', requireAuth, async (req, res) => {
  const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
  const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
  const trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const idRaw = req.body?.id
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)

  if (!trailerUrl) {
    res.status(400).json({ message: 'Trailer indisponível no momento.' })
    return
  }
  if (!isYouTubeTrailerUrl(trailerUrl)) {
    res.status(400).json({ message: 'Trailer inválido.' })
    return
  }
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Conteúdo inválido.' })
    return
  }

  const userContext = await readOptionalAuthUserContext(req)
  const userType = userContext.userType

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-trailer-'))
  const cleanup = () => safeRm(tmpDir)
  res.on('close', cleanup)

  try {
    let trailerFile = path.join(tmpDir, 'trailer.mp4')
    const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
    const bundledYtdlpCommand = resolveBundledYtdlpCommand()
    if (bundledYtdlpCommand) {
      const downloadResult = await runProcess({
        command: bundledYtdlpCommand,
        args: ['--js-runtimes', 'node', '--no-playlist', '-f', 'b[ext=mp4][height<=1080]/b[ext=mp4]', '-o', trailerTemplate, trailerUrl],
        cwd: tmpDir,
        timeoutMs: 180_000,
      })
      if (downloadResult.code !== 0) {
        console.error('trailer-download: bundled yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
    }

    if (!fs.existsSync(trailerFile)) {
      const ytdl = resolveYtdl()
      if (ytdl) {
        try {
          const info = await ytdl.getInfo(trailerUrl)
          const mp4Formats = info?.formats?.filter((f) => f && f.container === 'mp4' && f.hasVideo && f.hasAudio) || []
          const format = mp4Formats.length
            ? mp4Formats.sort((a, b) => (Number(b.bitrate || 0) - Number(a.bitrate || 0)))[0]
            : ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' })
          const stream = ytdl.downloadFromInfo(info, { format, requestOptions: { headers: { 'user-agent': 'Mozilla/5.0' } } })
          await downloadToFile({ stream, filePath: trailerFile, timeoutMs: 180_000 })
        } catch (e) {
          console.error('trailer-download: ytdl-core failed', { message: String(e?.message || '') })
        }
      }
    }

    if (!fs.existsSync(trailerFile)) {
      const ytdlpOk = await hasBinary('yt-dlp', ['--version'])
      if (!ytdlpOk) {
        res.status(503).json({ message: userType === 'admin' ? 'Trailer não configurado no servidor.' : 'Trailer indisponível no momento.' })
        return
      }
      const downloadResult = await runProcess({
        command: 'yt-dlp',
        args: ['--js-runtimes', 'node', '--no-playlist', '-f', 'b[ext=mp4][height<=1080]/b[ext=mp4]', '-o', trailerTemplate, trailerUrl],
        cwd: tmpDir,
        timeoutMs: 180_000,
      })
      if (downloadResult.code !== 0) {
        console.error('trailer-download: yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
        res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
        return
      }
      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }
    }

    if (!fs.existsSync(trailerFile)) {
      res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
      return
    }

    let titleText = ''
    try {
      const settingsKeys = await getSearchProviderSettingsKeys()
      const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
      if (apiKeys.length > 0) {
        const payload = await fetchSearchProviderJson({
          path: `/${mediaType}/${id}`,
          params: { language: 'pt-BR' },
          apiKeys,
        })
        titleText = payload?.title || payload?.name || ''
      }
    } catch {
      titleText = ''
    }

    const safeFileBaseName = (value) => {
      return String(value || '')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, 80) || 'trailer'
    }
    const downloadName = `${safeFileBaseName(titleText || 'trailer')}_trailer.mp4`

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
    res.status(200)
    fs.createReadStream(trailerFile).pipe(res)
  } catch (e) {
    console.error('trailer-download: unexpected error', { message: String(e?.message || '') })
    res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
  }
})

app.get('/api/admin/telegram', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await query('select value from app_settings where key = $1 limit 1', ['telegram_bot_token'])
    const row = result.rows[0]
    const token = row && typeof row.value === 'string' ? row.value : ''
    res.json({ configured: Boolean(token && token.trim()) })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.put('/api/admin/telegram', requireAuth, requireAdmin, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  try {
    await query(
      `
      insert into app_settings (key, value, updated_at)
      values ($1, $2, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      ['telegram_bot_token', token]
    )
    telegramTokenCache = { token, fetchedAt: Date.now() }
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get('/api/admin/search-provider', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { primaryValue, secondaryValue } = await migrateSearchProviderSettingsKeysIfNeeded()
    res.json({
      primaryConfigured: Boolean(primaryValue),
      secondaryConfigured: Boolean(secondaryValue),
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.put('/api/admin/search-provider', requireAuth, requireAdmin, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const hasPrimary = Object.prototype.hasOwnProperty.call(body, 'primary')
  const hasSecondary = Object.prototype.hasOwnProperty.call(body, 'secondary')

  const primary = hasPrimary && typeof body.primary === 'string' ? body.primary.trim() : undefined
  const secondary = hasSecondary && typeof body.secondary === 'string' ? body.secondary.trim() : undefined

  try {
    const entries = []
    if (primary !== undefined) entries.push([SEARCH_PROVIDER_SETTINGS_KEYS.primary, primary])
    if (secondary !== undefined) entries.push([SEARCH_PROVIDER_SETTINGS_KEYS.secondary, secondary])

    if (entries.length === 0) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    const params = []
    const valuesSql = entries
      .map(([key, value], index) => {
        const i = index * 2
        params.push(key, value)
        return `($${i + 1}, $${i + 2}, now())`
      })
      .join(', ')

    await query(
      `
      insert into app_settings (key, value, updated_at)
      values ${valuesSql}
      on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      params
    )
    searchProviderSettingsCache = { keys: [], fetchedAt: 0 }
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const now = Date.now()
    const since24h = now - 24 * 60 * 60 * 1000
    const since7d = now - 7 * 24 * 60 * 60 * 1000

    const usersTotalPromise = query('select count(*)::int as value from app_users')
    const usersActivePromise = query('select count(*)::int as value from app_users where is_active = true')
    const usersByTypePromise = query('select type, count(*)::int as value from app_users group by type')
    const premiumExpiringSoonPromise = query(
      `
      select count(*)::int as value
      from app_users
      where type = 'premium'
        and is_active = true
        and subscription_end is not null
        and subscription_end >= now()
        and subscription_end < now() + interval '7 days'
      `
    )
    const premiumExpiredPromise = query(
      `
      select count(*)::int as value
      from app_users
      where type = 'premium'
        and is_active = true
        and subscription_end is not null
        and subscription_end < now()
      `
    )
    const searchesTotalPromise = query('select count(*)::int as value from app_search_history')
    const searches24hPromise = query('select count(*)::int as value from app_search_history where timestamp >= $1', [since24h])
    const topQueries7dPromise = query(
      `
      select query, count(*)::int as value
      from app_search_history
      where timestamp >= $1
      group by query
      order by value desc
      limit 10
      `,
      [since7d]
    )

    const [usersTotal, usersActive, usersByType, premiumExpiringSoon, premiumExpired, searchesTotal, searches24h, topQueries7d] = await Promise.all([
      usersTotalPromise,
      usersActivePromise,
      usersByTypePromise,
      premiumExpiringSoonPromise,
      premiumExpiredPromise,
      searchesTotalPromise,
      searches24hPromise,
      topQueries7dPromise,
    ])

    const allowRegistrations = await getAllowRegistrations()
    const baseUrl = await getSearchProviderBaseUrl()
    const searchKeys = uniqStrings([...(await getSearchProviderSettingsKeys())])
    const searchConfigured = Boolean(baseUrl) && searchKeys.length > 0
    const typesMap = new Map(usersByType.rows.map((row) => [row.type, row.value]))

    res.json({
      users: {
        total: usersTotal.rows[0]?.value ?? 0,
        active: usersActive.rows[0]?.value ?? 0,
        byType: {
          admin: typesMap.get('admin') ?? 0,
          premium: typesMap.get('premium') ?? 0,
          free: typesMap.get('free') ?? 0,
        },
        premiumExpiringSoon: premiumExpiringSoon.rows[0]?.value ?? 0,
        premiumExpired: premiumExpired.rows[0]?.value ?? 0,
      },
      searches: {
        total: searchesTotal.rows[0]?.value ?? 0,
        last24h: searches24h.rows[0]?.value ?? 0,
        topQueries7d: topQueries7d.rows.map((row) => ({ query: row.query, count: row.value })),
      },
      system: {
        allowRegistrations,
        searchConfigured,
      },
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const q = typeof req.query?.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
  const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : NaN
  const offsetRaw = typeof req.query?.offset === 'string' ? Number(req.query.offset) : NaN
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 50
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0

  try {
    const where = q
      ? `where email ilike $1 or name ilike $1 or coalesce(brand_name,'') ilike $1`
      : ``
    const values = q ? [`%${q}%`, limit, offset] : [limit, offset]
    const queryText = q
      ? `
        select id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
        from app_users
        ${where}
        order by created_at desc
        limit $2 offset $3
      `
      : `
        select id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
        from app_users
        order by created_at desc
        limit $1 offset $2
      `

    const result = await query(queryText, values)
    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        type: row.type,
        isActive: Boolean(row.is_active),
        brandName: row.brand_name || undefined,
        subscriptionEnd: row.subscription_end || undefined,
        phone: row.phone || undefined,
        website: row.website || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  const name = String(req.body?.name || '').trim()
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : ''
  const website = typeof req.body?.website === 'string' ? req.body.website.trim() : ''
  const brandName = String(req.body?.brandName || '').trim()
  const type = req.body?.type === 'admin' || req.body?.type === 'premium' ? req.body.type : 'free'
  const subscriptionEndRaw = typeof req.body?.subscriptionEnd === 'string' ? req.body.subscriptionEnd.trim() : ''
  const subscriptionEnd = subscriptionEndRaw ? new Date(subscriptionEndRaw).toISOString() : null

  if (!email || !password || !name || !brandName) {
    res.status(400).json({ message: 'Preencha os campos obrigatórios.' })
    return
  }

  try {
    const digest = await createPasswordDigest(password)
    const created = await query(
      `
      insert into app_users
        (email, name, phone, website, type, is_active, subscription_end, brand_name, brand_colors, password_hash, password_salt, password_iterations)
      values
        ($1, $2, nullif($3,''), nullif($4,''), $5, true, $6, $7, $8, $9, $10, $11)
      returning id, email, name, type, is_active, brand_name, subscription_end, created_at, updated_at
      `,
      [
        email,
        name,
        phone,
        website,
        type,
        type === 'premium' ? subscriptionEnd : null,
        brandName,
        JSON.stringify({ primary: '#3b82f6', secondary: '#8b5cf6' }),
        digest.hash,
        digest.salt,
        digest.iterations,
      ]
    )

    const row = created.rows[0]
    res.status(201).json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        type: row.type,
        isActive: Boolean(row.is_active),
        brandName: row.brand_name || undefined,
        subscriptionEnd: row.subscription_end || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch (e) {
    const message = String(e?.message || '')
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(409).json({ message: 'Este email já está cadastrado.' })
      return
    }
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params?.id || '').trim()
  if (!userId) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  const patch = []
  const nextIsActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined
  const nextType = req.body?.type === 'admin' || req.body?.type === 'premium' || req.body?.type === 'free' ? req.body.type : undefined

  if (typeof req.body?.email === 'string') {
    const email = normalizeEmail(req.body.email)
    if (!email) {
      res.status(400).json({ message: 'Email inválido.' })
      return
    }
    patch.push(['email', email])
  }

  if (typeof req.body?.name === 'string') {
    const name = req.body.name.trim()
    if (!name) {
      res.status(400).json({ message: 'Nome inválido.' })
      return
    }
    patch.push(['name', name])
  }

  if (typeof req.body?.brandName === 'string') {
    const brandName = req.body.brandName.trim()
    if (!brandName) {
      res.status(400).json({ message: 'Nome da marca inválido.' })
      return
    }
    patch.push(['brand_name', brandName])
  }

  if (typeof req.body?.phone === 'string') {
    const phone = req.body.phone.trim()
    patch.push(['phone', phone ? phone : null])
  }

  if (typeof req.body?.website === 'string') {
    const website = req.body.website.trim()
    patch.push(['website', website ? website : null])
  }

  if (typeof nextIsActive === 'boolean') {
    patch.push(['is_active', nextIsActive])
  }

  if (typeof nextType === 'string') {
    patch.push(['type', nextType])
  }

  const subscriptionEndRaw = typeof req.body?.subscriptionEnd === 'string' ? req.body.subscriptionEnd.trim() : undefined
  if (subscriptionEndRaw !== undefined) {
    const subscriptionEnd = subscriptionEndRaw ? new Date(subscriptionEndRaw).toISOString() : null
    patch.push(['subscription_end', subscriptionEnd])
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const passwordTrimmed = password.trim()

  if (patch.length === 0 && !passwordTrimmed) {
    res.status(400).json({ message: 'Nada para atualizar.' })
    return
  }

  try {
    const currentResult = await query(
      `select id, email, type, is_active from app_users where id = $1 limit 1`,
      [userId]
    )
    const current = currentResult.rows[0]
    if (!current) {
      res.status(404).json({ message: 'Usuário não encontrado.' })
      return
    }

    const currentType = typeof current.type === 'string' ? current.type : 'free'
    const effectiveNextType = typeof nextType === 'string' ? nextType : currentType
    const effectiveNextIsActive = typeof nextIsActive === 'boolean' ? nextIsActive : Boolean(current.is_active)

    if (currentType === 'admin' && (!effectiveNextIsActive || effectiveNextType !== 'admin')) {
      const otherAdmins = await query(
        `select count(1)::int as total from app_users where type = 'admin' and id <> $1 and is_active = true`,
        [userId]
      )
      const total = Number(otherAdmins.rows[0]?.total || 0)
      if (total <= 0) {
        res.status(403).json({ message: 'Você não pode remover/desativar o último admin.' })
        return
      }
    }

    const requestedEmail = patch.find((item) => item[0] === 'email')?.[1]
    if (typeof requestedEmail === 'string' && requestedEmail !== current.email) {
      const exists = await query(`select 1 from app_users where email = $1 and id <> $2 limit 1`, [requestedEmail, userId])
      if (exists.rowCount > 0) {
        res.status(409).json({ message: 'Este email já está cadastrado.' })
        return
      }
    }

    if (effectiveNextType !== 'premium') {
      const hasTypePatch = patch.some((item) => item[0] === 'type')
      const hasSubscriptionPatch = patch.some((item) => item[0] === 'subscription_end')
      if (hasTypePatch || hasSubscriptionPatch) {
        patch.push(['subscription_end', null])
      }
    }

    if (passwordTrimmed) {
      const digest = await createPasswordDigest(passwordTrimmed)
      patch.push(['password_hash', digest.hash])
      patch.push(['password_salt', digest.salt])
      patch.push(['password_iterations', digest.iterations])
    }

    const setClause = patch.map((item, index) => `${item[0]} = $${index + 1}`).join(', ')
    const values = patch.map((item) => item[1])
    values.push(userId)

    const result = await query(
      `
      update app_users
      set ${setClause}, updated_at = now()
      where id = $${patch.length + 1}
      returning id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
      `,
      values
    )
    const row = result.rows[0]
    res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        type: row.type,
        isActive: Boolean(row.is_active),
        brandName: row.brand_name || undefined,
        subscriptionEnd: row.subscription_end || undefined,
        phone: row.phone || undefined,
        website: row.website || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch (e) {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params?.id || '').trim()
  if (!userId) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  if (userId === req.auth.userId) {
    res.status(403).json({ message: 'Você não pode excluir sua própria conta.' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const currentResult = await client.query(`select id, type from app_users where id = $1 limit 1`, [userId])
    const current = currentResult.rows[0]
    if (!current) {
      await client.query('ROLLBACK')
      res.status(404).json({ message: 'Usuário não encontrado.' })
      return
    }

    if (current.type === 'admin') {
      const otherAdmins = await client.query(
        `select count(1)::int as total from app_users where type = 'admin' and id <> $1 and is_active = true`,
        [userId]
      )
      const total = Number(otherAdmins.rows[0]?.total || 0)
      if (total <= 0) {
        await client.query('ROLLBACK')
        res.status(403).json({ message: 'Você não pode excluir o último admin.' })
        return
      }
    }

    await client.query(`delete from ticket_messages where user_id = $1`, [userId])
    await client.query(`delete from tickets where user_id = $1`, [userId])
    await client.query(`delete from app_users where id = $1`, [userId])
    await client.query('COMMIT')
    res.status(204).end()
  } catch {
    try {
      await client.query('ROLLBACK')
    } catch {
      void 0
    }
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  } finally {
    client.release()
  }
})

app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params?.id || '').trim()
  if (!userId) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  try {
    const current = await query(`select id from app_users where id = $1 limit 1`, [userId])
    if (current.rowCount <= 0) {
      res.status(404).json({ message: 'Usuário não encontrado.' })
      return
    }

    const password = generateRandomPassword(14)
    const digest = await createPasswordDigest(password)
    await query(
      `
      update app_users
      set password_hash = $1,
          password_salt = $2,
          password_iterations = $3,
          updated_at = now()
      where id = $4
      `,
      [digest.hash, digest.salt, digest.iterations, userId]
    )

    res.json({ password })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get('/api/search/query', async (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DEBUG] Search Request:', {
      url: req.url,
      headers: req.headers.authorization ? 'Auth present' : 'No auth',
      query: req.query,
    })
  }
  const type = req.query?.type === 'movie' || req.query?.type === 'tv' ? req.query.type : 'multi'
  const queryText = typeof req.query?.query === 'string' ? req.query.query.trim().slice(0, 120) : ''
  const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'
  const yearRaw = typeof req.query?.year === 'string' ? req.query.year.trim() : ''
  const year = /^\d{4}$/.test(yearRaw) ? yearRaw : ''

  if (!queryText) {
    res.status(400).json({ message: 'Consulta inválida.' })
    return
  }

  const userContext = await readOptionalAuthUserContext(req)

  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
  const searchPath = type === 'movie' ? '/search/movie' : type === 'tv' ? '/search/tv' : '/search/multi'
  const params = {
    query: queryText,
    language,
    include_adult: 'false',
    ...(type === 'movie' && year ? { year } : null),
    ...(type === 'tv' && year ? { first_air_date_year: year } : null),
  }

  try {
    const cacheKey = `search:${searchPath}:${getStableObjectKey(params)}`
    const cached = getSearchProviderCache(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const payload = await fetchSearchProviderJson({ path: searchPath, params, apiKeys })
    setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 30_000, maxEntries: 250 })
    res.json(payload)
  } catch (e) {
    const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
    if (status === 429) {
      res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
      return
    }
    res.status(status).json({
      message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
    })
  }
})

app.get('/api/search/videos', async (req, res) => {
  const mediaType = req.query?.mediaType === 'tv' ? 'tv' : 'movie'
  const id = typeof req.query?.id === 'string' ? Number(req.query.id) : NaN
  const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  const userContext = await readOptionalAuthUserContext(req)

  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
  try {
    const cacheKey = `videos:${mediaType}:${id}:${language}`
    const cached = getSearchProviderCache(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const payload = await fetchSearchProviderJson({
      path: `/${mediaType}/${id}/videos`,
      params: { language },
      apiKeys,
    })
    setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 15 * 60_000, maxEntries: 500 })
    res.json(payload)
  } catch (e) {
    const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
    if (status === 429) {
      res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
      return
    }
    res.status(status).json({
      message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
    })
  }
})

app.get('/api/search/details', requireAuth, async (req, res) => {
  const mediaType = req.query?.mediaType === 'tv' ? 'tv' : 'movie'
  const id = typeof req.query?.id === 'string' ? Number(req.query.id) : NaN
  const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  const userContext = await readOptionalAuthUserContext(req)
  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])

  try {
    const cacheKey = `details:${mediaType}:${id}:${language}`
    const cached = getSearchProviderCache(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const payload = await fetchSearchProviderJson({
      path: `/${mediaType}/${id}`,
      params: { language },
      apiKeys,
    })

    const genresRaw = payload && Array.isArray(payload.genres) ? payload.genres : []
    const genres = genresRaw
      .map((g) => ({
        id: typeof g?.id === 'number' ? g.id : null,
        name: typeof g?.name === 'string' ? g.name.trim() : '',
      }))
      .filter((g) => Boolean(g.name))

    const data = {
      vote_average: typeof payload?.vote_average === 'number' ? payload.vote_average : 0,
      vote_count: typeof payload?.vote_count === 'number' ? payload.vote_count : 0,
      genres,
    }

    setSearchProviderCache({ key: cacheKey, data, ttlMs: 15 * 60_000, maxEntries: 500 })
    res.json(data)
  } catch (e) {
    const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
    if (status === 429) {
      res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
      return
    }
    res.status(status).json({
      message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
    })
  }
})

app.get('/api/admin/settings', requireAuth, requireAdmin, async (_req, res) => {
  const allowRegistrations = await getAllowRegistrations()
  res.json({ allowRegistrations })
})

app.put('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const allowRegistrations = typeof req.body?.allowRegistrations === 'boolean' ? req.body.allowRegistrations : null
  if (allowRegistrations === null) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  try {
    await query(
      `
      insert into app_settings (key, value, updated_at)
      values ($1, $2, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
      ['allow_registrations', allowRegistrations ? 'true' : 'false']
    )
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  const name = String(req.body?.name || '').trim()
  const phone = String(req.body?.phone || '').trim()
  const brandName = String(req.body?.brandName || '').trim()

  if (!email || !password || !name || !brandName) {
    res.status(400).json({ message: 'Preencha os campos obrigatórios.' })
    return
  }

  const allowRegistrations = await getAllowRegistrations()
  if (!allowRegistrations) {
    res.status(403).json({ message: 'Cadastros temporariamente desabilitados.' })
    return
  }

  try {
    const digest = await createPasswordDigest(password)
    const bootstrapAdminEmail = typeof process.env.ADMIN_BOOTSTRAP_EMAIL === 'string'
      ? process.env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase()
      : 'admin@mediahub.com'
    const isAdmin = Boolean(bootstrapAdminEmail && email === bootstrapAdminEmail)
    const subscriptionEnd = null

    const created = await query(
      `
      insert into app_users
        (email, name, phone, type, is_active, subscription_end, brand_name, brand_colors, password_hash, password_salt, password_iterations)
      values
        ($1, $2, nullif($3,''), $4, true, $5, $6, $7, $8, $9, $10)
      returning *
      `,
      [
        email,
        name,
        phone,
        isAdmin ? 'admin' : 'free',
        subscriptionEnd,
        brandName,
        JSON.stringify({ primary: '#3b82f6', secondary: '#8b5cf6' }),
        digest.hash,
        digest.salt,
        digest.iterations,
      ]
    )

    const row = created.rows[0]
    const token = signToken({ sub: row.id })
    res.json({ token, user: publicUserFromRow(row) })
  } catch (e) {
    const message = String(e?.message || '')
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(409).json({ message: 'Este email já está cadastrado.' })
      return
    }
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (!email || !password) {
    res.status(400).json({ message: 'Preencha email e senha.' })
    return
  }

  try {
    const result = await query('select * from app_users where email = $1 limit 1', [email])
    const row = result.rows[0]
    if (!row) {
      res.status(401).json({ message: 'Email ou senha inválidos.' })
      return
    }

    const ok = await verifyPassword({
      password,
      digest: {
        hash: row.password_hash,
        salt: row.password_salt,
        iterations: row.password_iterations,
      },
    })

    if (!ok) {
      res.status(401).json({ message: 'Email ou senha inválidos.' })
      return
    }

    const token = signToken({ sub: row.id })
    res.json({ token, user: publicUserFromRow(row) })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/auth/password-reset/start', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''))
    if (!email) {
      res.status(400).json({ message: 'Informe o email.' })
      return
    }
    const userResult = await query('select id, email from app_users where lower(email) = $1 limit 1', [email])
    const user = userResult.rows[0]
    if (!user) {
      res.json({ ok: true })
      return
    }
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
    await query(
      `insert into app_password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    )
    const baseUrl = APP_URL || (req.headers.origin || '').replace(/\/$/, '')
    const url = `${baseUrl}/reset?token=${rawToken}`
    try {
      await sendResetEmail({ to: user.email, url })
      res.json({ ok: true })
    } catch (e) {
      console.error('SMTP Error', e)
      res.status(503).json({ message: 'Envio indisponível. Tente mais tarde.' })
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Não foi possível solicitar reset no momento.' })
  }
})

app.post('/api/auth/password-reset/confirm', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim()
    const password = String(req.body?.password || '').trim()
    if (!token || !password) {
      res.status(400).json({ message: 'Token e nova senha são obrigatórios.' })
      return
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const result = await query(
      `select t.id, t.user_id, t.expires_at, t.used_at
       from app_password_reset_tokens t
       where t.token_hash = $1
       limit 1`,
      [tokenHash]
    )
    const row = result.rows[0]
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      res.status(400).json({ message: 'Token inválido ou expirado.' })
      return
    }
    const digest = await createPasswordDigest(password)
    await query(
      `update app_users set password_hash = $1, password_salt = $2, password_iterations = $3, updated_at = now() where id = $4`,
      [digest.hash, digest.salt, digest.iterations, row.user_id]
    )
    await query(`update app_password_reset_tokens set used_at = now() where id = $1`, [row.id])
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Não foi possível redefinir a senha.' })
  }
})
app.post('/api/auth/password-reset/request', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''))
    if (!email) {
      res.status(400).json({ message: 'Informe o email.' })
      return
    }
    const userResult = await query('select id from app_users where lower(email) = $1 limit 1', [email])
    const userId = userResult.rows[0]?.id || null
    await query(
      `insert into app_password_reset_requests (email, user_id, status)
       values ($1, $2, 'pending')`,
      [email, userId]
    )
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Não foi possível solicitar reset no momento.' })
  }
})

app.get('/api/admin/password-reset-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `select id, email, user_id, status, created_at, resolved_at
       from app_password_reset_requests
       where status = 'pending'
       order by created_at desc
       limit 200`,
      []
    )
    res.json({ items: result.rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao listar solicitações.' })
  }
})

app.post('/api/admin/password-reset-requests/:id/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params?.id || '').trim()
    if (!id) {
      res.status(400).json({ message: 'ID inválido.' })
      return
    }
    const rowResult = await query('select id, user_id from app_password_reset_requests where id = $1 and status = \'pending\' limit 1', [id])
    const row = rowResult.rows[0]
    if (!row || !row.user_id) {
      res.status(404).json({ message: 'Solicitação não encontrada.' })
      return
    }
    const password = generateRandomPassword(14)
    const digest = await createPasswordDigest(password)
    await query(
      `update app_users
       set password_hash = $1,
           password_salt = $2,
           password_iterations = $3,
           updated_at = now()
       where id = $4`,
      [digest.hash, digest.salt, digest.iterations, row.user_id]
    )
    await query('update app_password_reset_requests set status = \'resolved\', resolved_at = now() where id = $1', [id])
    res.json({ password })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao processar solicitação.' })
  }
})
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await query('select * from app_users where id = $1 limit 1', [req.auth.userId])
    const row = result.rows[0]
    if (!row) {
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }
    res.json({ user: publicUserFromRow(row) })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.put('/api/me', requireAuth, async (req, res) => {
  const asTrimmedStringOrNullOrUndefined = (value) => {
    if (value === null) return null
    if (typeof value !== 'string') return undefined
    return value.trim()
  }

  const name = asTrimmedStringOrNullOrUndefined(req.body?.name)
  const phone = asTrimmedStringOrNullOrUndefined(req.body?.phone)
  const website = asTrimmedStringOrNullOrUndefined(req.body?.website)
  const brandName = asTrimmedStringOrNullOrUndefined(req.body?.brandName)
  const brandLogo = req.body?.brandLogo === null ? null : typeof req.body?.brandLogo === 'string' ? req.body.brandLogo : undefined
  const brandColors = req.body?.brandColors === null ? null : req.body?.brandColors && typeof req.body.brandColors === 'object' ? req.body.brandColors : undefined
  const telegramChatIdRaw = asTrimmedStringOrNullOrUndefined(req.body?.telegramChatId)
  const telegramChatId = telegramChatIdRaw === '' ? null : telegramChatIdRaw
  const searchIntegrationKeyRaw = asTrimmedStringOrNullOrUndefined(req.body?.searchIntegrationKey)
  const searchIntegrationKey = searchIntegrationKeyRaw === '' ? null : searchIntegrationKeyRaw

  if (typeof searchIntegrationKey === 'string' && searchIntegrationKey.length > 256) {
    res.status(400).json({ message: 'Chave inválida.' })
    return
  }

  try {
    const canUseTelegramChatId = telegramChatId !== undefined ? await hasTelegramChatIdColumn() : false
    const searchKeyColumn = searchIntegrationKey !== undefined ? await getSearchIntegrationKeyColumn() : null
    const canUseSearchKey = searchIntegrationKey !== undefined ? Boolean(searchKeyColumn) : false

    if (searchIntegrationKey !== undefined && !canUseSearchKey) {
      res.status(503).json({ message: 'Configuração de busca indisponível no momento.' })
      return
    }

    const currentResult = await query(
      `
      select brand_name, brand_name_changed_at, brand_change_count,
             brand_logo, logo_changed_at, logo_change_count
      from app_users
      where id = $1
      limit 1
      `,
      [req.auth.userId]
    )
    const current = currentResult.rows[0]
    if (!current) {
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }

    const patch = []

    if (typeof name === 'string' && name) patch.push(['name', name])
    if (phone === null) patch.push(['phone', null])
    if (typeof phone === 'string') patch.push(['phone', phone || null])
    if (website === null) patch.push(['website', null])
    if (typeof website === 'string') patch.push(['website', website || null])
    if (brandColors !== undefined) patch.push(['brand_colors', brandColors])
    if (telegramChatId !== undefined && canUseTelegramChatId) patch.push(['telegram_chat_id', telegramChatId])
    if (searchIntegrationKey !== undefined && searchKeyColumn) patch.push([searchKeyColumn, searchIntegrationKey])

    if (brandName !== undefined) {
      const nextBrandName = typeof brandName === 'string' ? brandName : ''
      if (!nextBrandName) {
        res.status(400).json({ message: 'Nome da marca inválido.' })
        return
      }

      const currentBrandName = typeof current.brand_name === 'string' ? current.brand_name : ''
      if (nextBrandName !== currentBrandName) {
        const lastChangedAt = current.brand_name_changed_at ? new Date(current.brand_name_changed_at) : null
        if (lastChangedAt) {
          const diffDays = (Date.now() - lastChangedAt.getTime()) / (1000 * 3600 * 24)
          if (diffDays < 15) {
            const remaining = Math.max(0, 15 - Math.floor(diffDays))
            res.status(403).json({ message: `Você poderá alterar o nome da marca novamente em ${remaining} dias.` })
            return
          }
        }
        patch.push(['brand_name', nextBrandName])
        patch.push(['brand_name_changed_at', new Date().toISOString()])
        patch.push(['brand_change_count', (Number(current.brand_change_count) || 0) + 1])
      }
    }

    if (brandLogo !== undefined) {
      const currentLogo = typeof current.brand_logo === 'string' ? current.brand_logo : null
      const nextLogo = brandLogo

      const changed = (currentLogo || null) !== (nextLogo || null)
      if (changed) {
        patch.push(['brand_logo', nextLogo])
        patch.push(['logo_changed_at', new Date().toISOString()])
        patch.push(['logo_change_count', (Number(current.logo_change_count) || 0) + 1])
      }
    }

    if (patch.length === 0) {
      res.status(400).json({ message: 'Nada para atualizar.' })
      return
    }

    const setParts = []
    const values = []
    let i = 1
    for (const [k, v] of patch) {
      setParts.push(`${k} = $${i}`)
      values.push(v)
      i++
    }
    setParts.push(`updated_at = now()`)

    values.push(req.auth.userId)

    const result = await query(
      `update app_users set ${setParts.join(', ')} where id = $${i} returning *`,
      values
    )
    const row = result.rows[0]
    res.json({ user: publicUserFromRow(row) })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/telegram/send', requireAuth, async (req, res) => {
  const textRaw = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  const text = stripYouTubeUrlsFromText(textRaw)
  const includeCover = Boolean(req.body?.includeCover)
  const posterPath = typeof req.body?.posterPath === 'string' ? req.body.posterPath.trim() : ''

  if (!text && !includeCover) {
    res.status(400).json({ message: 'Informe o texto ou selecione uma imagem.' })
    return
  }

  if (includeCover && (!posterPath || !posterPath.startsWith('/'))) {
    res.status(400).json({ message: 'Imagem inválida.' })
    return
  }

  try {
    const canUseTelegramChatId = await hasTelegramChatIdColumn()
    if (!canUseTelegramChatId) {
      res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
      return
    }

    const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
    const userRow = userResult.rows[0]
    const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
    const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

    if (!chatId) {
      res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
      return
    }

    const token = await getTelegramBotToken()
    if (!token) {
      res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
      return
    }

    const telegramBase = `https://api.telegram.org/bot${token}`
    const imageBaseUrl = includeCover ? await getSearchProviderImageBaseUrl() : ''
    if (includeCover && !imageBaseUrl) {
      res.status(503).json({ message: 'Imagem indisponível no momento.' })
      return
    }
    const photoUrl = includeCover ? `${imageBaseUrl}/w780${posterPath}` : ''

    const sendMessage = async (payload) => {
      const r = await fetch(`${telegramBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return r
    }

    const sendPhoto = async (payload) => {
      const r = await fetch(`${telegramBase}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return r
    }

    if (includeCover) {
      const caption = text.length > 1024 ? text.slice(0, 1021) + '…' : text
      const photoRes = await sendPhoto({ chat_id: chatId, photo: photoUrl, caption })
      await photoRes.json().catch(() => null)
      if (!photoRes.ok) {
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      if (text.length > 1024) {
        const msgRes = await sendMessage({ chat_id: chatId, text })
        if (!msgRes.ok) {
          res.json({ ok: true, warning: true })
          return
        }
      }

      res.json({ ok: true })
      return
    }

    const msgRes = await sendMessage({ chat_id: chatId, text })
    if (!msgRes.ok) {
      res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
      return
    }

    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/telegram/send-trailer-video', requireAuth, async (req, res) => {
  const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
  const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
  const trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const idRaw = req.body?.id
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
  const captionRaw = typeof req.body?.caption === 'string' ? req.body.caption.trim() : ''

  if (!trailerUrl) {
    res.status(400).json({ message: 'Trailer indisponível no momento.' })
    return
  }
  if (!isYouTubeTrailerUrl(trailerUrl)) {
    res.status(400).json({ message: 'Trailer inválido.' })
    return
  }
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Conteúdo inválido.' })
    return
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-telegram-trailer-'))
  const cleanup = () => safeRm(tmpDir)
  res.on('close', cleanup)

  try {
    const canUseTelegramChatId = await hasTelegramChatIdColumn()
    if (!canUseTelegramChatId) {
      res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
      return
    }

    const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
    const userRow = userResult.rows[0]
    const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
    const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

    if (!chatId) {
      res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
      return
    }

    const token = await getTelegramBotToken()
    if (!token) {
      res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
      return
    }

    const userContext = await readOptionalAuthUserContext(req)
    const resolvedUserType = userContext.userType

    let ffmpegCommand = resolveFfmpegCommand()
    if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
      ffmpegCommand = 'ffmpeg'
    }
    const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])

    const ensureTrailerFile = async () => {
      let trailerFile = path.join(tmpDir, 'trailer.mp4')
      const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
      const bundledYtdlpCommand = resolveBundledYtdlpCommand()
      const command = bundledYtdlpCommand ? bundledYtdlpCommand : (await hasBinary('yt-dlp', ['--version'])) ? 'yt-dlp' : null
      if (!command) {
        res.status(503).json({ message: resolvedUserType === 'admin' ? 'Trailer não configurado no servidor.' : 'Trailer indisponível no momento.' })
        return null
      }
      const downloadResult = await runProcess({
        command,
        args: [
          '--js-runtimes',
          'node',
          '--no-playlist',
          '-f',
          'b[ext=mp4][height<=720][filesize<45M]/b[ext=mp4][height<=720]/b[ext=mp4][height<=480][filesize<45M]/b[ext=mp4][height<=480]/b[ext=mp4]',
          '-o',
          trailerTemplate,
          trailerUrl,
        ],
        cwd: tmpDir,
        timeoutMs: 180_000,
      })
      if (downloadResult.code !== 0) {
        console.error('telegram-trailer-video: yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
        res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
        return null
      }

      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }

      if (!fs.existsSync(trailerFile)) return null
      return trailerFile
    }

    const trailerFile = await ensureTrailerFile()
    if (!trailerFile) {
      if (!res.headersSent) {
        res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
      }
      return
    }
    let uploadFile = trailerFile
    if (ffmpegOk) {
      const optimizedFile = path.join(tmpDir, 'trailer_telegram.mp4')
      const optimizeResult = await runProcess({
        command: ffmpegCommand,
        args: [
          '-y',
          '-i',
          trailerFile,
          '-t',
          '45',
          '-vf',
          'scale=-2:720',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-maxrate',
          '1400k',
          '-bufsize',
          '2800k',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          optimizedFile,
        ],
        cwd: tmpDir,
        timeoutMs: 240_000,
      })
      if (optimizeResult.code === 0 && fs.existsSync(optimizedFile)) {
        uploadFile = optimizedFile
      }
    }

    let titleText = ''
    let overviewText = ''
    let ratingValue = null

    try {
      const settingsKeys = await getSearchProviderSettingsKeys()
      const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
      if (apiKeys.length > 0) {
        const payload = await fetchSearchProviderJson({
          path: `/${mediaType}/${id}`,
          params: { language: 'pt-BR' },
          apiKeys,
        })
        titleText = payload?.title || payload?.name || ''
        overviewText = typeof payload?.overview === 'string' ? payload.overview : ''
        ratingValue = Number.isFinite(payload?.vote_average) ? Number(payload.vote_average) : null
      }
    } catch {
      titleText = ''
      overviewText = ''
      ratingValue = null
    }

    const captionParts = []
    if (captionRaw) {
      captionParts.push(stripYouTubeUrlsFromText(captionRaw))
    } else {
      if (titleText) captionParts.push(titleText)
      captionParts.push(`Tipo: ${mediaType === 'tv' ? 'Série' : 'Filme'}`)
      if (typeof ratingValue === 'number' && ratingValue > 0) captionParts.push(`Avaliação: ${ratingValue.toFixed(1)}/10`)
      const synopsis = String(overviewText || '').trim()
      if (synopsis) captionParts.push(synopsis)
    }

    const fullCaption = stripYouTubeUrlsFromText(captionParts.join('\n\n')).slice(0, 4096)
    const safeCaption = fullCaption.length > 1024 ? fullCaption.slice(0, 1021) + '…' : fullCaption

    const safeFileBaseName = (value) => {
      return String(value || '')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, 80) || 'trailer'
    }
    const filename = `${safeFileBaseName(titleText || 'trailer')}_trailer.mp4`

    const telegramBase = `https://api.telegram.org/bot${token}`

    const buffer = fs.readFileSync(uploadFile)
    const form = new FormData()
    form.set('chat_id', chatId)
    if (safeCaption) {
      form.set('caption', safeCaption)
    }
    form.set('video', new Blob([buffer], { type: 'video/mp4' }), filename)

    const r = await fetch(`${telegramBase}/sendVideo`, { method: 'POST', body: form })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      console.error('telegram-trailer-video: sendVideo failed', err)
      res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
      return
    }

    if (fullCaption.length > 1024) {
      const msgRes = await fetch(`${telegramBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: fullCaption }),
      })
      if (!msgRes.ok) {
        res.json({ ok: true, warning: true })
        return
      }
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('telegram-trailer-video: unexpected error', { message: String(error?.message || '') })
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  } finally {
    cleanup()
  }
})

app.post('/api/telegram/send-upload', requireAuth, express.raw({ type: ['image/png', 'image/jpeg', 'application/octet-stream'], limit: '6mb' }), async (req, res) => {
  const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
  const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
  if (buffer.length === 0) {
    res.status(400).json({ message: 'Arquivo inválido.' })
    return
  }

  try {
    const canUseTelegramChatId = await hasTelegramChatIdColumn()
    if (!canUseTelegramChatId) {
      res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
      return
    }

    const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
    const userRow = userResult.rows[0]
    const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
    const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

    if (!chatId) {
      res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
      return
    }

    const token = await getTelegramBotToken()
    if (!token) {
      res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
      return
    }

    const telegramBase = `https://api.telegram.org/bot${token}`
    const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : 'application/octet-stream'
    const filename = contentType.includes('png') ? 'imagem.png' : 'imagem.jpg'

    const form = new FormData()
    form.set('chat_id', chatId)
    if (caption) {
      const safeCaption = caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption
      form.set('caption', safeCaption)
    }
    form.set('photo', new Blob([buffer], { type: contentType }), filename)

    const r = await fetch(`${telegramBase}/sendPhoto`, { method: 'POST', body: form })
    await r.json().catch(() => null)
    if (!r.ok) {
      res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
      return
    }

    if (caption.length > 1024) {
      const msgRes = await fetch(`${telegramBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: caption }),
      })
      if (!msgRes.ok) {
        res.json({ ok: true, warning: true })
        return
      }
    }

    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/telegram/send-video-upload', requireAuth, upload.single('video'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ message: 'Vídeo inválido.' })
      return
    }

    const captionRaw = req.body.caption || ''
    const caption = String(captionRaw).slice(0, 1024)

    const canUseTelegramChatId = await hasTelegramChatIdColumn()
    if (!canUseTelegramChatId) {
      res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
      return
    }

    const userResult = await query('select telegram_chat_id from app_users where id = $1 limit 1', [req.auth.userId])
    const userRow = userResult.rows[0]
    const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''

    if (!chatId) {
      res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
      return
    }

    const token = await getTelegramBotToken()
    if (!token) {
      res.status(503).json({ message: 'Telegram não configurado.' })
      return
    }

    const telegramBase = `https://api.telegram.org/bot${token}`
    
    const form = new FormData()
    form.append('chat_id', chatId)
    if (caption) {
      form.append('caption', caption)
    }
    const blob = new Blob([file.buffer], { type: file.mimetype })
    form.append('video', blob, file.originalname || 'video.mp4')

    const r = await fetch(`${telegramBase}/sendVideo`, { method: 'POST', body: form })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      console.error('Telegram Error:', err)
      res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('Send Video Error:', error)
    res.status(500).json({ message: 'Erro interno ao enviar vídeo.' })
  }
})

app.post('/api/telegram/send-media-group-upload',
  requireAuth,
  express.raw({ type: ['application/octet-stream'], limit: '12mb' }),
  async (req, res) => {
    const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
    const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
    if (buffer.length < 8) {
      res.status(400).json({ message: 'Arquivo inválido.' })
      return
    }

    const firstLen = buffer.readUInt32BE(0)
    const firstStart = 4
    const secondLenOffset = firstStart + firstLen
    if (firstLen <= 0 || secondLenOffset + 4 > buffer.length) {
      res.status(400).json({ message: 'Arquivo inválido.' })
      return
    }

    const secondLen = buffer.readUInt32BE(secondLenOffset)
    const secondStart = secondLenOffset + 4
    const end = secondStart + secondLen
    if (secondLen <= 0 || end !== buffer.length) {
      res.status(400).json({ message: 'Arquivo inválido.' })
      return
    }

    const first = buffer.subarray(firstStart, firstStart + firstLen)
    const second = buffer.subarray(secondStart, secondStart + secondLen)

    try {
      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
      const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res
          .status(503)
          .json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
        return
      }

      const telegramBase = `https://api.telegram.org/bot${token}`
      const safeCaption = caption && caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption

      const form = new FormData()
      form.set('chat_id', chatId)
      form.set(
        'media',
        JSON.stringify([
          ...(safeCaption
            ? [{ type: 'photo', media: 'attach://p1', caption: safeCaption }]
            : [{ type: 'photo', media: 'attach://p1' }]),
          { type: 'photo', media: 'attach://p2' },
        ])
      )
      form.set('p1', new Blob([first], { type: 'image/png' }), 'top10_1.png')
      form.set('p2', new Blob([second], { type: 'image/png' }), 'top10_2.png')

      const r = await fetch(`${telegramBase}/sendMediaGroup`, { method: 'POST', body: form })
      await r.json().catch(() => null)
      if (!r.ok) {
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      if (caption.length > 1024) {
        const msgRes = await fetch(`${telegramBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: caption }),
        })
        if (!msgRes.ok) {
          res.json({ ok: true, warning: true })
          return
        }
      }

      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  }
)

app.post(
  '/api/telegram/send-document-upload',
  requireAuth,
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '20mb' }),
  async (req, res) => {
    const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
    const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
    if (buffer.length === 0) {
      res.status(400).json({ message: 'Arquivo inválido.' })
      return
    }

    try {
      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
      const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
        return
      }

      const telegramBase = `https://api.telegram.org/bot${token}`
      const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : 'application/octet-stream'

      const form = new FormData()
      form.set('chat_id', chatId)
      if (caption) {
        const safeCaption = caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption
        form.set('caption', safeCaption)
      }
      form.set('document', new Blob([buffer], { type: contentType }), 'banners.zip')

      const r = await fetch(`${telegramBase}/sendDocument`, { method: 'POST', body: form })
      await r.json().catch(() => null)
      if (!r.ok) {
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      if (caption.length > 1024) {
        const msgRes = await fetch(`${telegramBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: caption }),
        })
        if (!msgRes.ok) {
          res.json({ ok: true, warning: true })
          return
        }
      }

      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  }
)

app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'select id, query, results, timestamp, type from app_search_history where user_id = $1 order by timestamp desc limit 10',
      [req.auth.userId]
    )
    res.json({ items: result.rows })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/history', requireAuth, async (req, res) => {
  const queryText = typeof req.body?.query === 'string' ? req.body.query.slice(0, 500) : ''
  const type = req.body?.type === 'bulk' ? 'bulk' : 'individual'
  const results = Array.isArray(req.body?.results) ? req.body.results : []
  const timestamp = typeof req.body?.timestamp === 'number' ? req.body.timestamp : Date.now()

  if (!queryText) {
    res.status(400).json({ message: 'Consulta inválida.' })
    return
  }

  try {
    await query('delete from app_search_history where user_id = $1 and query = $2 and type = $3', [req.auth.userId, queryText, type])
    await query(
      `
      insert into app_search_history (user_id, query, results, timestamp, type)
      values ($1, $2, $3::jsonb, $4, $5)
      `,
      [req.auth.userId, queryText, JSON.stringify(results), timestamp, type]
    )
    await query(
      `
      delete from app_search_history
      where user_id = $1
        and id not in (
          select id
          from app_search_history
          where user_id = $1
          order by timestamp desc
          limit 10
        )
      `,
      [req.auth.userId]
    )
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

// --- Ticket System Routes ---

// Admin Middleware

// Get System Settings (Public/Auth)
app.get('/api/tickets/settings', async (req, res) => {
  try {
    const result = await query("SELECT value FROM app_settings WHERE key = 'tickets_enabled'")
    // Handle both string 'true' and boolean true just in case JSONB parsing varies
    const val = result.rows[0]?.value
    const enabled = val === 'true' || val === true || val === '"true"'
    res.json({ enabled })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao buscar configurações.' })
  }
})

// Update Settings (Admin)
app.put('/api/admin/tickets/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body
    await query("INSERT INTO app_settings (key, value) VALUES ('tickets_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(enabled)])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao atualizar configurações.' })
  }
})

// List Tickets (User)
app.get('/api/tickets', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY updated_at DESC', [req.auth.userId])
    res.json(result.rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao buscar tickets.' })
  }
})

// Create Ticket (User)
app.post('/api/tickets', requireAuth, async (req, res) => {
  try {
    const { subject, message, priority = 'medium' } = req.body
    
    // Check if tickets are enabled
    const settings = await query("SELECT value FROM app_settings WHERE key = 'tickets_enabled'")
    const val = settings.rows[0]?.value
    const enabled = val === 'true' || val === true || val === '"true"'
    
    if (!enabled) {
       const user = await query('select type from app_users where id = $1', [req.auth.userId])
       if (user.rows[0]?.type !== 'admin') {
         return res.status(403).json({ message: 'O sistema de tickets está temporariamente desativado.' })
       }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ticketRes = await client.query(
        'INSERT INTO tickets (user_id, subject, priority) VALUES ($1, $2, $3) RETURNING id',
        [req.auth.userId, subject, priority]
      )
      const ticketId = ticketRes.rows[0].id
      await client.query(
        'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, $4)',
        [ticketId, req.auth.userId, message, false]
      )
      await client.query('COMMIT')
      res.json({ id: ticketId })
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao criar ticket.' })
  }
})

// Get Ticket Details (User/Admin)
app.get('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const ticketRes = await query('SELECT t.*, u.email as user_email FROM tickets t JOIN app_users u ON t.user_id = u.id WHERE t.id = $1', [id])
    const ticket = ticketRes.rows[0]
    
    if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' })

    if (ticket.user_id !== req.auth.userId) {
       const user = await query('select type from app_users where id = $1', [req.auth.userId])
       if (user.rows[0]?.type !== 'admin') {
         return res.status(403).json({ message: 'Acesso negado.' })
       }
    }

    const messagesRes = await query(`
      SELECT tm.*, u.email as user_email, u.type as user_type 
      FROM ticket_messages tm 
      JOIN app_users u ON tm.user_id = u.id 
      WHERE tm.ticket_id = $1 
      ORDER BY tm.created_at ASC
    `, [id])
    
    res.json({ ticket, messages: messagesRes.rows })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao buscar detalhes do ticket.' })
  }
})

// Add Message (User/Admin)
app.post('/api/tickets/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { message } = req.body
    
    const ticketRes = await query('SELECT * FROM tickets WHERE id = $1', [id])
    const ticket = ticketRes.rows[0]
    
    if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' })

    let isAdmin = false
    if (ticket.user_id !== req.auth.userId) {
       const user = await query('select type from app_users where id = $1', [req.auth.userId])
       if (user.rows[0]?.type !== 'admin') {
         return res.status(403).json({ message: 'Acesso negado.' })
       }
       isAdmin = true
    }

    await query(
      'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, $4)',
      [id, req.auth.userId, message, isAdmin]
    )
    
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id])
    
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao enviar mensagem.' })
  }
})

// Admin List Tickets
app.get('/api/admin/tickets', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.*, u.email as user_email 
      FROM tickets t 
      JOIN app_users u ON t.user_id = u.id 
      ORDER BY 
        CASE WHEN t.status = 'open' THEN 1 
             WHEN t.status = 'in_progress' THEN 2 
             ELSE 3 
        END, 
        t.updated_at DESC
    `)
    res.json(result.rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao buscar tickets.' })
  }
})

// Admin Update Status
app.put('/api/admin/tickets/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    await query('UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao atualizar status.' })
  }
})

// Ticket Stats (User)
app.get('/api/tickets/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
      FROM tickets 
      WHERE user_id = $1
    `, [userId])
    res.json(result.rows[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Erro ao buscar estatísticas.' })
  }
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, '..', 'dist')
const anexosDir = path.join(__dirname, '..', 'anexos')

if (fs.existsSync(anexosDir)) {
  app.use('/anexos', express.static(anexosDir))
}

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res) => {
    if (req.path && req.path.startsWith('/api/')) {
      res.status(404).json({ message: 'Rota não encontrada.' })
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`API pronta em http://localhost:${PORT}`)
})
