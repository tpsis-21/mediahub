/**
 * Extrai wrapText..renderBannerBlob do ProfessionalBannerModal para
 * src/lib/banner/professional-layout.ts e deixa um wrapper fino no modal.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modalPath = path.join(root, 'src/components/ProfessionalBannerModal.tsx')
const outPath = path.join(root, 'src/lib/banner/professional-layout.ts')
const lines = fs.readFileSync(modalPath, 'utf8').split(/\r?\n/)

const idx = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i
  return -1
}

const wrapStart = idx(/^  const wrapText =/)
const renderEnd = idx(/^  const renderBannerBlobRef =/)
if (wrapStart < 0 || renderEnd < 0) {
  console.error({ wrapStart, renderEnd })
  process.exit(1)
}

const block = lines
  .slice(wrapStart, renderEnd)
  .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
  .join('\n')

const header = `import type { MovieData } from '../../services/searchService';
import { getPosterUrl } from './poster';
import { loadImageOrThrow } from './image';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../utils';

export type ProfessionalBannerTemplate = {
  id: number;
  name: string;
  layout: 'classic' | 'inspired';
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
};

export type ProfessionalBannerFormat = {
  width: number;
  height: number;
  label?: string;
};

export type ProfessionalBannerRenderInput = {
  movie: MovieData;
  template: ProfessionalBannerTemplate;
  format: ProfessionalBannerFormat;
  mime: 'image/png' | 'image/jpeg';
  quality: number;
  title: string;
  year: string | number;
  synopsis: string;
  rating: number;
  detailsRating?: number | null;
  mediaTypeLabel: string;
  tagLabel: string;
  brandLogo?: string | null;
  brandName?: string | null;
  includeFooterPhone?: boolean;
  includeFooterWebsite?: boolean;
  phone?: string | null;
  website?: string | null;
};

const WHATSAPP_ICON_URL = new URL('../../../anexos/pngtree-whatsapp-icon-png-image_6315990.png', import.meta.url).href;

const loadImage = (src: string) => loadImageOrThrow(src);

`

// Transform renderBannerBlob to exported function that uses input fields instead of closures
let body = block
  .replace(/^const loadImage = \(src: string\) => loadImageOrThrow\(src\);\n\n/m, '')
  .replace(
    /^const renderBannerBlob = async \(args: \{\n    template: BannerTemplate;\n    format: \{ width: number; height: number \};\n    mime: 'image\/png' \| 'image\/jpeg';\n    quality: number;\n  \}\): Promise<Blob> => \{/,
    `export const renderProfessionalBannerBlob = async (args: ProfessionalBannerRenderInput): Promise<Blob> => {
  const movie = args.movie;
  const title = args.title;
  const year = args.year;
  const synopsis = args.synopsis;
  const rating = args.rating;
  const detailsRating = args.detailsRating;
  const mediaType = args.mediaTypeLabel;
  const selectedTagLabel = args.tagLabel;
  const user = {
    brandLogo: args.brandLogo,
    brandName: args.brandName,
    phone: args.phone,
    website: args.website,
  };
  const includeFooterPhone = Boolean(args.includeFooterPhone);
  const includeFooterWebsite = Boolean(args.includeFooterWebsite);`
  )

fs.writeFileSync(outPath, `${header}\n${body}\n`)

// Slim modal: remove wrap..render block, add import + thin wrappers
const before = lines.slice(0, wrapStart)
const after = lines.slice(renderEnd)
let head = before.join('\n')

if (!head.includes('professional-layout')) {
  head = head.replace(
    "import { getPosterUrl, loadImageOrThrow } from '../lib/banner';",
    `import { getPosterUrl, loadImageOrThrow } from '../lib/banner';
import {
  renderProfessionalBannerBlob,
  type ProfessionalBannerTemplate,
} from '../lib/banner/professional-layout';`
  )
}

// Prefer type alias if BannerTemplate exists
head = head.replace(
  /type BannerTemplate = \{[\s\S]*?gradientTo: string;\n\};/,
  'type BannerTemplate = ProfessionalBannerTemplate;'
)

const inject = `  const renderBannerBlob = async (args: {
    template: BannerTemplate;
    format: { width: number; height: number };
    mime: 'image/png' | 'image/jpeg';
    quality: number;
  }): Promise<Blob> =>
    renderProfessionalBannerBlob({
      ...args,
      movie,
      title,
      year,
      synopsis,
      rating,
      detailsRating,
      mediaTypeLabel: mediaType,
      tagLabel: selectedTagLabel,
      brandLogo: user?.brandLogo,
      brandName: user?.brandName,
      includeFooterPhone,
      includeFooterWebsite,
      phone: user?.phone,
      website: user?.website,
    });

`

const out = `${head}\n${inject}${after.join('\n')}\n`
fs.writeFileSync(modalPath, out)
console.log('professional-layout lines', fs.readFileSync(outPath, 'utf8').split(/\n/).length)
console.log('modal lines', out.split(/\n/).length)
