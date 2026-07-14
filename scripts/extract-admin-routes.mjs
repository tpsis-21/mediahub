import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
const outPath = path.join(root, 'server/routes/admin-routes.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const start = text.search(/^app\.get\('\/api\/admin\/telegram'/m)
const end = text.search(/^app\.get\('\/api\/assets\/image'/m)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const block = text.slice(start, end)
text = text.slice(0, start) + text.slice(end)

// Heurística de deps: identificadores usados como chamada no bloco que também existem no server como const/function
const serverIdents = new Set()
for (const m of text.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_][\w]*)|^const ([A-Za-z_][\w]*)\s*=/gm)) {
  serverIdents.add(m[1] || m[2])
}

const called = new Set()
for (const m of block.matchAll(/\b([A-Za-z_][\w]*)\s*\(/g)) {
  called.add(m[1])
}

const skip = new Set([
  'if', 'for', 'while', 'switch', 'return', 'typeof', 'await', 'catch', 'try', 'new', 'String', 'Boolean',
  'Number', 'Array', 'Object', 'JSON', 'Date', 'Math', 'Buffer', 'Error', 'console', 'fetch', 'encodeURIComponent',
  'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'Promise', 'Map', 'Set', 'URL', 'RegExp',
])

const deps = [...called]
  .filter((name) => serverIdents.has(name) || ['requireAuth', 'requireAdmin', 'query', 'pool'].includes(name))
  .filter((name) => !skip.has(name))
  .sort()

// Always include core middlewares
for (const must of ['requireAuth', 'requireAdmin', 'query']) {
  if (!deps.includes(must)) deps.unshift(must)
}

const header = `/**
 * Rotas administrativas.
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerAdminRoutes = (app, deps) => {
  const {
${deps.map((d) => `    ${d},`).join(nl)}
  } = deps

`

const body = block
  .split(/\r?\n/)
  .map((line) => (line.length ? `  ${line}` : line))
  .join(nl)

fs.writeFileSync(outPath, `${header}${body}${nl}}${nl}`)

if (!text.includes("from './routes/admin-routes.mjs'")) {
  text = text.replace(
    "import { registerTelegramRoutes } from './routes/telegram-routes.mjs'",
    `import { registerTelegramRoutes } from './routes/telegram-routes.mjs'${nl}import { registerAdminRoutes } from './routes/admin-routes.mjs'`
  )
}

const register = [
  'registerAdminRoutes(app, {',
  ...deps.map((d) => `  ${d},`),
  '})',
  '',
  '',
].join(nl)

if (!text.includes('registerAdminRoutes(app')) {
  text = text.replace('registerTelegramRoutes(app, {', `${register}registerTelegramRoutes(app, {`)
}

fs.writeFileSync(serverPath, text)
console.log('deps', deps.join(', '))
console.log('admin-routes lines', fs.readFileSync(outPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', text.split(/\r?\n/).length)
