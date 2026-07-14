import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const adminPath = path.join(root, 'server/routes/admin-routes.mjs')
const serverPath = path.join(root, 'server/server.mjs')
const nl = fs.readFileSync(serverPath, 'utf8').includes('\r\n') ? '\r\n' : '\n'

let admin = fs.readFileSync(adminPath, 'utf8')
let server = fs.readFileSync(serverPath, 'utf8')

const helperStart = admin.indexOf('  /** SVG no canvas 2D do browser falha muito')
if (helperStart < 0) {
  console.error('crest helpers not found in admin-routes')
  process.exit(1)
}

// Find closing of registerAdminRoutes: last `}\n\n` before file end that closes the export function
// Helpers end just before the final `}\n` of registerAdminRoutes
const helpers = admin.slice(helperStart).replace(/\r?\n\}\r?\n\s*$/, '\n')
// Dedent helpers (remove 2 spaces)
const helpersDedented = helpers
  .split(/\r?\n/)
  .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
  .join(nl)

admin = admin.slice(0, helperStart).replace(/\s*$/, `${nl}}${nl}`)
fs.writeFileSync(adminPath, admin)

// Patch admin deps
admin = fs.readFileSync(adminPath, 'utf8')
if (!admin.includes('createPasswordDigest')) {
  admin = admin.replace(
    '    uniqStrings,\n  } = deps',
    `    uniqStrings,
    createPasswordDigest,
    generateRandomPassword,
    pool,
    FOOTBALL_SETTINGS_KEYS,
  } = deps`
  )
  fs.writeFileSync(adminPath, admin)
}

server = fs.readFileSync(serverPath, 'utf8')
if (!server.includes('const processFootballCrestProxy')) {
  // Insert helpers before registerAdminRoutes
  const marker = 'registerAdminRoutes(app, {'
  const idx = server.indexOf(marker)
  if (idx < 0) {
    console.error('registerAdminRoutes not found')
    process.exit(1)
  }
  const crestPreamble = `let __dbgFootballCrestServerLogs = 0

${helpersDedented}
`
  server = server.slice(0, idx) + crestPreamble + server.slice(idx)
}

// Fix registerAdminRoutes deps list
server = server.replace(
  /registerAdminRoutes\(app, \{[\s\S]*?\}\)/,
  `registerAdminRoutes(app, {
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
})`
)

fs.writeFileSync(serverPath, server)
console.log('admin lines', fs.readFileSync(adminPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', server.split(/\r?\n/).length)
console.log('has processFootballCrestProxy', server.includes('const processFootballCrestProxy'))
console.log('admin has processFootball', fs.readFileSync(adminPath, 'utf8').includes('processFootballCrestProxy'))
