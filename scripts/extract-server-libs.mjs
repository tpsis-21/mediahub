import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const cutExport = (startRe, endRe, outRel, header, exportNames) => {
  const start = text.search(startRe)
  const end = text.search(endRe)
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`cut failed ${startRe} -> ${endRe} (${start},${end})`)
  }
  const block = text.slice(start, end)
  text = text.slice(0, start) + text.slice(end)

  // Promote const X = to export const X =
  let body = block
  for (const name of exportNames) {
    body = body.replace(new RegExp(`^const ${name}\\b`, 'm'), `export const ${name}`)
    body = body.replace(new RegExp(`^async function ${name}\\b`, 'm'), `export async function ${name}`)
    body = body.replace(new RegExp(`^function ${name}\\b`, 'm'), `export function ${name}`)
  }

  const out = path.join(root, outRel)
  fs.writeFileSync(out, `${header}${nl}${nl}${body}`)
  console.log('wrote', outRel, 'lines', body.split(/\r?\n/).length)
}

// --- media tools ---
cutExport(
  /^const runProcess = async/m,
  /^const getSearchProviderErrorMessage =/m,
  'server/lib/media-tools.mjs',
  `import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Ferramentas de mídia: ffmpeg/yt-dlp, YouTube trailer helpers, temp cleanup. */`,
  [
    'runProcess',
    'resolveVideoBrandingFonts',
    'hasBinary',
    'resolveFfmpegCommand',
    'resolveYtdl',
    'resolveYtdlpExec',
    'resolveBundledYtdlpCommand',
    'isYouTubeTrailerUrl',
    'isYouTubeTrailerId',
    'buildYouTubeTrailerUrlFromId',
    'stripYouTubeUrlsFromText',
    'resolveTrailerUrlFromProvider',
    'downloadToFile',
    'escapeFfmpegText',
    'escapeFfmpegPath',
    'resolveFfmpegDrawtextFont',
    'safeRm',
    'cleanupStaleTempFiles',
  ]
)

// Fix resolveTrailer to take fetchSearchProviderJson from args
{
  const p = path.join(root, 'server/lib/media-tools.mjs')
  let m = fs.readFileSync(p, 'utf8')
  m = m.replace(
    'export const resolveTrailerUrlFromProvider = async ({ mediaType, id, userKey }) => {',
    'export const resolveTrailerUrlFromProvider = async ({ mediaType, id, userKey, fetchSearchProviderJson }) => {'
  )
  if (!m.includes('if (typeof fetchSearchProviderJson !== \'function\')')) {
    m = m.replace(
      'export const resolveTrailerUrlFromProvider = async ({ mediaType, id, userKey, fetchSearchProviderJson }) => {',
      `export const resolveTrailerUrlFromProvider = async ({ mediaType, id, userKey, fetchSearchProviderJson }) => {
  if (typeof fetchSearchProviderJson !== 'function') {
    throw new Error('fetchSearchProviderJson é obrigatório')
  }`
    )
  }
  fs.writeFileSync(p, m)
}

// --- football parse / normalize (pure + settings keys) ---
cutExport(
  /^const FOOTBALL_SETTINGS_KEYS =/m,
  /^const getFootballSettings = async/m,
  'server/lib/football-parse.mjs',
  `/** Parsing/normalização de agenda e filtros de futebol (sem I/O de banco). */`,
  [
    'FOOTBALL_SETTINGS_KEYS',
    'DEFAULT_FOOTBALL_TIME_ZONE',
    'DEFAULT_FOOTBALL_READ_TIME',
    'DEFAULT_FOOTBALL_READ_WINDOW_START',
    'DEFAULT_FOOTBALL_READ_WINDOW_END',
    'DEFAULT_FOOTBALL_EXCLUDED_CHANNELS',
    'DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS',
    'normalizeFootballFilterToken',
    'parseFootballSettingList',
    'getZonedNowParts',
    'addDaysToIsoDate',
    'parseClockTime',
    'parseFootballLine',
    'parseFutebolNaTvSchedule',
    'prettifyFootballTeamFromSlug',
    'normalizeFootballCompetitionLabel',
    'extractFootballCompetitionFromHref',
    'normalizeFootballSearchText',
    'isPlaceholderFootballTeamCrestUrl',
    'normalizeFootballCrestUrl',
    'parseFutebolNaTvBrSchedule',
    'parseFutebolNaTvBrMarkdownSchedule',
    'parseFootballScheduleFromSource',
  ]
)

// Wire imports + re-exports into server.mjs
const mediaImport = `import {
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
} from './lib/football-parse.mjs'
`

if (!text.includes("from './lib/media-tools.mjs'")) {
  text = text.replace(
    "import { isSafeExternalHttpUrl } from './lib/safe-url.mjs'",
    `import { isSafeExternalHttpUrl } from './lib/safe-url.mjs'${nl}${mediaImport}`
  )
}

// Wrapper after fetchSearchProviderJson exists — inject near registerVideoRoutes
const wrapper = `
const resolveTrailerUrlFromProvider = (args) =>
  resolveTrailerUrlFromProviderCore({ ...args, fetchSearchProviderJson })

`

if (!text.includes('resolveTrailerUrlFromProviderCore')) {
  text = text.replace('registerVideoRoutes(app, {', `${wrapper}registerVideoRoutes(app, {`)
}

fs.writeFileSync(serverPath, text)
console.log('server lines', text.split(/\r?\n/).length)
