/**
 * Extrai layout de banners de futebol e badges de ranking Bulk.
 * Roda: node scripts/extract-banner-layouts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const footballPath = path.join(root, 'src/components/FootballBannerModal.tsx')
const bulkPath = path.join(root, 'src/components/BulkBannerModal.tsx')

const football = fs.readFileSync(footballPath, 'utf8')
const footballLines = football.split(/\r?\n/)

// Encontrar blocos por marcadores
const findLine = (re, from = 0) => {
  for (let i = from; i < footballLines.length; i++) {
    if (re.test(footballLines[i])) return i
  }
  return -1
}

const typeStart = findLine(/^type BannerFormat =/)
const templatesStart = findLine(/^type FootballBannerTemplateId =/)
const bgStart = findLine(/^const FOOTBALL_BACKGROUND_URL =/)
const stripStart = findLine(/^const stripDiacritics =/)
const genEnd = findLine(/^interface FootballBannerModalProps/)

if ([typeStart, templatesStart, bgStart, stripStart, genEnd].some((n) => n < 0)) {
  console.error({ typeStart, templatesStart, bgStart, stripStart, genEnd })
  process.exit(1)
}

const matchType = footballLines.slice(typeStart, templatesStart).join('\n')
const templateBlock = footballLines.slice(templatesStart, bgStart).join('\n')
// assets from FOOTBALL_BACKGROUND through FOOTBALL_WHATSAPP (before debug counters)
const dbgStart = findLine(/^\/\*\* Limite de logs de debug/)
const assetsBlock = footballLines.slice(bgStart, dbgStart > 0 ? dbgStart : stripStart).join('\n')
const layoutFns = footballLines.slice(stripStart, genEnd).join('\n')

const footballLayout = `import { drawRoundedRect } from './canvas';
import { getDrawableImageIntrinsicSize, getFootballCrestCacheKey, isUsableCrestImageElement } from './crest';
import { loadImage as loadBannerImage } from './image';

${matchType}

${templateBlock}

const getCanvasFontStack = () => 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

${assetsBlock}

export type FootballLayoutLoaders = {
  loadImage: (src: string) => Promise<HTMLImageElement | null>;
  loadBrandLogoImage: (rawUrl: string) => Promise<HTMLImageElement | null>;
  loadFootballCrestImage: (rawUrl: string) => Promise<HTMLImageElement | null>;
  loadImageFirstAvailable: (candidates: string[]) => Promise<HTMLImageElement | null>;
  debugLog?: (payload: {
    runId?: string;
    hypothesisId?: string;
    location: string;
    message: string;
    data?: Record<string, unknown>;
  }) => void;
};

let __loaders: FootballLayoutLoaders | null = null;

export const configureFootballLayoutLoaders = (loaders: FootballLayoutLoaders) => {
  __loaders = loaders;
};

const requireLoaders = () => {
  if (!__loaders) throw new Error('Football layout loaders não configurados');
  return __loaders;
};

const loadImage = (src: string) => requireLoaders().loadImage(src);
const loadBrandLogoImage = (rawUrl: string) => requireLoaders().loadBrandLogoImage(rawUrl);
const loadFootballCrestImage = (rawUrl: string) => requireLoaders().loadFootballCrestImage(rawUrl);
const loadImageFirstAvailable = (candidates: string[]) => requireLoaders().loadImageFirstAvailable(candidates);
const postFootballBannerDebugLog = (payload: {
  runId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) => {
  requireLoaders().debugLog?.(payload);
};

${layoutFns}

export {
  computeFootballBannerItemsPerPage,
  generateFootballBanner,
  generateFootballBanners,
  mergeFootballMatchCrestSources,
  normalizeFootballScheduleCrests,
  FOOTBALL_BANNER_TEMPLATES,
  FOOTBALL_TEMPLATE_DEFAULT_COLORS,
  FOOTBALL_BACKGROUND_URL,
};
`

const outFootball = path.join(root, 'src/lib/banner/football-layout.ts')
fs.writeFileSync(outFootball, footballLayout)
console.log('wrote', outFootball, 'chars', footballLayout.length)

// Bulk badges
const bulk = fs.readFileSync(bulkPath, 'utf8')
const bulkOut = `import { drawRoundedRect } from './canvas';

export const drawRankBadgeSquare = (args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  text: string;
}) => {
  const { ctx, x, y, size, text } = args;
  const badgeGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  badgeGradient.addColorStop(0, '#fbbf24');
  badgeGradient.addColorStop(1, '#d97706');
  ctx.fillStyle = badgeGradient;
  drawRoundedRect(ctx, x, y, size, size, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, size, size, 14);
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = \`900 \${Math.max(16, Math.round(size * 0.40))}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
};

export const drawRankBadgeCircle = (args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  text: string;
  isTopOne?: boolean;
}) => {
  const { ctx, x, y, size, text, isTopOne = false } = args;
  const badgeGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  badgeGradient.addColorStop(0, isTopOne ? '#fbbf24' : '#fcd34d');
  badgeGradient.addColorStop(1, '#78350f');
  ctx.fillStyle = badgeGradient;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = \`900 \${Math.max(18, Math.round(size * 0.48))}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
};
`
fs.writeFileSync(path.join(root, 'src/lib/banner/bulk-ranking.ts'), bulkOut)
console.log('wrote bulk-ranking.ts')
