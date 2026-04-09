import dotenv from 'dotenv'
import crypto from 'node:crypto'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import dns from 'node:dns'
import fs from 'node:fs'
import net from 'node:net'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnvPort } from '../scripts/read-env-port.mjs'

const __rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
/** Raiz do monorepo (mediahub) — preferido para o Cursor ler a sessão. */
const __debugAgentLogFootballPath = path.join(__rootDir, '..', 'debug-3ee3aa.log')
/** Cópia dentro do pacote — útil se o processo CWD/paths divergirem do monorepo. */
const __debugAgentLogFootballPathAlt = path.join(__rootDir, 'debug-3ee3aa.log')
let __dbgFootballCrestServerLogs = 0
let __dbgNdjsonAppendWarned = false
/** Buffer em memória — o agente pode ler via GET /api/debug/session-ring sem depender do FS do workspace. */
const __sessionDebugRingMax = 400
const __sessionDebugRing = []

const appendDebugNdjsonToSessionFiles = (payload) => {
  try {
    __sessionDebugRing.push({ ...payload, _ringOrder: __sessionDebugRing.length })
    if (__sessionDebugRing.length > __sessionDebugRingMax) {
      __sessionDebugRing.splice(0, __sessionDebugRing.length - __sessionDebugRingMax)
    }
  } catch {
    void 0
  }
  const line = `${JSON.stringify(payload)}\n`
  for (const target of [__debugAgentLogFootballPath, __debugAgentLogFootballPathAlt]) {
    try {
      fs.appendFileSync(target, line)
    } catch (err) {
      if (!__dbgNdjsonAppendWarned) {
        __dbgNdjsonAppendWarned = true
        console.error('[debug-3ee3aa] falha ao gravar NDJSON', target, err?.message || err)
      }
    }
  }
}

const appendFootballDebugNdjson = (hypothesisId, location, message, data) => {
  appendDebugNdjsonToSessionFiles({
    sessionId: '3ee3aa',
    hypothesisId,
    timestamp: Date.now(),
    location,
    message,
    data,
  })
}
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
import * as cheerio from 'cheerio';
const require = createRequire(import.meta.url)

const resolveCanvasIcuPath = () => {
  const fromEnv = typeof process.env.ICU_DATA === 'string' ? process.env.ICU_DATA.trim() : ''
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  try {
    const canvasPkg = require.resolve('@napi-rs/canvas/package.json')
    const pkgDir = path.dirname(canvasPkg)
    const candidate = path.join(pkgDir, 'icudtl.dat')
    if (fs.existsSync(candidate)) return candidate
  } catch {
    void 0
  }
  const nodeDirCandidate = path.join(path.dirname(process.execPath), 'icudtl.dat')
  if (fs.existsSync(nodeDirCandidate)) return nodeDirCandidate
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    const findIcuByPrefix = (baseDir, prefix) => {
      try {
        if (!baseDir || !fs.existsSync(baseDir)) return ''
        const entries = fs.readdirSync(baseDir, { withFileTypes: true })
          .filter((entry) => entry && entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
          .map((entry) => entry.name)
          .sort((a, b) => (a > b ? -1 : 1))
        for (const name of entries) {
          const candidate = path.join(baseDir, name, 'icudtl.dat')
          if (fs.existsSync(candidate)) return candidate
        }
      } catch {
        void 0
      }
      return ''
    }
    const candidates = [
      path.join(localAppData, 'Programs', 'cursor', 'icudtl.dat'),
      path.join(localAppData, 'Programs', 'Cursor', 'icudtl.dat'),
    ]
    for (const candidate of candidates) {
      try {
        if (candidate && fs.existsSync(candidate)) return candidate
      } catch {
        void 0
      }
    }
    const dynamicCandidates = [
      findIcuByPrefix(path.join(localAppData, 'Discord'), 'app-'),
      findIcuByPrefix(path.join(localAppData, 'Programs', 'Microsoft VS Code'), ''),
      findIcuByPrefix(path.join(localAppData, 'Programs', 'Opera'), ''),
    ].filter(Boolean)
    for (const candidate of dynamicCandidates) {
      if (candidate && fs.existsSync(candidate)) return candidate
    }
  }
  return ''
}

const verifyCanvasRuntimeHealth = (icuPath) => {
  if (process.platform !== 'win32') return true
  if (!icuPath || !fs.existsSync(icuPath)) return false
  try {
    const script = [
      "const { createCanvas } = require('@napi-rs/canvas');",
      "const c = createCanvas(128, 128);",
      "const ctx = c.getContext('2d');",
      "ctx.fillStyle = '#111'; ctx.fillRect(0,0,128,128);",
      "ctx.font = '700 24px Arial';",
      "ctx.fillStyle = '#fff';",
      "ctx.fillText('OK', 12, 64);",
      "process.exit(0);",
    ].join(' ')
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: __rootDir,
      env: { ...process.env, ICU_DATA: icuPath },
      encoding: 'utf8',
      timeout: 12000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

const ensureCanvasIcuNearBinary = (icuPath) => {
  if (!icuPath || !fs.existsSync(icuPath)) return
  const targets = []
  try {
    const canvasNativePkg = require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json')
    targets.push(path.join(path.dirname(canvasNativePkg), 'icudtl.dat'))
  } catch {
    void 0
  }
  targets.push(path.join(path.dirname(process.execPath), 'icudtl.dat'))
  for (const target of targets) {
    try {
      if (!target || fs.existsSync(target)) continue
      fs.copyFileSync(icuPath, target)
    } catch {
      void 0
    }
  }
}

const canvasIcuDataPath = resolveCanvasIcuPath()
let isCanvasRuntimeHealthy = process.platform !== 'win32' || Boolean(canvasIcuDataPath)
let hasWarnedCanvasRuntimeUnhealthy = false
if (canvasIcuDataPath && !process.env.ICU_DATA) {
  process.env.ICU_DATA = canvasIcuDataPath
}
if (canvasIcuDataPath) {
  ensureCanvasIcuNearBinary(canvasIcuDataPath)
}
if (process.platform === 'win32' && isCanvasRuntimeHealthy) {
  isCanvasRuntimeHealthy = verifyCanvasRuntimeHealth(canvasIcuDataPath)
}
if (process.platform === 'win32') {
  if (canvasIcuDataPath) {
    console.log('[video-branding] ICU_DATA carregado para canvas:', canvasIcuDataPath)
  } else {
    console.warn('[video-branding] ICU_DATA não encontrado no Windows; fallback degradado será usado.')
  }
  if (!isCanvasRuntimeHealthy) {
    console.warn('[video-branding] Canvas desativado no Windows (healthcheck falhou). Usando fallback.')
  }
}

let createCanvas = (..._args) => {
  throw new Error('Canvas runtime indisponível.')
}
let GlobalFonts = {
  registerFromPath: () => false,
}
let loadImage = async () => {
  throw new Error('Canvas runtime indisponível.')
}
if (isCanvasRuntimeHealthy) {
  try {
    const canvasApi = require('@napi-rs/canvas')
    createCanvas = canvasApi.createCanvas
    GlobalFonts = canvasApi.GlobalFonts
    loadImage = canvasApi.loadImage
  } catch {
    isCanvasRuntimeHealthy = false
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

const isProductionEnv = process.env.NODE_ENV === 'production'
const rawPort = String(process.env.PORT || '').trim()
const resolvedListenPort = rawPort ? Number(rawPort) : readEnvPort()
const PORT =
  Number.isFinite(resolvedListenPort) && resolvedListenPort > 0 ? resolvedListenPort : 8081
const HOST = process.env.HOST || '0.0.0.0'
/** URL direta do Postgres (obrigatória). Com Supabase em rede só IPv4, use também pooler — ver `getPgConnectionForPool`. */
const DATABASE_URL_DIRECT = String(process.env.DATABASE_URL || '').trim()
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
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
    } catch {
    }

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
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      
      INSERT INTO app_settings (key, value) VALUES ('tickets_enabled', 'true') ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS football_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS football_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID NOT NULL REFERENCES football_sources(id) ON DELETE CASCADE,
        schedule_date DATE NOT NULL,
        matches JSONB NOT NULL DEFAULT '[]'::jsonb,
        fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (source_id, schedule_date)
      );

      INSERT INTO football_sources (name, url, is_active)
      SELECT 'Futebol na TV', 'https://www.futebolnatv.com.br/', true
      WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%futebolnatv.com.br%');

      INSERT INTO football_sources (name, url, is_active)
      SELECT 'OneFootball', 'https://onefootball.com/pt-br/jogos', true
      WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%onefootball.com/pt-br/jogos%');

      INSERT INTO football_sources (name, url, is_active)
      SELECT '365Scores TV', 'https://www.365scores.com/pt-br/where-to-watch', true
      WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%365scores.com/pt-br/where-to-watch%');
    `)
    console.log('DB Init: Tabelas de tickets verificadas.')
  } catch (e) {
    console.error('DB Init Error:', e)
  }
}
// initDb()

/** Marca de arranque do processo — devolve em /api/debug/session-ring para saber se o ring é desta instância. */
const __apiBootAt = Date.now()

const app = express()
app.disable('x-powered-by')
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

const originsMatchModuloWww = (allowed, requestOrigin) => {
  try {
    const a = new URL(allowed)
    const b = new URL(requestOrigin)
    if (a.protocol !== b.protocol) return false
    if (String(a.port || '') !== String(b.port || '')) return false
    const ha = (a.hostname || '').toLowerCase().replace(/^www\./, '')
    const hb = (b.hostname || '').toLowerCase().replace(/^www\./, '')
    return ha === hb
  } catch {
    return false
  }
}

/** Host após remover [ ] do IPv6 — compara localhost, 127.0.0.1 e ::1 como equivalentes em dev. */
const normalizeLoopbackHostname = (hostname) =>
  String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '')

const isNormalizedLoopbackHost = (h) =>
  h === 'localhost' ||
  h === '127.0.0.1' ||
  h === '::1' ||
  h === '0:0:0:0:0:0:0:1' ||
  h === '::ffff:127.0.0.1'

/** Vite com host `::` → Origin `http://[::1]:5173` enquanto ALLOWED_ORIGIN pode ser `http://localhost:5173`. */
const isDevLoopbackOriginEquivalent = (origin, allowedList) => {
  if (!isDev || !Array.isArray(allowedList) || allowedList.length === 0) return false
  try {
    const o = new URL(origin)
    const op = o.port || (o.protocol === 'https:' ? '443' : '80')
    const oh = normalizeLoopbackHostname(o.hostname)
    if (!isNormalizedLoopbackHost(oh)) return false
    for (const allowed of allowedList) {
      try {
        const a = new URL(allowed)
        const ap = a.port || (a.protocol === 'https:' ? '443' : '80')
        const ah = normalizeLoopbackHostname(a.hostname)
        if (!isNormalizedLoopbackHost(ah)) continue
        if (ap === op && o.protocol === a.protocol) return true
      } catch {
        void 0
      }
    }
  } catch {
    void 0
  }
  return false
}

const isAllowedOrigin = (origin) => {
  if (ALLOWED_ORIGINS.length === 0) return true
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  for (const allowed of ALLOWED_ORIGINS) {
    if (originsMatchModuloWww(allowed, origin)) return true
  }
  if (isDevLoopbackOriginEquivalent(origin, ALLOWED_ORIGINS)) return true
  if (!isDev) return false
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true
  if (/^https?:\/\/\[::1\](:\d+)?$/i.test(origin)) return true
  if (/^https?:\/\/\[::ffff:127\.0\.0\.1\](:\d+)?$/i.test(origin)) return true
  if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return true
  return false
}

const isSafeExternalHttpUrl = (raw) => {
  try {
    const url = new URL(String(raw || ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = (url.hostname || '').toLowerCase()
    if (!host) return false
    if (host === 'localhost') return false
    if (host === '127.0.0.1') return false
    if (host === '::1') return false

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split('.').map((n) => Number(n))
      if (a === 10) return false
      if (a === 127) return false
      if (a === 169 && b === 254) return false
      if (a === 192 && b === 168) return false
      if (a === 172 && b >= 16 && b <= 31) return false
    }

    if (host.includes(':')) {
      const normalized = host.replace(/^\[|\]$/g, '')
      const compact = normalized.toLowerCase()
      if (compact === '::1') return false
      if (compact.startsWith('fe80:')) return false
      if (compact.startsWith('fc') || compact.startsWith('fd')) return false
    }

    return true
  } catch {
    return false
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    // `Accept` customizado no fetch (ex.: escudos) dispara preflight; sem isto o browser bloqueia antes do GET.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
})

/** NDJSON em mediahub/debug-3ee3aa.log (dev ou DEBUG_AGENT_LOG=1). */
app.post('/api/debug/agent-log', (req, res) => {
  // #region agent log
  appendFootballDebugNdjson('H19', 'server.mjs:/api/debug/agent-log', 'agent_log_route_hit', {
    isDev,
    envDebugAgentLog: String(process.env.DEBUG_AGENT_LOG || '').trim(),
    hasBody: Boolean(req.body && typeof req.body === 'object'),
  })
  // #endregion
  if (!isDev && String(process.env.DEBUG_AGENT_LOG || '').trim() !== '1') {
    res.status(404).end()
    return
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    appendDebugNdjsonToSessionFiles({ ...body, _serverTs: Date.now() })
    res.status(204).end()
  } catch {
    res.status(500).end()
  }
})

app.get('/api/debug/session-ring', (_req, res) => {
  if (!isDev && String(process.env.DEBUG_AGENT_LOG || '').trim() !== '1') {
    res.status(404).end()
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    sessionId: '3ee3aa',
    apiBootAt: __apiBootAt,
    count: __sessionDebugRing.length,
    items: __sessionDebugRing,
  })
})

app.post('/api/debug/session-ring/clear', (_req, res) => {
  if (!isDev && String(process.env.DEBUG_AGENT_LOG || '').trim() !== '1') {
    res.status(404).end()
    return
  }
  __sessionDebugRing.length = 0
  appendFootballDebugNdjson('H20', 'server.mjs:/api/debug/session-ring/clear', 'session_ring_cleared', {})
  res.status(204).end()
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
    await deactivateExpiredPremiumByUserId(userId)
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

const FFMPEG_FONT_PATHS_REGULAR = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
]

const FFMPEG_FONT_PATHS_BOLD = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf',
]

const firstReadableFontFile = (candidates) => {
  for (const p of candidates) {
    if (!p || typeof p !== 'string') continue
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      // ignore
    }
  }
  return ''
}

const ffmpegFilterFontPath = (absPath) => String(absPath || '').replace(/\\/g, '/').replace(':', '\\:')

const copyFontToTmpForFfmpeg = (srcPath, destName, tmpDir) => {
  if (!srcPath || !tmpDir) return ''
  try {
    const dest = path.join(tmpDir, destName)
    fs.copyFileSync(srcPath, dest)
    return ffmpegFilterFontPath(dest)
  } catch {
    return ''
  }
}

/** Fontes TTF para video branding (Canvas + escapes do ffmpeg) em Linux/Docker sem só Debian paths. */
const resolveVideoBrandingFonts = async (tmpDir) => {
  let fontFile = ''
  let fontBoldFile = ''
  const isWin = process.platform === 'win32'

  const envR = typeof process.env.VIDEO_BRANDING_FONT === 'string' ? process.env.VIDEO_BRANDING_FONT.trim() : ''
  const envB = typeof process.env.VIDEO_BRANDING_FONT_BOLD === 'string' ? process.env.VIDEO_BRANDING_FONT_BOLD.trim() : ''

  try {
    if (isWin) {
      const systemFontPath = 'C:\\Windows\\Fonts\\segoeui.ttf'
      const systemFontBoldPath = 'C:\\Windows\\Fonts\\segoeuib.ttf'
      const fallbackFontPath = 'C:\\Windows\\Fonts\\arial.ttf'
      const fallbackFontBoldPath = 'C:\\Windows\\Fonts\\arialbd.ttf'

      if (fs.existsSync(systemFontPath)) {
        fontFile = copyFontToTmpForFfmpeg(systemFontPath, 'vb-font.ttf', tmpDir)
      } else if (fs.existsSync(fallbackFontPath)) {
        fontFile = copyFontToTmpForFfmpeg(fallbackFontPath, 'vb-font.ttf', tmpDir)
      }

      if (fs.existsSync(systemFontBoldPath)) {
        fontBoldFile = copyFontToTmpForFfmpeg(systemFontBoldPath, 'vb-font-bold.ttf', tmpDir)
      } else if (fs.existsSync(fallbackFontBoldPath)) {
        fontBoldFile = copyFontToTmpForFfmpeg(fallbackFontBoldPath, 'vb-font-bold.ttf', tmpDir)
      } else {
        fontBoldFile = fontFile
      }
      return { fontFile, fontBoldFile }
    }

    let regSrc = envR && fs.existsSync(envR) ? envR : ''
    let boldSrc = envB && fs.existsSync(envB) ? envB : ''

    if (!regSrc) {
      try {
        const fm = await runProcess({ command: 'fc-match', args: ['-f', '%{file}', 'DejaVu Sans'], timeoutMs: 5000 })
        if (fm.code === 0) {
          const fp = fm.stdout.trim().split(/\n/)[0]?.trim()
          if (fp && fs.existsSync(fp)) regSrc = fp
        }
      } catch {
        // ignore
      }
    }
    if (!boldSrc) {
      try {
        const fmB = await runProcess({ command: 'fc-match', args: ['-f', '%{file}', 'DejaVu Sans Bold'], timeoutMs: 5000 })
        if (fmB.code === 0) {
          const fp = fmB.stdout.trim().split(/\n/)[0]?.trim()
          if (fp && fs.existsSync(fp)) boldSrc = fp
        }
      } catch {
        // ignore
      }
    }

    if (!regSrc) regSrc = firstReadableFontFile(FFMPEG_FONT_PATHS_REGULAR)
    if (!boldSrc) boldSrc = firstReadableFontFile(FFMPEG_FONT_PATHS_BOLD)

    fontFile = copyFontToTmpForFfmpeg(regSrc, 'vb-font.ttf', tmpDir)
    fontBoldFile = copyFontToTmpForFfmpeg(boldSrc, 'vb-font-bold.ttf', tmpDir)
    if (!fontBoldFile && fontFile) fontBoldFile = fontFile
    if (!fontFile && fontBoldFile) fontFile = fontBoldFile
  } catch (e) {
    console.error('video-branding: font resolve failed', e)
  }

  return { fontFile, fontBoldFile }
}

const hasBinary = async (name, args) => {
  try {
    const result = await runProcess({ command: name, args, timeoutMs: 12000 })
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
  if (resolved && typeof resolved === 'function') return resolved
  if (resolved && typeof resolved === 'object' && typeof resolved.default === 'function') return resolved.default
  return null
}

const resolveBundledYtdlpCommand = () => {
  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const candidates = []
  candidates.push(path.join(process.cwd(), 'server', 'bin', filename))
  const pkgPath = safeResolve('youtube-dl-exec/package.json')
  if (pkgPath) {
    candidates.push(path.join(path.dirname(pkgPath), 'bin', filename))
  }
  const modPath = safeResolve('youtube-dl-exec')
  if (modPath) {
    candidates.push(path.join(path.dirname(modPath), '..', 'bin', filename))
  }
  candidates.push(path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', filename))

  for (const fullPath of candidates) {
    if (fullPath && fs.existsSync(fullPath)) return fullPath
  }
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

const resolveTrailerUrlFromProvider = async ({ mediaType, id, userKey }) => {
  if (!Number.isFinite(id) || id <= 0) return ''
  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userKey, ...settingsKeys])
  if (apiKeys.length === 0) return ''

  const pickBestTrailerId = (videos) => {
    const normalized = Array.isArray(videos)
      ? videos
          .map((video) => ({
            key: typeof video?.key === 'string' ? video.key.trim() : '',
            site: typeof video?.site === 'string' ? video.site.trim().toLowerCase() : '',
            type: typeof video?.type === 'string' ? video.type.trim().toLowerCase() : '',
            name: typeof video?.name === 'string' ? video.name.trim().toLowerCase() : '',
          }))
          .filter((video) => video.site === 'youtube' && isYouTubeTrailerId(video.key))
      : []
    if (normalized.length === 0) return ''

    const scored = normalized
      .map((video) => {
        let score = 0
        if (video.type === 'trailer') score += 100
        else if (video.type === 'teaser') score += 70
        else if (video.type === 'clip') score += 55
        else if (video.type === 'featurette') score += 45
        else score += 20
        if (video.name.includes('official') || video.name.includes('oficial')) score += 20
        if (video.name.includes('trailer')) score += 10
        if (video.name.includes('teaser')) score += 6
        return { key: video.key, score }
      })
      .sort((a, b) => b.score - a.score)
    return scored[0]?.key || ''
  }

  const languages = ['pt-BR', 'en-US']
  for (const language of languages) {
    try {
      const payload = await fetchSearchProviderJson({
        path: `/${mediaType}/${id}/videos`,
        params: { language },
        apiKeys,
      })
      const trailerId = pickBestTrailerId(payload?.results)
      if (trailerId) return buildYouTubeTrailerUrlFromId(trailerId)
    } catch {
      // tenta próximo idioma
    }
  }
  try {
    const payload = await fetchSearchProviderJson({
      path: `/${mediaType}/${id}/videos`,
      params: {},
      apiKeys,
    })
    const trailerId = pickBestTrailerId(payload?.results)
    if (trailerId) return buildYouTubeTrailerUrlFromId(trailerId)
  } catch {
    // sem fallback extra
  }
  return ''
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
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/'/g, "\\'")
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')

const escapeFfmpegPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")

const resolveFfmpegDrawtextFont = () => {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Windows\\Fonts\\segoeui.ttf',
        'C:\\Windows\\Fonts\\arial.ttf',
      ]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      void 0
    }
  }
  return ''
}

const safeRm = (targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

const cleanupStaleTempFiles = () => {
  try {
    const tmpRoot = os.tmpdir()
    const entries = fs.readdirSync(tmpRoot, { withFileTypes: true })
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      const isMediahub = name.startsWith('mediahub-')
      const isPyInstaller = name.startsWith('_MEI')
      if (!isMediahub && !isPyInstaller) continue
      const fullPath = path.join(tmpRoot, name)
      let stale = true
      try {
        const stat = fs.statSync(fullPath)
        stale = now - stat.mtimeMs > 15 * 60_000
      } catch {
        stale = true
      }
      if (stale) safeRm(fullPath)
    }
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

/** TMDB omite media_type em /trending/movie|tv/week; o cliente filtrava e ficava sem itens. */
const normalizeTrendingPayload = (payload, mediaType) => {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return payload
  const results = payload.results.map((item) => {
    if (!item || typeof item !== 'object') return item
    const mt = item.media_type
    if (mt === 'movie' || mt === 'tv' || mt === 'person') return item
    if (mediaType === 'movie') return { ...item, media_type: 'movie' }
    if (mediaType === 'tv') return { ...item, media_type: 'tv' }
    const hasMovieFields = typeof item.title === 'string' || typeof item.release_date === 'string'
    const hasTvFields = typeof item.name === 'string' || typeof item.first_air_date === 'string'
    if (hasTvFields && !hasMovieFields) return { ...item, media_type: 'tv' }
    if (hasMovieFields) return { ...item, media_type: 'movie' }
    return item
  })
  return { ...payload, results }
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

const getAppSettingValue = async (key) => {
  try {
    const result = await query('select value from app_settings where key = $1 limit 1', [key])
    const row = result.rows[0]
    if (!row) return null
    if (typeof row.value === 'string') return row.value
    if (row.value === null || row.value === undefined) return null
    return String(row.value)
  } catch {
    return null
  }
}

const setAppSettingValue = async ({ key, value }) => {
  await query(
    `
    insert into app_settings (key, value, updated_at)
    values ($1, $2, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    `,
    [key, value]
  )
}

const parseBooleanSettingValue = (rawValue, fallback = true) => {
  if (typeof rawValue === 'boolean') return rawValue
  if (rawValue === null || rawValue === undefined) return fallback
  const normalized = String(rawValue).trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'true' || normalized === '"true"' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === '"false"' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  return fallback
}

const getTicketsEnabled = async () => {
  try {
    const result = await query("select value from app_settings where key = 'tickets_enabled' limit 1")
    const row = result.rows[0]
    if (!row) {
      await setAppSettingValue({ key: 'tickets_enabled', value: 'true' })
      return true
    }
    return parseBooleanSettingValue(row.value, true)
  } catch {
    return true
  }
}

const deactivateExpiredPremiumByUserId = async (userId) => {
  if (!userId) return
  try {
    await query(
      `
      update app_users
      set is_active = false, updated_at = now()
      where id = $1
        and type = 'premium'
        and is_active = true
        and subscription_end is not null
        and subscription_end < now()
      `,
      [userId]
    )
  } catch {
  }
}

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

const FOOTBALL_SETTINGS_KEYS = {
  readTime: 'football_read_time',
  readWindowStart: 'football_read_window_start',
  readWindowEnd: 'football_read_window_end',
  timeZone: 'football_time_zone',
  lastRunDate: 'football_last_run_date',
  excludedChannels: 'football_excluded_channels',
  excludedCompetitions: 'football_excluded_competitions',
}

const DEFAULT_FOOTBALL_TIME_ZONE = 'America/Sao_Paulo'
const DEFAULT_FOOTBALL_READ_TIME = '19:00'
const DEFAULT_FOOTBALL_READ_WINDOW_START = '19:30'
const DEFAULT_FOOTBALL_READ_WINDOW_END = '20:00'
const DEFAULT_FOOTBALL_EXCLUDED_CHANNELS = [
  'ppv onefootball',
  'ppv-onefootball',
  'ppv/onefootball',
  'onefootball ppv',
]
const DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS = [
  'ingles 5 divisao',
  'inglês 5ª divisão',
  'english 5th division',
  'national league',
  'vanarama national league',
]

const normalizeFootballFilterToken = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const parseFootballSettingList = (rawValue, defaults) => {
  const fallback = Array.isArray(defaults) ? defaults.map((v) => normalizeFootballFilterToken(v)).filter(Boolean) : []
  if (typeof rawValue !== 'string') return fallback
  const raw = rawValue.trim()
  if (!raw) return fallback
  let values = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) values = parsed
  } catch {
    values = raw.split(/\r?\n|[,;]+/g)
  }
  const normalized = values.map((v) => normalizeFootballFilterToken(v)).filter(Boolean)
  return normalized.length ? [...new Set(normalized)] : fallback
}

const parseClockTime = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})(?::|h|H)(\d{2})$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23) return null
  if (minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const getZonedNowParts = ({ timeZone }) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const map = new Map(parts.map((p) => [p.type, p.value]))
  const date = `${map.get('year')}-${map.get('month')}-${map.get('day')}`
  const time = `${map.get('hour')}:${map.get('minute')}`
  return { date, time }
}

const addDaysToIsoDate = (isoDate, days) => {
  const base = new Date(`${isoDate}T12:00:00.000Z`)
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

const stripHtml = (html) => {
  const pre = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|li|div|h1|h2|h3|h4|h5|h6)>/gi, '\n')
  return pre
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

const parseFootballLine = (line) => {
  const normalized = String(line || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const timeMatch = normalized.match(/\b(\d{1,2}[:hH]\d{2})\b/)
  if (!timeMatch) return null
  const time = parseClockTime(timeMatch[1])
  if (!time) return null

  const rest = normalized.slice((timeMatch.index || 0) + timeMatch[0].length).trim()
  if (!rest) return null

  const parts = rest.split(/\s[-–—]\s/).map((p) => p.trim()).filter(Boolean)
  const teamsPart = parts[0] || rest
  const channelsPart = parts.length > 1 ? parts.slice(1).join(' - ') : ''

  const teamsMatch = teamsPart.match(/^(.+?)\s+(?:x|X|vs\.?|VS\.?)\s+(.+?)$/)
  if (!teamsMatch) return null

  const home = teamsMatch[1].trim()
  const away = teamsMatch[2].trim()
  if (!home || !away) return null

  const channels = channelsPart
    ? channelsPart.split(/[,/|•]+/).map((c) => c.trim()).filter(Boolean)
    : []

  return { time, home, away, channels }
}

const parseFutebolNaTvSchedule = ({ html, targetDateIso }) => {
  const text = stripHtml(html)
  const targetDdMm = (() => {
    const [y, m, d] = targetDateIso.split('-')
    return `${d}/${m}`
  })()

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let inDate = false
  const matches = []
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/)
    if (dateMatch) {
      const dd = String(dateMatch[1]).padStart(2, '0')
      const mm = String(dateMatch[2]).padStart(2, '0')
      const ddMm = `${dd}/${mm}`
      inDate = ddMm === targetDdMm
      continue
    }
    if (!inDate) continue
    const parsed = parseFootballLine(line)
    if (parsed) matches.push(parsed)
  }
  return matches
}

const prettifyFootballTeamFromSlug = (slug) => {
  const raw = String(slug || '').trim().replace(/^-+/, '').replace(/-+$/, '')
  if (!raw) return ''
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase()
      if (lowered === 'fc' || lowered === 'sc' || lowered === 'mg' || lowered === 'sp' || lowered === 'rj') {
        return lowered.toUpperCase()
      }
      if (part.length <= 2) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const normalizeFootballCompetitionLabel = (value) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw
    .replace(/\s*[-–—]\s*rodada.*$/i, '')
    .replace(/\s+rodada.*$/i, '')
    .replace(/\s*[-–—]\s*\d+ª?\s+rodada.*$/i, '')
    .trim()
}

const extractFootballCompetitionFromHref = (absHref) => {
  const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
  const path = m ? m[1] : ''
  if (!path) return ''
  const parts = path
    .replace(/\.html$/i, '')
    .split('/')
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  if (parts.length < 2) return ''
  const competitionSlug = parts[0]
  if (!competitionSlug || competitionSlug.includes('-x-')) return ''
  return normalizeFootballCompetitionLabel(prettifyFootballTeamFromSlug(competitionSlug))
}

const normalizeFootballSearchText = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const isPlaceholderFootballTeamCrestUrl = (value) => String(value || '').includes('/assets/img/loadteam.png')

const normalizeFootballCrestUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:')) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
  if (raw.startsWith('upload/')) return `https://www.futebolnatv.com.br/${raw}`
  // Sem protocolo, new URL() falha e isSafeExternalHttpUrl rejeita — quebra o proxy /api/football/crest.
  if (/^www\.futebolnatv\.com\.br(\/|$|\?|#)/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return `https://${raw}`
  }
  try {
    const parsed = new URL(raw)
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:'
      return parsed.toString()
    }
    return parsed.toString()
  } catch {
    return raw
  }
}

const parseFutebolNaTvBrSchedule = ({ html }) => {
  const rawHtml = String(html || '')
  const anchorRe = /<a\b[^>]*href="([^"]*\/aovivo\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const byHref = new Map()

  const toAbsHref = (href) => {
    const raw = String(href || '')
      .trim()
      .replace(/^[\[(<"']+/, '')
      .replace(/[\])>,"'.;:!?]+$/, '')
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const parseTeamsFromHref = (absHref) => {
    const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
    const last = m ? m[1] : ''
    const base = last.replace(/\.html$/i, '')
    const sep = base.indexOf('-x-')
    if (sep === -1) return { home: '', away: '' }
    const homeSlug = base.slice(0, sep)
    let awaySlug = base.slice(sep + 3)
    awaySlug = awaySlug
      .replace(/-\d{2}-\d{2}-\d{4}$/i, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
      .replace(/-[a-f0-9]{8,}$/i, '')
    return { home: prettifyFootballTeamFromSlug(homeSlug), away: prettifyFootballTeamFromSlug(awaySlug) }
  }

  const maybeSetChannels = (entry, text) => {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return
    if (normalized.length > 140) return
    const looksLikeChannels = normalized === normalized.toUpperCase() && /[A-Z]/.test(normalized) && !/\b\d{1,2}[:hH]\d{2}\b/.test(normalized)
    if (!looksLikeChannels) return
    entry.channels = [normalized]
  }

  const toAbsAssetUrl = (href) => {
    const raw = String(href || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const extractTeamCrestsFromAnchorHtml = (value) => {
    const raw = String(value || '')
    if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }
    const urls = []
    const re = /<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
    let m
    while ((m = re.exec(raw)) !== null) {
      const src = String(m[1] || m[2] || m[3] || '').trim()
      if (src) urls.push(toAbsAssetUrl(src))
    }
    const unique = uniqStrings(urls)
    const teamUrls = unique.filter((u) => u.includes('/upload/teams/') || u.includes('/assets/img/loadteam.png'))
    return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' }
  }

  const parseTableMatches = () => {
    let selectedTableHtml = ''

    const parseTableMatchesFromHtml = (tableHtml) => {
      const rows = String(tableHtml || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || []
      const out = []
      for (const rowHtml of rows) {
        const hrefMatch = String(rowHtml || '').match(/href="([^"]*\/aovivo\/[^"]+)"/i)
        const href = hrefMatch ? toAbsHref(hrefMatch[1]) : ''
        const cells = []
        const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
        let m
        while ((m = cellRe.exec(rowHtml)) !== null) {
          cells.push(m[1])
        }
        if (cells.length < 4) continue

        const timeCell = stripHtml(cells[0]).replace(/\s+/g, ' ').trim()
        const timeToken = (timeCell.match(/\b(\d{1,2}[:hH]\d{2})\b/) || [])[1] || timeCell
        const time = parseClockTime(timeToken)
        if (!time) continue

        const normalizeCellText = (html) => stripHtml(html).replace(/\s+/g, ' ').trim()
        const competitionCell = normalizeFootballCompetitionLabel(cells[1] ? normalizeCellText(cells[1]) : '')
        const competitionHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(href))
        const competition = competitionCell || competitionHref
        const separatorIdx = cells.findIndex((cellHtml) => {
          const value = normalizeCellText(cellHtml).toLowerCase()
          return value === 'x' || value === '×' || value === 'vs' || value === 'vs.'
        })

        let homeHtml = ''
        let awayHtml = ''
        let home = ''
        let away = ''
        if (separatorIdx > 1 && separatorIdx < cells.length - 2) {
          homeHtml = cells[separatorIdx - 1]
          awayHtml = cells[separatorIdx + 1]
          home = normalizeCellText(homeHtml)
          away = normalizeCellText(awayHtml)
        } else {
          const gameHtml = cells.slice(2, -1).join(' ')
          const gameText = normalizeCellText(gameHtml)
          const teamsMatch = gameText.match(/^(.+?)\s*(?:x|X|×|vs\.?|VS\.?)\s*(.+?)$/)
          if (!teamsMatch) continue
          home = teamsMatch[1].trim()
          away = teamsMatch[2].trim()
          homeHtml = gameHtml
          awayHtml = gameHtml
        }
        if (!home || !away) continue

        const channelHtml = cells[cells.length - 1] || ''
        const channelTextRaw = stripHtml(channelHtml).replace(/\s+/g, ' ').trim()
        const isNoBroadcast = /sem\s+transmiss/i.test(channelTextRaw)
        const channels = isNoBroadcast || !channelTextRaw
          ? []
          : channelTextRaw
              .split(/\s*(?:,|\/|\||•|\be\b)\s*/i)
              .map((c) => c.trim())
              .filter(Boolean)

        const firstImgSrc = (html) => {
          const value = String(html || '')
          const imgMatch = value.match(/<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/i)
          const src = imgMatch ? (imgMatch[1] || imgMatch[2] || imgMatch[3] || '') : ''
          return src ? toAbsAssetUrl(src) : ''
        }
        const homeCrestUrl = firstImgSrc(homeHtml)
        const awayCrestUrl = firstImgSrc(awayHtml)

        out.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
      }
      return out
    }

    const tables = rawHtml.match(/<table\b[\s\S]*?<\/table>/gi) || []
    const candidates = tables.length > 0 ? tables : [rawHtml]
    let bestMatches = []
    let bestScore = -1
    for (const candidate of candidates) {
      const headerText = stripHtml(candidate).replace(/\s+/g, ' ').toLowerCase()
      const hasHeader = headerText.includes('hora') && headerText.includes('jogo') && headerText.includes('canal')
      const parsed = parseTableMatchesFromHtml(candidate)
      const score = parsed.length * 10 + (hasHeader ? 50 : 0)
      if (score > bestScore) {
        bestScore = score
        bestMatches = parsed
        selectedTableHtml = candidate
      }
    }

    parseTableMatches.selectedTableHtml = selectedTableHtml
    return bestMatches
  }

  let match
  while ((match = anchorRe.exec(rawHtml)) !== null) {
    const absHref = toAbsHref(match[1])
    if (!absHref) continue
    const inner = match[2]
    const text = stripHtml(inner).replace(/\s+/g, ' ').trim()
    if (!text) continue

    const existing = byHref.get(absHref) || {
      href: absHref,
      time: null,
      home: '',
      away: '',
      competition: '',
      channels: [],
      homeCrestUrl: '',
      awayCrestUrl: '',
    }
    if (!existing.href) existing.href = absHref
    if (!existing.homeCrestUrl || !existing.awayCrestUrl) {
      const crests = extractTeamCrestsFromAnchorHtml(inner)
      if (!existing.homeCrestUrl && crests.homeCrestUrl) existing.homeCrestUrl = crests.homeCrestUrl
      if (!existing.awayCrestUrl && crests.awayCrestUrl) existing.awayCrestUrl = crests.awayCrestUrl
    }
    const timeMatch = text.match(/\b(\d{1,2}[:hH]\d{2})\b/)
    if (timeMatch) {
      const time = parseClockTime(timeMatch[1])
      if (time) existing.time = time
      if (!existing.home || !existing.away) {
        const teams = parseTeamsFromHref(absHref)
        if (teams.home && teams.away) {
          existing.home = teams.home
          existing.away = teams.away
        }
      }
    } else {
      maybeSetChannels(existing, text)
    }
    byHref.set(absHref, existing)
  }

  const matches = []
  for (const entry of byHref.values()) {
    const time = parseClockTime(entry?.time)
    const home = typeof entry?.home === 'string' ? entry.home.trim() : ''
    const away = typeof entry?.away === 'string' ? entry.away.trim() : ''
    const competition = typeof entry?.competition === 'string' ? entry.competition.trim() : ''
    const channels = Array.isArray(entry?.channels) ? entry.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof entry?.homeCrestUrl === 'string' ? entry.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof entry?.awayCrestUrl === 'string' ? entry.awayCrestUrl.trim() : ''
    const href = typeof entry?.href === 'string' ? entry.href.trim() : ''
    if (!time || !home || !away) continue
    matches.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
  }

  const tableMatches = parseTableMatches()
  const selectedTableHtml = typeof parseTableMatches.selectedTableHtml === 'string' ? parseTableMatches.selectedTableHtml : ''
  const looseMatches = tableMatches.length > 0
    ? []
    : (() => {
        const text = stripHtml(selectedTableHtml || rawHtml)
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
        const out = []
        for (const line of lines) {
          const parsed = parseFootballLine(line)
          if (!parsed) continue
          out.push(parsed)
        }
        return out
      })()

  const mergedMap = new Map()
  const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
  for (const m of [...matches, ...tableMatches, ...looseMatches]) {
    const time = parseClockTime(m?.time)
    const home = typeof m?.home === 'string' ? m.home.trim() : ''
    const away = typeof m?.away === 'string' ? m.away.trim() : ''
    const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
    const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
    const href = typeof m?.href === 'string' ? m.href.trim() : ''
    if (!time || !home || !away) continue
    const key = buildKey({ time, home, away })
    const existing = mergedMap.get(key)
    if (!existing) {
      mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
      continue
    }
    if (!existing.competition && competition) existing.competition = competition
    if (existing.channels.length === 0 && channels.length > 0) {
      existing.channels = channels
    } else if (channels.length > 0) {
      const nextChannels = uniqStrings([...existing.channels, ...channels])
      existing.channels = nextChannels
    }
    if (!existing.homeCrestUrl && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
    if (!existing.awayCrestUrl && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
    if (!existing.href && href) existing.href = href
  }

  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

const parseFutebolNaTvBrMarkdownSchedule = ({ markdown }) => {
  const raw = String(markdown || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const byHref = new Map()
  const pipeMatches = []

  const toAbsHref = (href) => {
    const raw = String(href || '')
      .trim()
      .replace(/^[\[(<"']+/, '')
      .replace(/[\])>,"'.;:!?]+$/, '')
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const toAbsAssetUrl = (href) => {
    const raw = String(href || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const ensureEntry = (absHref) => {
    const existing = byHref.get(absHref)
    if (existing) return existing
    const next = { href: absHref, time: null, home: '', away: '', competition: '', channels: [], homeCrestUrl: '', awayCrestUrl: '' }
    byHref.set(absHref, next)
    return next
  }

  const parseTeamsFromHref = (absHref) => {
    const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
    const last = m ? m[1] : ''
    const base = last.replace(/\.html$/i, '')
    const sep = base.indexOf('-x-')
    if (sep === -1) return { home: '', away: '' }
    const homeSlug = base.slice(0, sep)
    let awaySlug = base.slice(sep + 3)
    awaySlug = awaySlug
      .replace(/-\d{2}-\d{2}-\d{4}$/i, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
      .replace(/-[a-f0-9]{8,}$/i, '')
    return { home: prettifyFootballTeamFromSlug(homeSlug), away: prettifyFootballTeamFromSlug(awaySlug) }
  }

  const extractGameHrefsFromLine = (line) => {
    const hrefs = []
    const re = /\]\(((?:https?:\/\/(?:www\.)?futebolnatv\.com\.br)?\/aovivo\/[^)\s]+|https?:\/\/(?:www\.)?futebolnatv\.com\.br\/aovivo\/[^)\s]+)\)/gi
    let m
    while ((m = re.exec(line)) !== null) {
      const abs = toAbsHref(m[1])
      if (abs) hrefs.push(abs)
    }
    const fallbackRe = /(https?:\/\/(?:www\.)?futebolnatv\.com\.br\/aovivo\/[^\s)\]>"]+)/gi
    while ((m = fallbackRe.exec(String(line || ''))) !== null) {
      const abs = toAbsHref(m[1])
      if (abs) hrefs.push(abs)
    }
    if (hrefs.length === 0) return hrefs
    return uniqStrings(hrefs)
  }

  const extractChannelLabelFromLine = (line, absHref) => {
    const escaped = String(absHref || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[([^\\]]{1,80})\\]\\(${escaped}\\)`, 'gi')
    const labels = []
    let m
    while ((m = re.exec(line)) !== null) {
      labels.push(String(m[1] || '').trim())
    }
    return labels.filter(Boolean)
  }

  const extractTeamCrestsFromLine = (line) => {
    const rawLine = String(line || '')
    if (!rawLine) return { homeCrestUrl: '', awayCrestUrl: '' }
    const urls = []
    const re = /!\[[^\]]*\]\(([^)\s]+)\)/gi
    let m
    while ((m = re.exec(rawLine)) !== null) {
      const abs = toAbsAssetUrl(String(m[1] || '').trim())
      if (abs) urls.push(abs)
    }
    const htmlImgRe = /<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
    while ((m = htmlImgRe.exec(rawLine)) !== null) {
      const src = String(m[1] || m[2] || m[3] || '').trim()
      const abs = toAbsAssetUrl(src)
      if (abs) urls.push(abs)
    }
    const teamUrls = urls
      .filter(Boolean)
      .filter((u) => u.includes('/upload/teams/') || u.includes('/assets/img/loadteam.png'))
    const unique = uniqStrings(teamUrls)
    const homeCrestUrl = unique[0] || ''
    const awayCrestUrl = unique[1] || ''
    return { homeCrestUrl, awayCrestUrl }
  }

  const normalizeChannelListFromCell = (value) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    if (/sem\s+transmiss/i.test(normalized)) return []
    return normalized
      .split(/\s*(?:,|\/|\||•|\be\b)\s*/i)
      .map((c) => c.trim())
      .filter(Boolean)
  }

  const stripMarkdownInline = (value) => {
    const raw = String(value || '')
    if (!raw) return ''
    const withoutLinks = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    const withoutHtml = stripHtml(withoutLinks)
    return withoutHtml
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const parsePipeRow = (line) => {
    if (!line.includes('|')) return null
    const cells = line
      .split('|')
      .map((c) => stripMarkdownInline(c))
      .filter(Boolean)
    if (cells.length < 3) return null
    const timeToken = (cells[0].match(/\b(\d{1,2}[:hH]\d{2})\b/) || [])[1] || cells[0]
    const time = parseClockTime(timeToken)
    if (!time) return null

    const separatorIdx = cells.findIndex((c) => {
      const v = c.toLowerCase()
      return v === 'x' || v === '×' || v === 'vs' || v === 'vs.'
    })
    let home = ''
    let away = ''
    if (separatorIdx > 0 && separatorIdx < cells.length - 1) {
      home = String(cells[separatorIdx - 1] || '').trim()
      away = String(cells[separatorIdx + 1] || '').trim()
    } else {
      const gameCell = cells.find((c) => /(?:\bx\b|×|\bvs\.?\b)/i.test(c)) || ''
      const match = String(gameCell).match(/^(.+?)\s*(?:x|X|×|vs\.?|VS\.?)\s*(.+?)$/)
      if (match) {
        home = String(match[1] || '').trim()
        away = String(match[2] || '').trim()
      }
    }
    if (!home || !away) return null

    const href = extractGameHrefsFromLine(line)[0] || ''
    const competitionCell = normalizeFootballCompetitionLabel(cells[1] || '')
    const competitionHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(href))
    const competition = competitionCell || competitionHref
    const channels = normalizeChannelListFromCell(cells[cells.length - 1])
    const crests = extractTeamCrestsFromLine(line)
    return { time, home, away, competition, channels, homeCrestUrl: crests.homeCrestUrl, awayCrestUrl: crests.awayCrestUrl, href }
  }

  const extractCompetitionFromMarkdownLine = (line) => {
    const raw = String(line || '')
    if (!raw) return ''
    const boldMatch = raw.match(/\*\*([^*]+)\*\s*(?:-\s*rodada[^\]\n]*)?/i)
    const fromBold = normalizeFootballCompetitionLabel(boldMatch ? boldMatch[1] : '')
    if (fromBold) return fromBold
    const inlineMatch = raw.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^–—\-\n]{0,120})\s*(?:[-–—]\s*rodada.*)?/i)
    return normalizeFootballCompetitionLabel(inlineMatch ? inlineMatch[1] : '')
  }

  const headerIdx = lines.findIndex((line) => {
    if (!line.includes('|')) return false
    const normalized = stripMarkdownInline(line).toLowerCase()
    return normalized.includes('hora') && normalized.includes('jogo') && normalized.includes('canal')
  })

  const pipeScanLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines
  let hasParsedPipe = false
  for (const line of pipeScanLines) {
    let allowPipeParse = true
    if (headerIdx >= 0) {
      const normalized = stripMarkdownInline(line)
      if (!normalized.includes('|') && hasParsedPipe) break
      if (/\b:?-{3,}:?\b/.test(normalized)) continue
      if (!normalized.includes('|')) allowPipeParse = false
    }
    if (allowPipeParse) {
      const parsedPipe = parsePipeRow(line)
      if (parsedPipe) {
        pipeMatches.push(parsedPipe)
        hasParsedPipe = true
      }
    }

    const hrefs = extractGameHrefsFromLine(line)
    if (hrefs.length === 0) continue

    const timeMatch = line.match(/\b(\d{1,2}[:hH]\d{2})\b/)
    const crests = extractTeamCrestsFromLine(line)
    const lineCompetition = extractCompetitionFromMarkdownLine(line)
    for (const absHref of hrefs) {
      const entry = ensureEntry(absHref)

      if (!entry.homeCrestUrl && crests.homeCrestUrl) entry.homeCrestUrl = crests.homeCrestUrl
      if (!entry.awayCrestUrl && crests.awayCrestUrl) entry.awayCrestUrl = crests.awayCrestUrl
      if (!entry.competition && lineCompetition) entry.competition = lineCompetition
      if (!entry.competition) {
        const fromHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(absHref))
        if (fromHref) entry.competition = fromHref
      }

      if (timeMatch) {
        const time = parseClockTime(timeMatch[1])
        if (time) entry.time = time
        if (!entry.home || !entry.away) {
          const teams = parseTeamsFromHref(absHref)
          if (teams.home && teams.away) {
            entry.home = teams.home
            entry.away = teams.away
          }
        }
        continue
      }

      const labels = extractChannelLabelFromLine(line, absHref)
      if (labels.length > 0) {
        entry.channels = labels
        continue
      }

      if (entry.channels.length === 0) {
        const normalized = String(line || '').replace(/\s+/g, ' ').trim()
        const looksLikeChannels = normalized === normalized.toUpperCase() && /[A-Z]/.test(normalized) && normalized.length <= 140
        if (looksLikeChannels) entry.channels = [normalized]
      }
    }
  }

  const matches = []
  for (const entry of byHref.values()) {
    const time = parseClockTime(entry?.time)
    const home = typeof entry?.home === 'string' ? entry.home.trim() : ''
    const away = typeof entry?.away === 'string' ? entry.away.trim() : ''
    const competition = typeof entry?.competition === 'string' ? entry.competition.trim() : ''
    const channels = Array.isArray(entry?.channels) ? entry.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof entry?.homeCrestUrl === 'string' ? entry.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof entry?.awayCrestUrl === 'string' ? entry.awayCrestUrl.trim() : ''
    const href = typeof entry?.href === 'string' ? entry.href.trim() : ''
    if (!time || !home || !away) continue
    matches.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
  }
  const mergedMap = new Map()
  const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
  for (const m of [...matches, ...pipeMatches]) {
    const time = parseClockTime(m?.time)
    const home = typeof m?.home === 'string' ? m.home.trim() : ''
    const away = typeof m?.away === 'string' ? m.away.trim() : ''
    const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
    const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
    const href = typeof m?.href === 'string' ? m.href.trim() : ''
    if (!time || !home || !away) continue
    const key = buildKey({ time, home, away })
    const existing = mergedMap.get(key)
    if (!existing) {
      mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
      continue
    }
    if (!existing.competition && competition) existing.competition = competition
    if (existing.channels.length === 0 && channels.length > 0) {
      existing.channels = channels
    } else if (channels.length > 0) {
      existing.channels = uniqStrings([...existing.channels, ...channels])
    }
    if (!existing.homeCrestUrl && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
    if (!existing.awayCrestUrl && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
    if (!existing.href && href) existing.href = href
  }
  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

const parseOneFootballMarkdownSchedule = ({ markdown }) => {
  const raw = String(markdown || '')
  if (!raw) return []
  const lines = raw.split('\n')
  const out = []
  let currentCompetition = ''

  const extractOneFootballCrestUrl = (rawUrl) => {
    const value = String(rawUrl || '').trim()
    if (!value) return ''
    try {
      const parsed = new URL(value)
      const encoded = parsed.searchParams.get('image')
      if (encoded) {
        let decoded = encoded
        for (let i = 0; i < 3; i++) {
          try {
            const next = decodeURIComponent(decoded)
            if (next === decoded) break
            decoded = next
          } catch {
            break
          }
        }
        if (/^https?:\/\//i.test(decoded)) return decoded
      }
      return parsed.toString()
    } catch {
      return value
    }
  }

  for (const originalLine of lines) {
    const line = String(originalLine || '').trim()
    if (!line) continue

    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      currentCompetition = normalizeFootballCompetitionLabel(heading[1])
      continue
    }

    if (!/^\*\s+/.test(line)) continue
    if (!/\/match\//i.test(line)) continue

    const iconRe = /Icon:\s*([^)\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
    const teams = []
    let m
    while ((m = iconRe.exec(line)) !== null) {
      const name = String(m[1] || '').replace(/\s+/g, ' ').trim()
      const crest = extractOneFootballCrestUrl(m[2])
      if (name) teams.push({ name, crest })
      if (teams.length >= 2) break
    }
    if (teams.length < 2) continue

    const timeMatch = line.match(/\b(\d{1,2}:\d{2})\b/)
    const time = parseClockTime(timeMatch ? timeMatch[1] : '')
    if (!time) continue

    const hrefMatch = line.match(/\]\((https?:\/\/(?:www\.)?onefootball\.com\/[^)\s]*\/match\/\d+[^)\s]*)\)/i)
    const href = hrefMatch ? String(hrefMatch[1]).trim() : ''

    out.push({
      time,
      home: teams[0].name,
      away: teams[1].name,
      competition: currentCompetition,
      channels: [],
      homeCrestUrl: teams[0].crest || '',
      awayCrestUrl: teams[1].crest || '',
      href,
    })
  }

  const mergedMap = new Map()
  for (const m of out) {
    const key = `${m.time}::${normalizeFootballSearchText(m.home)}::${normalizeFootballSearchText(m.away)}`
    if (!mergedMap.has(key)) {
      mergedMap.set(key, m)
      continue
    }
    const existing = mergedMap.get(key)
    if (!existing.competition && m.competition) existing.competition = m.competition
    if (!existing.homeCrestUrl && m.homeCrestUrl) existing.homeCrestUrl = m.homeCrestUrl
    if (!existing.awayCrestUrl && m.awayCrestUrl) existing.awayCrestUrl = m.awayCrestUrl
  }
  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

const isLikelyBlockedHtml = (html) => {
  const raw = String(html || '')
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('cf-browser-verification')) return true
  if (lower.includes('cloudflare')) return true
  if (lower.includes('attention required')) return true
  if (lower.includes('just a moment')) return true
  if (lower.includes('enable javascript')) return true
  if (lower.includes('checking your browser')) return true
  return false
}

const toJinaReaderUrl = (absUrl) => {
  const raw = String(absUrl || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}${u.hash}`
  } catch {
    return `https://r.jina.ai/https://${raw.replace(/^\/+/, '')}`
  }
}

const fetchTextWithHeaders = async (url) => {
  let origin = ''
  try {
    origin = new URL(String(url || '')).origin
  } catch {
    origin = ''
  }
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6',
      ...(origin ? { referer: `${origin}/`, origin } : {}),
    },
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, text }
}

const resolveFootballSourceFetchUrl = ({ sourceUrl, scheduleDateIso, timeZone }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (!host.endsWith('futebolnatv.com.br')) return sourceUrl

    const nowParts = getZonedNowParts({ timeZone: timeZone || DEFAULT_FOOTBALL_TIME_ZONE })
    const today = nowParts.date
    if (scheduleDateIso === today) return 'https://www.futebolnatv.com.br/jogos-hoje/'
    if (scheduleDateIso === addDaysToIsoDate(today, 1)) return 'https://www.futebolnatv.com.br/jogos-amanha/'
    if (scheduleDateIso === addDaysToIsoDate(today, -1)) return 'https://www.futebolnatv.com.br/jogos-ontem/'
    return 'https://www.futebolnatv.com.br/'
  } catch {
    return sourceUrl
  }
}

const resolveOneFootballFetchUrl = ({ sourceUrl, scheduleDateIso }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (!host.endsWith('onefootball.com')) return sourceUrl
    if (!scheduleDateIso) return 'https://onefootball.com/pt-br/jogos'
    return `https://onefootball.com/pt-br/jogos?date=${encodeURIComponent(scheduleDateIso)}`
  } catch {
    return sourceUrl
  }
}

const parseFootballScheduleFromSource = ({ sourceUrl, html, targetDateIso }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (host.endsWith('futebolnatv.com.br')) {
      return parseFutebolNaTvBrSchedule({ html })
    }
  } catch {
  }
  return parseFutebolNaTvSchedule({ html, targetDateIso })
}

const getFootballSettings = async () => {
  const [readTimeValue, readWindowStartValue, readWindowEndValue, timeZoneValue, lastRunValue, excludedChannelsValue, excludedCompetitionsValue] = await Promise.all([
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readTime),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readWindowStart),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readWindowEnd),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.timeZone),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.lastRunDate),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.excludedChannels),
    getAppSettingValue(FOOTBALL_SETTINGS_KEYS.excludedCompetitions),
  ])

  const readTime = parseClockTime(readTimeValue) || DEFAULT_FOOTBALL_READ_TIME
  const readWindowStart = parseClockTime(readWindowStartValue) || DEFAULT_FOOTBALL_READ_WINDOW_START
  const readWindowEnd = parseClockTime(readWindowEndValue) || DEFAULT_FOOTBALL_READ_WINDOW_END
  const timeZoneCandidate = typeof timeZoneValue === 'string' ? timeZoneValue.trim() : ''
  const timeZone = timeZoneCandidate === DEFAULT_FOOTBALL_TIME_ZONE ? timeZoneCandidate : DEFAULT_FOOTBALL_TIME_ZONE
  const lastRunDate = typeof lastRunValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastRunValue.trim()) ? lastRunValue.trim() : null
  const excludedChannels = parseFootballSettingList(excludedChannelsValue, DEFAULT_FOOTBALL_EXCLUDED_CHANNELS)
  const excludedCompetitions = parseFootballSettingList(excludedCompetitionsValue, DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS)
  return { readTime, readWindowStart, readWindowEnd, timeZone, lastRunDate, excludedChannels, excludedCompetitions }
}

const getDefaultFootballScheduleDate = ({ nowDateIso, nowTime, readTime }) => {
  const date = typeof nowDateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowDateIso) ? nowDateIso : ''
  if (!date) return addDaysToIsoDate(getZonedNowParts({ timeZone: DEFAULT_FOOTBALL_TIME_ZONE }).date, 1)
  const currentTime = parseClockTime(nowTime) || ''
  const cutoffTime = parseClockTime(readTime) || DEFAULT_FOOTBALL_READ_TIME
  if (!currentTime) return date
  return currentTime >= cutoffTime ? addDaysToIsoDate(date, 1) : date
}

const toMinutes = (time) => {
  const parsed = parseClockTime(time)
  if (!parsed) return null
  const [hRaw, mRaw] = parsed.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

const getWindowTriggerMinute = ({ dateIso, windowStart, windowEnd }) => {
  const start = toMinutes(windowStart)
  const end = toMinutes(windowEnd)
  if (start === null || end === null) return toMinutes(DEFAULT_FOOTBALL_READ_WINDOW_START)
  const span = end >= start ? (end - start + 1) : (24 * 60 - start + end + 1)
  const safeSpan = Math.max(1, span)
  const seed = String(dateIso || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const offset = seed % safeSpan
  return (start + offset) % (24 * 60)
}

const footballMatchCrestLookupCache = new Map()
const footballMatchCompetitionLookupCache = new Map()

const toAbsFutebolNaTvAssetUrl = (href) => {
  const raw = String(href || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
  return `https://www.futebolnatv.com.br/${raw}`
}

const extractFutebolNaTvTeamCrestsFromHtml = (html) => {
  const raw = String(html || '')
  if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }

  const $ = cheerio.load(raw);
  const urls = [];

  const isTeamCrestUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return false;
    if (s.includes('/assets/img/loadteam.png')) return false;
    // Aceita variações de caminho do provedor (upload/teams, upload/team, teams/<...>)
    return /(\/upload\/teams\/|\/upload\/team\/|\/teams\/)/i.test(s);
  }

  $('img').each((i, elem) => {
    const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-original') || $(elem).attr('data-lazy-src') || $(elem).attr('data-lazy');
    const srcset = $(elem).attr('srcset');

    if (src) urls.push(toAbsFutebolNaTvAssetUrl(src));
    if (srcset) {
      // srcset pode vir como: "url1 1x, url2 2x"
      const first = String(srcset).split(',').map((p) => p.trim())[0];
      const urlOnly = first ? first.split(/\s+/)[0] : '';
      if (urlOnly) urls.push(toAbsFutebolNaTvAssetUrl(urlOnly));
    }
  });

  // Alguns escudos podem aparecer no HTML em blocos/estilos e não necessariamente em img.src.
  // Captura caminhos que contenham "teams" e normaliza.
  const regexTeamUrls = raw.match(/(?:https?:\/\/(?:www\.)?futebolnatv\.com\.br)?\/(?:upload\/)?teams\/[^"'\\s)]+/gi) || [];
  for (const m of regexTeamUrls) {
    urls.push(toAbsFutebolNaTvAssetUrl(m));
  }

  const unique = uniqStrings(urls);
  const teamUrls = unique.filter((u) => isTeamCrestUrl(u));
  return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' };
}

const extractFutebolNaTvTeamCrestsFromMarkdown = (markdown) => {
  const raw = String(markdown || '')
  if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }
  const urls = []
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/gi
  let m

  const isTeamCrestUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return false;
    if (s.includes('/assets/img/loadteam.png')) return false;
    return /(\/upload\/teams\/|\/upload\/team\/|\/teams\/)/i.test(s);
  }

  while ((m = re.exec(raw)) !== null) {
    const abs = toAbsFutebolNaTvAssetUrl(String(m[1] || '').trim())
    if (abs) urls.push(abs)
  }
  const unique = uniqStrings(urls)
  const teamUrls = unique.filter((u) => isTeamCrestUrl(u))
  return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' }
}

const fetchFutebolNaTvMatchCrests = async (absHref) => {
  const href = typeof absHref === 'string' ? absHref.trim() : ''
  if (!href || !isSafeExternalHttpUrl(href)) return { homeCrestUrl: '', awayCrestUrl: '' }
  const cached = footballMatchCrestLookupCache.get(href)
  if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
    return { homeCrestUrl: cached.homeCrestUrl || '', awayCrestUrl: cached.awayCrestUrl || '' }
  }
  let homeCrestUrl = ''
  let awayCrestUrl = ''
  try {
    const primary = await fetchTextWithHeaders(href)
    const extracted = extractFutebolNaTvTeamCrestsFromHtml(primary.text)
    homeCrestUrl = extracted.homeCrestUrl
    awayCrestUrl = extracted.awayCrestUrl
    const shouldTryReader = !homeCrestUrl || !awayCrestUrl || !primary.ok || isLikelyBlockedHtml(primary.text)
    if (shouldTryReader) {
      const reader = await fetchTextWithHeaders(toJinaReaderUrl(href))
      if (reader.ok && reader.text) {
        const fromMd = extractFutebolNaTvTeamCrestsFromMarkdown(reader.text)
        if (!homeCrestUrl && fromMd.homeCrestUrl) homeCrestUrl = fromMd.homeCrestUrl
        if (!awayCrestUrl && fromMd.awayCrestUrl) awayCrestUrl = fromMd.awayCrestUrl
      }
    }
  } catch {
    homeCrestUrl = ''
    awayCrestUrl = ''
  }
  const isEmpty = !String(homeCrestUrl || '').trim() && !String(awayCrestUrl || '').trim()
  footballMatchCrestLookupCache.set(href, {
    homeCrestUrl,
    awayCrestUrl,
    expiresAt: Date.now() + (isEmpty ? 10 * 60_000 : 12 * 60 * 60_000),
  })
  return { homeCrestUrl, awayCrestUrl }
}

const extractFutebolNaTvCompetitionFromMarkdown = (markdown) => {
  const raw = String(markdown || '')
  if (!raw) return ''
  const strong = raw.match(/\*\*([^*]+)\*\s*(?:-\s*rodada[^\n\]]*)?/i)
  if (strong) {
    const normalized = normalizeFootballCompetitionLabel(strong[1])
    if (normalized) return normalized
  }
  const lineMatch = raw.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^\n]{0,120})/i)
  return normalizeFootballCompetitionLabel(lineMatch ? lineMatch[1] : '')
}

const fetchFutebolNaTvMatchCompetition = async (absHref) => {
  const href = typeof absHref === 'string' ? absHref.trim() : ''
  if (!href || !isSafeExternalHttpUrl(href)) return ''
  const cached = footballMatchCompetitionLookupCache.get(href)
  if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
    return String(cached.competition || '').trim()
  }
  let competition = ''
  try {
    const reader = await fetchTextWithHeaders(toJinaReaderUrl(href))
    if (reader.ok && reader.text) {
      competition = extractFutebolNaTvCompetitionFromMarkdown(reader.text)
    }
    if (!competition) {
      const primary = await fetchTextWithHeaders(href)
      if (primary.ok && primary.text) {
        const fromHtml = stripHtml(primary.text).replace(/\s+/g, ' ').trim()
        const m = fromHtml.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^–—\-]{0,120})\s*(?:[-–—]\s*rodada.*)?/i)
        competition = normalizeFootballCompetitionLabel(m ? m[1] : '')
      }
    }
  } catch {
    competition = ''
  }
  const normalized = normalizeFootballCompetitionLabel(competition)
  footballMatchCompetitionLookupCache.set(href, {
    competition: normalized,
    expiresAt: Date.now() + (normalized ? 12 * 60 * 60_000 : 15 * 60_000),
  })
  return normalized
}

const enrichFutebolNaTvMatchesWithCompetition = async (matches) => {
  const list = Array.isArray(matches) ? matches : []
  const targets = list.filter((m) => {
    const href = typeof m?.href === 'string' ? m.href.trim() : ''
    const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
    return href && isSafeExternalHttpUrl(href) && !competition
  })
  if (targets.length === 0) return list
  const queue = [...targets].slice(0, 120)
  const workerCount = Math.max(1, Math.min(8, queue.length))
  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) return
        const href = typeof item?.href === 'string' ? item.href.trim() : ''
        if (!href) continue
        const value = await fetchFutebolNaTvMatchCompetition(href)
        if (value && !item.competition) item.competition = value
      }
    })
  )
  return list
}

const enrichFutebolNaTvMatchesWithCrests = async (matches) => {
  const list = Array.isArray(matches) ? matches : []
  const candidates = list.filter((m) => {
    const href = typeof m?.href === 'string' ? m.href.trim() : ''
    if (!href || !isSafeExternalHttpUrl(href)) return false
    const home = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
    const away = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
    return !home || !away || isPlaceholderFootballTeamCrestUrl(home) || isPlaceholderFootballTeamCrestUrl(away)
  })
  candidates.sort((a, b) => {
    const ah = typeof a?.homeCrestUrl === 'string' ? a.homeCrestUrl.trim() : ''
    const aa = typeof a?.awayCrestUrl === 'string' ? a.awayCrestUrl.trim() : ''
    const bh = typeof b?.homeCrestUrl === 'string' ? b.homeCrestUrl.trim() : ''
    const ba = typeof b?.awayCrestUrl === 'string' ? b.awayCrestUrl.trim() : ''
    const aScore = (!ah || isPlaceholderFootballTeamCrestUrl(ah) ? 1 : 0) + (!aa || isPlaceholderFootballTeamCrestUrl(aa) ? 1 : 0)
    const bScore = (!bh || isPlaceholderFootballTeamCrestUrl(bh) ? 1 : 0) + (!ba || isPlaceholderFootballTeamCrestUrl(ba) ? 1 : 0)
    return bScore - aScore
  })
  const targets = candidates.slice(0, 120)
  if (targets.length === 0) return list

  const queue = [...targets]
  const workerCount = Math.max(1, Math.min(6, queue.length))
  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) return
        const href = typeof item?.href === 'string' ? item.href.trim() : ''
        if (!href) continue
        const currentHome = typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : ''
        const currentAway = typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : ''
        const fetched = await fetchFutebolNaTvMatchCrests(href)
        const nextHome = String(fetched.homeCrestUrl || '').trim()
        const nextAway = String(fetched.awayCrestUrl || '').trim()
        if ((!currentHome || isPlaceholderFootballTeamCrestUrl(currentHome)) && nextHome) item.homeCrestUrl = nextHome
        if ((!currentAway || isPlaceholderFootballTeamCrestUrl(currentAway)) && nextAway) item.awayCrestUrl = nextAway
      }
    })
  )
  return list
}

const footballTeamBadgeLookupCache = new Map()

const normalizeFootballTeamForBadgeSearch = (value) => {
  const base = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|ec|sc|ac|cf|cd|clube de regatas|clube)\b/gi, ' ')
    .replace(/\b(w|women|feminino|fem|sub[-\s]?\d{2})\b/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return base
}

const fetchTeamBadgeByName = async (teamName) => {
  const normalized = normalizeFootballTeamForBadgeSearch(teamName)
  if (!normalized) return ''
  const cached = footballTeamBadgeLookupCache.get(normalized)
  if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
    return String(cached.url || '').trim()
  }

  const tryNames = uniqStrings([
    String(teamName || '').trim(),
    normalized.replace(/\b(feminino|fem)\b/gi, '').trim(),
    normalized.replace(/\bfc\b/gi, '').trim(),
  ]).filter(Boolean)

  let out = ''
  for (const name of tryNames.slice(0, 2)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
        signal: controller.signal,
      })
      if (!res.ok) continue
      const payload = await res.json()
      const teams = Array.isArray(payload?.teams) ? payload.teams : []
      const exact = teams.find((t) => normalizeFootballTeamForBadgeSearch(t?.strTeam) === normalized)
      const candidate = exact || teams[0]
      const badge = String(candidate?.strTeamBadge || '').trim()
      if (badge && isSafeExternalHttpUrl(badge)) {
        out = badge
        break
      }
    } catch {
    } finally {
      clearTimeout(timer)
    }
  }

  footballTeamBadgeLookupCache.set(normalized, {
    url: out,
    expiresAt: Date.now() + (out ? 7 * 24 * 60 * 60_000 : 20 * 60_000),
  })
  return out
}

const enrichFootballMatchesWithTeamNameBadges = async (matches) => {
  const list = Array.isArray(matches) ? matches : []
  if (list.length === 0) return list

  const missingNames = uniqStrings(
    list.flatMap((m) => {
      const out = []
      const home = String(m?.homeCrestUrl || '').trim()
      const away = String(m?.awayCrestUrl || '').trim()
      if (!home || isPlaceholderFootballTeamCrestUrl(home)) out.push(String(m?.home || '').trim())
      if (!away || isPlaceholderFootballTeamCrestUrl(away)) out.push(String(m?.away || '').trim())
      return out
    }).filter(Boolean)
  ).slice(0, 24)

  if (missingNames.length === 0) return list
  const badgeMap = new Map()
  const queue = [...missingNames]
  const workerCount = Math.max(1, Math.min(6, queue.length))
  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (queue.length > 0) {
        const team = queue.shift()
        if (!team) return
        const url = await fetchTeamBadgeByName(team)
        if (url) badgeMap.set(team, url)
      }
    })
  )

  if (badgeMap.size === 0) return list
  for (const m of list) {
    const currentHome = String(m?.homeCrestUrl || '').trim()
    const currentAway = String(m?.awayCrestUrl || '').trim()
    if (!currentHome || isPlaceholderFootballTeamCrestUrl(currentHome)) {
      const nextHome = badgeMap.get(String(m?.home || '').trim())
      if (nextHome) m.homeCrestUrl = nextHome
    }
    if (!currentAway || isPlaceholderFootballTeamCrestUrl(currentAway)) {
      const nextAway = badgeMap.get(String(m?.away || '').trim())
      if (nextAway) m.awayCrestUrl = nextAway
    }
  }
  return list
}

/** Cache URL externa → data URL (evita canvas/CORS no browser: o schedule já traz pixels embutidos). */
const footballCrestDataUrlCache = new Map()

const sniffImageMimeFromBuffer = (buf) => {
  if (!buf || buf.length < 12) return ''
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp'
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  return ''
}

const fetchExternalCrestAsDataUrl = async (rawUrl) => {
  const normalized = normalizeFootballCrestUrl(rawUrl)
  if (!normalized || normalized.startsWith('data:')) return ''
  if (!isSafeExternalHttpUrl(normalized)) return ''
  const hit = footballCrestDataUrlCache.get(normalized)
  if (hit && hit.expiresAt > Date.now()) return String(hit.dataUrl || '')

  try {
    const url = new URL(normalized)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6500)
    let response
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          referer: `${url.origin}/`,
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      })
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 12 * 60_000 })
      return ''
    }
    const buf = Buffer.from(await response.arrayBuffer())
    // Limite alinhado ao proxy /api/football/crest; acima disso o cliente usa a URL remota ou o proxy.
    if (buf.length < 24 || buf.length > 600_000) {
      footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 20 * 60_000 })
      return ''
    }
    const ct = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    let mime = ct.startsWith('image/') ? ct : ''
    if (!mime) mime = sniffImageMimeFromBuffer(buf)
    if (!mime) {
      const headUtf8 = buf.slice(0, Math.min(256, buf.length)).toString('utf8').trimStart()
      if (headUtf8.startsWith('<svg') || headUtf8.startsWith('<?xml') || /<svg[\s>]/i.test(headUtf8)) {
        mime = 'image/svg+xml'
      }
    }
    if (!mime) {
      footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 20 * 60_000 })
      return ''
    }
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
    footballCrestDataUrlCache.set(normalized, { dataUrl, expiresAt: Date.now() + 24 * 60 * 60_000 })
    return dataUrl
  } catch {
    footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 8 * 60_000 })
    return ''
  }
}

/** Substitui homeCrestUrl/awayCrestUrl por data URLs quando o servidor consegue baixar a imagem (definitivo para produção). */
const inlineFootballCrestUrlsAsDataUrls = async (matches, { budgetMs = 26_000 } = {}) => {
  const list = Array.isArray(matches) ? matches : []
  if (list.length === 0) return list

  const seen = new Set()
  const queue = []
  for (const m of list) {
    for (const field of ['homeCrestUrl', 'awayCrestUrl']) {
      const raw = String(m[field] || '').trim()
      if (!raw || raw.startsWith('data:') || isPlaceholderFootballTeamCrestUrl(raw)) continue
      const norm = normalizeFootballCrestUrl(raw)
      if (!norm || !isSafeExternalHttpUrl(norm)) continue
      if (seen.has(norm)) continue
      seen.add(norm)
      queue.push(norm)
    }
  }
  if (queue.length === 0) return list

  const deadline = Date.now() + budgetMs
  const urlToData = new Map()
  const workerCount = Math.min(8, Math.max(1, queue.length))
  const workQueue = [...queue]

  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (Date.now() < deadline && workQueue.length > 0) {
        const u = workQueue.shift()
        if (!u) return
        const dataUrl = await fetchExternalCrestAsDataUrl(u)
        if (dataUrl) urlToData.set(u, dataUrl)
      }
    })
  )

  for (const m of list) {
    for (const field of ['homeCrestUrl', 'awayCrestUrl']) {
      const raw = String(m[field] || '').trim()
      if (!raw || raw.startsWith('data:') || isPlaceholderFootballTeamCrestUrl(raw)) continue
      const norm = normalizeFootballCrestUrl(raw)
      const embedded = urlToData.get(norm)
      if (embedded) {
        if (field === 'homeCrestUrl') {
          if (!m.homeCrestUrlRemote) m.homeCrestUrlRemote = norm
        } else if (!m.awayCrestUrlRemote) {
          m.awayCrestUrlRemote = norm
        }
        m[field] = embedded
      }
    }
  }
  return list
}

const refreshFootballSchedule = async ({ scheduleDateIso, timeZone }) => {
  // const sources = await query(
    //   `
    //   select id, name, url
    //   from football_sources
    //   where is_active = true
    //   order by created_at asc
    //   `
    // );
  const sources = await query(
    `
    select id, name, url
    from football_sources
    where is_active = true
    order by created_at asc
    `
  );
  const results = []

  const looksLikeFutebolNaTvScheduleHtml = (html) => {
    const raw = String(html || '')
    if (!raw) return false
    const lowerRaw = raw.toLowerCase()
    const aovivoCount = (lowerRaw.match(/\/aovivo\//g) || []).length
    if (aovivoCount >= 8) return true
    const text = normalizeFootballSearchText(stripHtml(raw))
    const timeCount = (text.match(/\b\d{1,2}[:h]\d{2}\b/g) || []).length
    if (timeCount >= 10) return true
    if (text.includes('hora') && text.includes('canal')) return true
    return false
  }

  for (const source of sources.rows) {
    const urlRaw = typeof source.url === 'string' ? source.url.trim() : ''
    if (!urlRaw || !isSafeExternalHttpUrl(urlRaw)) continue
    const fetchUrl = resolveOneFootballFetchUrl({
      sourceUrl: resolveFootballSourceFetchUrl({ sourceUrl: urlRaw, scheduleDateIso, timeZone }),
      scheduleDateIso,
    })
    if (!fetchUrl || !isSafeExternalHttpUrl(fetchUrl)) continue
    let isFutebolNaTvBrSource = false
    try {
      const host = (new URL(fetchUrl).hostname || '').toLowerCase()
      isFutebolNaTvBrSource = host.endsWith('futebolnatv.com.br')
    } catch {
      isFutebolNaTvBrSource = false
    }
    let matches = []
    let ok = false
    try {
      const isOneFootballSource = (() => {
        try {
          const host = (new URL(fetchUrl).hostname || '').toLowerCase()
          return host.endsWith('onefootball.com')
        } catch {
          return false
        }
      })()

      if (isFutebolNaTvBrSource) {
        try {
          const readerUrl = toJinaReaderUrl(fetchUrl)
          const reader = await fetchTextWithHeaders(readerUrl)
          if (reader.ok && reader.text) {
            const readerMatches = parseFutebolNaTvBrMarkdownSchedule({ markdown: reader.text })
            if (readerMatches.length > 0) {
              matches = readerMatches
              ok = true
            }
          }
        } catch {
        }
      }

      if (isOneFootballSource) {
        try {
          const readerUrl = toJinaReaderUrl(fetchUrl)
          const reader = await fetchTextWithHeaders(readerUrl)
          if (reader.ok && reader.text) {
            const readerMatches = parseOneFootballMarkdownSchedule({ markdown: reader.text })
            if (readerMatches.length > 0) {
              matches = readerMatches
              ok = true
            }
          }
        } catch {
        }
      }

      const primary = await fetchTextWithHeaders(fetchUrl)
      const primarySearchText = normalizeFootballSearchText(stripHtml(primary.text))
      const primaryParsed = parseFootballScheduleFromSource({ sourceUrl: fetchUrl, html: primary.text, targetDateIso: scheduleDateIso })
      if (matches.length === 0) {
        matches = primaryParsed
      } else if (Array.isArray(primaryParsed) && primaryParsed.length > 0) {
        const mergedMap = new Map()
        const buildKey = (m) => `${m.time}::${normalizeFootballSearchText(m.home)}::${normalizeFootballSearchText(m.away)}`
        for (const m of [...matches, ...primaryParsed]) {
          const time = parseClockTime(m?.time)
          const home = typeof m?.home === 'string' ? m.home.trim() : ''
          const away = typeof m?.away === 'string' ? m.away.trim() : ''
          const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
          const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
          const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
          const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
          const href = typeof m?.href === 'string' ? m.href.trim() : ''
          if (!time || !home || !away) continue
          const key = buildKey({ time, home, away })
          const existing = mergedMap.get(key)
          if (!existing) {
            mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
            continue
          }
          if (!existing.competition && competition) existing.competition = competition
          if (existing.channels.length === 0 && channels.length > 0) {
            existing.channels = channels
          } else if (channels.length > 0) {
            existing.channels = uniqStrings([...existing.channels, ...channels])
          }
          const existingHome = typeof existing.homeCrestUrl === 'string' ? existing.homeCrestUrl.trim() : ''
          const existingAway = typeof existing.awayCrestUrl === 'string' ? existing.awayCrestUrl.trim() : ''
          if ((!existingHome || isPlaceholderFootballTeamCrestUrl(existingHome)) && homeCrestUrl && !isPlaceholderFootballTeamCrestUrl(homeCrestUrl)) {
            existing.homeCrestUrl = homeCrestUrl
          } else if (!existingHome && homeCrestUrl) {
            existing.homeCrestUrl = homeCrestUrl
          }
          if ((!existingAway || isPlaceholderFootballTeamCrestUrl(existingAway)) && awayCrestUrl && !isPlaceholderFootballTeamCrestUrl(awayCrestUrl)) {
            existing.awayCrestUrl = awayCrestUrl
          } else if (!existingAway && awayCrestUrl) {
            existing.awayCrestUrl = awayCrestUrl
          }
          if (!existing.href && href) existing.href = href
        }
        matches = [...mergedMap.values()]
        matches.sort((a, b) => a.time.localeCompare(b.time))
      }
      ok = Boolean(ok) || primary.ok

      const shouldTryReaderToFillGaps = (() => {
        try {
          const url = new URL(fetchUrl)
          const host = (url.hostname || '').toLowerCase()
          if (!host.endsWith('futebolnatv.com.br')) return false
        } catch {
          return false
        }
        return matches.length > 0 && matches.length < 80
      })()

      const shouldTryReader = (() => {
        if (matches.length > 0) return false
        try {
          const url = new URL(fetchUrl)
          const host = (url.hostname || '').toLowerCase()
          if (!host.endsWith('futebolnatv.com.br')) return false
        } catch {
          return false
        }
        if (primary.status >= 400) return true
        if (isLikelyBlockedHtml(primary.text)) return true
        return true
      })()

      if (shouldTryReader || shouldTryReaderToFillGaps) {
        const readerUrl = toJinaReaderUrl(fetchUrl)
        const reader = await fetchTextWithHeaders(readerUrl)
        if (reader.ok && reader.text) {
          const readerMatches = parseFutebolNaTvBrMarkdownSchedule({ markdown: reader.text })
          const canFilterReaderByPrimary =
            Boolean(primary.ok) &&
            Boolean(primary.text) &&
            primarySearchText.length > 400 &&
            !isLikelyBlockedHtml(primary.text) &&
            looksLikeFutebolNaTvScheduleHtml(primary.text)
          const filteredReaderMatches = canFilterReaderByPrimary
            ? readerMatches.filter((m) => {
                const home = typeof m?.home === 'string' ? m.home.trim() : ''
                const away = typeof m?.away === 'string' ? m.away.trim() : ''
                if (!home || !away) return false
                const homeNeedle = normalizeFootballSearchText(home)
                const awayNeedle = normalizeFootballSearchText(away)
                if (!homeNeedle || !awayNeedle) return false
                return primarySearchText.includes(homeNeedle) && primarySearchText.includes(awayNeedle)
              })
            : []
          const effectiveReaderMatches =
            filteredReaderMatches.length >= Math.max(12, Math.min(readerMatches.length, matches.length))
              ? filteredReaderMatches
              : readerMatches
          if (shouldTryReader) {
            matches = effectiveReaderMatches
          } else if (effectiveReaderMatches.length > 0) {
            const mergedMap = new Map()
            const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
            for (const m of [...matches, ...effectiveReaderMatches]) {
              const time = parseClockTime(m?.time)
              const home = typeof m?.home === 'string' ? m.home.trim() : ''
              const away = typeof m?.away === 'string' ? m.away.trim() : ''
              const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
              const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
              const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
              const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
              const href = typeof m?.href === 'string' ? m.href.trim() : ''
              if (!time || !home || !away) continue
              const key = buildKey({ time, home, away })
              const existing = mergedMap.get(key)
              if (!existing) {
                mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
                continue
              }
              if (!existing.competition && competition) existing.competition = competition
              if (existing.channels.length === 0 && channels.length > 0) {
                existing.channels = channels
              } else if (channels.length > 0) {
                existing.channels = uniqStrings([...existing.channels, ...channels])
              }
              if (!existing.homeCrestUrl && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
              if (!existing.awayCrestUrl && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
              if (!existing.href && href) existing.href = href
            }
            matches = [...mergedMap.values()]
            matches.sort((a, b) => a.time.localeCompare(b.time))
          }
          ok = true
        }
      }
    } catch {
      matches = []
      ok = false
    }

    if (isFutebolNaTvBrSource && matches.length > 0) {
      matches = await enrichFutebolNaTvMatchesWithCompetition(matches)
      matches = await enrichFutebolNaTvMatchesWithCrests(matches)
    }

    await query(
      `
      insert into football_schedules (source_id, schedule_date, matches, fetched_at, created_at, updated_at)
      values ($1, $2, $3::jsonb, now(), now(), now())
      on conflict (source_id, schedule_date)
      do update set matches = excluded.matches, fetched_at = now(), updated_at = now()
      `,
      [source.id, scheduleDateIso, JSON.stringify(matches)]
    )

    results.push({ sourceId: source.id, sourceName: source.name, matchesCount: matches.length, ok })
  }
  return { date: scheduleDateIso, results }
}

const footballScheduleAutoRefreshCache = new Map()

const footballScheduleCrestDebugLogCache = new Map()

const shouldRefreshFootballScheduleBecauseTooFew = ({ merged, scheduleDateIso }) => {
  const matchesCount = Array.isArray(merged) ? merged.length : 0
  if (matchesCount >= 24) return false
  const dateKey = typeof scheduleDateIso === 'string' && scheduleDateIso.trim() ? scheduleDateIso.trim() : ''
  if (!dateKey) return true
  const now = Date.now()
  const last = footballScheduleAutoRefreshCache.get(dateKey) || 0
  const minCooldownMs = matchesCount < 18 ? 60_000 : 10 * 60_000
  if (now - last < minCooldownMs) return false
  footballScheduleAutoRefreshCache.set(dateKey, now)
  return true
}

const shouldRefreshFootballScheduleBecauseCrestsMissing = ({ merged, scheduleDateIso }) => {
  const matches = Array.isArray(merged) ? merged : []
  if (matches.length < 8) return false
  const withBoth = matches.filter((m) => {
    const home = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
    const away = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
    if (!home || !away) return false
    if (isPlaceholderFootballTeamCrestUrl(home) || isPlaceholderFootballTeamCrestUrl(away)) return false
    return true
  }).length
  const ratio = withBoth / matches.length
  if (ratio >= 0.6) return false
  const dateKey = typeof scheduleDateIso === 'string' && scheduleDateIso.trim() ? scheduleDateIso.trim() : ''
  if (!dateKey) return true
  const now = Date.now()
  const cacheKey = `${dateKey}:crests`
  const last = footballScheduleAutoRefreshCache.get(cacheKey) || 0
  const minCooldownMs = ratio < 0.2 ? 60_000 : 10 * 60_000
  if (now - last < minCooldownMs) return false
  footballScheduleAutoRefreshCache.set(cacheKey, now)
  return true
}

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
      res.json(normalizeTrendingPayload(cached, mediaType))
      return
    }

    const raw = await fetchSearchProviderJson({
      path: `/trending/${mediaType}/week`,
      params: { language },
      apiKeys,
    })
    const payload = normalizeTrendingPayload(raw, mediaType)
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
  const asBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase()
      if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
      if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
    }
    return fallback
  }
  const startedAt = Date.now()
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let responseFinished = false
  console.log('[video-branding] request:start', { requestId, userId: req.auth?.userId || null })
  res.on('finish', () => {
    responseFinished = true
    console.log('[video-branding] request:finish', {
      requestId,
      statusCode: res.statusCode,
      elapsedMs: Date.now() - startedAt,
      writableEnded: res.writableEnded,
    })
  })
  res.on('close', () => {
    console.log('[video-branding] request:close', {
      requestId,
      statusCode: res.statusCode,
      elapsedMs: Date.now() - startedAt,
      finished: responseFinished,
      writableEnded: res.writableEnded,
      destroyed: res.destroyed,
    })
  })
  req.on('aborted', () => {
    console.warn('[video-branding] request:aborted', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      finished: responseFinished,
    })
  })

  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const id = Number(req.body?.id)
  const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
  const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
  let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const layoutRaw = typeof req.body?.layout === 'string' ? req.body.layout.trim() : ''
  const layout = layoutRaw === 'feed' ? 'feed' : 'portrait'
  const includeLogo = asBool(req.body?.includeLogo, true)
  const includeSynopsis = true
  const includeCta = asBool(req.body?.includeCta, true)
  const includePhone = asBool(req.body?.includePhone, false)
  const includeWebsite = asBool(req.body?.includeWebsite, false)
  const forceDownload = asBool(req.body?.download, false)
  const ctaText = typeof req.body?.ctaText === 'string' ? req.body.ctaText.replace(/\r/g, '').trim().slice(0, 40) : ''
  const synopsisTheme = typeof req.body?.synopsisTheme === 'string' ? req.body.synopsisTheme.trim().slice(0, 60) : ''
  const limitDuration = asBool(req.body?.limitDuration, false)
  let preview = asBool(req.body?.preview, false)
  const voteAverageRaw = Number(req.body?.voteAverage)
  const requestVoteAverage = Number.isFinite(voteAverageRaw) && voteAverageRaw > 0 ? voteAverageRaw : 0
  const previewSecondsRaw = Number(req.body?.previewSeconds)
  let previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.round(previewSecondsRaw), 30) : 0
  if (previewSeconds > 0) preview = true
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

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Dados inválidos.' })
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
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      trailerUrl = await resolveTrailerUrlFromProvider({ mediaType, id, userKey: req.auth.userKey })
    }
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    return
  }
  if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
    res.status(404).json({ message: 'Trailer não encontrado para este conteúdo.' })
    return
  }

  if (!isCanvasRuntimeHealthy) {
    if (!hasWarnedCanvasRuntimeUnhealthy) {
      hasWarnedCanvasRuntimeUnhealthy = true
      console.warn(
        '[video-branding] ICU do canvas não encontrado; continuando execução com fallback.'
      )
    }
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

  cleanupStaleTempFiles()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-vb-'))
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (tmpDir) safeRm(tmpDir)
  }
  res.on('finish', cleanup)
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

    let trailerFile = path.join(tmpDir, 'trailer.mp4')
    let trailerAcquireErrorText = ''
    const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
    const bundledYtdlpCommand = resolveBundledYtdlpCommand()

    /** ytdl-core quebra com frequência com mudanças do YouTube; nesta rota usamos só yt-dlp (mais estável). */
    const useYtdlCoreBranding = process.env.MEDIAHUB_VIDEO_BRANDING_USE_YTDL === '1'
    const ytdl = useYtdlCoreBranding ? resolveYtdl() : null
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
        trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(e?.message || '')}`
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
          trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(ee?.message || '')}\n${String(ee?.stderr || '')}`
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
            trailerAcquireErrorText = `${trailerAcquireErrorText}\n${downloadResult.stderr || ''}`
            console.error('video-branding: bundled yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
          }
        } catch (e) {
          trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(e?.message || '')}`
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
        if (bundledYtdlpCommand) {
          cleanupStaleTempFiles()
          const retryResult = await runProcess({
            command: bundledYtdlpCommand,
            args: [
              '--no-progress',
              '--no-playlist',
              '--retries',
              '1',
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
          if (retryResult.code === 0) {
            const files = fs
              .readdirSync(tmpDir)
              .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
            if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
          } else {
            trailerAcquireErrorText = `${trailerAcquireErrorText}\n${retryResult.stderr || ''}`
          }
        }
      }
      if (!fs.existsSync(trailerFile) && !command) {
        const lower = trailerAcquireErrorText.toLowerCase()
        const looksLikeNoSpace =
          lower.includes('failed to extract') || lower.includes('no space') || lower.includes('nospc') || lower.includes('decompression')
        if (looksLikeNoSpace) {
          res.status(503).json({ message: 'Servidor sem espaço temporário para gerar com trailer. Tente novamente em instantes.' })
          return
        }
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

    let trailerMaxEndSeconds = null
    if (typeof maxDurationSeconds === 'number' && maxDurationSeconds > 0) {
      trailerMaxEndSeconds =
        typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 0
          ? Math.min(trailerMaxEndSeconds, maxDurationSeconds)
          : maxDurationSeconds
    }

    if (!isCanvasRuntimeHealthy) {
      console.warn('[video-branding] canvas indisponível: usando fallback de branding via ffmpeg.')
      // Em alguns navegadores a conexão longa é encerrada se os headers demorarem.
      // Enviamos headers cedo para manter o socket vivo durante o transcode.
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Accel-Buffering', 'no')
      if (forceDownload) res.setHeader('Content-Disposition', 'attachment; filename="video_branding_trailer.mp4"')
      res.status(200)
      if (typeof res.flushHeaders === 'function') {
        try { res.flushHeaders() } catch { void 0 }
      }
      const outFileDegraded = path.join(tmpDir, 'out-degraded.mp4')
      const outputLimitSeconds = preview && previewSeconds > 0
        ? previewSeconds
        : typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1
          ? trailerMaxEndSeconds
          : 0
      const fallbackBrandName = String(brandName || 'MediaHub').trim() || 'MediaHub'
      const fallbackCta = includeCta ? String(ctaText || 'Dica de Conteúdo').trim() || 'Dica de Conteúdo' : ''
      const fallbackFooter = includePhone
        ? formatPhoneForDisplay(phone)
        : includeWebsite
          ? String(website || '').trim()
          : ''
      const colorRaw = String(brandColors?.primary || '#7c3aed').trim()
      const normalizedColor = /^#?[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw.replace('#', '')}` : '#7c3aed'
      const secondaryRaw = String(brandColors?.secondary || '#2563eb').trim()
      const normalizedSecondary = /^#?[0-9a-fA-F]{6}$/.test(secondaryRaw) ? `#${secondaryRaw.replace('#', '')}` : '#2563eb'
      const escapedName = escapeFfmpegText(fallbackBrandName)
      const escapedCta = escapeFfmpegText(fallbackCta)
      const escapedFooter = escapeFfmpegText(fallbackFooter)
      const fallbackFontFile = resolveFfmpegDrawtextFont()
      const fontPrefix = fallbackFontFile
        ? `fontfile='${escapeFfmpegPath(fallbackFontFile)}':`
        : ''

      const targetW = 1080
      const targetH = layout === 'feed' ? 1350 : 1920
      const headerH = layout === 'feed' ? 180 : 220
      const trailerH = layout === 'feed' ? 520 : 608
      const trailerY = headerH
      const infoY = trailerY + trailerH
      const infoH = Math.max(180, targetH - infoY)

      const buildDegradedArgs = (mode = 'full') => {
        const args = ['-y', '-i', trailerFile]
        const parts = [
          `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=28:2[bg]`,
          `[0:v]scale=${targetW}:${trailerH}:force_original_aspect_ratio=increase,crop=${targetW}:${trailerH}[main]`,
          `[bg][main]overlay=0:${trailerY}[v0]`,
          `[v0]drawbox=x=0:y=0:w=${targetW}:h=${headerH}:color=black@0.42:t=fill[v1]`,
          `[v1]drawbox=x=0:y=${infoY}:w=${targetW}:h=${infoH}:color=black@0.52:t=fill[v2]`,
        ]

        if (mode === 'full') {
          // Topbar (estilo story): CTA forte + barra de marca.
          parts.push(`[v2]drawbox=x=0:y=${headerH - 12}:w=${targetW}:h=12:color=${normalizedColor}:t=fill[v3]`)
          parts.push(`[v3]drawtext=${fontPrefix}expansion=none:text='${escapedName}':x=120:y=${Math.max(56, Math.round(headerH * 0.52))}:fontsize=72:fontcolor=white:shadowx=2:shadowy=2[v4]`)
          parts.push(`[v4]drawtext=${fontPrefix}expansion=none:text='▶':x=52:y=${Math.max(56, Math.round(headerH * 0.52))}:fontsize=42:fontcolor=white:shadowx=1:shadowy=1[v5]`)
          if (escapedCta) {
            parts.push(`[v5]drawbox=x=36:y=${targetH - 132}:w=${targetW - 72}:h=68:color=${normalizedSecondary}@0.38:t=fill[v6]`)
            parts.push(`[v6]drawtext=${fontPrefix}expansion=none:text='${escapedCta}':x=56:y=${targetH - 86}:fontsize=34:fontcolor=white:shadowx=2:shadowy=2[v7]`)
            if (escapedFooter) {
              parts.push(`[v7]drawtext=${fontPrefix}expansion=none:text='${escapedFooter}':x=56:y=${targetH - 36}:fontsize=32:fontcolor=white:shadowx=2:shadowy=2[vout]`)
            } else {
              parts.push(`[v7]null[vout]`)
            }
          } else if (escapedFooter) {
            parts.push(`[v5]drawtext=${fontPrefix}expansion=none:text='${escapedFooter}':x=56:y=${targetH - 36}:fontsize=32:fontcolor=white:shadowx=2:shadowy=2[vout]`)
          } else {
            parts.push(`[v5]null[vout]`)
          }
        } else if (mode === 'minimal') {
          parts.push(`[v2]drawbox=x=0:y=${headerH - 10}:w=${targetW}:h=10:color=${normalizedColor}:t=fill[v3]`)
          parts.push(`[v3]drawbox=x=0:y=0:w=${targetW}:h=8:color=${normalizedSecondary}:t=fill[vout]`)
        } else {
          parts.push(`[v2]null[vout]`)
        }

        args.push('-filter_complex', parts.join(';'))
        args.push('-map', '[vout]')
        args.push('-map', '0:a?')
        if (outputLimitSeconds > 0) args.push('-t', String(outputLimitSeconds))
        args.push('-c:v', 'libx264')
        args.push('-preset', 'veryfast')
        args.push('-crf', preview ? '24' : '24')
        args.push('-c:a', 'aac')
        args.push('-b:a', '128k')
        args.push('-movflags', '+faststart')
        args.push(outFileDegraded)
        return args
      }

      let degradedResult = await runProcess({
        command: ffmpegCommand,
        args: buildDegradedArgs('full'),
        cwd: tmpDir,
        timeoutMs: preview ? 90_000 : 900_000,
      })
      let degradedModeApplied = 'full'
      if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
        console.warn('video-branding: fallback com overlay falhou; tentando fallback minimo.', {
          code: degradedResult.code,
          stderr: degradedResult.stderr.slice(0, 3000),
        })
        degradedResult = await runProcess({
          command: ffmpegCommand,
          args: buildDegradedArgs('minimal'),
          cwd: tmpDir,
          timeoutMs: preview ? 90_000 : 900_000,
        })
        degradedModeApplied = 'minimal'
      }
      if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
        console.warn('video-branding: fallback minimo falhou; tentando sem overlay.', {
          code: degradedResult.code,
          stderr: degradedResult.stderr.slice(0, 1000),
        })
        degradedResult = await runProcess({
          command: ffmpegCommand,
          args: buildDegradedArgs('none'),
          cwd: tmpDir,
          timeoutMs: preview ? 90_000 : 900_000,
        })
        degradedModeApplied = 'none'
      }
      if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
        console.error('video-branding: ffmpeg degraded failed', {
          code: degradedResult.code,
          stderr: degradedResult.stderr.slice(0, 4000),
        })
        // Última barreira: entrega trailer cru para evitar quebra total da funcionalidade.
        if (fs.existsSync(trailerFile)) {
          fs.createReadStream(trailerFile).pipe(res)
          return
        }
        try { res.destroy() } catch { void 0 }
        return
      }
      console.log('video-branding: fallback gerado', { mode: degradedModeApplied })
      const degradedStream = fs.createReadStream(outFileDegraded)
      degradedStream.on('error', (err) => {
        console.error('video-branding: degraded stream error', { message: String(err?.message || '') })
        try {
          if (!res.headersSent) res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
          else res.destroy()
        } catch {
          void 0
        } finally {
          cleanup()
        }
      })
      res.on('close', () => {
        try {
          degradedStream.destroy()
        } catch {
          void 0
        }
      })
      degradedStream.pipe(res)
      return
    }

    let posterFile = ''
    let synopsisText = ''
    let titleText = ''
    let yearText = ''
    let runtimeText = ''
    let genresText = ''
    let seasonsText = ''
    let ratingValue = requestVoteAverage

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
             const seasonCount = Number(payload.number_of_seasons)
             seasonsText = mediaType === 'tv' && Number.isFinite(seasonCount) && seasonCount > 0
               ? `${Math.round(seasonCount)} ${Math.round(seasonCount) === 1 ? 'TEMPORADA' : 'TEMPORADAS'}`
               : ''
             genresText = payload.genres?.map(g => g.name).slice(0, 2).join(', ') || ''
             if (typeof payload.vote_average === 'number' && Number.isFinite(payload.vote_average) && payload.vote_average > 0) {
               ratingValue = payload.vote_average
             }

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

    const { fontFile, fontBoldFile } = await resolveVideoBrandingFonts(tmpDir)
    if (!fontFile && !fontBoldFile) {
      console.warn('video-branding: nenhuma fonte TTF encontrada; Canvas usa fallback do sistema')
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
    const cleanFontFile = fontFile ? fontFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep) : ''
    const cleanFontBoldFile = fontBoldFile ? fontBoldFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep) : ''

    try {
      if (cleanFontFile) GlobalFonts.registerFromPath(cleanFontFile, fontName)
      if (cleanFontBoldFile) GlobalFonts.registerFromPath(cleanFontBoldFile, fontBoldName)
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
      const headerCtaScale = hasHeaderCta ? 0.78 : 1
      const headerUiScale = headerScale * headerCtaScale
      const padX = Math.max(28, Math.round(64 * headerUiScale))
      const iconBox = Math.max(48, Math.round(84 * headerUiScale))
      const gap = Math.max(10, Math.round(18 * headerUiScale))
      const iconX = padX
      const iconY = Math.round((headerH - iconBox) / 2)
      const textX = iconX + iconBox + gap
      const headerLogoW = Math.max(146, Math.round(targetW * (165 / 1080)))
      const reservedRight = logoIndex >= 0 ? 26 + headerLogoW + Math.round(30 * headerUiScale) : padX
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
        hctx.textBaseline = 'middle'
        hctx.shadowColor = 'rgba(0,0,0,0.70)'
        hctx.shadowBlur = 12
        hctx.shadowOffsetY = 6

        hctx.fillStyle = '#ffffff'
        hctx.font = `800 ${titleFontSize}px ${canvasFontBold}`
        for (let i = 0; i < titleLines.length; i++) {
          hctx.fillText(titleLines[i], textX, startY + i * titleLineHeight + Math.round(titleLineHeight / 2))
        }

        if (headerPhone) {
          hctx.fillStyle = 'rgba(255,255,255,0.92)'
          hctx.font = `800 ${phoneFontSize}px ${canvasFontBold}`
          hctx.fillText(headerPhone, textX, startY + titleLines.length * titleLineHeight + 16 + Math.round(phoneFontSize / 2))
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
    infoOverlay.addColorStop(0, 'rgba(2,6,23,0.32)')
    infoOverlay.addColorStop(0.55, 'rgba(2,6,23,0.40)')
    infoOverlay.addColorStop(1, 'rgba(2,6,23,0.55)')
    ctx.fillStyle = infoOverlay
    ctx.fillRect(0, 0, targetW, infoH)
    if (videoThemeConfig.headerColorWash) {
      ctx.fillStyle = videoThemeConfig.headerColorWash
      ctx.fillRect(0, 0, targetW, infoH)
    }
    const lowerThemeShadow = ctx.createRadialGradient(
      Math.round(targetW * 0.5),
      Math.round(infoH * 0.72),
      Math.round(targetW * 0.1),
      Math.round(targetW * 0.5),
      Math.round(infoH * 0.72),
      Math.round(targetW * 0.7)
    )
    lowerThemeShadow.addColorStop(0, rgbaFromHex(themePrimary, 0.22))
    lowerThemeShadow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = lowerThemeShadow
    ctx.fillRect(0, 0, targetW, infoH)
    
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
    const tagsText = [typeText, genresList, yearText, seasonsText].filter(Boolean).join(' • ')

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

    const synBaseY = tagsY + tagsH
    const synBaseBottomY = ratingPillBottomY ? Math.max(synBaseY, ratingPillBottomY) : synBaseY
    const synBoxX = padX
    const synBoxW = targetW - padX * 2
    const synMinY = synBaseBottomY + synTopGap
    const synAfterPosterY = canShowPosterCard ? posterY + posterH + 22 : synMinY
    const synBoxY = Math.max(synMinY, synAfterPosterY)
    const synAvailableH = btnY - synBoxY - gap
    const synBoxH = Math.max(60, Math.min(synAvailableH, Math.round(infoH * (isCompactInfo ? 0.56 : 0.62))))

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

    const minSynFont = layout === 'feed' ? 7 : 7
    const maxSynFont = isCompactInfo ? 22 : 26
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
      const lh = Math.max(fs + 3, Math.round(fs * 1.28))
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
      ctx.font = `500 ${minSynFont}px ${canvasFontRegular}`
      synTextFontSize = minSynFont
      synTextLineHeight = Math.max(minSynFont + 2, Math.round(minSynFont * 1.22))
      synCols = synMaxCols
      synColW = synCols === 1 ? synTextW : Math.floor((synTextW - synColGap * (synCols - 1)) / synCols)
      synTextLines = wrapLinesFull(ctx, synopsisText, synColW)
      synMaxLinesPerCol = Math.max(1, Math.floor(synTextH / synTextLineHeight))
    }

    ctx.fillStyle = 'rgba(248,250,252,0.95)'
    ctx.font = `500 ${synTextFontSize}px ${canvasFontRegular}`
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
        let fontSize = footerKind === 'phone' ? 34 : 30
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
        const midY = Math.round(footerY + footerH / 2) - (footerKind === 'phone' ? Math.round(targetH * 0.008) : 0)

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
              const iconY = Math.round(footerY + (footerH - m.iconSize) / 2) - Math.round(targetH * 0.008)
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
    const renderResult = await runProcess({ command: ffmpegCommand, args, cwd: tmpDir, timeoutMs: preview ? 90_000 : 900_000 })
    if (renderResult.code !== 0 || !fs.existsSync(outFile)) {
      console.error('video-branding: ffmpeg failed', { code: renderResult.code, stderr: renderResult.stderr.slice(0, 5000) })
      res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
      return
    }

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Cache-Control', 'no-store')
    if (forceDownload) res.setHeader('Content-Disposition', 'attachment; filename="video_branding_trailer.mp4"')
    try {
      const stats = fs.statSync(outFile)
      if (Number.isFinite(stats.size) && stats.size > 0) res.setHeader('Content-Length', String(stats.size))
    } catch {
      void 0
    }
    res.status(200)
    const stream = fs.createReadStream(outFile)
    stream.on('error', (err) => {
      console.error('video-branding: stream error', { message: String(err?.message || '') })
      try {
        if (!res.headersSent) res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
        else res.destroy()
      } catch {
        void 0
      } finally {
        cleanup()
      }
    })
    res.on('close', () => {
      try {
        stream.destroy()
      } catch {
        void 0
      }
    })
    stream.pipe(res)
  } catch (e) {
    console.error('video-branding: unexpected error', { message: String(e?.message || '') })
    try {
      if (!res.headersSent) {
        res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
      } else {
        res.destroy()
      }
    } catch {
      void 0
    }
  }
})

app.post('/api/trailer/download', requireAuth, async (req, res) => {
  const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
  const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
  let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const idRaw = req.body?.id
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
  const previewSecondsRaw = Number(req.body?.previewSeconds)
  const previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.max(Math.round(previewSecondsRaw), 6), 30) : 0

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Conteúdo inválido.' })
    return
  }

  let tmpDir = ''
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (tmpDir) safeRm(tmpDir)
  }
  res.on('finish', cleanup)
  res.on('close', cleanup)

  try {
    const userContext = await readOptionalAuthUserContext(req)
    const userType = userContext.userType
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      trailerUrl = await resolveTrailerUrlFromProvider({ mediaType, id, userKey: userContext.userKey })
    }
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      res.status(404).json({ message: 'Trailer não encontrado para este conteúdo.' })
      return
    }

    cleanupStaleTempFiles()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-trailer-'))

    let trailerFile = path.join(tmpDir, 'trailer.mp4')
    const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
    const bundledYtdlpCommand = resolveBundledYtdlpCommand()
    const findDownloadedTrailerFile = () => {
      const files = fs
        .readdirSync(tmpDir)
        .filter((name) => name.toLowerCase().startsWith('trailer.'))
      if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      return fs.existsSync(trailerFile)
    }
    let ffmpegCommand = resolveFfmpegCommand()
    if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
      ffmpegCommand = 'ffmpeg'
    }
    const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])
    const canUseDownloadSections = previewSeconds > 0 && ffmpegOk

    const ytdlpFormat = previewSeconds > 0 ? 'best[ext=mp4][height<=480]/best[height<=480]' : 'best[ext=mp4]/best'
    const acquireErrors = []

    const buildYtdlpArgList = (withJsRuntime) => {
      const parts = []
      if (withJsRuntime) {
        parts.push('--js-runtimes', 'node')
      }
      parts.push(
        '--no-playlist',
        '--extractor-retries',
        '2',
        '--retries',
        '2',
        '--fragment-retries',
        '2',
        '--socket-timeout',
        '30',
        '-f',
        ytdlpFormat,
        '-o',
        trailerTemplate,
        trailerUrl
      )
      if (canUseDownloadSections) {
        parts.splice(parts.length - 3, 0, '--download-sections', `*0-${previewSeconds}`)
      }
      return parts
    }

    const ytdlpCommandVariants = []
    ytdlpCommandVariants.push({ command: 'py', baseArgs: ['-m', 'yt_dlp'] })
    ytdlpCommandVariants.push({ command: 'python', baseArgs: ['-m', 'yt_dlp'] })
    if (bundledYtdlpCommand) ytdlpCommandVariants.push({ command: bundledYtdlpCommand, baseArgs: [] })
    ytdlpCommandVariants.push({ command: 'yt-dlp', baseArgs: [] })

    const attemptYtdlpDownload = async (command, baseArgs, ytdlpArgList) => {
      const cookieSources = [null, 'edge', 'chrome', 'firefox']
      for (const cookieSource of cookieSources) {
        const args = cookieSource
          ? [...baseArgs, '--cookies-from-browser', cookieSource, ...ytdlpArgList]
          : [...baseArgs, ...ytdlpArgList]
        try {
          const downloadResult = await runProcess({
            command,
            args,
            cwd: tmpDir,
            timeoutMs: 420_000,
          })
          if (downloadResult.code === 0) {
            if (findDownloadedTrailerFile()) return true
            continue
          }
          acquireErrors.push(String(downloadResult.stderr || `${command} failed (${cookieSource || 'no-cookies'})`))
        } catch (e) {
          acquireErrors.push(String(e?.message || `${command} spawn failed (${cookieSource || 'no-cookies'})`))
        }
      }
      return false
    }

    const runAllYtdlpStrategies = async () => {
      for (const withJs of [true, false]) {
        if (findDownloadedTrailerFile()) return
        const ytdlpArgList = buildYtdlpArgList(withJs)
        for (const variant of ytdlpCommandVariants) {
          if (findDownloadedTrailerFile()) return
          const ok = await attemptYtdlpDownload(variant.command, variant.baseArgs, ytdlpArgList)
          if (!ok) {
            console.error('trailer-download: yt-dlp variant failed', { command: variant.command, withJsRuntime: withJs })
          }
        }
      }
    }

    // ytdl-core removido nesta rota (instável com mudanças do YouTube); yt-dlp é o caminho padrão.

    if (!findDownloadedTrailerFile() && isYouTubeTrailerUrl(trailerUrl)) {
      const ytdlpExec = resolveYtdlpExec()
      if (ytdlpExec) {
        try {
          await ytdlpExec(trailerUrl, {
            output: trailerTemplate,
            format: previewSeconds > 0 ? ytdlpFormat : 'bv*+ba/b',
            mergeOutputFormat: 'mp4',
            ffmpegLocation: ffmpegCommand,
            retries: 2,
          })
        } catch (ee) {
          acquireErrors.push(String(ee?.message || 'youtube-dl-exec failed'))
          console.error('trailer-download: youtube-dl-exec failed', {
            message: String(ee?.message || ''),
            stderr: String(ee?.stderr || ''),
          })
        }
      }
    }

    if (!findDownloadedTrailerFile()) {
      await runAllYtdlpStrategies()
    }

    if (!findDownloadedTrailerFile() && bundledYtdlpCommand) {
      cleanupStaleTempFiles()
      for (const withJs of [true, false]) {
        if (findDownloadedTrailerFile()) break
        const ytdlpArgList = buildYtdlpArgList(withJs)
        await attemptYtdlpDownload(bundledYtdlpCommand, [], ytdlpArgList)
      }
      findDownloadedTrailerFile()
    }

    if (!findDownloadedTrailerFile()) {
      if (userType === 'admin' || process.env.NODE_ENV !== 'production') {
        console.error('trailer-download: acquisition failed', { errors: acquireErrors.slice(0, 8) })
      }
      res.status(503).json({
        message: 'Não foi possível baixar o trailer agora. Tente novamente em instantes.',
        hint:
          'No computador onde a API roda, instale o yt-dlp no PATH (ex.: winget install yt-dlp ou pip install yt-dlp) e confira se o ffmpeg está disponível. Em desenvolvimento, veja o terminal da API para o erro detalhado.',
      })
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
    const extRaw = path.extname(trailerFile || '').toLowerCase()
    const ext = extRaw && extRaw.startsWith('.') ? extRaw.slice(1) : (extRaw || '')
    const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'mp4'
    const contentType =
      safeExt === 'mp4'
        ? 'video/mp4'
        : safeExt === 'webm'
          ? 'video/webm'
          : 'application/octet-stream'
    const downloadName = `${safeFileBaseName(titleText || 'trailer')}_trailer.${safeExt}`

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
    try {
      const stats = fs.statSync(trailerFile)
      if (Number.isFinite(stats.size) && stats.size > 0) res.setHeader('Content-Length', String(stats.size))
    } catch {
      void 0
    }
    res.status(200)
    const stream = fs.createReadStream(trailerFile)
    stream.on('error', (err) => {
      console.error('trailer-download: stream error', { message: String(err?.message || '') })
      try {
        if (!res.headersSent) res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
        else res.destroy()
      } catch {
        void 0
      } finally {
        cleanup()
      }
    })
    res.on('close', () => {
      try {
        stream.destroy()
      } catch {
        void 0
      }
    })
    stream.pipe(res)
  } catch (e) {
    console.error('trailer-download: unexpected error', { message: String(e?.message || '') })
    if (!res.headersSent) res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
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
    await ensureSearchHistorySchema()
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
    const topQueriesAllPromise = query(
      `
      select query, count(*)::int as value
      from app_search_history
      group by query
      order by value desc
      limit 10
      `
    )

    const [usersTotal, usersActive, usersByType, premiumExpiringSoon, premiumExpired, searchesTotal, searches24h, topQueries7d, topQueriesAll] = await Promise.all([
      usersTotalPromise,
      usersActivePromise,
      usersByTypePromise,
      premiumExpiringSoonPromise,
      premiumExpiredPromise,
      searchesTotalPromise,
      searches24hPromise,
      topQueries7dPromise,
      topQueriesAllPromise,
    ])
    const topRows = topQueries7d.rows.length > 0 ? topQueries7d.rows : topQueriesAll.rows

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
        topQueries7d: topRows.map((row) => ({ query: row.query, count: row.value })),
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
  const ticketsEnabled = await getTicketsEnabled()
  res.json({ allowRegistrations, ticketsEnabled })
})

app.put('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  const allowRegistrations = typeof req.body?.allowRegistrations === 'boolean' ? req.body.allowRegistrations : null
  const ticketsEnabled = typeof req.body?.ticketsEnabled === 'boolean' ? req.body.ticketsEnabled : null
  if (allowRegistrations === null && ticketsEnabled === null) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  try {
    if (allowRegistrations !== null) {
      await query(
        `
        insert into app_settings (key, value, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
        `,
        ['allow_registrations', allowRegistrations ? 'true' : 'false']
      )
    }
    if (ticketsEnabled !== null) {
      await setAppSettingValue({ key: 'tickets_enabled', value: ticketsEnabled ? 'true' : 'false' })
    }
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get('/api/admin/football/settings', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const settings = await getFootballSettings()
    const sources = await query(
      `
      select id, name, url, is_active, created_at, updated_at
      from football_sources
      order by created_at asc
      `
    )
    res.json({
      settings,
      sources: sources.rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.put('/api/admin/football/settings', requireAuth, requireAdmin, async (req, res) => {
  const readTimeRaw = typeof req.body?.readTime === 'string' ? req.body.readTime.trim() : ''
  const readWindowStartRaw = typeof req.body?.readWindowStart === 'string' ? req.body.readWindowStart.trim() : ''
  const readWindowEndRaw = typeof req.body?.readWindowEnd === 'string' ? req.body.readWindowEnd.trim() : ''
  const timeZoneRaw = typeof req.body?.timeZone === 'string' ? req.body.timeZone.trim() : ''
  const readTime = parseClockTime(readTimeRaw)
  const readWindowStart = parseClockTime(readWindowStartRaw)
  const readWindowEnd = parseClockTime(readWindowEndRaw)
  const timeZone = timeZoneRaw || null
  const excludedChannelsInput = Array.isArray(req.body?.excludedChannels)
    ? req.body.excludedChannels
    : typeof req.body?.excludedChannels === 'string'
      ? req.body.excludedChannels.split(/\r?\n|[,;]+/g)
      : []
  const excludedCompetitionsInput = Array.isArray(req.body?.excludedCompetitions)
    ? req.body.excludedCompetitions
    : typeof req.body?.excludedCompetitions === 'string'
      ? req.body.excludedCompetitions.split(/\r?\n|[,;]+/g)
      : []
  const excludedChannels = [...new Set(excludedChannelsInput.map((v) => normalizeFootballFilterToken(v)).filter(Boolean))]
  const excludedCompetitions = [...new Set(excludedCompetitionsInput.map((v) => normalizeFootballFilterToken(v)).filter(Boolean))]

  if (!readTime && !readWindowStart && !readWindowEnd && !timeZone && excludedChannels.length === 0 && excludedCompetitions.length === 0) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }

  try {
    const effectiveReadTime = readTime || readWindowEnd || DEFAULT_FOOTBALL_READ_TIME
    await setAppSettingValue({ key: FOOTBALL_SETTINGS_KEYS.readTime, value: effectiveReadTime })
    await setAppSettingValue({
      key: FOOTBALL_SETTINGS_KEYS.readWindowStart,
      value: readWindowStart || DEFAULT_FOOTBALL_READ_WINDOW_START,
    })
    await setAppSettingValue({
      key: FOOTBALL_SETTINGS_KEYS.readWindowEnd,
      value: readWindowEnd || DEFAULT_FOOTBALL_READ_WINDOW_END,
    })
    if (timeZone) {
      await setAppSettingValue({ key: FOOTBALL_SETTINGS_KEYS.timeZone, value: timeZone })
    }
    await setAppSettingValue({
      key: FOOTBALL_SETTINGS_KEYS.excludedChannels,
      value: JSON.stringify(excludedChannels.length ? excludedChannels : DEFAULT_FOOTBALL_EXCLUDED_CHANNELS),
    })
    await setAppSettingValue({
      key: FOOTBALL_SETTINGS_KEYS.excludedCompetitions,
      value: JSON.stringify(excludedCompetitions.length ? excludedCompetitions : DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS),
    })
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/admin/football/sources', requireAuth, requireAdmin, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
  const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : ''
  if (!name || !url || !isSafeExternalHttpUrl(url)) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }
  try {
    const created = await query(
      `
      insert into football_sources (name, url, is_active, created_at, updated_at)
      values ($1, $2, true, now(), now())
      returning id, name, url, is_active, created_at, updated_at
      `,
      [name, url]
    )
    const row = created.rows[0]
    res.status(201).json({
      source: {
        id: row.id,
        name: row.name,
        url: row.url,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.put('/api/admin/football/sources/:id', requireAuth, requireAdmin, async (req, res) => {
  const sourceId = String(req.params?.id || '').trim()
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
  const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : ''
  if (!sourceId || !name || !url || !isSafeExternalHttpUrl(url)) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }
  try {
    const updated = await query(
      `
      update football_sources
      set name = $1, url = $2, updated_at = now()
      where id = $3
      returning id, name, url, is_active, created_at, updated_at
      `,
      [name, url, sourceId]
    )
    if (updated.rowCount <= 0) {
      res.status(404).json({ message: 'Fonte não encontrada.' })
      return
    }
    const row = updated.rows[0]
    res.json({
      source: {
        id: row.id,
        name: row.name,
        url: row.url,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.patch('/api/admin/football/sources/:id', requireAuth, requireAdmin, async (req, res) => {
  const sourceId = String(req.params?.id || '').trim()
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null
  if (!sourceId || isActive === null) {
    res.status(400).json({ message: 'Dados inválidos.' })
    return
  }
  try {
    const updated = await query(
      `
      update football_sources
      set is_active = $1, updated_at = now()
      where id = $2
      returning id, name, url, is_active, created_at, updated_at
      `,
      [isActive, sourceId]
    )
    if (updated.rowCount <= 0) {
      res.status(404).json({ message: 'Fonte não encontrada.' })
      return
    }
    const row = updated.rows[0]
    res.json({
      source: {
        id: row.id,
        name: row.name,
        url: row.url,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.post('/api/admin/football/refresh', requireAuth, requireAdmin, async (req, res) => {
  const dateRaw = typeof req.body?.date === 'string' ? req.body.date.trim() : ''
  const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

  try {
    const settings = await getFootballSettings()
    const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
    const date = explicitDate || getDefaultFootballScheduleDate({ nowDateIso: nowParts.date, nowTime: nowParts.time, readTime: settings.readWindowEnd || settings.readTime })
    void refreshFootballSchedule({ scheduleDateIso: date, timeZone: settings.timeZone }).catch(() => undefined)
    res.status(202).json({ started: true, date })
  } catch {
    res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
  }
})

app.get(['/api/football/schedule', '/api/football/schedule/'], requireAuth, requirePremiumOrAdmin, async (req, res) => {
  const dateRaw = typeof req.query?.date === 'string' ? req.query.date.trim() : ''
  const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

  try {
    const settings = await getFootballSettings()
    const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
    const date = explicitDate || getDefaultFootballScheduleDate({ nowDateIso: nowParts.date, nowTime: nowParts.time, readTime: settings.readWindowEnd || settings.readTime })

    const loadRows = async (targetDate) =>
      query(
        `
        select distinct on (fs.source_id) fs.matches, fs.fetched_at
        from football_schedules fs
        join football_sources s on s.id = fs.source_id
        where fs.schedule_date = $1
          and s.is_active = true
        order by fs.source_id, fs.fetched_at desc nulls last
        `,
        [targetDate]
      )

    const mergeRows = (rows) => {
      const mergedMap = new Map()
      let updatedAt = null
      for (const row of rows) {
        if (!updatedAt || (row.fetched_at && new Date(row.fetched_at).getTime() > new Date(updatedAt).getTime())) {
          updatedAt = row.fetched_at
        }
        const list = Array.isArray(row.matches) ? row.matches : []
        for (const item of list) {
          const time = parseClockTime(item?.time)
          const home = typeof item?.home === 'string' ? item.home.trim() : ''
          const away = typeof item?.away === 'string' ? item.away.trim() : ''
          const competition = typeof item?.competition === 'string' ? item.competition.trim() : ''
          const channels = Array.isArray(item?.channels) ? item.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
          const homeCrestUrl = normalizeFootballCrestUrl(typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : '')
          const awayCrestUrl = normalizeFootballCrestUrl(typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : '')
          const href = typeof item?.href === 'string' ? item.href.trim() : ''
          if (!time || !home || !away) continue
          const key = `${time}::${normalizeFootballSearchText(home)}::${normalizeFootballSearchText(away)}`
          const existing = mergedMap.get(key)
          if (!existing) {
            mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
            continue
          }
          if (!existing.competition && competition) existing.competition = competition
          if (existing.channels.length === 0 && channels.length > 0) {
            existing.channels = channels
          } else if (channels.length > 0) {
            existing.channels = uniqStrings([...existing.channels, ...channels])
          }

          const existingHome = typeof existing.homeCrestUrl === 'string' ? existing.homeCrestUrl.trim() : ''
          const existingAway = typeof existing.awayCrestUrl === 'string' ? existing.awayCrestUrl.trim() : ''
          if ((!existingHome || isPlaceholderFootballTeamCrestUrl(existingHome)) && homeCrestUrl && !isPlaceholderFootballTeamCrestUrl(homeCrestUrl)) {
            existing.homeCrestUrl = homeCrestUrl
          } else if (!existingHome && homeCrestUrl) {
            existing.homeCrestUrl = homeCrestUrl
          }
          if ((!existingAway || isPlaceholderFootballTeamCrestUrl(existingAway)) && awayCrestUrl && !isPlaceholderFootballTeamCrestUrl(awayCrestUrl)) {
            existing.awayCrestUrl = awayCrestUrl
          } else if (!existingAway && awayCrestUrl) {
            existing.awayCrestUrl = awayCrestUrl
          }
          if (!existing.href && href) existing.href = href
        }
      }
      const merged = [...mergedMap.values()]
      merged.sort((a, b) => a.time.localeCompare(b.time))
      return { merged, updatedAt }
    }

    const shouldExcludeFootballMatch = (match, settings) => {
      const competition = normalizeFootballFilterToken(match?.competition || '')
      const channels = Array.isArray(match?.channels)
        ? match.channels.map((c) => normalizeFootballFilterToken(c)).filter(Boolean)
        : []
      const excludedCompetitions = Array.isArray(settings?.excludedCompetitions) ? settings.excludedCompetitions : []
      const excludedChannels = Array.isArray(settings?.excludedChannels) ? settings.excludedChannels : []
      const competitionExcluded = competition && excludedCompetitions.some((needle) => competition.includes(needle))
      const exclusiveChannelsExcluded =
        channels.length > 0 &&
        excludedChannels.length > 0 &&
        channels.every((channel) => excludedChannels.some((needle) => channel.includes(needle)))
      return competitionExcluded || exclusiveChannelsExcluded
    }

    let responseDate = date
    let result = await loadRows(responseDate)
    let { merged, updatedAt } = mergeRows(result.rows)

    if (!explicitDate && merged.length === 0) {
      const fallbackDates = uniqStrings([nowParts.date, addDaysToIsoDate(nowParts.date, -1)])
      for (const fallbackDate of fallbackDates) {
        if (fallbackDate === responseDate) continue
        const fallbackRows = await loadRows(fallbackDate)
        const fallbackMerged = mergeRows(fallbackRows.rows)
        if (fallbackMerged.merged.length > 0) {
          responseDate = fallbackDate
          merged = fallbackMerged.merged
          updatedAt = fallbackMerged.updatedAt
          break
        }
      }
    }

    merged = merged.filter((match) => !shouldExcludeFootballMatch(match, settings))

    // Se a cobertura de escudos estiver baixa, tenta enriquecer agora,
    // mas sem bloquear demais a resposta (evita timeout no frontend).
    const shouldEnrichNow = shouldRefreshFootballScheduleBecauseCrestsMissing({ merged, scheduleDateIso: responseDate })
    if (shouldEnrichNow && merged.length > 0) {
      const timeoutMs = 8_000
      const withTimeout = async (p) => {
        let timer = null
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs)
        })
        try {
          const out = await Promise.race([p, timeout])
          return out
        } finally {
          if (timer) clearTimeout(timer)
        }
      }
      try {
        const enriched = await withTimeout(enrichFutebolNaTvMatchesWithCrests(merged))
        if (Array.isArray(enriched) && enriched.length > 0) merged = enriched
      } catch {
      }
      try {
        const byName = await withTimeout(enrichFootballMatchesWithTeamNameBadges(merged))
        if (Array.isArray(byName) && byName.length > 0) merged = byName
      } catch {
      }
    }

    // Embute escudos como data URLs na resposta: o canvas não depende de CORS/proxy no browser.
    try {
      merged = await inlineFootballCrestUrlsAsDataUrls(merged, { budgetMs: 26_000 })
    } catch {
    }

    if (
      shouldRefreshFootballScheduleBecauseTooFew({ merged, scheduleDateIso: responseDate }) ||
      shouldRefreshFootballScheduleBecauseCrestsMissing({ merged, scheduleDateIso: responseDate })
    ) {
      void refreshFootballSchedule({ scheduleDateIso: responseDate, timeZone: settings.timeZone }).catch(() => undefined)
    }

    const isMissingCrest = (url) => !String(url || '').trim() || isPlaceholderFootballTeamCrestUrl(String(url || ''))
    const totalMatches = Array.isArray(merged) ? merged.length : 0
    const missingHome = merged.filter((m) => isMissingCrest(m.homeCrestUrl)).length
    const missingAway = merged.filter((m) => isMissingCrest(m.awayCrestUrl)).length
    const missingBoth = merged.filter((m) => isMissingCrest(m.homeCrestUrl) && isMissingCrest(m.awayCrestUrl)).length
    const missingAny = merged.filter((m) => isMissingCrest(m.homeCrestUrl) || isMissingCrest(m.awayCrestUrl)).length

    const dateKey = typeof responseDate === 'string' ? responseDate.trim() : ''
    const shouldLogCrestsDebug =
      dateKey &&
      (missingAny >= Math.max(6, Math.floor(totalMatches * 0.7))) &&
      (Date.now() - (footballScheduleCrestDebugLogCache.get(dateKey) || 0) > 10 * 60_000)

    if (shouldLogCrestsDebug) {
      const sample = merged
        .filter((m) => isMissingCrest(m.homeCrestUrl) || isMissingCrest(m.awayCrestUrl))
        .slice(0, 3)
        .map((m) => ({
          time: m.time,
          home: m.home,
          away: m.away,
          href: m.href,
          homeCrestUrl: m.homeCrestUrl,
          awayCrestUrl: m.awayCrestUrl,
        }))

      console.log('football_schedule_crests_debug', {
        date: dateKey,
        totalMatches,
        missingHome,
        missingAway,
        missingBoth,
        missingAny,
        missingAnyRatio: totalMatches ? missingAny / totalMatches : 0,
        sample,
      })
      footballScheduleCrestDebugLogCache.set(dateKey, Date.now())
    }

    const normalizeCrestFieldForClient = (u) => {
      const s = typeof u === 'string' ? u.trim() : ''
      if (!s || s.startsWith('data:')) return s
      return normalizeFootballCrestUrl(s) || s
    }
    const publicMatches = merged.map((m) => {
      const base = {
        time: m.time,
        home: m.home,
        away: m.away,
        competition: m.competition,
        channels: Array.isArray(m.channels) ? m.channels : [],
        homeCrestUrl: normalizeCrestFieldForClient(m.homeCrestUrl || ''),
        awayCrestUrl: normalizeCrestFieldForClient(m.awayCrestUrl || ''),
      }
      const hr = typeof m.homeCrestUrlRemote === 'string' ? m.homeCrestUrlRemote.trim() : ''
      const ar = typeof m.awayCrestUrlRemote === 'string' ? m.awayCrestUrlRemote.trim() : ''
      if (hr) base.homeCrestUrlRemote = normalizeCrestFieldForClient(hr)
      if (ar) base.awayCrestUrlRemote = normalizeCrestFieldForClient(ar)
      return base
    })
    // #region agent log
    appendFootballDebugNdjson('H16,H17', 'server.mjs:/api/football/schedule', 'schedule_response_summary', {
      date: responseDate,
      totalMatches,
      missingHome,
      missingAway,
      missingBoth,
      missingAny,
      sample: publicMatches.slice(0, 2).map((m) => ({
        home: m.home,
        away: m.away,
        homeCrestUrlLen: String(m.homeCrestUrl || '').length,
        awayCrestUrlLen: String(m.awayCrestUrl || '').length,
      })),
    })
    // #endregion
    res.json({ date: responseDate, updatedAt, matches: publicMatches })
  } catch {
    res.status(200).json({
      date: explicitDate || new Date().toISOString().slice(0, 10),
      updatedAt: null,
      matches: [],
    })
  }
})

/** SVG no canvas 2D do browser falha muito (intrínseco 0×0). Converte para PNG quando o runtime canvas está OK. */
const rasterizeFootballCrestSvgToPng = async (svgBuffer) => {
  if (!isCanvasRuntimeHealthy) return null
  try {
    const img = await loadImage(svgBuffer)
    let w = Number(img.width) || 0
    let h = Number(img.height) || 0
    if (!w || !h) {
      w = 512
      h = 512
    }
    const maxSide = 512
    if (w > maxSide || h > maxSide) {
      const scale = maxSide / Math.max(w, h)
      w = Math.max(1, Math.floor(w * scale))
      h = Math.max(1, Math.floor(h * scale))
    }
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toBuffer('image/png')
  } catch {
    return null
  }
}

const setFootballCrestCorsHeaders = (res) => {
  // Imagem carregada no canvas no browser (crossOrigin=anonymous): precisa CORS + CORP permissivo.
  // Em dev o Vite proxy mascara origem cruzada; em produção (front ≠ API) sem isso o onerror cai e só aparecem iniciais.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}

const makeFootballCrestDbg = (routeTag) => (data) => {
  if (__dbgFootballCrestServerLogs >= 30) return
  __dbgFootballCrestServerLogs += 1
  appendDebugNdjsonToSessionFiles({
    sessionId: '3ee3aa',
    hypothesisId: 'H1',
    timestamp: Date.now(),
    location: `server.mjs:${routeTag} /api/football/crest`,
    message: 'crest_proxy',
    data,
  })
}

const processFootballCrestProxy = async (res, urlRaw, dbgFootballCrest) => {
  try {
    const normalized = normalizeFootballCrestUrl(urlRaw)
    if (!normalized || normalized.startsWith('data:')) {
      dbgFootballCrest({ sentStatus: 400, note: 'invalid_or_data_crest_url' })
      res.status(400).end()
      return
    }
    if (!isSafeExternalHttpUrl(normalized)) {
      dbgFootballCrest({ host: '', sentStatus: 403, note: 'unsafe_url' })
      res.status(403).end()
      return
    }
    const url = new URL(normalized)
    const response = await fetch(url.toString(), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: `${url.origin}/`,
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })
    if (!response.ok) {
      dbgFootballCrest({ host: url.hostname, upstreamStatus: response.status, sentStatus: 502, note: 'upstream_not_ok' })
      res.status(502).end()
      return
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 8) {
      dbgFootballCrest({ host: url.hostname, upstreamStatus: response.status, sentStatus: 502, note: 'tiny_body' })
      res.status(502).end()
      return
    }
    const headerCt = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    let contentType = headerCt.startsWith('image/') ? headerCt : ''
    if (!contentType) contentType = sniffImageMimeFromBuffer(buffer)
    if (!contentType) {
      const headUtf8 = buffer.slice(0, Math.min(256, buffer.length)).toString('utf8').trimStart()
      if (headUtf8.startsWith('<svg') || headUtf8.startsWith('<?xml') || /<svg[\s>]/i.test(headUtf8)) {
        contentType = 'image/svg+xml'
      }
    }
    if (!contentType || !contentType.startsWith('image/')) {
      dbgFootballCrest({ host: url.hostname, upstreamStatus: response.status, sentStatus: 502, note: 'not_image_mime', headerCt })
      res.status(502).end()
      return
    }
    if (buffer.length > 2_500_000) {
      dbgFootballCrest({ host: url.hostname, sentStatus: 413, note: 'too_large' })
      res.status(413).end()
      return
    }
    let crestProxyNote
    if (contentType === 'image/svg+xml') {
      const pngBuf = await rasterizeFootballCrestSvgToPng(buffer)
      if (pngBuf && pngBuf.length >= 24) {
        dbgFootballCrest({
          host: url.hostname,
          upstreamStatus: response.status,
          sentStatus: 200,
          bytes: pngBuf.length,
          contentType: 'image/png',
          note: 'svg_rasterized',
        })
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.status(200).send(pngBuf)
        return
      }
      crestProxyNote = 'svg_rasterize_miss'
    }
    dbgFootballCrest({
      host: url.hostname,
      upstreamStatus: response.status,
      sentStatus: 200,
      bytes: buffer.length,
      contentType,
      ...(crestProxyNote
        ? { note: crestProxyNote, canvasHealthy: isCanvasRuntimeHealthy }
        : {}),
    })
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).send(buffer)
  } catch {
    dbgFootballCrest({ sentStatus: 400, note: 'catch' })
    res.status(400).end()
  }
}

app.options('/api/football/crest', (_req, res) => {
  setFootballCrestCorsHeaders(res)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')
  res.status(204).end()
})

app.get('/api/football/crest', async (req, res) => {
  setFootballCrestCorsHeaders(res)
  // #region agent log
  appendFootballDebugNdjson('H18', 'server.mjs:/api/football/crest', 'crest_route_hit', {
    method: 'GET',
    hasUrl: typeof req.query?.url === 'string' && req.query.url.trim().length > 0,
    urlLen: typeof req.query?.url === 'string' ? req.query.url.trim().length : 0,
  })
  // #endregion
  const urlRaw = typeof req.query?.url === 'string' ? req.query.url.trim() : ''
  if (!urlRaw || urlRaw.length > 3000) {
    res.status(400).end()
    return
  }
  await processFootballCrestProxy(res, urlRaw, makeFootballCrestDbg('GET'))
})

app.post('/api/football/crest', async (req, res) => {
  setFootballCrestCorsHeaders(res)
  // #region agent log
  appendFootballDebugNdjson('H18', 'server.mjs:/api/football/crest', 'crest_route_hit', {
    method: 'POST',
    hasUrl: typeof req.body?.url === 'string' && req.body.url.trim().length > 0,
    urlLen: typeof req.body?.url === 'string' ? req.body.url.trim().length : 0,
  })
  // #endregion
  const urlRaw = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (!urlRaw || urlRaw.length > 16384) {
    res.status(400).end()
    return
  }
  await processFootballCrestProxy(res, urlRaw, makeFootballCrestDbg('POST'))
})

app.get('/api/assets/image', requireAuth, requirePremiumOrAdmin, async (req, res) => {
  const urlRaw = typeof req.query?.url === 'string' ? req.query.url.trim() : ''
  if (!urlRaw || urlRaw.length > 800 || !isSafeExternalHttpUrl(urlRaw)) {
    res.status(400).end()
    return
  }

  try {
    const url = new URL(urlRaw)
    const response = await fetch(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0',
        accept: 'image/*',
      },
    })
    if (!response.ok) {
      res.status(502).end()
      return
    }
    const contentType = String(response.headers.get('content-type') || '')
    if (!contentType.startsWith('image/')) {
      res.status(502).end()
      return
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 2_500_000) {
      res.status(413).end()
      return
    }
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.status(200).send(buffer)
  } catch {
    res.status(400).end()
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

    await deactivateExpiredPremiumByUserId(row.id)
    const currentResult = await query('select * from app_users where id = $1 limit 1', [row.id])
    const currentRow = currentResult.rows[0] || row
    if (!currentRow.is_active) {
      res.status(403).json({ message: 'Sua conta está inativa. Fale com o suporte.' })
      return
    }

    const ok = await verifyPassword({
      password,
      digest: {
        hash: currentRow.password_hash,
        salt: currentRow.password_salt,
        iterations: currentRow.password_iterations,
      },
    })

    if (!ok) {
      res.status(401).json({ message: 'Email ou senha inválidos.' })
      return
    }

    const token = signToken({ sub: currentRow.id })
    res.json({ token, user: publicUserFromRow(currentRow) })
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
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/$/, '') : ''
    const baseUrl = APP_URL || origin || (process.env.NODE_ENV !== 'production' ? `http://127.0.0.1:${process.env.VITE_PORT || 5173}` : '')
    const url = `${baseUrl}/reset?token=${rawToken}`
    try {
      await sendResetEmail({ to: user.email, url })
      res.json({ ok: true })
    } catch (e) {
      console.error('SMTP Error', e)
      if (process.env.NODE_ENV !== 'production') {
        res.json({ ok: true, devResetUrl: url, devToken: rawToken })
        return
      }
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

app.post('/api/me/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')
  const confirmPassword = String(req.body?.confirmPassword || '')

  if (!currentPassword || !newPassword || !confirmPassword) {
    res.status(400).json({ message: 'Preencha senha atual, nova senha e confirmação.' })
    return
  }

  if (newPassword.length < 8) {
    res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' })
    return
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ message: 'A confirmação da senha não confere.' })
    return
  }

  if (currentPassword === newPassword) {
    res.status(400).json({ message: 'A nova senha precisa ser diferente da senha atual.' })
    return
  }

  try {
    const result = await query('select id, password_hash, password_salt, password_iterations from app_users where id = $1 limit 1', [
      req.auth.userId,
    ])
    const row = result.rows[0]
    if (!row) {
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }

    const ok = await verifyPassword({
      password: currentPassword,
      digest: {
        hash: row.password_hash,
        salt: row.password_salt,
        iterations: row.password_iterations,
      },
    })

    if (!ok) {
      res.status(401).json({ message: 'Senha atual inválida.' })
      return
    }

    const digest = await createPasswordDigest(newPassword)
    await query(
      `update app_users
          set password_hash = $1,
              password_salt = $2,
              password_iterations = $3,
              updated_at = now()
        where id = $4`,
      [digest.hash, digest.salt, digest.iterations, req.auth.userId]
    )

    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Não foi possível atualizar a senha agora. Tente novamente.' })
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
  let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
  const idRaw = req.body?.id
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
  const captionRaw = typeof req.body?.caption === 'string' ? req.body.caption.trim() : ''

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
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      trailerUrl = await resolveTrailerUrlFromProvider({ mediaType, id, userKey: userContext.userKey })
    }
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      res.status(404).json({ message: 'Trailer não encontrado para este conteúdo.' })
      return
    }

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
    const contentType = typeof file.mimetype === 'string' ? file.mimetype : 'application/octet-stream'
    const isMp4 = contentType.toLowerCase().includes('mp4')
    const filename = file.originalname || (isMp4 ? 'video.mp4' : 'video.webm')
    const blob = new Blob([file.buffer], { type: contentType })
    if (isMp4) {
      form.append('video', blob, filename)
    } else {
      form.append('document', blob, filename)
    }

    const r = await fetch(`${telegramBase}/${isMp4 ? 'sendVideo' : 'sendDocument'}`, { method: 'POST', body: form })
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
    await ensureSearchHistorySchema()
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
    await ensureSearchHistorySchema()
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
    const enabled = await getTicketsEnabled()
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
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : ''
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
    const priority = 'medium'
    if (!subject || !message) {
      return res.status(400).json({ message: 'Assunto e mensagem são obrigatórios.' })
    }
    
    // Check if tickets are enabled
    const enabled = await getTicketsEnabled()
    
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
app.get('/api/tickets/:id(\\d+)', requireAuth, async (req, res) => {
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
app.post('/api/tickets/:id(\\d+)/messages', requireAuth, async (req, res) => {
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
app.put('/api/admin/tickets/:id(\\d+)/status', requireAuth, requireAdmin, async (req, res) => {
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

app.get('/api/football/schedule/refresh', async (req, res) => {
  try {
    const { date } = req.query;
    const settings = await getFootballSettings();
    const scheduleDateIso = date || getDefaultFootballScheduleDate({
      nowDateIso: getZonedNowParts({ timeZone: settings.timeZone }).date,
      nowTime: getZonedNowParts({ timeZone: settings.timeZone }).time,
      readTime: settings.readTime
    });

    const results = await refreshFootballSchedule({ scheduleDateIso, timeZone: settings.timeZone });
    res.json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Erro ao forçar a atualização da programação de futebol.' });
  }
});

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
