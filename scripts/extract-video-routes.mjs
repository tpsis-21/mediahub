import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
const outPath = path.join(root, 'server/routes/video-routes.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const start = text.search(/^app\.post\('\/api\/video-branding\/trailer'/m)
const end = text.search(/^const rasterizeFootballCrestSvgToPng =/m)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const block = text.slice(start, end)
text = text.slice(0, start) + text.slice(end)

// Collect server-level const/function names for dep candidates
const serverIdents = new Set()
for (const m of text.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_][\w]*)|^const ([A-Za-z_][\w]*)\s*=|^let ([A-Za-z_][\w]*)\s*=/gm)) {
  serverIdents.add(m[1] || m[2] || m[3])
}

const called = new Set()
for (const m of block.matchAll(/\b([A-Za-z_][\w]*)\s*\(/g)) called.add(m[1])

const skip = new Set([
  'if', 'for', 'while', 'switch', 'return', 'typeof', 'await', 'catch', 'try', 'new', 'String', 'Boolean',
  'Number', 'Array', 'Object', 'JSON', 'Date', 'Math', 'Buffer', 'Error', 'console', 'fetch', 'encodeURIComponent',
  'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'Promise', 'Map', 'Set',
  'URL', 'RegExp', 'Blob', 'FormData', 'Uint8Array', 'DataView', 'process', 'require',
])

const must = [
  'requireAuth',
  'requirePremiumOrAdmin',
  'rateLimitVideo',
  'query',
  'isCanvasRuntimeHealthy',
  'createCanvas',
  'loadImage',
]

const deps = [...new Set([...must, ...[...called].filter((n) => serverIdents.has(n) && !skip.has(n))])].sort()

const header = `import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Vídeo / trailer branding + download + proxy de assets.
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerVideoRoutes = (app, deps) => {
  const {
${deps.map((d) => `    ${d},`).join(nl)}
  } = deps

`

const body = block
  .split(/\r?\n/)
  .map((line) => (line.length ? `  ${line}` : line))
  .join(nl)
  .replace(/\bfs\./g, 'fs.')
  .replace(/\bos\./g, 'os.')
  .replace(/\bpath\./g, 'path.')

fs.writeFileSync(outPath, `${header}${body}${nl}}${nl}`)

if (!text.includes("from './routes/video-routes.mjs'")) {
  text = text.replace(
    "import { registerAdminRoutes } from './routes/admin-routes.mjs'",
    `import { registerAdminRoutes } from './routes/admin-routes.mjs'${nl}import { registerVideoRoutes } from './routes/video-routes.mjs'`
  )
}

const register = [
  'registerVideoRoutes(app, {',
  ...deps.map((d) => `  ${d},`),
  '})',
  '',
  '',
].join(nl)

if (!text.includes('registerVideoRoutes(app')) {
  text = text.replace('registerAdminRoutes(app, {', `${register}registerAdminRoutes(app, {`)
}

fs.writeFileSync(serverPath, text)
console.log('deps count', deps.length)
console.log('deps', deps.join(', '))
console.log('video-routes lines', fs.readFileSync(outPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', text.split(/\r?\n/).length)
