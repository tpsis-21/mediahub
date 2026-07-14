/**
 * Extrai o bloco de geração de ranking (Em Alta + Top10 Cartaz) do BulkBannerModal
 * para src/lib/banner/bulk-ranking-layout.ts e reescreve o modal para importar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modalPath = path.join(root, 'src/components/BulkBannerModal.tsx')
const outPath = path.join(root, 'src/lib/banner/bulk-ranking-layout.ts')

const lines = fs.readFileSync(modalPath, 'utf8').split(/\r?\n/)

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

const block = lines.slice(start, end)

// Dedentar 2 espaços (métodos do componente)
const dedented = block.map((line) => (line.startsWith('  ') ? line.slice(2) : line))

const header = `import type { MovieData } from '../../services/searchService';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../utils';
import { canvasToBlob, drawRoundedRect } from './canvas';
import { hexToRgba } from './colors';
import { loadImageOrThrow } from './image';
import { getPosterUrl } from './poster';
import { drawRankBadgeSquare } from './bulk-ranking';

export type RankingCategory = 'movie' | 'tv' | 'all';
export type RankingColorVariant = 'classic' | 'brand' | 'dark' | 'red';
export type BannerFormatSize = { width: number; height: number };

export type RankingBrandInput = {
  brandColors?: { primary?: string; secondary?: string } | null;
  brandLogo?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type RankingLayoutOptions = {
  colorVariant: RankingColorVariant;
  footerIncludePhone: boolean;
  footerIncludeWebsite: boolean;
  brand: RankingBrandInput;
};

`

const footer = `
`

let body = dedented.join('\n')

// Transform closures to use options parameter
// The two generate functions need to accept layout options instead of closing over user/ranking*

// Wrap helpers as module-level (already dedented). Rewrite generate* signatures.

body = body.replace(
  /const generateRankingBannerEmAlta = async \(args: \{\n    items: MovieData\[\];\n    category: RankingCategory;\n    format: BannerFormat;\n    rankOffset: number;\n  \}\): Promise<Blob> => \{/,
  `export const generateRankingBannerEmAlta = async (args: {
  items: MovieData[];
  category: RankingCategory;
  format: BannerFormatSize;
  rankOffset: number;
  options: RankingLayoutOptions;
}): Promise<Blob> => {
  const { brand: user, colorVariant: rankingColorVariant, footerIncludePhone: rankingFooterIncludePhone, footerIncludeWebsite: rankingFooterIncludeWebsite } = args.options;`
)

body = body.replace(
  /const generateRankingBannerTop10Cartaz = async \(args: \{\n    items: MovieData\[\];\n    category: RankingCategory;\n    format: BannerFormat;\n    rangeLabel\?: string;\n    rankOffset: number;\n  \}\): Promise<Blob> => \{/,
  `export const generateRankingBannerTop10Cartaz = async (args: {
  items: MovieData[];
  category: RankingCategory;
  format: BannerFormatSize;
  rangeLabel?: string;
  rankOffset: number;
  options: RankingLayoutOptions;
}): Promise<Blob> => {
  const { brand: user, colorVariant: rankingColorVariant, footerIncludePhone: rankingFooterIncludePhone, footerIncludeWebsite: rankingFooterIncludeWebsite } = args.options;`
)

// Export drawing helpers used only internally — keep private except generators
body = body
  .replace(/^const drawWhatsappIcon/, 'const drawWhatsappIcon')
  .replace(/^const drawRankingFooter/, 'const drawRankingFooter')
  .replace(/^const drawImageCover/, 'const drawImageCover')
  .replace(/^const loadPoster/, 'const loadPoster')
  .replace(/^const loadBrandLogo/, 'const loadBrandLogo')
  .replace(/^const drawBrandLogoWatermark/, 'const drawBrandLogoWatermark')

// loadBrandLogo uses user?.brandLogo — rewrite to take brandLogo from closure via user alias in generate*, but loadBrandLogo is shared and closes over user
// Fix: change loadBrandLogo to accept optional src or use module-level brand from generate args only.
// Easiest: rewrite loadBrandLogo to take logoUrl string.

body = body.replace(
  /const loadBrandLogo = async \(\) => \{\n    const src = typeof user\?\.brandLogo === 'string' \? user\.brandLogo\.trim\(\) : '';/,
  `const loadBrandLogo = async (brandLogo?: string | null) => {
    const src = typeof brandLogo === 'string' ? brandLogo.trim() : '';`
)

// Replace loadBrandLogo() calls with loadBrandLogo(user?.brandLogo)
body = body.replace(/await loadBrandLogo\(\)/g, 'await loadBrandLogo(user?.brandLogo)')

const out = `${header}\n${body}\n${footer}`
fs.writeFileSync(outPath, out)
console.log('wrote', outPath, 'lines', out.split(/\n/).length)
