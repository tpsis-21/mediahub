import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
const outPath = path.join(root, 'server/routes/me-routes.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const start = text.search(/^app\.post\('\/api\/auth\/password-reset\/start'/m)
const end = text.search(/^app\.post\('\/api\/telegram\/send'/m)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const block = text.slice(start, end)
text = text.slice(0, start) + text.slice(end)

const header = `/**
 * Conta do usuário: password-reset + /api/me
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerMeRoutes = (app, deps) => {
  const {
    rateLimitAuth,
    requireAuth,
    normalizeEmail,
    query,
    crypto,
    APP_URL,
    sendResetEmail,
    createPasswordDigest,
    verifyPassword,
    publicUserFromRow,
    deactivateExpiredPremiumByUserId,
  } = deps

`

const body = block
  .split(/\r?\n/)
  .map((line) => (line.length ? `  ${line}` : line))
  .join(nl)

// crypto is used as global in original - need to keep as deps.crypto or import
// Original uses `crypto.randomBytes` - Node crypto module in scope in server.mjs
// We'll pass crypto from deps.

fs.writeFileSync(outPath, `${header}${body}${nl}}${nl}`)

if (!text.includes("from './routes/me-routes.mjs'")) {
  text = text.replace(
    "import { registerTicketRoutes } from './routes/ticket-routes.mjs'",
    `import { registerTicketRoutes } from './routes/ticket-routes.mjs'${nl}import { registerMeRoutes } from './routes/me-routes.mjs'`
  )
}

const registerMe = [
  'registerMeRoutes(app, {',
  '  rateLimitAuth,',
  '  requireAuth,',
  '  normalizeEmail,',
  '  query,',
  '  crypto,',
  '  APP_URL,',
  '  sendResetEmail,',
  '  createPasswordDigest,',
  '  verifyPassword,',
  '  publicUserFromRow,',
  '  deactivateExpiredPremiumByUserId,',
  '})',
  '',
  '',
].join(nl)

if (!text.includes('registerMeRoutes(app')) {
  text = text.replace('registerHealthRoutes(app, { query })', `${registerMe}registerHealthRoutes(app, { query })`)
}

fs.writeFileSync(serverPath, text)
console.log('me-routes lines', fs.readFileSync(outPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', text.split(/\r?\n/).length)
