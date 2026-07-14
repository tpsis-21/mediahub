import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = path.join(root, 'src/components/FootballBannerModal.tsx')
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)

const idx = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i
  return -1
}

const bannerFormat = idx(/^type BannerFormat =/)
const debugLimit = idx(/^\/\*\* Limite de logs de debug/)
const strip = idx(/^const stripDiacritics =/)
const props = idx(/^interface FootballBannerModalProps/)

if ([bannerFormat, debugLimit, strip, props].some((n) => n < 0)) {
  console.error({ bannerFormat, debugLimit, strip, props })
  process.exit(1)
}

const part1 = lines.slice(0, bannerFormat)
const part2 = lines.slice(debugLimit, strip)
const part3 = lines.slice(props)

const layoutImport = `import {
  configureFootballLayoutLoaders,
  generateFootballBanners,
  FOOTBALL_BANNER_TEMPLATES,
  FOOTBALL_TEMPLATE_DEFAULT_COLORS,
  footballMatchKey,
  getDefaultFootballScheduleDate,
  normalizeFootballScheduleCrests,
  readCachedFootballSchedule,
  writeCachedFootballSchedule,
  type BannerFormat,
  type FootballBannerTemplateId,
  type FootballMatch,
  type FootballScheduleResponse,
} from '../lib/banner/football-layout';
`

let head = part1.join('\n')
if (!head.includes('football-layout')) {
  const marker = "from '../lib/banner/crest';"
  const pos = head.indexOf(marker)
  if (pos < 0) {
    console.error('crest import not found')
    process.exit(1)
  }
  const nl = head.indexOf('\n', pos)
  head = head.slice(0, nl + 1) + layoutImport + head.slice(nl + 1)
}

const configure = `
configureFootballLayoutLoaders({
  loadImage,
  loadBrandLogoImage,
  loadFootballCrestImage,
  loadImageFirstAvailable,
  debugLog: postFootballBannerDebugLog,
});
`

const out = `${head}\n${part2.join('\n')}\n${configure}\n${part3.join('\n')}\n`
fs.writeFileSync(p, out)
console.log('modal rewritten', out.split(/\n/).length, 'lines')
