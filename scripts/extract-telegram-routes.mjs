import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
const outPath = path.join(root, 'server/routes/telegram-routes.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const start = text.search(/^app\.post\('\/api\/telegram\/send'/m)
const end = text.search(/^registerMeRoutes\(app,/m)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const block = text.slice(start, end)
text = text.slice(0, start) + text.slice(end)

const depsList = [
  'requireAuth',
  'rateLimitTelegram',
  'express',
  'upload',
  'query',
  'hasTelegramChatIdColumn',
  'getTelegramBotToken',
  'getSearchProviderImageBaseUrl',
  'getSearchProviderSettingsKeys',
  'stripYouTubeUrlsFromText',
  'isYouTubeTrailerId',
  'isYouTubeTrailerUrl',
  'buildYouTubeTrailerUrlFromId',
  'resolveTrailerUrlFromProvider',
  'ensureTrailerFile',
  'fetchSearchProviderJson',
  'readOptionalAuthUserContext',
  'uniqStrings',
  'resolveBundledYtdlpCommand',
  'resolveFfmpegCommand',
  'runProcess',
  'safeFileBaseName',
  'safeRm',
  'fs',
  'path',
  'os',
]

const header = `import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Envio via Telegram (usuário autenticado).
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerTelegramRoutes = (app, deps) => {
  const {
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
    ensureTrailerFile,
    fetchSearchProviderJson,
    readOptionalAuthUserContext,
    uniqStrings,
    resolveBundledYtdlpCommand,
    resolveFfmpegCommand,
    runProcess,
    safeFileBaseName,
    safeRm,
  } = deps

`

// Indent route bodies; they already start at column 0 with app.post
const body = block
  .split(/\r?\n/)
  .map((line) => (line.length ? `  ${line}` : line))
  .join(nl)
  // Prefer module-level fs/path/os over deps if original used fs.xxx
  .replace(/\bfs\.existsSync\b/g, 'fs.existsSync')
  .replace(/\bfs\.mkdtempSync\b/g, 'fs.mkdtempSync')
  .replace(/\bfs\.readdirSync\b/g, 'fs.readdirSync')
  .replace(/\bfs\.readFileSync\b/g, 'fs.readFileSync')
  .replace(/\bos\.tmpdir\b/g, 'os.tmpdir')
  .replace(/\bpath\.join\b/g, 'path.join')

fs.writeFileSync(outPath, `${header}${body}${nl}}${nl}`)

if (!text.includes("from './routes/telegram-routes.mjs'")) {
  text = text.replace(
    "import { registerMeRoutes } from './routes/me-routes.mjs'",
    `import { registerMeRoutes } from './routes/me-routes.mjs'${nl}import { registerTelegramRoutes } from './routes/telegram-routes.mjs'`
  )
}

const register = [
  'registerTelegramRoutes(app, {',
  ...depsList.filter((d) => !['fs', 'path', 'os'].includes(d)).map((d) => `  ${d},`),
  '})',
  '',
  '',
].join(nl)

if (!text.includes('registerTelegramRoutes(app')) {
  text = text.replace('registerMeRoutes(app, {', `${register}registerMeRoutes(app, {`)
}

fs.writeFileSync(serverPath, text)
console.log('telegram-routes lines', fs.readFileSync(outPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', text.split(/\r?\n/).length)
