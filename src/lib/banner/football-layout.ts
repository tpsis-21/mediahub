import { drawRoundedRect } from './canvas';
import { getDrawableImageIntrinsicSize, getFootballCrestCacheKey, isUsableCrestImageElement } from './crest';

export type BannerFormat = 'square' | 'story';

export type FootballMatch = {
  time: string;
  home: string;
  away: string;
  competition?: string;
  channels: string[];
  homeCrestUrl?: string;
  awayCrestUrl?: string;
  /** URL https original quando o servidor embute o escudo em data: — usado ao persistir cache sem estourar quota. */
  homeCrestUrlRemote?: string;
  awayCrestUrlRemote?: string;
};

export type FootballScheduleResponse = {
  date: string;
  updatedAt: string | null;
  matches: FootballMatch[];
};

const FOOTBALL_SCHEDULE_CACHE_KEY_V1 = 'football_schedule_cache_v1';
const getFootballScheduleCacheKey = (dateIso: string) => `football_schedule_cache_v3_${dateIso}`;

const parseClockTime = (value: string) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})(?::|h|H)(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Chave estável para seleção e remapeamento pós-refresh (horário normalizado + nomes NFC + espaços). */
const footballMatchKey = (match: Pick<FootballMatch, 'time' | 'home' | 'away'>) => {
  const rawTime = String(match.time ?? '').trim();
  const timePart = parseClockTime(rawTime) || rawTime.toLowerCase();
  const normName = (s: unknown) =>
    String(s ?? '')
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  return `${timePart}::${normName(match.home)}::${normName(match.away)}`;
};

const getSaoPauloNowParts = () => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const date = `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
  const time = `${map.get('hour')}:${map.get('minute')}`;
  return { date, time };
};

const addDaysToIsoDate = (isoDate: string, days: number) => {
  const base = new Date(`${isoDate}T12:00:00.000Z`);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
};

const getDefaultFootballScheduleDate = () => {
  const now = getSaoPauloNowParts();
  const currentTime = parseClockTime(now.time) || '';
  const cutoffTime = '19:00';
  if (!currentTime) return now.date;
  return currentTime >= cutoffTime ? addDaysToIsoDate(now.date, 1) : now.date;
};

const readCachedFootballSchedule = (expectedDate: string): FootballScheduleResponse | null => {
  try {
    const rawV2 = localStorage.getItem(getFootballScheduleCacheKey(expectedDate));
    if (rawV2) {
      const parsed: unknown = JSON.parse(rawV2);
      if (!parsed || typeof parsed !== 'object') return null;
      const record = parsed as { schedule?: unknown; cachedAt?: unknown };
      const cachedAt = typeof record.cachedAt === 'number' ? record.cachedAt : 0;
      if (!cachedAt || Date.now() - cachedAt > 12 * 60 * 60 * 1000) return null;
      const schedule = record.schedule as unknown;
      if (!schedule || typeof schedule !== 'object') return null;
      const s = schedule as FootballScheduleResponse;
      if (typeof s.date !== 'string' || !Array.isArray(s.matches)) return null;
      if (s.date !== expectedDate) return null;
      return normalizeFootballScheduleCrests(s);
    }

    const rawV1 = localStorage.getItem(FOOTBALL_SCHEDULE_CACHE_KEY_V1);
    if (!rawV1) return null;
    const parsed: unknown = JSON.parse(rawV1);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { schedule?: unknown; cachedAt?: unknown };
    const cachedAt = typeof record.cachedAt === 'number' ? record.cachedAt : 0;
    if (!cachedAt || Date.now() - cachedAt > 12 * 60 * 60 * 1000) return null;
    const schedule = record.schedule as unknown;
    if (!schedule || typeof schedule !== 'object') return null;
    const s = schedule as FootballScheduleResponse;
    if (typeof s.date !== 'string' || !Array.isArray(s.matches)) return null;
    if (s.date !== expectedDate) return null;
    writeCachedFootballSchedule(s);
    return normalizeFootballScheduleCrests(s);
  } catch {
    return null;
  }
};

const stripInlineCrestsForStorage = (schedule: FootballScheduleResponse): FootballScheduleResponse => ({
  ...schedule,
  matches: (schedule.matches || []).map((m) => {
    const homeRemote = typeof m.homeCrestUrlRemote === 'string' ? m.homeCrestUrlRemote.trim() : '';
    const awayRemote = typeof m.awayCrestUrlRemote === 'string' ? m.awayCrestUrlRemote.trim() : '';
    const home =
      typeof m.homeCrestUrl === 'string' && m.homeCrestUrl.startsWith('data:')
        ? homeRemote || ''
        : m.homeCrestUrl;
    const away =
      typeof m.awayCrestUrl === 'string' && m.awayCrestUrl.startsWith('data:')
        ? awayRemote || ''
        : m.awayCrestUrl;
    const { homeCrestUrlRemote: _hr, awayCrestUrlRemote: _ar, ...rest } = m;
    return {
      ...rest,
      homeCrestUrl: home,
      awayCrestUrl: away,
      ...(homeRemote ? { homeCrestUrlRemote: homeRemote } : {}),
      ...(awayRemote ? { awayCrestUrlRemote: awayRemote } : {}),
    };
  }),
});

const writeCachedFootballSchedule = (schedule: FootballScheduleResponse) => {
  try {
    const dateIso = typeof schedule?.date === 'string' ? schedule.date.trim() : '';
    if (!dateIso) return;
    const key = getFootballScheduleCacheKey(dateIso);
    const payload = { cachedAt: Date.now(), schedule };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      localStorage.setItem(key, JSON.stringify({ ...payload, schedule: stripInlineCrestsForStorage(schedule) }));
    }
  } catch {
    return;
  }
};

const formatDatePtBr = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('pt-BR');
};

const buildMatchesText = (date: string, matches: FootballMatch[]) => {
  const lines: string[] = [];
  lines.push(`Jogos - ${formatDatePtBr(date)}`);
  lines.push('');
  for (const m of matches) {
    const competition = typeof m.competition === 'string' && m.competition.trim() ? ` [${m.competition.trim()}]` : '';
    const channels = m.channels?.length ? ` — ${m.channels.join(', ')}` : '';
    lines.push(`${m.time} • ${m.home} x ${m.away}${competition}${channels}`);
  }
  return lines.join('\n');
};

const getCanvasFontStack = () => 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export type FootballBannerTemplateId = 'informativo' | 'clean' | 'promo';

type FootballBannerTemplate = {
  id: FootballBannerTemplateId;
  name: string;
  description: string;
  resolution: string;
  previewUrl: string;
};

const FOOTBALL_BANNER_TEMPLATES: FootballBannerTemplate[] = [
  {
    id: 'informativo',
    name: 'Modelo 1 - Informativo',
    description: 'Layout tradicional com leitura direta dos confrontos.',
    resolution: '1080×1350 px',
    // public/ + dist (Vite/Express em /previews); anexos como fallback na API :8081
    previewUrl: '/previews/template-informativo.png',
  },
  {
    id: 'promo',
    name: 'Modelo 2 - Diagonal',
    description: 'Layout com faixa diagonal para destaque de canais e horário.',
    resolution: '1080×1350 px',
    previewUrl: '/previews/template-promo.png',
  },
  {
    id: 'clean',
    name: 'Modelo 3 - Kit Oficial',
    description: 'Layout oficial baseado nos assets do Modelo 3.',
    resolution: '1080×1350 px',
    previewUrl: '/previews/template-clean.png',
  },
];

const FOOTBALL_TEMPLATE_DEFAULT_COLORS: Record<FootballBannerTemplateId, { primary: string; secondary: string }> = {
  informativo: { primary: '#0F172A', secondary: '#1D4ED8' },
  clean: { primary: '#0F172A', secondary: '#22C55E' },
  promo: { primary: '#0B3A27', secondary: '#1F8A4C' },
};

const FOOTBALL_BACKGROUND_URL = new URL('../../anexos/soccer-sport-environment-filed.jpg', import.meta.url).href;
const FOOTBALL_PROMO_BG_URLS = [
  '/anexos/modelo%202jogos%20do%20dia/fundo.png',
  '/anexos/modelo 2jogos do dia/fundo.png',
  new URL('../../anexos/modelo 2jogos do dia/fundo.png', import.meta.url).href,
];
const FOOTBALL_PROMO_TITLE_URLS = [
  '/anexos/modelo%202jogos%20do%20dia/jogos-do-dia.png',
  '/anexos/modelo 2jogos do dia/jogos-do-dia.png',
  new URL('../../anexos/modelo 2jogos do dia/jogos-do-dia.png', import.meta.url).href,
];
const FOOTBALL_PROMO_DATE_BADGE_URLS = [
  '/anexos/modelo%202jogos%20do%20dia/dia-e-mes.png',
  '/anexos/modelo 2jogos do dia/dia-e-mes.png',
  new URL('../../anexos/modelo 2jogos do dia/dia-e-mes.png', import.meta.url).href,
];
const FOOTBALL_PROMO_FLAGS_URLS = [
  '/anexos/modelo%202jogos%20do%20dia/flags-jogos.png?v=promo-flags-v2',
  '/anexos/modelo 2jogos do dia/flags-jogos.png?v=promo-flags-v2',
  `${new URL('../../anexos/modelo 2jogos do dia/flags-jogos.png', import.meta.url).href}?v=promo-flags-v2`,
];
const FOOTBALL_PROMO_FLAG_URLS = [
  '/anexos/modelo%202jogos%20do%20dia/flag1.png',
  '/anexos/modelo 2jogos do dia/flag1.png',
  new URL('../../anexos/modelo 2jogos do dia/flag1.png', import.meta.url).href,
];
const FOOTBALL_MODEL3_BG_URLS = [
  '/anexos/modelo%203/fundo.png',
  '/anexos/modelo 3/fundo.png',
  new URL('../../anexos/modelo 3/fundo.png', import.meta.url).href,
];
const FOOTBALL_MODEL3_TITLE_URLS = [
  '/anexos/modelo%203/jogos%20do%20dia2.png?v=modelo3-title-v2',
  '/anexos/modelo 3/jogos do dia2.png?v=modelo3-title-v2',
  `${new URL('../../anexos/modelo 3/jogos do dia2.png', import.meta.url).href}?v=modelo3-title-v2`,
  '/anexos/modelo%203/jogos%20do%20dia.png',
  '/anexos/modelo 3/jogos do dia.png',
  '/anexos/modelo%203/jgos%20do%20dia.png',
  '/anexos/modelo 3/jgos do dia.png',
  new URL('../../anexos/modelo 3/jogos do dia.png', import.meta.url).href,
  new URL('../../anexos/modelo 3/jgos do dia.png', import.meta.url).href,
];
const FOOTBALL_MODEL3_FLAG_URLS = [
  '/anexos/modelo%203/flag-jogos2.png?v=modelo3-flag-v8',
  '/anexos/modelo 3/flag-jogos2.png?v=modelo3-flag-v8',
  `${new URL('../../anexos/modelo 3/flag-jogos2.png', import.meta.url).href}?v=modelo3-flag-v8`,
  '/anexos/modelo%203/flag-jogos.png?v=modelo3-flag-v8',
  '/anexos/modelo 3/flag-jogos.png?v=modelo3-flag-v8',
  `${new URL('../../anexos/modelo 3/flag-jogos.png', import.meta.url).href}?v=modelo3-flag-v8`,
];
const FOOTBALL_WHATSAPP_ICON_URLS = [
  '/anexos/pngtree-whatsapp-icon-png-image_6315990.png',
  '/anexos/pngtree-whatsapp-icon-png-image_6315990.png?v=wa-icon-v1',
  `${new URL('../../anexos/pngtree-whatsapp-icon-png-image_6315990.png', import.meta.url).href}?v=wa-icon-v1`,
];


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

let dbgDrawImageSafeFailLogs = 0;
let dbgCrestInputSummaryLogs = 0;

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const toTeamInitials = (teamName: string) => {
  const normalized = stripDiacritics(String(teamName || '').trim()).toUpperCase();
  const parts = normalized.split(/\s+/).filter(Boolean);
  const noise = new Set(['FC', 'EC', 'SC', 'AC', 'CF', 'CD', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'THE']);
  const candidates = parts.filter((p) => !noise.has(p));
  const source = candidates.length ? candidates : parts;
  if (!source.length) return '—';
  if (source.length === 1) return source[0].slice(0, 2);
  return `${source[0][0] || ''}${source[source.length - 1][0] || ''}`.slice(0, 2);
};

const hashString = (value: string) => {
  const s = String(value || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const isPlaceholderCrestUrl = (value: string) => String(value || '').includes('/assets/img/loadteam.png');
const hasRenderableCrest = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return !isPlaceholderCrestUrl(raw);
};

/** Usa homeCrestUrlRemote/away quando o principal vier vazio ou for placeholder (API + cache). */
const mergeFootballMatchCrestSources = (m: FootballMatch): FootballMatch => {
  const home = typeof m.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : '';
  const away = typeof m.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : '';
  const hr = typeof m.homeCrestUrlRemote === 'string' ? m.homeCrestUrlRemote.trim() : '';
  const ar = typeof m.awayCrestUrlRemote === 'string' ? m.awayCrestUrlRemote.trim() : '';
  let homeCrestUrl = home;
  if (!homeCrestUrl || isPlaceholderCrestUrl(homeCrestUrl)) homeCrestUrl = hr || homeCrestUrl;
  let awayCrestUrl = away;
  if (!awayCrestUrl || isPlaceholderCrestUrl(awayCrestUrl)) awayCrestUrl = ar || awayCrestUrl;
  return { ...m, homeCrestUrl, awayCrestUrl };
};

const normalizeFootballScheduleCrests = (schedule: FootballScheduleResponse): FootballScheduleResponse => ({
  ...schedule,
  matches: Array.isArray(schedule.matches) ? schedule.matches.map(mergeFootballMatchCrestSources) : [],
});

const computeFootballBannerItemsPerPage = (args: {
  format: BannerFormat;
  templateId: FootballBannerTemplateId;
  footerText?: string;
}) => {
  if (args.templateId === 'promo') {
    return 6;
  }

  const height = args.format === 'square' ? 1350 : 1920;
  const pad = args.format === 'square' ? 72 : 86;
  const headerH = args.format === 'square' ? 240 : 280;
  const rowHBase = args.format === 'square' ? 108 : 118;
  const footerH = args.footerText ? (args.format === 'square' ? 120 : 140) : 0;
  const listY = pad + headerH + (args.format === 'square' ? 28 : 36);
  const listH = height - listY - pad - footerH;

  if (args.templateId === 'clean') {
    // Modelo 3: fixo em 5 jogos por página.
    return 5;
  }
  return Math.max(6, Math.min(12, Math.floor((listH - 56) / rowHBase)));
};

const generateFootballBanner = async (args: {
  brandPrimary: string;
  brandSecondary: string;
  brandName?: string;
  brandLogo?: string;
  footerText?: string;
  footerContactType?: 'phone' | 'website';
  date: string;
  matches: FootballMatch[];
  format: BannerFormat;
  templateId: FootballBannerTemplateId;
  pageIndex?: number;
  pageCount?: number;
  preloadedLogoImg?: HTMLImageElement | null;
  preloadedBackgroundImg?: HTMLImageElement | null;
  crestCache?: Map<string, HTMLImageElement | null>;
}) => {
  const width = 1080;
  const height = args.format === 'square' ? 1350 : 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');

  const pageIndex = typeof args.pageIndex === 'number' && Number.isFinite(args.pageIndex) ? Math.max(0, Math.floor(args.pageIndex)) : 0;
  const pageCount = typeof args.pageCount === 'number' && Number.isFinite(args.pageCount) ? Math.max(1, Math.floor(args.pageCount)) : 1;

  const pad = args.format === 'square' ? 72 : 86;
  const headerH = args.format === 'square' ? 240 : 280;
  const rowHBase = args.format === 'square' ? 108 : 118;
  const footerH = args.footerText ? (args.format === 'square' ? 120 : 140) : 0;

  const parseHex = (input: string) => {
    const raw = String(input || '').trim();
    const hex = raw.startsWith('#') ? raw.slice(1) : raw;
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    const int = Number.parseInt(full, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  };

  const rgb = (c: { r: number; g: number; b: number }, a = 1) => `rgba(${c.r},${c.g},${c.b},${a})`;

  const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    return {
      r: clamp(a.r + (b.r - a.r) * t),
      g: clamp(a.g + (b.g - a.g) * t),
      b: clamp(a.b + (b.b - a.b) * t),
    };
  };

  const brandPrimaryRgb = parseHex(args.brandPrimary) || { r: 37, g: 99, b: 235 };
  const brandSecondaryRgb = parseHex(args.brandSecondary) || { r: 124, g: 58, b: 237 };
  const whiteRgb = { r: 255, g: 255, b: 255 };
  const blackRgb = { r: 0, g: 0, b: 0 };

  const fitText = (value: string, maxWidth: number) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = '…';
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const candidate = `${text.slice(0, mid).trim()}${ellipsis}`;
      if (ctx.measureText(candidate).width <= maxWidth) lo = mid + 1;
      else hi = mid;
    }
    const cut = Math.max(0, lo - 1);
    return `${text.slice(0, cut).trim()}${ellipsis}`;
  };

  const canvasToPngBlob = async () => {
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/png');
      });
      if (blob) return blob;
    } catch {
      // ignore
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      return await (await fetch(dataUrl)).blob();
    } catch {
      return new Blob([], { type: 'image/png' });
    }
  };

  const pageIndicator = pageCount > 1 ? `PÁG ${pageIndex + 1}/${pageCount}` : '';
  const logoImg = args.preloadedLogoImg !== undefined ? args.preloadedLogoImg : await loadBrandLogoImage(args.brandLogo || '');
  const backgroundImg = args.preloadedBackgroundImg !== undefined ? args.preloadedBackgroundImg : await loadImage(FOOTBALL_BACKGROUND_URL);
  const fontStack = getCanvasFontStack();
  const crestImages = args.crestCache ?? new Map<string, HTMLImageElement | null>();
  const ensureCrestImages = async (rawUrls: string[]) => {
    const uniqueRaw = Array.from(new Set(rawUrls.filter(Boolean)));
    const missingRaw = uniqueRaw.filter((raw) => {
      const key = getFootballCrestCacheKey(raw);
      return Boolean(key) && !crestImages.has(key);
    });
    if (missingRaw.length === 0) return;
    const crestDbgSamples: { urlKind: string; keyTail: string; imgOk: boolean; nw: number }[] = [];
    const loadOne = async (raw: string, skipSample?: boolean) => {
      const key = getFootballCrestCacheKey(raw);
      if (!key) return;
      const img = await loadFootballCrestImage(raw);
      // Não cachear elemento “morto” (0×0 não-SVG): bloqueava o 2.º passe de retry e o canvas ficava sem escudo.
      if (img && isUsableCrestImageElement(img)) crestImages.set(key, img);
      if (!skipSample && crestDbgSamples.length < 8) {
        const urlKind = raw.startsWith('data:') ? `data:${raw.length}` : raw.startsWith('/') ? 'path' : 'remote';
        const nw = img ? img.naturalWidth || img.width || 0 : 0;
        crestDbgSamples.push({
          urlKind,
          keyTail: key.length > 48 ? `…${key.slice(-44)}` : key,
          imgOk: isUsableCrestImageElement(img),
          nw,
        });
      }
    };
    // Rajada ilimitada para o mesmo host (proxy / API) tende a falhas transitórias (timeouts, fila no Node).
    const crestLoadConcurrency = 4;
    for (let i = 0; i < missingRaw.length; i += crestLoadConcurrency) {
      const chunk = missingRaw.slice(i, i + crestLoadConcurrency);
      await Promise.all(chunk.map((raw) => loadOne(raw)));
    }
    const stillMissing = missingRaw.filter((raw) => {
      const key = getFootballCrestCacheKey(raw);
      return Boolean(key) && !crestImages.has(key);
    });
    if (stillMissing.length > 0) {
      for (let i = 0; i < stillMissing.length; i += crestLoadConcurrency) {
        const chunk = stillMissing.slice(i, i + crestLoadConcurrency);
        await Promise.all(chunk.map((raw) => loadOne(raw, true)));
      }
    }
    // #region agent log
    postFootballBannerDebugLog({
      hypothesisId: 'H1,H2,H3',
      location: 'FootballBannerModal.tsx:ensureCrestImages',
      message: 'crest_batch',
      data: {
        missing: missingRaw.length,
        retrySecondPass: stillMissing.length,
        crestLoadConcurrency,
        samples: crestDbgSamples,
      },
    });
    // #endregion
  };

  const drawCoverImage = (img: HTMLImageElement, x: number, y: number, w: number, h: number, opts?: { alignY?: number }) => {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s;
    const dh = ih * s;
    const alignY = typeof opts?.alignY === 'number' && Number.isFinite(opts.alignY) ? Math.max(0, Math.min(1, opts.alignY)) : 0.5;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) * alignY;
    ctx.drawImage(img, dx, dy, dw, dh);
  };
  const drawImageSafe = (img: HTMLImageElement | null, x: number, y: number, w: number, h: number) => {
    if (!img) return false;
    const { iw, ih } = getDrawableImageIntrinsicSize(img);
    if (!iw || !ih) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    if (w <= 0 || h <= 0) return false;
    try {
      ctx.drawImage(img, x, y, w, h);
      return true;
    } catch (e) {
      // #region agent log
      if (dbgDrawImageSafeFailLogs < 8) {
        dbgDrawImageSafeFailLogs += 1;
        postFootballBannerDebugLog({
          hypothesisId: 'H8',
          location: 'FootballBannerModal.tsx:drawImageSafe',
          message: 'drawImage_threw',
          data: { err: String(e), iw, ih },
        });
      }
      // #endregion
      return false;
    }
  };
  const drawImageCropSafe = (
    img: HTMLImageElement | null,
    source: { sx: number; sy: number; sw: number; sh: number },
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    if (!img) return false;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    if (w <= 0 || h <= 0) return false;
    const sx = Math.max(0, Math.min(iw - 1, Math.floor(source.sx)));
    const sy = Math.max(0, Math.min(ih - 1, Math.floor(source.sy)));
    const sw = Math.max(1, Math.min(iw - sx, Math.floor(source.sw)));
    const sh = Math.max(1, Math.min(ih - sy, Math.floor(source.sh)));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    return true;
  };

  const drawPromoTemplate = async () => {
    const promoBgImg = await loadImageFirstAvailable(FOOTBALL_PROMO_BG_URLS);
    const promoTitleImg = await loadImageFirstAvailable(FOOTBALL_PROMO_TITLE_URLS);
    const promoFlagsImg = await loadImageFirstAvailable(FOOTBALL_PROMO_FLAGS_URLS);

    const promoPrimary = mix(brandPrimaryRgb, blackRgb, 0.22);
    const promoSecondary = mix(brandSecondaryRgb, blackRgb, 0.12);
    const promoAccent = mix(brandSecondaryRgb, whiteRgb, 0.56);
    const promoTextDark = mix(brandPrimaryRgb, blackRgb, 0.52);
    const promoCardDark = mix(brandPrimaryRgb, blackRgb, 0.34);

    if (promoBgImg) {
      drawImageSafe(promoBgImg, 10, 35, 1060, 1280);
    } else if (backgroundImg) {
      drawCoverImage(backgroundImg, 0, 0, width, height, { alignY: 0.6 });
    }

    // Aplica as cores da marca no template promo sem destruir o layout base.
    const promoOverlay = ctx.createLinearGradient(0, 0, width, height);
    promoOverlay.addColorStop(0, rgb(promoPrimary, 0.28));
    promoOverlay.addColorStop(1, rgb(promoSecondary, 0.22));
    ctx.fillStyle = promoOverlay;
    ctx.fillRect(0, 0, width, height);

    const titleW = promoTitleImg ? 640 : 0;
    const titleH = promoTitleImg ? Math.round((promoTitleImg.naturalHeight / Math.max(1, promoTitleImg.naturalWidth)) * titleW) : 0;
    const headerStartX = titleW > 0 ? Math.round((width - titleW) / 2) : 52;
    const headerY = 148;

    if (promoTitleImg) {
      drawImageSafe(promoTitleImg, headerStartX, headerY, titleW, titleH);
    }

    const [dd, mm] = formatDatePtBr(args.date).split('/');
    const monthLabel = ({
      '01': 'JAN', '02': 'FEV', '03': 'MAR', '04': 'ABR', '05': 'MAI', '06': 'JUN',
      '07': 'JUL', '08': 'AGO', '09': 'SET', '10': 'OUT', '11': 'NOV', '12': 'DEZ',
    } as Record<string, string>)[String(mm || '').padStart(2, '0')] || String(mm || '').trim();
    const dayText = String(dd || '').trim();
    const dayArea = titleW > 0
      ? {
          x: headerStartX + titleW * 0.786,
          y: headerY + titleH * 0.265,
          w: titleW * 0.132,
          h: titleH * 0.475,
        }
      : { x: width - 236, y: headerY + 28, w: 104, h: 64 };
    const monthArea = titleW > 0
      ? {
          x: headerStartX + titleW * 0.931,
          y: headerY + titleH * 0.265,
          w: titleW * 0.056,
          h: titleH * 0.475,
        }
      : { x: width - 132, y: headerY + 28, w: 38, h: 64 };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgb(promoTextDark, 0.98);
    ctx.font = `900 66px ${fontStack}`;
    const dayMetrics = ctx.measureText(dayText || '00');
    const dayAscent = dayMetrics.actualBoundingBoxAscent || 0;
    const dayDescent = dayMetrics.actualBoundingBoxDescent || 0;
    const dayBaselineY = dayArea.y + dayArea.h / 2 + (dayAscent - dayDescent) / 2;
    const dayOpticalCenterX = dayArea.x + dayArea.w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(dayArea.x, dayArea.y, dayArea.w, dayArea.h);
    ctx.clip();
    ctx.fillText(dayText, dayOpticalCenterX, dayBaselineY);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 2;
    ctx.font = `900 32px ${fontStack}`;
    const monthMetrics = ctx.measureText(monthLabel || 'JAN');
    const monthAscent = monthMetrics.actualBoundingBoxAscent || 0;
    const monthDescent = monthMetrics.actualBoundingBoxDescent || 0;
    const monthBaseline = (monthAscent - monthDescent) / 2;
    ctx.translate(monthArea.x + monthArea.w / 2, monthArea.y + monthArea.h / 2);
    ctx.beginPath();
    ctx.rect(-monthArea.w / 2, -monthArea.h / 2, monthArea.w, monthArea.h);
    ctx.clip();
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(monthLabel, 0, monthBaseline);
    ctx.restore();

    const rowsMax = 6;
    const visibleCount = Math.min(args.matches.length, rowsMax);
    const items = args.matches.slice(0, visibleCount);
    const crestUrlList = items
      .flatMap((m) => [m.homeCrestUrl || '', m.awayCrestUrl || ''])
      .filter((u) => Boolean(u) && !isPlaceholderCrestUrl(u));
    // #region agent log
    if (dbgCrestInputSummaryLogs < 6) {
      dbgCrestInputSummaryLogs += 1;
      postFootballBannerDebugLog({
        hypothesisId: 'H16',
        location: 'FootballBannerModal.tsx:drawPromoTemplate',
        message: 'crest_input_summary',
        data: {
          templateId: 'promo',
          items: items.length,
          crestCandidates: crestUrlList.length,
          missingAny: items.filter((m) => !hasRenderableCrest(m.homeCrestUrl) || !hasRenderableCrest(m.awayCrestUrl)).length,
        },
      });
    }
    // #endregion
    await ensureCrestImages(crestUrlList);

    const rowRatio = promoFlagsImg ? ((promoFlagsImg.naturalHeight || promoFlagsImg.height) / Math.max(1, (promoFlagsImg.naturalWidth || promoFlagsImg.width))) : (124 / 727);
    const firstRowY = 340;
    const rowGap = 10;
    const rowsBottomLimit = 1160;
    const rowsCount = Math.max(1, visibleCount);
    const availableRowsH = rowsBottomLimit - firstRowY - rowGap * (rowsCount - 1);
    const rowH = Math.max(94, Math.min(124, Math.floor(availableRowsH / rowsCount)));
    const rowsBlockH = rowH * rowsCount + rowGap * (rowsCount - 1);
    const firstVisibleRowY = Math.max(firstRowY, Math.round((firstRowY + rowsBottomLimit - rowsBlockH) / 2));
    const rowW = Math.floor(rowH / Math.max(0.0001, rowRatio));
    const rowX = Math.round((width - rowW) / 2);
    const sx = rowW / 727;
    const sy = rowH / 124;

    const drawContain = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const { iw, ih } = getDrawableImageIntrinsicSize(img);
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      drawImageSafe(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = firstVisibleRowY + i * (rowH + rowGap);
      const home = String(item.home || '').trim();
      const away = String(item.away || '').trim();
      const when = String(item.time || '').trim();
      const competition = String(item.competition || '').trim() || 'Campeonato não informado';
      const channels = item.channels?.length ? item.channels.join(' • ') : '';
      const channelsLabel = channels || 'Canais não informados';

      if (promoFlagsImg) {
        drawImageSafe(promoFlagsImg, rowX, y, rowW, rowH);
      }

      const homeKey = getFootballCrestCacheKey(item.homeCrestUrl || '');
      const awayKey = getFootballCrestCacheKey(item.awayCrestUrl || '');
      const homeImg = homeKey && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(homeKey) || null : null;
      const awayImg = awayKey && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(awayKey) || null : null;

      if (i === 0) {
        // #region agent log
        postFootballBannerDebugLog({
          hypothesisId: 'H2,H4',
          location: 'FootballBannerModal.tsx:drawPromoRow0',
          message: 'crest_lookup_canvas',
          data: {
            templateId: 'promo',
            mapHasHome: homeKey ? crestImages.has(homeKey) : false,
            mapHasAway: awayKey ? crestImages.has(awayKey) : false,
            homeNw: homeImg ? homeImg.naturalWidth || homeImg.width || 0 : 0,
            awayNw: awayImg ? awayImg.naturalWidth || awayImg.width || 0 : 0,
          },
        });
        // #endregion
      }

      const homeBox = { x: rowX + 87 * sx, y: y + 18 * sy, w: 242 * sx, h: 35 * sy };
      const awayBox = { x: rowX + 398 * sx, y: y + 18 * sy, w: 238 * sx, h: 35 * sy };
      const midX = rowX + (364 * sx);
      const namesCenterY = homeBox.y + homeBox.h / 2;
      const crestSize = args.format === 'square' ? 84 : 112;
      const crestY = namesCenterY - crestSize / 2;
      const leftBox = { x: rowX - crestSize / 2, y: crestY, w: crestSize, h: crestSize };
      const rightBox = { x: rowX + rowW - crestSize / 2, y: crestY, w: crestSize, h: crestSize };
      const drawCrestFallback = (box: { x: number; y: number; w: number; h: number }, team: string) => {
        const initials = toTeamInitials(team);
        const hue = hashString(team) % 360;
        drawRoundedRect(ctx, box.x + 6, box.y + 6, box.w - 12, box.h - 12, 10);
        ctx.fillStyle = `hsl(${hue} 58% 34%)`;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(20, Math.floor((box.h - 12) * 0.28))}px ${fontStack}`;
        ctx.fillText(initials, box.x + box.w / 2, box.y + box.h / 2);
      };
      if (homeImg) drawContain(homeImg, leftBox.x + 4, leftBox.y + 4, leftBox.w - 8, leftBox.h - 8);
      else drawCrestFallback(leftBox, home);
      if (awayImg) drawContain(awayImg, rightBox.x + 4, rightBox.y + 4, rightBox.w - 8, rightBox.h - 8);
      else drawCrestFallback(rightBox, away);

      ctx.textBaseline = 'middle';
      const teamFontSize = Math.max(34, Math.round(42 * sy));
      ctx.font = `900 ${teamFontSize}px ${fontStack}`;
      ctx.fillStyle = rgb(promoTextDark, 0.98);
      const competitionY = y + 4 * sy;
      const competitionW = 300 * sx;
      const competitionH = 16 * sy;
      drawRoundedRect(ctx, midX - competitionW / 2, competitionY - competitionH / 2, competitionW, competitionH, 8);
      ctx.fillStyle = rgb(promoCardDark, 0.92);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = rgb(whiteRgb, 0.98);
      ctx.font = `800 14px ${fontStack}`;
      ctx.fillText(fitText(competition.toUpperCase(), competitionW - 14), midX, competitionY, competitionW - 14);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgb(promoTextDark, 0.98);
      const drawTeamNameCentered = (label: string, box: { x: number; y: number; w: number; h: number }) => {
        const text = fitText(label.toUpperCase(), Math.max(0, box.w - 14));
        const metrics = ctx.measureText(text || 'A');
        const ascent = metrics.actualBoundingBoxAscent || 0;
        const descent = metrics.actualBoundingBoxDescent || 0;
        const baselineY = box.y + box.h / 2 + (ascent - descent) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.fillText(text, box.x + box.w / 2, baselineY, Math.max(0, box.w - 14));
        ctx.restore();
      };
      drawTeamNameCentered(home, homeBox);
      drawTeamNameCentered(away, awayBox);
      // O novo asset do flag já possui o "X" de confronto no layout.
      // Não desenhar outro "X" para evitar duplicidade visual.

      ctx.fillStyle = rgb(whiteRgb, 0.95);
      const channelsFontSize = Math.max(13, Math.round(15 * sy));
      ctx.font = `700 ${channelsFontSize}px ${fontStack}`;
      // Ajuste fino para o novo asset de flag: canais e horário no mesmo eixo vertical.
      const metaBox = { x: rowX + 132 * sx, y: y + 80 * sy, w: 322 * sx, h: 24 * sy };
      const timeBox = { x: rowX + 506 * sx, y: y + 80 * sy, w: 66 * sx, h: 24 * sy };
      const channelsMaxW = metaBox.w - 14;
      const channelsRawW = ctx.measureText(channelsLabel).width;
      if (channelsRawW <= channelsMaxW) {
        ctx.textAlign = 'center';
        ctx.fillText(channelsLabel, metaBox.x + metaBox.w / 2, metaBox.y + metaBox.h / 2, channelsMaxW);
      } else {
        // Mesmo truncado, mantém centralizado para não aparentar desalinhamento no flag.
        ctx.textAlign = 'center';
        ctx.fillText(fitText(channelsLabel, metaBox.w - 16), metaBox.x + metaBox.w / 2, metaBox.y + metaBox.h / 2, metaBox.w - 16);
      }

      ctx.fillStyle = rgb(promoTextDark, 0.98);
      const timeFontSize = Math.max(17, Math.round(20 * sy));
      ctx.font = `900 ${timeFontSize}px ${fontStack}`;
      ctx.textAlign = 'center';
      ctx.fillText(when, timeBox.x + timeBox.w / 2, timeBox.y + timeBox.h / 2, timeBox.w - 8);
    }

    const transmissionText = (args.footerText || '').trim();
    if (transmissionText) {
      const dynamicFooterY = Math.round(firstVisibleRowY + rowsBlockH + 28);
      const footerY = Math.min(1192, Math.max(1086, dynamicFooterY));
      const leftBadgeX = 74;
      const leftBadgeH = 42;
      const rightBarX = leftBadgeX;
      const rightBarW = 932;
      drawRoundedRect(ctx, rightBarX, footerY, rightBarW, leftBadgeH, 10);
      ctx.fillStyle = rgb(promoCardDark, 0.9);
      ctx.fill();
      ctx.strokeStyle = rgb(promoAccent, 0.86);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = rgb(promoAccent, 0.96);
      ctx.font = `700 22px ${fontStack}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(transmissionText, rightBarW - 26), rightBarX + rightBarW / 2, footerY + leftBadgeH / 2 + 1, rightBarW - 26);
    }

    
  };

  const drawModel3Template = async () => {
    const model3BgImg = await loadImageFirstAvailable(FOOTBALL_MODEL3_BG_URLS);
    const model3TitleImg = await loadImageFirstAvailable(FOOTBALL_MODEL3_TITLE_URLS);
    const model3FlagRawImg = await loadImageFirstAvailable(FOOTBALL_MODEL3_FLAG_URLS);
    const whatsappIconImg = await loadImageFirstAvailable(FOOTBALL_WHATSAPP_ICON_URLS);
    const fallbackFlagImg = await loadImageFirstAvailable(FOOTBALL_PROMO_FLAGS_URLS);
    const model3FlagImg = model3FlagRawImg || fallbackFlagImg;

    if (model3BgImg) {
      drawImageSafe(model3BgImg, 0, 0, width, height);
    } else if (backgroundImg) {
      drawCoverImage(backgroundImg, 0, 0, width, height, { alignY: 0.62 });
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, 'rgba(0,0,0,0.08)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    const titleY = args.format === 'square' ? 72 : 94;
    const titleW = model3TitleImg ? Math.min(args.format === 'square' ? 760 : 860, width - 120) : 0;
    const titleH = model3TitleImg ? Math.round((model3TitleImg.naturalHeight / Math.max(1, model3TitleImg.naturalWidth)) * titleW) : 0;
    const titleX = titleW > 0 ? Math.round((width - titleW) / 2) : 56;
    if (model3TitleImg && titleW > 0 && titleH > 0) {
      drawImageSafe(model3TitleImg, titleX, titleY, titleW, titleH);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(216,255,108,0.96)';
      ctx.font = `900 ${args.format === 'square' ? 82 : 94}px ${fontStack}`;
      ctx.fillText('JOGOS DO DIA', 72, titleY + 14);
    }

    const rowsMax = 5;
    const visibleCount = Math.min(args.matches.length, rowsMax);
    const items = args.matches.slice(0, visibleCount);
    const crestUrlList = items
      .flatMap((m) => [m.homeCrestUrl || '', m.awayCrestUrl || ''])
      .filter((u) => Boolean(u) && !isPlaceholderCrestUrl(u));
    // #region agent log
    if (dbgCrestInputSummaryLogs < 6) {
      dbgCrestInputSummaryLogs += 1;
      postFootballBannerDebugLog({
        hypothesisId: 'H16',
        location: 'FootballBannerModal.tsx:drawModel3Template',
        message: 'crest_input_summary',
        data: {
          templateId: 'clean',
          items: items.length,
          crestCandidates: crestUrlList.length,
          missingAny: items.filter((m) => !hasRenderableCrest(m.homeCrestUrl) || !hasRenderableCrest(m.awayCrestUrl)).length,
        },
      });
    }
    // #endregion
    await ensureCrestImages(crestUrlList);

    // Usa o próprio arquivo do modelo 3; se vier com canvas grande, recorta a faixa útil automaticamente.
    const flagImageWidth = model3FlagImg ? (model3FlagImg.naturalWidth || model3FlagImg.width || 2048) : 2048;
    const flagImageHeight = model3FlagImg ? (model3FlagImg.naturalHeight || model3FlagImg.height || 281) : 281;
    const flagImageRatio = flagImageHeight / Math.max(1, flagImageWidth);
    const model3FlagSourceRect =
      flagImageRatio > 0.4
        ? {
            sx: 0,
            sy: Math.floor(flagImageHeight * 0.26),
            sw: flagImageWidth,
            sh: Math.max(1, Math.floor(flagImageHeight * 0.20)),
          }
        : { sx: 0, sy: 0, sw: flagImageWidth, sh: flagImageHeight };
    const rowRatio = model3FlagSourceRect.sh / Math.max(1, model3FlagSourceRect.sw);
    const titleBottomY = titleY + (titleH > 0 ? titleH : 84);
    const rowsTop = titleBottomY + 34;
    const rowsBottom = args.footerText ? 1168 : 1244;
    const rowsCount = Math.max(1, visibleCount);
    const rowGap = 10;
    const availableRowsH = rowsBottom - rowsTop - rowGap * (rowsCount - 1);

    // Malha fixa para evitar variação caótica entre cenários.
    let rowW = Math.min(width - 90, 1020);
    let rowH = Math.floor(rowW * rowRatio);
    const maxRowHBySpace = Math.max(92, Math.floor(availableRowsH / rowsCount));
    if (rowH > maxRowHBySpace) {
      rowH = maxRowHBySpace;
      rowW = Math.floor(rowH / Math.max(0.0001, rowRatio));
      rowW = Math.min(rowW, width - 90);
      rowH = Math.floor(rowW * rowRatio);
    }
    const rowsBlockH = rowH * rowsCount + rowGap * (rowsCount - 1);
    const rowsStartY = Math.max(rowsTop, Math.round((rowsTop + rowsBottom - rowsBlockH) / 2));
    const rowX = Math.round((width - rowW) / 2);
    const flagW = model3FlagSourceRect.sw;
    const flagH = model3FlagSourceRect.sh;
    const sx = rowW / flagW;
    const sy = rowH / flagH;

    const drawContain = (img: HTMLImageElement, x: number, yPos: number, w: number, h: number) => {
      const { iw, ih } = getDrawableImageIntrinsicSize(img);
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      drawImageSafe(img, x + (w - dw) / 2, yPos + (h - dh) / 2, dw, dh);
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = rowsStartY + i * (rowH + rowGap);
      const home = String(item.home || '').trim();
      const away = String(item.away || '').trim();
      const when = String(item.time || '').trim();
      const competition = String(item.competition || '').trim() || 'CAMPEONATO NÃO INFORMADO';
      const channelsLabel = item.channels?.length ? item.channels.join(' • ') : 'CANAIS NÃO INFORMADOS';

      if (model3FlagImg) {
        drawImageCropSafe(model3FlagImg, model3FlagSourceRect, rowX, y, rowW, rowH);
      } else {
        drawRoundedRect(ctx, rowX, y, rowW, rowH, 12);
        ctx.fillStyle = 'rgba(8,34,24,0.9)';
        ctx.fill();
      }

      // Alinha o eixo vertical dos nomes com o "VS" central do flag.
      const homeBox = { x: rowX + flagW * 0.175 * sx, y: y + flagH * 0.34 * sy, w: flagW * 0.29 * sx, h: flagH * 0.24 * sy };
      const awayBox = { x: rowX + flagW * 0.535 * sx, y: y + flagH * 0.34 * sy, w: flagW * 0.29 * sx, h: flagH * 0.24 * sy };
      const crestSize = Math.max(56, Math.min(args.format === 'square' ? 80 : 88, Math.floor(rowH * 0.62)));
      const crestCenterY = y + flagH * 0.468 * sy;
      const crestY = crestCenterY - crestSize / 2;
      const leftCrestCenterX = rowX + flagW * 0.088 * sx;
      const rightCrestCenterX = rowX + flagW * 0.912 * sx;
      const leftBox = { x: leftCrestCenterX - crestSize / 2, y: crestY, w: crestSize, h: crestSize };
      const rightBox = { x: rightCrestCenterX - crestSize / 2, y: crestY, w: crestSize, h: crestSize };
      const crestInset = Math.max(2, Math.round(crestSize * 0.05));

      const homeKey = getFootballCrestCacheKey(item.homeCrestUrl || '');
      const awayKey = getFootballCrestCacheKey(item.awayCrestUrl || '');
      const homeImg = homeKey && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(homeKey) || null : null;
      const awayImg = awayKey && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(awayKey) || null : null;

      if (i === 0) {
        // #region agent log
        postFootballBannerDebugLog({
          hypothesisId: 'H2,H4',
          location: 'FootballBannerModal.tsx:drawModel3Row0',
          message: 'crest_lookup_canvas',
          data: {
            templateId: 'clean',
            mapHasHome: homeKey ? crestImages.has(homeKey) : false,
            mapHasAway: awayKey ? crestImages.has(awayKey) : false,
            homeNw: homeImg ? homeImg.naturalWidth || homeImg.width || 0 : 0,
            awayNw: awayImg ? awayImg.naturalWidth || awayImg.width || 0 : 0,
          },
        });
        // #endregion
      }

      const drawCrestFallback = (box: { x: number; y: number; w: number; h: number }, team: string) => {
        drawRoundedRect(ctx, box.x + crestInset, box.y + crestInset, box.w - crestInset * 2, box.h - crestInset * 2, 10);
        ctx.fillStyle = `hsl(${hashString(team) % 360} 56% 30%)`;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.max(18, Math.floor((box.h - crestInset * 2) * 0.3))}px ${fontStack}`;
        ctx.fillText(toTeamInitials(team), box.x + box.w / 2, box.y + box.h / 2);
      };
      if (homeImg) drawContain(homeImg, leftBox.x + crestInset, leftBox.y + crestInset, leftBox.w - crestInset * 2, leftBox.h - crestInset * 2);
      else drawCrestFallback(leftBox, home);
      if (awayImg) drawContain(awayImg, rightBox.x + crestInset, rightBox.y + crestInset, rightBox.w - crestInset * 2, rightBox.h - crestInset * 2);
      else drawCrestFallback(rightBox, away);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(12,34,56,0.98)';
      const teamFontSize = Math.max(20, Math.round(22 * sy));
      ctx.font = `900 ${teamFontSize}px ${fontStack}`;
      const drawTeamNameInsideBox = (label: string, box: { x: number; y: number; w: number; h: number }) => {
        const text = fitText(label.toUpperCase(), Math.max(0, box.w - 12));
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2, Math.max(0, box.w - 12));
        ctx.restore();
      };
      drawTeamNameInsideBox(home, homeBox);
      drawTeamNameInsideBox(away, awayBox);

      // Clip local garante que metadados nunca "saiam" do flag.
      ctx.save();
      ctx.beginPath();
      ctx.rect(rowX, y, rowW, rowH);
      ctx.clip();

      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.font = `800 ${Math.max(12, Math.round(13 * sy))}px ${fontStack}`;
      ctx.fillText(fitText(competition.toUpperCase(), flagW * 0.36 * sx), rowX + rowW / 2, y + flagH * 0.11 * sy, flagW * 0.36 * sx);

      // Canais e horário no rodapé vermelho do flag (layout de referência).
      const infoBar = {
        // Ajuste lateral: mantém canal/horário mais dentro do miolo vermelho do flag.
        x: rowX + flagW * 0.315 * sx,
        y: y + flagH * 0.82 * sy,
        w: flagW * 0.39 * sx,
        h: flagH * 0.10 * sy,
      };
      // Divisor ao lado do horário (lado direito), conforme referência.
      const splitX = infoBar.x + infoBar.w * 0.70;
      const channelsCenterX = infoBar.x + (splitX - infoBar.x) / 2;
      const timeCenterX = splitX + (infoBar.x + infoBar.w - splitX) / 2;
      const infoCenterY = infoBar.y + infoBar.h / 2;

      // Divisor sutil entre canal e horário
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1, 2 * sy);
      ctx.beginPath();
      ctx.moveTo(splitX, infoBar.y + 3 * sy);
      ctx.lineTo(splitX, infoBar.y + infoBar.h - 3 * sy);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.max(11, Math.round(13 * sy))}px ${fontStack}`;
      ctx.fillText(fitText(channelsLabel.toUpperCase(), (splitX - infoBar.x) - 10), channelsCenterX, infoCenterY, (splitX - infoBar.x) - 10);

      ctx.font = `900 ${Math.max(12, Math.round(15 * sy))}px ${fontStack}`;
      ctx.fillText(fitText(when.toUpperCase(), (infoBar.x + infoBar.w - splitX) - 10), timeCenterX, infoCenterY, (infoBar.x + infoBar.w - splitX) - 10);

      ctx.restore();
    }

    const transmissionText = (args.footerText || '').trim();
    if (transmissionText) {
      const footerY = 1192;
      const barX = 74;
      const barH = 42;
      const barW = 932;
      const isPhoneFooter = args.footerContactType === 'phone';
      if (!isPhoneFooter) {
        drawRoundedRect(ctx, barX, footerY, barW, barH, 10);
        ctx.fillStyle = 'rgba(9,25,82,0.90)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(129,192,255,0.92)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(209,234,255,0.98)';
      } else {
        // Sem "clip/flag" de fundo para telefone: apenas icone + numero.
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
      }
      const footerTextY = isPhoneFooter ? (footerY + barH / 2 + 4) : (footerY + barH / 2 + 1);
      ctx.font = `700 ${isPhoneFooter ? 24 : 22}px ${fontStack}`;
      ctx.textBaseline = 'middle';
      if (isPhoneFooter && whatsappIconImg) {
        const iconSize = 32;
        const gap = 12;
        const textMaxW = Math.max(80, barW - 24 - iconSize - gap);
        const text = fitText(transmissionText, textMaxW);
        const textW = Math.min(textMaxW, Math.ceil(ctx.measureText(text).width));
        const groupW = iconSize + gap + textW;
        const groupStartX = Math.round(barX + (barW - groupW) / 2);
        const iconY = Math.round(footerTextY - iconSize / 2);
        drawImageSafe(whatsappIconImg, groupStartX, iconY, iconSize, iconSize);
        ctx.textAlign = 'left';
        ctx.fillText(text, groupStartX + iconSize + gap, footerTextY, textMaxW);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(fitText(transmissionText, barW - 24), barX + barW / 2, footerTextY, barW - 24);
      }
    }
  };

  if (args.templateId === 'promo') {
    try {
      await drawPromoTemplate();
      return await canvasToPngBlob();
    } catch (error) {
      console.error('Falha no render do template promo', error);
      ctx.clearRect(0, 0, width, height);
      const promoBgImg = await loadImageFirstAvailable(FOOTBALL_PROMO_BG_URLS);
      const promoTitleImg = await loadImageFirstAvailable(FOOTBALL_PROMO_TITLE_URLS);
      if (promoBgImg) {
        drawImageSafe(promoBgImg, 10, 35, 1060, 1280);
      } else if (backgroundImg) {
        drawCoverImage(backgroundImg, 0, 0, width, height, { alignY: 0.6 });
      }
      if (promoTitleImg) {
        const titleW = 560;
        const titleH = Math.round((promoTitleImg.naturalHeight / Math.max(1, promoTitleImg.naturalWidth)) * titleW);
        drawImageSafe(promoTitleImg, 52, 154, titleW, titleH);
      }
      const fallbackRows = args.matches.slice(0, 4);
      for (let i = 0; i < fallbackRows.length; i++) {
        const y = 410 + i * 172;
        const m = fallbackRows[i];
        const home = String(m.home || '').trim().toUpperCase();
        const away = String(m.away || '').trim().toUpperCase();
        const meta = String(m.competition || '').trim() || 'Campeonato não informado';
        const time = String(m.time || '').trim().replace(':', 'H');
        drawRoundedRect(ctx, 210, y, 660, 44, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fill();
        drawRoundedRect(ctx, 310, y + 44, 435, 50, 10);
        ctx.fillStyle = 'rgba(2,53,30,0.97)';
        ctx.fill();
        drawRoundedRect(ctx, 745, y + 44, 146, 50, 10);
        ctx.fillStyle = 'rgba(176,255,89,0.98)';
        ctx.fill();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(3,58,34,0.98)';
        ctx.font = `900 42px ${fontStack}`;
        ctx.fillText(fitText(home, 250), 226, y + 22, 250);
        ctx.textAlign = 'right';
        ctx.fillText(fitText(away, 250), 854, y + 22, 250);
        ctx.textAlign = 'center';
        ctx.font = `900 40px ${fontStack}`;
        ctx.fillText('X', 542, y + 22);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `700 18px ${fontStack}`;
        ctx.fillText(fitText(meta, 410), 525, y + 69, 410);
        ctx.fillStyle = 'rgba(5,43,22,0.98)';
        ctx.font = `900 22px ${fontStack}`;
        ctx.fillText(time, 818, y + 69, 130);
      }
      return await canvasToPngBlob();
    }
  }

  if (args.templateId === 'clean') {
    try {
      await drawModel3Template();
      return await canvasToPngBlob();
    } catch (error) {
      console.error('Falha no render do template modelo 3', error);
    }
  }

  if (backgroundImg) {
    drawCoverImage(backgroundImg, 0, 0, width, height, { alignY: args.format === 'square' ? 0.6 : 0.78 });
  }

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, args.brandPrimary);
  bg.addColorStop(1, args.brandSecondary);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.fillRect(0, 0, width, height);

  const headerX = pad;
  const headerY = pad;
  const headerW = width - pad * 2;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, headerX, headerY, headerW, headerH, 28);
  ctx.fill();
  ctx.stroke();

  const showLogo = Boolean(logoImg);
  const logoSize = args.templateId === 'informativo'
    ? (args.format === 'square' ? 142 : 156)
    : (args.format === 'square' ? 88 : 96);
  const logoX = headerX + 34;
  const logoY = headerY + 34;

  if (showLogo && logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const titleX = showLogo ? logoX + logoSize + 22 : headerX + 34;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 ${args.format === 'square' ? 60 : 68}px ${fontStack}`;
  ctx.fillText('Jogos do Dia', titleX, headerY + 32);

  ctx.font = `700 ${args.format === 'square' ? 30 : 34}px ${fontStack}`;
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.fillText(formatDatePtBr(args.date), titleX, headerY + 118);

  const brandLabel = (args.brandName || '').trim();
  if (brandLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.font = `700 ${args.format === 'square' ? 24 : 26}px ${fontStack}`;
    ctx.fillText(brandLabel, titleX, headerY + 164);
  }

  const listX = pad;
  const listY = headerY + headerH + (args.format === 'square' ? 28 : 36);
  const listW = width - pad * 2;
  const listH = height - listY - pad - footerH;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  drawRoundedRect(ctx, listX, listY, listW, listH, 28);
  ctx.fill();
  ctx.stroke();

  const maxRows = args.templateId === 'clean'
    ? Math.max(7, Math.min(14, Math.floor((listH - 56) / Math.max(92, rowHBase - 10))))
    : Math.max(6, Math.min(12, Math.floor((listH - 56) / rowHBase)));
  const rows = args.matches.slice(0, maxRows);
  const contentPad = 28;
  const baseY = listY + contentPad;
  const crestUrlList = rows
    .flatMap((m) => [m.homeCrestUrl || '', m.awayCrestUrl || ''])
    .filter((u) => Boolean(u) && !isPlaceholderCrestUrl(u));
  // #region agent log
  if (dbgCrestInputSummaryLogs < 6) {
    dbgCrestInputSummaryLogs += 1;
    postFootballBannerDebugLog({
      hypothesisId: 'H16',
      location: 'FootballBannerModal.tsx:drawInformativeTemplate',
      message: 'crest_input_summary',
      data: {
        templateId: args.templateId,
        items: rows.length,
        crestCandidates: crestUrlList.length,
        missingAny: rows.filter((m) => !hasRenderableCrest(m.homeCrestUrl) || !hasRenderableCrest(m.awayCrestUrl)).length,
      },
    });
  }
  // #endregion
  await ensureCrestImages(crestUrlList);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const rowH = Math.floor((listH - contentPad * 2) / maxRows);
    const rowY = baseY + i * rowH;
    const rowX = listX + contentPad;
    const rowW = listW - contentPad * 2;

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    drawRoundedRect(ctx, rowX, rowY, rowW, rowH - 14, args.templateId === 'clean' ? 18 : 20);
    ctx.fill();
    ctx.stroke();

    const midY = rowY + (rowH - 14) / 2;
    const crestSizeBase = args.format === 'square'
      ? (args.templateId === 'clean' ? 54 : 58)
      : (args.templateId === 'clean' ? 60 : 66);
    const crestSize = Math.max(44, Math.min(crestSizeBase, Math.floor(rowH - 34)));
    const crestPad = args.templateId === 'clean' ? 18 : 20;
    const crestY = Math.round(midY - crestSize / 2);
    const timeW = args.templateId === 'clean' ? 152 : 160;
    const timeX = rowX + crestPad;
    const teamsX = timeX + timeW + (args.templateId === 'clean' ? 18 : 20);
    const teamsW = Math.max(0, rowX + rowW - crestPad - teamsX);
    const teamsMidX = teamsX + teamsW / 2;
    const crestHomeX = teamsX;
    const crestAwayX = teamsX + teamsW - crestSize;

    const crestHomeKey = getFootballCrestCacheKey(item.homeCrestUrl || '');
    const crestAwayKey = getFootballCrestCacheKey(item.awayCrestUrl || '');
    const crestHome = crestHomeKey && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(crestHomeKey) || null : null;
    const crestAway = crestAwayKey && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(crestAwayKey) || null : null;

    if (i === 0) {
      // #region agent log
      postFootballBannerDebugLog({
        hypothesisId: 'H2,H4',
        location: 'FootballBannerModal.tsx:drawRow0',
        message: 'crest_lookup_canvas',
        data: {
          templateId: args.templateId,
          homeKeyTail: crestHomeKey ? crestHomeKey.slice(-40) : '',
          awayKeyTail: crestAwayKey ? crestAwayKey.slice(-40) : '',
          mapHasHome: crestHomeKey ? crestImages.has(crestHomeKey) : false,
          mapHasAway: crestAwayKey ? crestImages.has(crestAwayKey) : false,
          homeNw: crestHome ? crestHome.naturalWidth || crestHome.width || 0 : 0,
          awayNw: crestAway ? crestAway.naturalWidth || crestAway.width || 0 : 0,
          placeholderHome: isPlaceholderCrestUrl(item.homeCrestUrl || ''),
        },
      });
      // #endregion
    }

    const drawImageContain = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const { iw, ih } = getDrawableImageIntrinsicSize(img);
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      try {
        ctx.drawImage(img, dx, dy, dw, dh);
      } catch (e) {
        // #region agent log
        if (dbgDrawImageSafeFailLogs < 8) {
          dbgDrawImageSafeFailLogs += 1;
          postFootballBannerDebugLog({
            hypothesisId: 'H8',
            location: 'FootballBannerModal.tsx:drawImageContain',
            message: 'drawImage_threw',
            data: { err: String(e), iw, ih },
          });
        }
        // #endregion
      }
    };

    const drawCrest = (img: HTMLImageElement | null, x: number, teamName: string) => {
      ctx.save();
      drawRoundedRect(ctx, x, crestY, crestSize, crestSize, 16);
      ctx.fillStyle = img ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.restore();
      if (img) {
        ctx.save();
        drawRoundedRect(ctx, x, crestY, crestSize, crestSize, 16);
        ctx.clip();
        drawImageContain(img, x, crestY, crestSize, crestSize);
        ctx.restore();
      } else {
        const initials = toTeamInitials(teamName);
        const hue = hashString(teamName) % 360;
        ctx.save();
        drawRoundedRect(ctx, x, crestY, crestSize, crestSize, 16);
        ctx.clip();
        ctx.fillStyle = `hsl(${hue} 62% 34%)`;
        ctx.fillRect(x, crestY, crestSize, crestSize);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `900 ${Math.max(18, Math.floor(crestSize * 0.42))}px ${fontStack}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, x + crestSize / 2, crestY + crestSize / 2);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x, crestY, crestSize, crestSize, 16);
      ctx.stroke();
      ctx.restore();
    };

    drawCrest(crestHome, crestHomeX, item.home);
    drawCrest(crestAway, crestAwayX, item.away);

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.font = `900 ${args.format === 'square' ? (args.templateId === 'clean' ? 32 : 34) : (args.templateId === 'clean' ? 34 : 36)}px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const when = item.time.replace(':', 'H');
    ctx.fillText(fitText(when, timeW), timeX, midY);

    const channels = item.channels?.length ? item.channels.join(', ') : '';
    const competition = typeof item?.competition === 'string' ? item.competition.trim() : '';
    const competitionDisplay = competition || 'Campeonato não informado';
    const teamsY = midY - (args.templateId === 'clean' ? 14 : 16);
    const competitionY = teamsY + (args.templateId === 'informativo' ? 22 : 20);
    const channelsY = competitionY + (args.templateId === 'informativo' ? 22 : 18);

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    const teamBaseFontSize = args.format === 'square' ? (args.templateId === 'clean' ? 27 : 29) : (args.templateId === 'clean' ? 30 : 32);
    const xGap = args.templateId === 'clean' ? 18 : 22;
    const nameGap = args.templateId === 'clean' ? 10 : 12;
    const homeNameX = crestHomeX + crestSize + nameGap;
    const homeNameW = Math.max(0, teamsMidX - xGap - homeNameX);
    const awayNameRight = crestAwayX - nameGap;
    const awayNameW = Math.max(0, awayNameRight - (teamsMidX + xGap));
    const drawAdaptiveTeamName = (value: string, x: number, y: number, maxWidth: number, align: 'left' | 'right') => {
      const minSize = args.templateId === 'clean' ? 22 : 23;
      let appliedSize = teamBaseFontSize;
      for (let size = teamBaseFontSize; size >= minSize; size--) {
        ctx.font = `800 ${size}px ${fontStack}`;
        if (ctx.measureText(String(value || '').trim()).width <= maxWidth) {
          appliedSize = size;
          break;
        }
        appliedSize = size;
      }
      ctx.font = `800 ${appliedSize}px ${fontStack}`;
      ctx.textAlign = align;
      ctx.fillText(fitText(value, maxWidth), x, y, maxWidth);
    };
    ctx.textAlign = 'left';
    drawAdaptiveTeamName(item.home, homeNameX, teamsY, homeNameW, 'left');
    drawAdaptiveTeamName(item.away, awayNameRight, teamsY, awayNameW, 'right');
    ctx.textAlign = 'center';
    ctx.font = `900 ${args.format === 'square' ? (args.templateId === 'clean' ? 26 : 28) : (args.templateId === 'clean' ? 28 : 30)}px ${fontStack}`;
    ctx.fillText('x', teamsMidX, teamsY);

    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.font = `700 ${args.format === 'square' ? (args.templateId === 'clean' ? 16 : 18) : (args.templateId === 'clean' ? 18 : 20)}px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(competitionDisplay, teamsW), teamsX + teamsW / 2, competitionY, teamsW);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `600 ${args.format === 'square' ? (args.templateId === 'clean' ? 15 : 17) : (args.templateId === 'clean' ? 17 : 19)}px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(channels || '—', teamsW), teamsX + teamsW / 2, channelsY, teamsW);
  }

  if (pageIndicator) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `700 ${args.format === 'square' ? 24 : 26}px ${fontStack}`;
    ctx.fillText(pageIndicator, width - pad, height - Math.round(pad * 0.55));
  }

  if (footerH && args.footerText) {
    const footerX = pad;
    const footerY = height - pad - footerH;
    const footerW = width - pad * 2;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.font = `700 ${args.format === 'square' ? 28 : 30}px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(args.footerText, footerX + footerW / 2, footerY + footerH / 2);
  }

  return await canvasToPngBlob();
};

const generateFootballBanners = async (args: {
  brandPrimary: string;
  brandSecondary: string;
  brandName?: string;
  brandLogo?: string;
  footerText?: string;
  footerContactType?: 'phone' | 'website';
  date: string;
  matches: FootballMatch[];
  format: BannerFormat;
  templateId: FootballBannerTemplateId;
}) => {
  const matchesNormalized = Array.isArray(args.matches) ? args.matches.map(mergeFootballMatchCrestSources) : [];
  const perPage = computeFootballBannerItemsPerPage({ format: args.format, templateId: args.templateId, footerText: args.footerText });
  const total = matchesNormalized.length;
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const logoImg = await loadBrandLogoImage(args.brandLogo || '');
  const backgroundImg = await loadImage(FOOTBALL_BACKGROUND_URL);
  const crestCache = new Map<string, HTMLImageElement | null>();
  const blobs: Blob[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const start = pageIndex * perPage;
    const slice = matchesNormalized.slice(start, start + perPage);
    const blob = await generateFootballBanner({
      ...args,
      matches: slice,
      pageIndex,
      pageCount,
      preloadedLogoImg: logoImg,
      preloadedBackgroundImg: backgroundImg,
      crestCache,
    });
    blobs.push(blob);
  }
  return { blobs, pageCount };
};


export {
  computeFootballBannerItemsPerPage,
  generateFootballBanner,
  generateFootballBanners,
  mergeFootballMatchCrestSources,
  normalizeFootballScheduleCrests,
  FOOTBALL_BANNER_TEMPLATES,
  FOOTBALL_TEMPLATE_DEFAULT_COLORS,
  FOOTBALL_BACKGROUND_URL,
  readCachedFootballSchedule,
  writeCachedFootballSchedule,
  getDefaultFootballScheduleDate,
  footballMatchKey,
  parseClockTime,
  addDaysToIsoDate,
  getSaoPauloNowParts,
  getFootballScheduleCacheKey,
  formatDatePtBr,
  buildMatchesText,
  hasRenderableCrest,
};
