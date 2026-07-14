import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = path.join(root, 'server/server.mjs')
const outPath = path.join(root, 'server/lib/football-schedule.mjs')
let text = fs.readFileSync(serverPath, 'utf8')
const nl = text.includes('\r\n') ? '\r\n' : '\n'

const start = text.search(/^const getFootballSettings = async/m)
const end = text.search(/^let footballSchedulerTimer = null/m)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const block = text.slice(start, end)
text = text.slice(0, start) + text.slice(end)

const deps = [
  'query',
  'getAppSettingValue',
  'setAppSettingValue',
  'isSafeExternalHttpUrl',
  'FOOTBALL_SETTINGS_KEYS',
  'DEFAULT_FOOTBALL_TIME_ZONE',
  'DEFAULT_FOOTBALL_READ_TIME',
  'DEFAULT_FOOTBALL_READ_WINDOW_START',
  'DEFAULT_FOOTBALL_READ_WINDOW_END',
  'DEFAULT_FOOTBALL_EXCLUDED_CHANNELS',
  'DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS',
  'parseClockTime',
  'parseFootballSettingList',
  'normalizeFootballFilterToken',
  'normalizeFootballSearchText',
  'normalizeFootballCrestUrl',
  'isPlaceholderFootballTeamCrestUrl',
  'stripHtml',
  'parseFootballScheduleFromSource',
  'parseFutebolNaTvBrMarkdownSchedule',
  'parseFutebolNaTvBrSchedule',
  'getZonedNowParts',
  'addDaysToIsoDate',
  'resolveFootballSourceFetchUrl',
  'resolveOneFootballFetchUrl',
  'toJinaReaderUrl',
  'fetchTextWithHeaders',
  'fetchJsonWithHeaders',
  'isSafeExternalHttpUrl',
]

const uniqueDeps = [...new Set(deps)]

const header = `/**
 * Agenda de futebol: settings, enrich de escudos, refresh e heurísticas de auto-refresh.
 * @param {Record<string, any>} deps
 */
export const createFootballScheduleService = (deps) => {
  const {
${uniqueDeps.map((d) => `    ${d},`).join(nl)}
  } = deps

`

const body = block
  .split(/\r?\n/)
  .map((line) => (line.length ? `  ${line}` : line))
  .join(nl)

const footer = `
  return {
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
  }
}
`

fs.writeFileSync(outPath, `${header}${body}${footer}${nl}`)

if (!text.includes("from './lib/football-schedule.mjs'")) {
  text = text.replace(
    "from './lib/football-parse.mjs'",
    `from './lib/football-parse.mjs'${nl}import { createFootballScheduleService } from './lib/football-schedule.mjs'`
  )
}

const wire = `
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
  getZonedNowParts,
  addDaysToIsoDate,
  resolveFootballSourceFetchUrl,
  resolveOneFootballFetchUrl,
  toJinaReaderUrl,
  fetchTextWithHeaders,
  fetchJsonWithHeaders,
})

`

if (!text.includes('createFootballScheduleService({')) {
  text = text.replace(/^let footballSchedulerTimer = null/m, `${wire}let footballSchedulerTimer = null`)
}

fs.writeFileSync(serverPath, text)
console.log('football-schedule lines', fs.readFileSync(outPath, 'utf8').split(/\r?\n/).length)
console.log('server lines', text.split(/\r?\n/).length)
