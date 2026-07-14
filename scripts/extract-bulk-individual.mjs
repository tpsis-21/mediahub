import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modalPath = path.join(root, 'src/components/BulkBannerModal.tsx')
const outPath = path.join(root, 'src/lib/banner/bulk-individual-layout.ts')

const lines = fs.readFileSync(modalPath, 'utf8').split(/\r?\n/)
const start = lines.findIndex((l) => l.startsWith('  const generateBanner = async'))
const end = lines.findIndex((l, i) => i > start && l.startsWith('  const handleGenerateRankingBanners'))
if (start < 0 || end < 0) {
  console.error({ start, end })
  process.exit(1)
}

const body = lines
  .slice(start, end)
  .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
  .join('\n')
  .replace(
    /^const generateBanner = async \(movie: MovieData, template: BannerTemplate, format: BannerFormat\): Promise<Blob> => \{/,
    `export const generateIndividualBanner = async (
  movie: MovieData,
  template: IndividualBannerTemplate,
  format: IndividualBannerFormat
): Promise<Blob> => {`
  )
  .replace(/const loadImage = \(src: string\) => loadImageOrThrow\(src\);\n\n/g, '')
  .replace(/\bloadImage\(/g, 'loadImageOrThrow(')
  .replace(/\bwrapText\(/g, 'wrapTextSimple(')

const header = `import type { MovieData } from '../../services/searchService';
import { canvasToBlob, drawRoundedRect, wrapTextSimple } from './canvas';
import { hexToRgba } from './colors';
import { loadImageOrThrow } from './image';
import { getPosterUrl } from './poster';

export type IndividualBannerTemplate = {
  id: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
};

export type IndividualBannerFormat = {
  width: number;
  height: number;
  label?: string;
};

export const DEFAULT_INDIVIDUAL_BANNER_TEMPLATES: IndividualBannerTemplate[] = [
  {
    id: 1,
    name: 'Padrão',
    primaryColor: '#3b82f6',
    secondaryColor: '#8b5cf6',
    gradientFrom: '#3b82f6',
    gradientTo: '#8b5cf6',
  },
  {
    id: 2,
    name: 'Escuro',
    primaryColor: '#111827',
    secondaryColor: '#111827',
    gradientFrom: '#070911',
    gradientTo: '#111827',
  },
  {
    id: 3,
    name: 'Vermelho',
    primaryColor: '#ef4444',
    secondaryColor: '#b91c1c',
    gradientFrom: '#ef4444',
    gradientTo: '#b91c1c',
  },
];

export const buildIndividualBannerTemplates = (brandColors?: {
  primary?: string;
  secondary?: string;
} | null): IndividualBannerTemplate[] => {
  if (brandColors?.primary && brandColors?.secondary) {
    return [
      {
        id: 100,
        name: 'Minha marca',
        primaryColor: brandColors.primary,
        secondaryColor: brandColors.secondary,
        gradientFrom: brandColors.primary,
        gradientTo: brandColors.secondary,
      },
      ...DEFAULT_INDIVIDUAL_BANNER_TEMPLATES,
    ];
  }
  return [...DEFAULT_INDIVIDUAL_BANNER_TEMPLATES];
};

`

fs.writeFileSync(outPath, `${header}\n${body}\n`)
console.log('wrote', outPath, 'lines', `${header}\n${body}\n`.split(/\n/).length)

// Slim modal: remove generateBanner block, add import + thin wrapper
const before = lines.slice(0, start)
const after = lines.slice(end)
let head = before.join('\n')

if (!head.includes('bulk-individual-layout')) {
  const marker = "from '../lib/banner/bulk-ranking-layout';"
  const pos = head.indexOf(marker)
  const insertAt = pos >= 0 ? head.indexOf('\n', pos) + 1 : head.indexOf('\n') + 1
  head =
    head.slice(0, insertAt) +
    `import {
  buildIndividualBannerTemplates,
  generateIndividualBanner,
  type IndividualBannerTemplate,
} from '../lib/banner/bulk-individual-layout';
` +
    head.slice(insertAt)
}

// Replace local BannerTemplate type usage - keep alias
head = head.replace(
  /type BannerTemplate = \{[\s\S]*?gradientTo: string;\n\};/,
  `type BannerTemplate = IndividualBannerTemplate;`
)

// Replace templates useMemo with buildIndividualBannerTemplates
const templatesStart = before.findIndex((l) => l.includes('const templates: BannerTemplate[] = useMemo'))
// We'll do string replace on head for templates block if still present
head = head.replace(
  /  const templates: BannerTemplate\[\] = useMemo\(\(\) => \{[\s\S]*?\}, \[user\?\.brandColors\?\.primary, user\?\.brandColors\?\.secondary\]\);/,
  `  const templates: BannerTemplate[] = useMemo(
    () => buildIndividualBannerTemplates(user?.brandColors),
    [user?.brandColors?.primary, user?.brandColors?.secondary]
  );`
)

const inject = `  const generateBanner = async (movie: MovieData, template: BannerTemplate, format: BannerFormat): Promise<Blob> =>
    generateIndividualBanner(movie, template, format);

`

const out = `${head}\n${inject}${after.join('\n')}\n`
fs.writeFileSync(modalPath, out)
console.log('modal lines', out.split(/\n/).length)
