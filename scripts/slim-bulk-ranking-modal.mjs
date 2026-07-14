import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const p = path.join(root, 'src/components/BulkBannerModal.tsx')
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)

const idx = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i
  return -1
}

const start = idx(/^  const drawWhatsappIcon =/)
const end = idx(/^  const generateRankingBannerEmAltaRef =/)
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const before = lines.slice(0, start)
const after = lines.slice(end)

const inject = `  const rankingLayoutOptions = useMemo(
    (): RankingLayoutOptions => ({
      colorVariant: rankingColorVariant,
      footerIncludePhone: rankingFooterIncludePhone,
      footerIncludeWebsite: rankingFooterIncludeWebsite,
      brand: {
        brandName: user?.brandName,
        brandColors: user?.brandColors,
        brandLogo: user?.brandLogo,
        phone: user?.phone,
        website: user?.website,
      },
    }),
    [
      rankingColorVariant,
      rankingFooterIncludePhone,
      rankingFooterIncludeWebsite,
      user?.brandName,
      user?.brandColors,
      user?.brandLogo,
      user?.phone,
      user?.website,
    ]
  );

  const generateRankingBannerEmAlta = (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rankOffset: number;
  }) =>
    generateRankingBannerEmAltaLib({
      ...args,
      format: { width: args.format.width, height: args.format.height },
      options: rankingLayoutOptions,
    });

  const generateRankingBannerTop10Cartaz = (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rangeLabel?: string;
    rankOffset: number;
  }) =>
    generateRankingBannerTop10CartazLib({
      ...args,
      format: { width: args.format.width, height: args.format.height },
      options: rankingLayoutOptions,
    });

`

let headLines = before.filter((line) => !line.includes("from '../lib/banner/bulk-ranking'"))
let head = headLines.join('\n')

if (!head.includes('bulk-ranking-layout')) {
  const marker = "from '../lib/banner';"
  const pos = head.indexOf(marker)
  if (pos < 0) {
    console.error('banner import not found')
    process.exit(1)
  }
  const nl = head.indexOf('\n', pos)
  head =
    head.slice(0, nl + 1) +
    `import {
  generateRankingBannerEmAlta as generateRankingBannerEmAltaLib,
  generateRankingBannerTop10Cartaz as generateRankingBannerTop10CartazLib,
  type RankingLayoutOptions,
} from '../lib/banner/bulk-ranking-layout';
` +
    head.slice(nl + 1)
}

const out = `${head}\n${inject}${after.join('\n')}\n`
fs.writeFileSync(p, out)
console.log('bulk modal rewritten', out.split(/\n/).length, 'lines')
