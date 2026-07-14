import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = path.join(root, 'server/server.mjs')
let text = fs.readFileSync(p, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const cutBetween = (startRe, endRe) => {
  const start = text.search(startRe)
  if (start < 0) throw new Error(`start not found: ${startRe}`)
  const rest = text.slice(start)
  const endRel = rest.search(endRe)
  if (endRel < 0) throw new Error(`end not found: ${endRe}`)
  text = text.slice(0, start) + rest.slice(endRel)
}

cutBetween(/^app\.get\('\/api\/health'/m, /^app\.post\('\/api\/video-branding\/trailer'/m)
cutBetween(/^app\.get\('\/api\/history'/m, /^registerSearchRoutes\(app, \{/m)

if (!text.includes("from './routes/health-routes.mjs'")) {
  text = text.replace(
    "import { registerFootballRoutes } from './routes/football-routes.mjs'",
    `import { registerFootballRoutes } from './routes/football-routes.mjs'${nl}import { registerHealthRoutes } from './routes/health-routes.mjs'${nl}import { registerHistoryRoutes } from './routes/history-routes.mjs'${nl}import { registerTicketRoutes } from './routes/ticket-routes.mjs'`
  )
}

const registerBlock = [
  'registerHealthRoutes(app, { query })',
  '',
  'registerHistoryRoutes(app, {',
  '  requireAuth,',
  '  query,',
  '  ensureSearchHistorySchema,',
  '})',
  '',
  'registerTicketRoutes(app, {',
  '  requireAuth,',
  '  requireAdmin,',
  '  query,',
  '  pool,',
  '  getTicketsEnabled,',
  '})',
  '',
  '',
].join(nl)

if (!text.includes('registerHealthRoutes(app')) {
  text = text.replace('registerSearchRoutes(app, {', `${registerBlock}registerSearchRoutes(app, {`)
}

fs.writeFileSync(p, text)
console.log('server.mjs updated, lines', text.split(/\r?\n/).length)
console.log('has health route inline', /app\.get\('\/api\/health'/.test(text))
console.log('has history inline', /app\.get\('\/api\/history'/.test(text))
console.log('has tickets settings inline', /app\.get\('\/api\/tickets\/settings'/.test(text))
console.log('has registerHealth', text.includes('registerHealthRoutes'))
