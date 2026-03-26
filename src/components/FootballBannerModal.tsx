import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Copy, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { apiRequest, apiRequestRaw, buildApiUrl, getAuthToken } from '../services/apiClient';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { ToastAction } from './ui/toast';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../lib/utils';

type BannerFormat = 'square' | 'story';

type FootballMatch = {
  time: string;
  home: string;
  away: string;
  competition?: string;
  channels: string[];
  homeCrestUrl?: string;
  awayCrestUrl?: string;
};

type FootballScheduleResponse = {
  date: string;
  updatedAt: string | null;
  matches: FootballMatch[];
};

const footballMatchKey = (match: Pick<FootballMatch, 'time' | 'home' | 'away'>) =>
  `${match.time}::${match.home}::${match.away}`.trim().toLowerCase();

const FOOTBALL_SCHEDULE_CACHE_KEY_V1 = 'football_schedule_cache_v1';
const getFootballScheduleCacheKey = (dateIso: string) => `football_schedule_cache_v2_${dateIso}`;

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
      return s;
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
    return s;
  } catch {
    return null;
  }
};

const writeCachedFootballSchedule = (schedule: FootballScheduleResponse) => {
  try {
    const dateIso = typeof schedule?.date === 'string' ? schedule.date.trim() : '';
    if (!dateIso) return;
    localStorage.setItem(getFootballScheduleCacheKey(dateIso), JSON.stringify({ cachedAt: Date.now(), schedule }));
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

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const getCanvasFontStack = () => 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

type FootballBannerTemplateId = 'informativo' | 'clean' | 'promo';

type FootballBannerTemplate = {
  id: FootballBannerTemplateId;
  name: string;
  description: string;
  resolution: string;
};

const FOOTBALL_BANNER_TEMPLATES: FootballBannerTemplate[] = [
  { id: 'informativo', name: 'Modelo 1 - Informativo', description: 'Layout tradicional com leitura direta dos confrontos.', resolution: '1080×1350 px' },
  { id: 'promo', name: 'Modelo 2 - Diagonal', description: 'Layout com faixa diagonal para destaque de canais e horário.', resolution: '1080×1350 px' },
  { id: 'clean', name: 'Modelo 3 - Kit Oficial', description: 'Layout oficial baseado nos assets do Modelo 3.', resolution: '1080×1350 px' },
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

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const url = typeof src === 'string' ? src.trim() : '';
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};
const loadImageFirstAvailable = async (candidates: string[]) => {
  for (const candidate of candidates) {
    const img = await loadImage(candidate);
    if (img) return img;
  }
  return null;
};

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
};

const loadBrandLogoImage = async (rawUrl: string): Promise<HTMLImageElement | null> => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return await loadImage(url);
  }
  if (!/^https?:\/\//i.test(url)) return await loadImage(url);
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(buildApiUrl(`/api/assets/image?url=${encodeURIComponent(url)}`), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'image/*' },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return await loadImageFromBlob(blob);
  } catch {
    return null;
  }
};

const resolveFootballAssetUrl = (rawUrl: string) => {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  if (value.startsWith('//')) {
    const absolute = `https:${value}`;
    return buildApiUrl(`/api/football/crest?url=${encodeURIComponent(absolute)}`);
  }
  // Alguns provedores retornam caminho relativo do futebolnatv para escudos.
  // Sem normalização, o browser tenta carregar no domínio da app e falha.
  if (value.startsWith('/upload/teams/')) {
    const absolute = `https://www.futebolnatv.com.br${value}`;
    return buildApiUrl(`/api/football/crest?url=${encodeURIComponent(absolute)}`);
  }
  if (value.startsWith('/')) return value;
  return buildApiUrl(`/api/football/crest?url=${encodeURIComponent(value)}`);
};

const resolveFootballAssetCandidates = (rawUrl: string) => {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value) return [];
  if (value.startsWith('data:')) return [value];
  if (value.startsWith('/')) {
    if (value.startsWith('/upload/teams/')) {
      const absolute = `https://www.futebolnatv.com.br${value}`;
      return [
        buildApiUrl(`/api/football/crest?url=${encodeURIComponent(absolute)}`),
        absolute,
      ];
    }
    return [value];
  }
  const absolute = value.startsWith('//') ? `https:${value}` : value;
  const httpsCandidate = absolute.replace(/^http:\/\//i, 'https://');
  return Array.from(
    new Set([
      buildApiUrl(`/api/football/crest?url=${encodeURIComponent(absolute)}`),
      httpsCandidate,
      absolute,
    ].filter(Boolean))
  );
};

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
      const key = resolveFootballAssetUrl(raw);
      return Boolean(key) && !crestImages.has(key);
    });
    if (missingRaw.length === 0) return;
    await Promise.all(
      missingRaw.map(async (raw) => {
        const key = resolveFootballAssetUrl(raw);
        if (!key) return;
        const img = await loadImageFirstAvailable(resolveFootballAssetCandidates(raw));
        crestImages.set(key, img);
      })
    );
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
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    if (w <= 0 || h <= 0) return false;
    ctx.drawImage(img, x, y, w, h);
    return true;
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
    const crestUrlList = items.flatMap((m) => [m.homeCrestUrl || '', m.awayCrestUrl || '']).filter(Boolean);
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
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
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

      const homeUrl = resolveFootballAssetUrl(item.homeCrestUrl || '');
      const awayUrl = resolveFootballAssetUrl(item.awayCrestUrl || '');
      const homeImg = homeUrl && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(homeUrl) || null : null;
      const awayImg = awayUrl && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(awayUrl) || null : null;

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
    const crestUrlList = items.flatMap((m) => [m.homeCrestUrl || '', m.awayCrestUrl || '']).filter(Boolean);
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
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
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

      const homeUrl = resolveFootballAssetUrl(item.homeCrestUrl || '');
      const awayUrl = resolveFootballAssetUrl(item.awayCrestUrl || '');
      const homeImg = homeUrl && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(homeUrl) || null : null;
      const awayImg = awayUrl && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(awayUrl) || null : null;

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
    .filter(Boolean);
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

    const crestHomeUrl = resolveFootballAssetUrl(item.homeCrestUrl || '');
    const crestAwayUrl = resolveFootballAssetUrl(item.awayCrestUrl || '');
    const crestHome = crestHomeUrl && !isPlaceholderCrestUrl(item.homeCrestUrl || '') ? crestImages.get(crestHomeUrl) || null : null;
    const crestAway = crestAwayUrl && !isPlaceholderCrestUrl(item.awayCrestUrl || '') ? crestImages.get(crestAwayUrl) || null : null;

    const drawImageContain = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
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
  const perPage = computeFootballBannerItemsPerPage({ format: args.format, templateId: args.templateId, footerText: args.footerText });
  const total = Array.isArray(args.matches) ? args.matches.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const logoImg = await loadBrandLogoImage(args.brandLogo || '');
  const backgroundImg = await loadImage(FOOTBALL_BACKGROUND_URL);
  const crestCache = new Map<string, HTMLImageElement | null>();
  const blobs: Blob[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const start = pageIndex * perPage;
    const slice = args.matches.slice(start, start + perPage);
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

interface FootballBannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FootballBannerModal: React.FC<FootballBannerModalProps> = ({ isOpen, onClose }) => {
  const { user, isPremiumActive, isPremiumExpired } = useAuth();
  const { toast } = useToast();
  const [format] = useState<BannerFormat>('square');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendAllProgress, setSendAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<FootballBannerTemplateId>('informativo');
  const [schedule, setSchedule] = useState<FootballScheduleResponse | null>(null);
  const [matchSelection, setMatchSelection] = useState<Record<string, boolean>>({});
  const [includeFooterPhone, setIncludeFooterPhone] = useState(false);
  const [includeFooterWebsite, setIncludeFooterWebsite] = useState(false);
  const [footerText, setFooterText] = useState('');
  const [generated, setGenerated] = useState<
    Array<{
      id: string;
      url: string;
      blob: Blob;
      date: string;
      createdAt: number;
      format: BannerFormat;
      templateId: FootballBannerTemplateId;
      pageIndex: number;
      pageCount: number;
    }>
  >([]);
  const [generatedSelection, setGeneratedSelection] = useState<Record<string, boolean>>({});
  const generatedRef = useRef(generated);
  const selectedMatches = useMemo(() => {
    if (!schedule) return [];
    const matches = Array.isArray(schedule.matches) ? schedule.matches : [];
    return matches.filter((m) => matchSelection[footballMatchKey(m)]);
  }, [matchSelection, schedule]);
  const scheduleText = useMemo(() => {
    if (!schedule) return '';
    return buildMatchesText(schedule.date, selectedMatches);
  }, [schedule, selectedMatches]);
  const scheduleTextRef = useRef(scheduleText);
  const selectedGenerated = useMemo(() => {
    return generated.filter((item) => generatedSelection[item.id]);
  }, [generated, generatedSelection]);
  const footerPhoneAvailable = typeof user?.phone === 'string' && Boolean(user.phone.trim());
  const footerWebsiteAvailable = typeof user?.website === 'string' && Boolean(user.website.trim());
  const lastScheduleFetchAtRef = useRef<number>(0);
  const emptyScheduleRetryTimerRef = useRef<number | null>(null);
  const emptyScheduleRetryCountRef = useRef<number>(0);

  const clearEmptyScheduleRetryTimer = useCallback(() => {
    if (emptyScheduleRetryTimerRef.current !== null) {
      window.clearTimeout(emptyScheduleRetryTimerRef.current);
      emptyScheduleRetryTimerRef.current = null;
    }
  }, []);

  const triggerScheduleRefresh = useCallback(async (dateIso: string) => {
    if (!dateIso) return;
    try {
      await apiRequest<{ date?: string }>({
        path: `/api/football/schedule/refresh?date=${encodeURIComponent(dateIso)}`,
        method: 'GET',
        auth: false,
        timeoutMs: 20_000,
      });
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    scheduleTextRef.current = scheduleText;
  }, [scheduleText]);

  useEffect(() => {
    generatedRef.current = generated;
  }, [generated]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      for (const item of generatedRef.current) {
        URL.revokeObjectURL(item.url);
      }
      generatedRef.current = [];
      setGenerated([]);
      setGeneratedSelection({});
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!footerPhoneAvailable && includeFooterPhone) setIncludeFooterPhone(false);
    if (!footerWebsiteAvailable && includeFooterWebsite) setIncludeFooterWebsite(false);
  }, [footerPhoneAvailable, footerWebsiteAvailable, includeFooterPhone, includeFooterWebsite, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (includeFooterPhone || includeFooterWebsite) return;
    if (footerWebsiteAvailable) {
      setIncludeFooterWebsite(true);
      return;
    }
    if (footerPhoneAvailable) setIncludeFooterPhone(true);
  }, [footerPhoneAvailable, footerWebsiteAvailable, includeFooterPhone, includeFooterWebsite, isOpen]);

  useEffect(() => {
    const nextValue =
      includeFooterWebsite && footerWebsiteAvailable && user?.website
        ? formatWebsiteForDisplay(user.website)
        : includeFooterPhone && footerPhoneAvailable && user?.phone
          ? formatPhoneForDisplay(user.phone)
          : '';
    if (footerText !== nextValue) setFooterText(nextValue);
  }, [
    footerPhoneAvailable,
    footerWebsiteAvailable,
    footerText,
    includeFooterPhone,
    includeFooterWebsite,
    user?.phone,
    user?.website,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    if (!user) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para usar este recurso.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Fazer login" onClick={() => window.dispatchEvent(new Event('mediahub:openAuthModal'))}>
            Fazer login
          </ToastAction>
        ),
      });
      onClose();
      return;
    }

    if (!isPremiumActive()) {
      toast({
        title: isPremiumExpired() ? 'Assinatura expirada' : 'Recurso Premium',
        description: isPremiumExpired()
          ? 'Este recurso está indisponível porque sua assinatura Premium expirou.'
          : 'Este recurso está disponível apenas para contas Premium.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Ver plano" onClick={() => window.dispatchEvent(new Event('mediahub:openUserAreaModal'))}>
            Ver plano
          </ToastAction>
        ),
      });
      onClose();
    }
  }, [isOpen, isPremiumActive, isPremiumExpired, onClose, toast, user]);

  const applySchedule = useCallback((data: FootballScheduleResponse) => {
    setSchedule(data);
    setMatchSelection(() => {
      const next: Record<string, boolean> = {};
      for (const match of data?.matches || []) {
        next[footballMatchKey(match)] = true;
      }
      return next;
    });
  }, []);

  const fetchSchedule = useCallback(async (targetDate?: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    try {
      const query = targetDate ? `?date=${encodeURIComponent(targetDate)}` : '';
      const data = await apiRequest<FootballScheduleResponse>({
        path: `/api/football/schedule${query}`,
        method: 'GET',
        auth: true,
        timeoutMs: 20_000,
      });
      lastScheduleFetchAtRef.current = Date.now();
      applySchedule(data);
      writeCachedFootballSchedule(data);
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        emptyScheduleRetryCountRef.current = 0;
        clearEmptyScheduleRetryTimer();
      }
    } catch {
      if (!schedule?.matches?.length) {
        const expectedDate = typeof targetDate === 'string' && targetDate.trim() ? targetDate.trim() : getDefaultFootballScheduleDate();
        const cached = readCachedFootballSchedule(expectedDate);
        if (cached?.matches?.length && (!targetDate || cached.date === targetDate)) {
          applySchedule(cached);
          return;
        }
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os jogos agora. Tente novamente.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Tentar novamente" onClick={() => void fetchSchedule(expectedDate)}>
              Tentar novamente
            </ToastAction>
          ),
        });
      }
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, [applySchedule, clearEmptyScheduleRetryTimer, schedule?.matches?.length, toast]);

  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    if (schedule?.matches?.length && now - lastScheduleFetchAtRef.current < 15 * 60 * 1000) return;
    const expectedDate = getDefaultFootballScheduleDate();
    const cached = readCachedFootballSchedule(expectedDate);
    if (cached?.matches?.length) {
      lastScheduleFetchAtRef.current = now;
      applySchedule(cached);
      void fetchSchedule(expectedDate, { silent: true });
      return;
    }
    void fetchSchedule(expectedDate);
  }, [applySchedule, fetchSchedule, isOpen, schedule?.matches?.length]);

  useEffect(() => {
    if (!isOpen) {
      clearEmptyScheduleRetryTimer();
      emptyScheduleRetryCountRef.current = 0;
      return;
    }
    const dateIso = typeof schedule?.date === 'string' ? schedule.date.trim() : '';
    const hasMatches = Boolean(schedule?.matches?.length);
    if (!dateIso || hasMatches || isLoading) {
      if (hasMatches) {
        clearEmptyScheduleRetryTimer();
        emptyScheduleRetryCountRef.current = 0;
      }
      return;
    }
    if (emptyScheduleRetryCountRef.current >= 4) return;

    const attempt = emptyScheduleRetryCountRef.current + 1;
    const waitMs = Math.min(8_000, 2_000 * attempt);
    clearEmptyScheduleRetryTimer();
    emptyScheduleRetryTimerRef.current = window.setTimeout(() => {
      void (async () => {
        if (attempt === 1) {
          await triggerScheduleRefresh(dateIso);
        }
        emptyScheduleRetryCountRef.current = attempt;
        await fetchSchedule(dateIso, { silent: true });
      })();
    }, waitMs);

    return () => {
      clearEmptyScheduleRetryTimer();
    };
  }, [clearEmptyScheduleRetryTimer, fetchSchedule, isLoading, isOpen, schedule?.date, schedule?.matches?.length, triggerScheduleRefresh]);

  const handleCopyText = async () => {
    const text = scheduleTextRef.current;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado', description: 'Lista de jogos copiada para a área de transferência.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar o texto.', variant: 'destructive' });
    }
  };

  const buildTelegramCaption = (args: { dateIso: string; pageIndex: number; pageCount: number }) => {
    const base = `JOGOS DO DIA ${formatDatePtBr(args.dateIso)}`;
    if (args.pageCount > 1) return `${base} (PÁG ${args.pageIndex + 1}/${args.pageCount})`;
    return base;
  };

  const downloadGenerated = (item: { blob: Blob; date: string; format: BannerFormat; pageIndex: number; pageCount: number }) => {
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url;
    const base = `jogos-${item.date}-${item.format === 'square' ? '1080x1350' : 'story'}`;
    const suffix = item.pageCount > 1 ? `-p${item.pageIndex + 1}de${item.pageCount}` : '';
    a.download = `${base}${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadAllGenerated = async () => {
    if (selectedGenerated.length === 0) {
      toast({ title: 'Selecione os banners', description: 'Marque pelo menos uma prévia para baixar.' });
      return;
    }
    const items = [...selectedGenerated].sort((a, b) => a.pageIndex - b.pageIndex);
    if (items.length === 1) {
      downloadGenerated(items[0]);
      return;
    }
    setIsGenerating(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const item of items) {
        const base = `jogos-${item.date}-${item.format === 'square' ? '1080x1350' : 'story'}`;
        const suffix = item.pageCount > 1 ? `-p${item.pageIndex + 1}de${item.pageCount}` : '';
        const filename = `${base}${suffix}.png`;
        zip.file(filename, item.blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = items[0]?.date || 'jogos';
      const fmt = items[0]?.format === 'square' ? '1080x1350' : 'story';
      a.href = url;
      a.download = `jogos-${date}-${fmt}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Sucesso', description: 'Arquivo .zip gerado com todos os banners.' });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível baixar todos os banners agora.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Tentar novamente" onClick={() => void downloadAllGenerated()}>
            Tentar novamente
          </ToastAction>
        ),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendAllToTelegram = async () => {
    if (!user) return;
    if (selectedGenerated.length === 0) {
      toast({ title: 'Selecione os banners', description: 'Marque pelo menos uma prévia para enviar.' });
      return;
    }
    const items = [...selectedGenerated].sort((a, b) => a.pageIndex - b.pageIndex);
    setIsGenerating(true);
    setSendAllProgress({ current: 0, total: items.length });
    try {
      const makeMediaGroupPayload = async (first: Blob, second: Blob) => {
        const firstBytes = new Uint8Array(await first.arrayBuffer());
        const secondBytes = new Uint8Array(await second.arrayBuffer());
        const out = new Uint8Array(8 + firstBytes.length + secondBytes.length);
        const view = new DataView(out.buffer);
        view.setUint32(0, firstBytes.length);
        out.set(firstBytes, 4);
        view.setUint32(4 + firstBytes.length, secondBytes.length);
        out.set(secondBytes, 8 + firstBytes.length);
        return out;
      };

      let sentCount = 0;
      let captionSent = false;
      for (let i = 0; i < items.length; i += 2) {
        const first = items[i];
        const second = items[i + 1];
        const params = new URLSearchParams();

        if (!captionSent) {
          params.set('caption', buildTelegramCaption({ dateIso: first.date, pageIndex: first.pageIndex, pageCount: first.pageCount }));
        }

        if (second) {
          await apiRequestRaw<{ ok: true }>({
            path: `/api/telegram/send-media-group-upload?${params.toString()}`,
            method: 'POST',
            auth: true,
            headers: { 'Content-Type': 'application/octet-stream' },
            body: await makeMediaGroupPayload(first.blob, second.blob),
            timeoutMs: 120_000,
          });
          sentCount += 2;
        } else {
          await apiRequestRaw<{ ok: true }>({
            path: `/api/telegram/send-upload?${params.toString()}`,
            method: 'POST',
            auth: true,
            headers: { 'Content-Type': first.blob.type || 'image/png' },
            body: first.blob,
            timeoutMs: 45_000,
          });
          sentCount += 1;
        }

        captionSent = true;
        setSendAllProgress({ current: sentCount, total: items.length });
      }
      toast({ title: 'Sucesso', description: 'Todos os banners foram enviados para o Telegram.' });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar todos os banners agora.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Tentar novamente" onClick={() => void handleSendAllToTelegram()}>
            Tentar novamente
          </ToastAction>
        ),
      });
    } finally {
      setIsGenerating(false);
      setSendAllProgress(null);
    }
  };

  const clearGenerated = () => {
    for (const item of generatedRef.current) {
      URL.revokeObjectURL(item.url);
    }
    generatedRef.current = [];
    setGenerated([]);
    setGeneratedSelection({});
  };

  const handleGenerate = async () => {
    if (!schedule) return;
    if (!schedule.matches?.length) {
      toast({ title: 'Sem jogos', description: 'Não há jogos disponíveis para esta data.' });
      return;
    }
    if (!selectedMatches.length) {
      toast({ title: 'Selecione jogos', description: 'Marque pelo menos um jogo para gerar o banner.' });
      return;
    }
    setIsGenerating(true);
    try {
      let matchesForGeneration = selectedMatches;
      const shouldAttemptRefreshForCrests =
        matchesForGeneration.length > 0 &&
        matchesForGeneration.every((m) => !hasRenderableCrest(m.homeCrestUrl) && !hasRenderableCrest(m.awayCrestUrl));

      if (shouldAttemptRefreshForCrests) {
        try {
          await triggerScheduleRefresh(schedule.date);
          const refreshed = await apiRequest<FootballScheduleResponse>({
            path: `/api/football/schedule?date=${encodeURIComponent(schedule.date)}`,
            method: 'GET',
            auth: true,
            timeoutMs: 20_000,
          });
          writeCachedFootballSchedule(refreshed);
          applySchedule(refreshed);
          const selectedKeys = new Set(selectedMatches.map((m) => footballMatchKey(m)));
          const remapped = (Array.isArray(refreshed.matches) ? refreshed.matches : []).filter((m) =>
            selectedKeys.has(footballMatchKey(m))
          );
          if (remapped.length > 0) {
            matchesForGeneration = remapped;
          }
        } catch {
          // Se não conseguir atualizar, segue com os dados atuais para não bloquear a geração.
        }
      }

      const modelDefault = FOOTBALL_TEMPLATE_DEFAULT_COLORS[selectedTemplateId] || { primary: '#2563eb', secondary: '#7c3aed' };
      clearGenerated();
      const { blobs, pageCount } = await generateFootballBanners({
        brandPrimary: modelDefault.primary,
        brandSecondary: modelDefault.secondary,
        brandName: user?.brandName,
        brandLogo: user?.brandLogo,
        footerText,
        footerContactType: includeFooterPhone ? 'phone' : includeFooterWebsite ? 'website' : undefined,
        date: schedule.date,
        matches: matchesForGeneration,
        format,
        templateId: selectedTemplateId,
      });
      const createdAt = Date.now();
      const items = blobs.map((blob, pageIndex) => {
        const url = URL.createObjectURL(blob);
        const id = typeof window !== 'undefined' && window.crypto && 'randomUUID' in window.crypto
          ? window.crypto.randomUUID()
          : `${createdAt}-${pageIndex}-${Math.random().toString(16).slice(2)}`;
        return {
          id,
          url,
          blob,
          date: schedule.date,
          createdAt,
          format,
          templateId: selectedTemplateId,
          pageIndex,
          pageCount,
        };
      });
      setGenerated(items);
      setGeneratedSelection(Object.fromEntries(items.map((item) => [item.id, true])));
    } catch (err) {
      console.error('Erro ao gerar banner de futebol', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o banner. Tente novamente.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Tentar novamente" onClick={() => void handleGenerate()}>
            Tentar novamente
          </ToastAction>
        ),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent variant="complex" className="max-w-6xl h-[92vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Banner Futebol</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,400px),1fr] gap-4 h-full min-h-0">
          <Card className="min-h-0 flex flex-col">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">Jogos e modelos</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    {schedule?.date ? `Data: ${formatDatePtBr(schedule.date)}` : 'Carregando…'}
                  </div>
                </div>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Jogos (somente os marcados entram nos banners)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!schedule?.matches?.length) return;
                        setMatchSelection(() => {
                          const next: Record<string, boolean> = {};
                          for (const match of schedule.matches) {
                            next[footballMatchKey(match)] = true;
                          }
                          return next;
                        });
                      }}
                      disabled={!schedule?.matches?.length}
                    >
                      Marcar todos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!schedule?.matches?.length) return;
                        setMatchSelection(() => {
                          const next: Record<string, boolean> = {};
                          for (const match of schedule.matches) {
                            next[footballMatchKey(match)] = false;
                          }
                          return next;
                        });
                      }}
                      disabled={!schedule?.matches?.length}
                    >
                      Desmarcar
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-56 rounded-md border">
                  <div className="p-3 space-y-2">
                    {schedule?.matches?.length ? (
                      schedule.matches.map((match, idx) => {
                        const key = footballMatchKey(match);
                        const id = `footballMatch-${idx}`;
                        const channels = match.channels?.length ? match.channels.join(', ') : '—';
                        const competition = typeof match?.competition === 'string' && match.competition.trim() ? match.competition.trim() : 'Campeonato não informado';
                        const checked = Boolean(matchSelection[key]);
                        return (
                          <div key={key} className="flex items-start gap-3">
                            <Checkbox
                              id={id}
                              checked={checked}
                              onCheckedChange={(value) => {
                                const nextChecked = value === true;
                                setMatchSelection((prev) => ({ ...prev, [key]: nextChecked }));
                              }}
                            />
                            <label htmlFor={id} className="min-w-0 cursor-pointer">
                              <div className="text-sm font-medium leading-tight">
                                {match.time} • {match.home} x {match.away}
                              </div>
                              <div className="text-xs text-muted-foreground leading-tight">
                                {[competition, channels].filter(Boolean).join(' • ')}
                              </div>
                            </label>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground">Nenhum jogo disponível.</div>
                    )}
                  </div>
                </ScrollArea>
                <div className="text-xs text-muted-foreground">
                  {selectedMatches.length}/{schedule?.matches?.length || 0} selecionado(s) - apenas estes serao usados na geracao
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => void handleCopyText()} disabled={!scheduleText}>
                    <Copy className="h-4 w-4" />
                    <span className="ml-2">Copiar lista</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Modelo</Label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3" role="radiogroup" aria-label="Modelos de banner">
                  {FOOTBALL_BANNER_TEMPLATES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      role="radio"
                      aria-checked={selectedTemplateId === t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`flex flex-col items-center gap-2 rounded-md border p-2 text-left transition-colors hover:border-primary ${
                        selectedTemplateId === t.id ? 'border-primary ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <img
                        src={`/src/assets/img/template-${t.id}.png`}
                        alt={`Exemplo do template ${t.name}`}
                        className="rounded-md aspect-[4/5] w-20 sm:w-24 bg-muted object-cover"
                      />
                      <div className="w-full">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-[11px] text-muted-foreground">{t.resolution}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Gerar banner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 min-h-0 overflow-y-auto pr-1 flex-1">
              <div className="space-y-2">
                <div className="grid gap-2">
                  <Label>Rodapé (opcional) — Contato</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {footerWebsiteAvailable && (
                      <Label className="flex items-center gap-2">
                        <Checkbox
                          checked={includeFooterWebsite}
                          onCheckedChange={(v) => {
                            const next = Boolean(v);
                            setIncludeFooterWebsite(next);
                            if (next) setIncludeFooterPhone(false);
                          }}
                          disabled={isGenerating}
                        />
                        Incluir site
                      </Label>
                    )}
                    {footerPhoneAvailable && (
                      <Label className="flex items-center gap-2">
                        <Checkbox
                          checked={includeFooterPhone}
                          onCheckedChange={(v) => {
                            const next = Boolean(v);
                            setIncludeFooterPhone(next);
                            if (next) setIncludeFooterWebsite(false);
                          }}
                          disabled={isGenerating}
                        />
                        Incluir telefone
                      </Label>
                    )}
                  </div>
                  {!footerPhoneAvailable && !footerWebsiteAvailable ? (
                    <p className="text-xs text-muted-foreground">Para habilitar, cadastre site e/ou telefone na Minha Área.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {footerText ? `Rodapé atual: ${footerText}` : 'Selecione uma opção de contato para exibir no rodapé.'}
                    </p>
                  )}
              </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => void handleGenerate()}
                  disabled={isLoading || isGenerating || !schedule?.matches?.length || selectedMatches.length === 0}
                  className="gap-2"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {isGenerating ? 'Gerando…' : 'Gerar banner'}
                </Button>
              </div>

              <Separator />

              <div className="space-y-2 min-h-0 flex flex-col flex-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Pré-visualizações</Label>
                    <div className="text-xs text-muted-foreground">{selectedGenerated.length}/{generated.length} selecionado(s)</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGeneratedSelection(Object.fromEntries(generated.map((item) => [item.id, true])))}
                      disabled={generated.length === 0}
                    >
                      Selecionar todos
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGeneratedSelection({})}
                      disabled={generated.length === 0}
                    >
                      Limpar seleção
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void downloadAllGenerated()}
                      disabled={selectedGenerated.length === 0 || isGenerating}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Baixar selecionados
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSendAllToTelegram()}
                      disabled={selectedGenerated.length === 0 || isGenerating}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Enviar selecionados
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">

                  {sendAllProgress ? (
                    <div className="w-full">
                      <div className="text-[11px] text-muted-foreground text-right" role="status" aria-live="polite">
                        Enviando {sendAllProgress.current}/{sendAllProgress.total}…
                      </div>
                      <div
                        className="h-2 w-full rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={sendAllProgress.total}
                        aria-valuenow={sendAllProgress.current}
                        aria-label="Progresso de envio"
                      >
                        <div
                          className="h-2 rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${Math.round((sendAllProgress.current / Math.max(1, sendAllProgress.total)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  </div>
                </div>
                {generated.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Gere um banner para visualizar aqui.</div>
                ) : generated.length === 1 ? (
                  <div className="rounded-md border bg-background/40 p-4 flex-1 min-h-0">
                    {generated.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-background/60 p-3 space-y-3 h-full flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={generatedSelection[item.id] === true}
                              onCheckedChange={(checked) =>
                                setGeneratedSelection((prev) => ({ ...prev, [item.id]: checked === true }))
                              }
                            />
                            <span className="text-sm text-muted-foreground">Selecionar</span>
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            {formatDatePtBr(item.date)} • 1080×1350 •{' '}
                            {FOOTBALL_BANNER_TEMPLATES.find((t) => t.id === item.templateId)?.name || 'Modelo'}
                            {item.pageCount > 1 ? ` • Pág. ${item.pageIndex + 1}/${item.pageCount}` : ''}
                          </div>
                        </div>
                        <div className="flex-1 min-h-[62vh] max-h-[70vh] mx-auto w-full">
                          <img
                            src={item.url}
                            alt={`Prévia do banner de jogos do dia ${formatDatePtBr(item.date)}${
                              item.pageCount > 1 ? ` (página ${item.pageIndex + 1} de ${item.pageCount})` : ''
                            }`}
                            className="h-full w-full rounded-md border bg-muted object-contain"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[54vh] sm:h-[58vh] lg:h-[64vh] rounded-md border bg-background/40">
                    <div className="p-4 space-y-4">
                      {generated.map((item) => (
                        <div key={item.id} className="rounded-lg border bg-background/60 p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={generatedSelection[item.id] === true}
                                onCheckedChange={(checked) =>
                                  setGeneratedSelection((prev) => ({ ...prev, [item.id]: checked === true }))
                                }
                              />
                              <span className="text-sm text-muted-foreground">Selecionar</span>
                            </div>
                            <div className="text-xs sm:text-sm text-muted-foreground">
                              {formatDatePtBr(item.date)} • 1080×1350 •{' '}
                              {FOOTBALL_BANNER_TEMPLATES.find((t) => t.id === item.templateId)?.name || 'Modelo'}
                              {item.pageCount > 1 ? ` • Pág. ${item.pageIndex + 1}/${item.pageCount}` : ''}
                            </div>
                          </div>
                          <div className="aspect-[4/5]">
                            <img
                              src={item.url}
                              alt={`Prévia do banner de jogos do dia ${formatDatePtBr(item.date)}${
                                item.pageCount > 1 ? ` (página ${item.pageIndex + 1} de ${item.pageCount})` : ''
                              }`}
                              className="h-full w-full rounded-md border bg-muted object-contain"
                              loading="lazy"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FootballBannerModal;
