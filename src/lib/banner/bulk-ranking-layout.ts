import type { MovieData } from '../../services/searchService';
import { apiRequestGetTryCandidates } from '../../services/apiClient';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../utils';
import { canvasToBlob, drawRoundedRect, wrapTextSimple } from './canvas';
import { hexToRgba } from './colors';
import { loadImageOrThrow } from './image';
import { getPosterUrl } from './poster';
import { drawRankBadgeSquare } from './bulk-ranking';

export type RankingCategory = 'movie' | 'tv' | 'all';
export type RankingColorVariant = 'classic' | 'brand' | 'dark' | 'red';
export type BannerFormatSize = { width: number; height: number };

export type RankingBrandInput = {
  brandName?: string | null;
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

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) =>
  wrapTextSimple(ctx, text, maxWidth);

const getRankingHeader = (category: RankingCategory, _rangeLabel?: string) => {
  if (category === 'movie') return 'Top 10 Filmes da Semana';
  if (category === 'tv') return 'Top 10 Séries da Semana';
  return 'Top 10 Conteúdos da Semana';
};

const buildRankingFooterText = (options: RankingLayoutOptions) => {
  const { brand: user, footerIncludePhone, footerIncludeWebsite } = options;
  const phone = typeof user?.phone === 'string' ? formatPhoneForDisplay(user.phone) : '';
  const website = typeof user?.website === 'string' ? formatWebsiteForDisplay(user.website) : '';
  const parts: string[] = [];
  if (footerIncludeWebsite && website) parts.push(website);
  if (footerIncludePhone && phone) parts.push(phone);
  return parts.join(' • ');
};


const drawWhatsappIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  const r = size / 2;
  ctx.save();
  ctx.fillStyle = '#25D366';
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fill();

  const strokeW = Math.max(2, Math.round(size * 0.10));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.38, y + size * 0.36);
  ctx.lineTo(x + size * 0.50, y + size * 0.48);
  ctx.lineTo(x + size * 0.64, y + size * 0.34);
  ctx.moveTo(x + size * 0.38, y + size * 0.62);
  ctx.lineTo(x + size * 0.50, y + size * 0.50);
  ctx.lineTo(x + size * 0.66, y + size * 0.64);
  ctx.stroke();
  ctx.restore();
};

const drawRankingFooter = (
  ctx: CanvasRenderingContext2D,
  args: { y: number; width: number; height: number; website?: string; phone?: string; floating?: boolean }
) => {
  const website = (args.website || '').trim();
  const phone = (args.phone || '').trim();
  if (!website && !phone) return;

  const footerX = (ctx.canvas.width - args.width) / 2;
  const footerY = args.y;
  const footerH = args.height;

  ctx.save();
  if (!args.floating) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    drawRoundedRect(ctx, footerX, footerY, args.width, footerH, Math.round(footerH / 2));
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  }

  const fontSize = Math.max(18, Math.round(footerH * 0.40));
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const iconSize = Math.max(22, Math.round(footerH * 0.55));
  const gap = Math.max(10, Math.round(footerH * 0.16));
  const bullet = website && phone ? ' • ' : '';
  const bulletW = bullet ? ctx.measureText(bullet).width : 0;
  const websiteW = website ? ctx.measureText(website).width : 0;
  const phoneW = phone ? ctx.measureText(phone).width : 0;
  const iconBlockW = phone ? iconSize + Math.round(gap * 0.8) : 0;
  const totalW = websiteW + bulletW + iconBlockW + phoneW;

  let x = ctx.canvas.width / 2 - totalW / 2;
  const textY = footerY + footerH / 2 + Math.round(fontSize * 0.36);

  if (website) {
    ctx.fillText(website, x, textY);
    x += websiteW;
  }

  if (bullet) {
    ctx.fillText(bullet, x, textY);
    x += bulletW;
  }

  if (phone) {
    const iconY = footerY + (footerH - iconSize) / 2;
    drawWhatsappIcon(ctx, x, iconY, iconSize);
    x += iconSize + Math.round(gap * 0.8);
    ctx.fillText(phone, x, textY);
  }
  ctx.restore();
};

const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let drawW = w;
  let drawH = h;
  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
  } else {
    drawW = w;
    drawH = w / imgRatio;
  }
  const dx = x - (drawW - w) / 2;
  const dy = y - (drawH - h) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
};

const loadPoster = async (movie: MovieData, size: string) => {
  if (!movie.poster_path) return null;
  try {
    return await loadImageOrThrow(getPosterUrl({ posterPath: movie.poster_path, size }));
  } catch {
    return null;
  }
};

const loadBrandLogo = async (brandLogo?: string | null) => {
  const src = typeof brandLogo === 'string' ? brandLogo.trim() : '';
  if (!src) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao carregar logo'));
    });
    return img;
  } catch {
    return null;
  }
};

const drawBrandLogoWatermark = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  args?: { alpha?: number; tileW?: number; tileH?: number; logoW?: number; rotationDeg?: number }
) => {
  const alpha = Math.max(0, Math.min(1, args?.alpha ?? 0.06));
  const tileW = Math.max(120, Math.round(args?.tileW ?? 320));
  const tileH = Math.max(120, Math.round(args?.tileH ?? 260));
  const logoW = Math.max(60, Math.round(args?.logoW ?? 180));
  const rotationDeg = args?.rotationDeg ?? -18;

  const tile = document.createElement('canvas');
  tile.width = tileW;
  tile.height = tileH;
  const tctx = tile.getContext('2d');
  if (!tctx) return;

  const scale = Math.min(logoW / logo.width, 1);
  const w = Math.max(1, Math.round(logo.width * scale));
  const h = Math.max(1, Math.round(logo.height * scale));

  tctx.save();
  tctx.translate(tileW / 2, tileH / 2);
  tctx.rotate((rotationDeg * Math.PI) / 180);
  tctx.globalAlpha = alpha;
  tctx.drawImage(logo, -w / 2, -h / 2, w, h);
  tctx.restore();

  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
};

export const generateRankingBannerEmAlta = async (args: {
  items: MovieData[];
  category: RankingCategory;
  format: BannerFormatSize;
  rankOffset: number;
  options: RankingLayoutOptions;
}): Promise<Blob> => {
  const {
    brand: user,
    colorVariant: rankingColorVariant,
    footerIncludePhone: rankingFooterIncludePhone,
    footerIncludeWebsite: rankingFooterIncludeWebsite,
  } = args.options;
  const items = args.items.slice(0, 5);
  const hasBrandColors = Boolean(user?.brandColors?.primary && user?.brandColors?.secondary);
  const brandPrimary = user?.brandColors?.primary ?? '#3b82f6';
  const brandSecondary = user?.brandColors?.secondary ?? '#8b5cf6';
  const variant: RankingColorVariant = rankingColorVariant === 'brand' && !hasBrandColors ? 'classic' : rankingColorVariant;
  const theme =
    variant === 'brand'
      ? {
          background: '#0b0f18',
          overlayWarmA: brandPrimary,
          overlayWarmB: brandSecondary,
          headerStyle: 'gradient' as const,
          headerA: brandPrimary,
          headerB: brandSecondary,
        }
      : variant === 'dark'
        ? {
            background: '#070911',
            overlayWarmA: '#111827',
            overlayWarmB: '#000000',
            headerStyle: 'solid' as const,
            headerA: 'rgba(17,24,39,0.92)',
            headerB: 'rgba(17,24,39,0.92)',
          }
        : variant === 'red'
          ? {
              background: '#0b0f18',
              overlayWarmA: '#ef4444',
              overlayWarmB: '#b91c1c',
              headerStyle: 'solid' as const,
              headerA: 'rgba(185, 28, 28, 0.95)',
              headerB: 'rgba(185, 28, 28, 0.95)',
            }
        : {
            background: '#0b0f18',
            overlayWarmA: '#3b82f6',
            overlayWarmB: '#8b5cf6',
            headerStyle: 'gradient' as const,
            headerA: '#3b82f6',
            headerB: '#8b5cf6',
          };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context não disponível');

  canvas.width = args.format.width;
  canvas.height = args.format.height;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const isSecondPage = args.rankOffset > 0;
  const main = items[0];
  const posterMain = !isSecondPage && main ? await loadPoster(main, 'w780') : null;
  if (posterMain) {
    ctx.save();
    ctx.globalAlpha = args.rankOffset > 0 ? 0.32 : 0.55;
    ctx.filter = args.rankOffset > 0 ? 'blur(26px)' : 'blur(16px)';
    drawImageCover(ctx, posterMain, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const overlay = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  overlay.addColorStop(0, 'rgba(0,0,0,0.50)');
  overlay.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const warm = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height);
  if (variant === 'brand') {
    warm.addColorStop(0, 'rgba(0,0,0,0.00)');
    warm.addColorStop(0.35, `${theme.overlayWarmA}00`);
    warm.addColorStop(1, `${theme.overlayWarmB}88`);
  } else if (variant === 'dark') {
    warm.addColorStop(0, 'rgba(0,0,0,0.00)');
    warm.addColorStop(1, 'rgba(0,0,0,0.55)');
  } else if (variant === 'red') {
    warm.addColorStop(0, hexToRgba(theme.overlayWarmA, 0));
    warm.addColorStop(1, hexToRgba(theme.overlayWarmB, 0.22));
  } else {
    warm.addColorStop(0, hexToRgba(theme.overlayWarmA, 0));
    warm.addColorStop(1, hexToRgba(theme.overlayWarmB, 0.55));
  }
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (variant === 'red') {
    const ambientRed = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    ambientRed.addColorStop(0, hexToRgba('#ef4444', 0.16));
    ambientRed.addColorStop(1, hexToRgba('#b91c1c', 0.16));
    ctx.fillStyle = ambientRed;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const brandName = (user?.brandName || 'MediaHub').trim();
  const brandLogo = await loadBrandLogo(user?.brandLogo);
  if (brandLogo) {
    drawBrandLogoWatermark(ctx, brandLogo, { alpha: 0.05, logoW: 180, tileW: 340, tileH: 280, rotationDeg: -18 });
  }

  const padding = 56;
  const gap = 16;
  const drawCardTitlePill = (args: { x: number; y: number; w: number; title: string }) => {
    const pillH = 60;
    const pillY = args.y;
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    drawRoundedRect(ctx, args.x, pillY, args.w, pillH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, args.x, pillY, args.w, pillH, 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    const fontCandidates = [15, 14, 13, 12, 11];
    const maxLines = 3;
    let chosenFont = 11;
    let renderLines: string[] = [];
    for (const size of fontCandidates) {
      ctx.font = `700 ${size}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      const lines = wrapText(ctx, args.title, args.w - 16);
      const lineH = Math.round(size * 1.1);
      if (lines.length <= maxLines && lines.length * lineH <= pillH - 10) {
        chosenFont = size;
        renderLines = lines;
        break;
      }
    }
    if (renderLines.length === 0) {
      ctx.font = `700 ${chosenFont}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      const lines = wrapText(ctx, args.title, args.w - 16);
      renderLines = lines.slice(0, maxLines);
      if (lines.length > maxLines && renderLines[maxLines - 1]) {
        renderLines[maxLines - 1] = `${renderLines[maxLines - 1]}…`;
      }
    }
    ctx.font = `700 ${chosenFont}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lineH = Math.round(chosenFont * 1.1);
    const totalH = renderLines.length * lineH;
    let textY = pillY + (pillH - totalH) / 2;
    renderLines.forEach((line) => {
      ctx.fillText(line, args.x + args.w / 2, textY);
      textY += lineH;
    });
  };
  const heroPosterW = Math.round(canvas.width * 0.29);
  const heroPosterH = Math.round(canvas.height * 0.47);
  const heroPosterX = padding;
  const heroPosterY = 104;

  if (!isSecondPage) {
    if (posterMain) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 12;
      drawRoundedRect(ctx, heroPosterX, heroPosterY, heroPosterW, heroPosterH, 22);
      ctx.clip();
      drawImageCover(ctx, posterMain, heroPosterX, heroPosterY, heroPosterW, heroPosterH);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, heroPosterX, heroPosterY, heroPosterW, heroPosterH, 22);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      drawRoundedRect(ctx, heroPosterX, heroPosterY, heroPosterW, heroPosterH, 22);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SEM IMAGEM', heroPosterX + heroPosterW / 2, heroPosterY + heroPosterH / 2);
    }
  }

  const headerPillY = 24;
  const headerPillH = 56;
  const headerPillW = 560;
  const headerPillX = (canvas.width - headerPillW) / 2;
  if (theme.headerStyle === 'gradient') {
    const g = ctx.createLinearGradient(headerPillX, headerPillY, headerPillX + headerPillW, headerPillY + headerPillH);
    g.addColorStop(0, theme.headerA);
    g.addColorStop(1, theme.headerB);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = g;
    drawRoundedRect(ctx, headerPillX, headerPillY, headerPillW, headerPillH, 28);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = theme.headerA;
    drawRoundedRect(ctx, headerPillX, headerPillY, headerPillW, headerPillH, 28);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(getRankingHeader(args.category), canvas.width / 2, headerPillY + 37);

  if (isSecondPage) {
    const brandHeaderY = 104;
    if (brandLogo) {
      const maxW = 300;
      const maxH = 98;
      const scale = Math.min(maxW / brandLogo.width, maxH / brandLogo.height, 1);
      const w = Math.max(1, Math.round(brandLogo.width * scale));
      const h = Math.max(1, Math.round(brandLogo.height * scale));
      const pad = 12;
      const boxW = w + pad * 2;
      const boxH = h + pad * 2;
      const x = (canvas.width - boxW) / 2;
      const y = brandHeaderY;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      drawRoundedRect(ctx, x, y, boxW, boxH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, boxW, boxH, 18);
      ctx.stroke();
      ctx.globalAlpha = 0.98;
      ctx.drawImage(brandLogo, x + pad, y + pad, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '900 32px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(brandName, canvas.width / 2, brandHeaderY + 56);
    }

    const footerPhone =
      rankingFooterIncludePhone && typeof user?.phone === 'string' && user.phone.trim() ? formatPhoneForDisplay(user.phone) : '';
    const footerWebsite =
      rankingFooterIncludeWebsite && typeof user?.website === 'string' && user.website.trim() ? formatWebsiteForDisplay(user.website) : '';
    const footerReserve = footerPhone || footerWebsite ? 86 : 0;
    const topY = 260;
    const bottomY = canvas.height - padding - footerReserve;
    const availableH = Math.max(1, bottomY - topY);
    const labelH = 60;
    const gapX = 18;
    const gapY = 24;

    let cardW = Math.floor((canvas.width - padding * 2 - gapX * 2) / 3);
    cardW = Math.min(cardW, 236);
    let posterH = Math.floor(cardW * 1.45);
    let cellH = posterH + labelH;
    const maxCellH = Math.floor((availableH - gapY) / 2);
    while (cellH > maxCellH && cardW > 140) {
      cardW -= 4;
      posterH = Math.floor(cardW * 1.45);
      cellH = posterH + labelH;
    }
    const row1Y = topY;
    const row2Y = row1Y + cellH + gapY;

    const row1W = cardW * 3 + gapX * 2;
    const row2W = cardW * 2 + gapX;
    const row1X = (canvas.width - row1W) / 2;
    const row2X = (canvas.width - row2W) / 2;
    const positions: Array<{ x: number; y: number; i: number }> = [
      { x: row1X, y: row1Y, i: 0 },
      { x: row1X + (cardW + gapX), y: row1Y, i: 1 },
      { x: row1X + (cardW + gapX) * 2, y: row1Y, i: 2 },
      { x: row2X, y: row2Y, i: 3 },
      { x: row2X + (cardW + gapX), y: row2Y, i: 4 },
    ];

    for (const pos of positions) {
      const item = items[pos.i];
      if (!item) continue;
      const poster = await loadPoster(item, 'w500');
      const x = pos.x;
      const yItem = pos.y;
      const posterW = cardW;
      const posterY = yItem;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.40)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetX = 6;
      ctx.shadowOffsetY = 10;
      drawRoundedRect(ctx, x, posterY, posterW, posterH, 20);
      ctx.clip();
      if (poster) {
        drawImageCover(ctx, poster, x, posterY, posterW, posterH);
      } else {
        const missingGradient = ctx.createLinearGradient(x, posterY, x + posterW, posterY + posterH);
        missingGradient.addColorStop(0, 'rgba(255,255,255,0.10)');
        missingGradient.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = missingGradient;
        ctx.fillRect(x, posterY, posterW, posterH);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '700 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SEM CAPA', x + posterW / 2, posterY + posterH / 2);
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, x, posterY, posterW, posterH, 20);
      ctx.stroke();

      const title = (item?.title || item?.name || '').trim();
      if (title) {
        const pillY = posterY + posterH + 8;
        drawCardTitlePill({ x, y: pillY, w: posterW, title });
      }

      const rankText = `${args.rankOffset + pos.i + 1}º`;
      const badgeSize = 44;
      const bx = x + posterW - badgeSize - 10;
      const by = posterY + 10;
      drawRankBadgeSquare({ ctx, x: bx, y: by, size: badgeSize, text: rankText });
    }

    if (footerPhone || footerWebsite) {
      const footerH = 54;
      const footerW = canvas.width - padding * 2;
      const footerY = canvas.height - padding + 12 - footerH;
      drawRankingFooter(ctx, { y: footerY, width: footerW, height: footerH, website: footerWebsite, phone: footerPhone, floating: true });
    }

    return canvasToBlob(canvas, 'image/png', 1.0);
  }

  const heroRankText = `${args.rankOffset + 1}º`;
  const heroBadgeSize = 54;
  const heroBx = heroPosterX + 14;
  const heroBy = heroPosterY + 14;
  drawRankBadgeSquare({ ctx, x: heroBx, y: heroBy, size: heroBadgeSize, text: heroRankText });

  const infoX = heroPosterX + heroPosterW + 48;
  const infoY = heroPosterY;
  const infoW = canvas.width - infoX - padding;
  const infoH = heroPosterH;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  drawRoundedRect(ctx, infoX, infoY, infoW, infoH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, infoX, infoY, infoW, infoH, 26);
  ctx.stroke();

  const headerY = infoY + 34;
  let headerContentBottom = headerY;
  let logoRect: { x: number; y: number; w: number; h: number } | null = null;
  if (brandLogo) {
    const maxW = 240;
    const maxH = 86;
    const scale = Math.min(maxW / brandLogo.width, maxH / brandLogo.height, 1);
    const w = Math.max(1, Math.round(brandLogo.width * scale));
    const h = Math.max(1, Math.round(brandLogo.height * scale));
    const pad = 12;
    const boxW = w + pad * 2;
    const boxH = h + pad * 2;
    const x = infoX + (infoW - boxW) / 2;
    const y = headerY - 8;
    headerContentBottom = y + boxH;
    logoRect = { x, y, w: boxW, h: boxH };
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    drawRoundedRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, y, boxW, boxH, 18);
    ctx.stroke();
    ctx.globalAlpha = 0.98;
    ctx.drawImage(brandLogo, x + pad, y + pad, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(brandName, infoX + infoW / 2, headerY + 36);
    headerContentBottom = headerY + 54;
  }

  const title = (main?.title || main?.name || '').trim() || 'Título';
  const synopsis = (main?.overview || '').trim();

  const ctaW = 240;
  const ctaH = 50;
  const ctaX = infoX + 32;
  const ctaY = infoY + infoH - 84;
  const contentBottom = ctaY - 22;

  let y = Math.max(infoY + 140, headerContentBottom + 44);
  if (logoRect) {
    y = Math.max(y, logoRect.y + logoRect.h + 44);
  }
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  const titleSizes = [56, 52, 48, 44];
  let titleFontSize = 56;
  let titleLines: string[] = [];
  for (const size of titleSizes) {
    ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const lines = wrapText(ctx, title, infoW - 64);
    const lineCount = Math.min(2, lines.length);
    const lineH = Math.round(size * 1.12);
    const reserveAfterTitle = synopsis ? 120 : 54;
    const needed = lineCount * lineH + reserveAfterTitle;
    if (y + needed <= contentBottom) {
      titleFontSize = size;
      titleLines = lines;
      break;
    }
    titleFontSize = size;
    titleLines = lines;
  }
  const titleLineH = Math.round(titleFontSize * 1.12);
  const limitedTitleLines = titleLines.slice(0, 2);
  if (titleLines.length > 2 && limitedTitleLines.length === 2) {
    const last = limitedTitleLines[1] || '';
    limitedTitleLines[1] = last ? `${last}…` : last;
  }
  limitedTitleLines.forEach((line, idx) => {
    ctx.fillText(line, infoX + 32, y + idx * titleLineH);
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  y += limitedTitleLines.length * titleLineH + 20;

  type SearchDetailsResponse = {
    vote_average?: number;
    genres?: Array<{ id?: number | null; name?: string }>;
  };

  let rating = typeof main?.vote_average === 'number' ? main.vote_average : 0;
  let genres: string[] = [];
  const shouldFetchDetails = Boolean(main && typeof main.id === 'number' && main.id > 0 && main.id < 10_000_000);
  if (shouldFetchDetails) {
    try {
      const details = await apiRequestGetTryCandidates<SearchDetailsResponse>({
        path: `/api/search/details?mediaType=${encodeURIComponent(main!.media_type)}&id=${encodeURIComponent(String(main!.id))}&language=pt-BR`,
        auth: true,
      });
      if (typeof details?.vote_average === 'number') rating = details.vote_average;
      if (Array.isArray(details?.genres)) {
        genres = details.genres
          .map((g) => (typeof g?.name === 'string' ? g.name.trim() : ''))
          .filter(Boolean)
          .slice(0, 2);
      }
    } catch {
      genres = [];
    }
  }

  const metaParts: string[] = [];
  if (rating > 0) metaParts.push(`⭐ ${rating.toFixed(1)}`);
  if (genres.length > 0) metaParts.push(genres.join(' • '));
  if (metaParts.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.font = '800 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(metaParts.join('  •  '), infoX + 32, y);
    y += 42;
  }

  if (synopsis) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '500 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const synopsisLines = wrapText(ctx, synopsis, infoW - 64);
    const lineH = 30;
    const remaining = Math.max(0, contentBottom - y);
    const maxLines = Math.min(4, Math.floor(remaining / lineH));
    synopsisLines.slice(0, Math.max(0, maxLines)).forEach((line, idx) => {
      const isLast = idx === maxLines - 1;
      const text = isLast && synopsisLines.length > maxLines ? `${line}…` : line;
      ctx.fillText(text, infoX + 32, y + idx * lineH);
    });
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  drawRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 25);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ASSISTA AGORA!', ctaX + ctaW / 2, ctaY + 33);

  const rankingFooterText = buildRankingFooterText(args.options);
  const rowY = heroPosterY + heroPosterH + 44;
  const maxItemW = (canvas.width - padding * 2 - gap * 3) / 4;
  const footerReserve = rankingFooterText ? 140 : 64;
  const availableH = Math.max(1, canvas.height - rowY - footerReserve);
  const labelH = 48;
  const itemH = Math.min(availableH, maxItemW * 1.62);
  const itemW = itemH / 1.62;
  const totalRowW = itemW * 4 + gap * 3;
  const rowX = (canvas.width - totalRowW) / 2;

  for (let i = 1; i < Math.min(items.length, 5); i++) {
    const item = items[i];
    const poster = await loadPoster(item, 'w500');
    const x = rowX + (i - 1) * (itemW + gap);
    const yItem = rowY;

    const posterH = Math.max(1, Math.round(itemH - labelH));
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 10;
    drawRoundedRect(ctx, x, yItem, itemW, posterH, 18);
    ctx.clip();
    if (poster) {
      drawImageCover(ctx, poster, x, yItem, itemW, posterH);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, yItem, itemW, posterH);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x, yItem, itemW, posterH, 18);
    ctx.stroke();

    const title = (item?.title || item?.name || '').trim();
    if (title) {
      const pillY = yItem + posterH + 8;
      drawCardTitlePill({ x, y: pillY, w: itemW, title });
    }

    const rankText = `${args.rankOffset + i + 1}º`;
    const badgeSize = 44;
    const bx = x + itemW - badgeSize - 10;
    const by = yItem + 10;
    drawRankBadgeSquare({ ctx, x: bx, y: by, size: badgeSize, text: rankText });
  }

  const footerPhone =
    rankingFooterIncludePhone && typeof user?.phone === 'string' && user.phone.trim() ? formatPhoneForDisplay(user.phone) : '';
  const footerWebsite =
    rankingFooterIncludeWebsite && typeof user?.website === 'string' && user.website.trim() ? formatWebsiteForDisplay(user.website) : '';
  if (footerPhone || footerWebsite) {
    const footerH = 54;
    const footerW = canvas.width - padding * 2;
    const footerY = canvas.height - padding + 12 - footerH;
    drawRankingFooter(ctx, { y: footerY, width: footerW, height: footerH, website: footerWebsite, phone: footerPhone, floating: true });
  }

  return canvasToBlob(canvas, 'image/png', 1.0);
};

export const generateRankingBannerTop10Cartaz = async (args: {
  items: MovieData[];
  category: RankingCategory;
  format: BannerFormatSize;
  rangeLabel?: string;
  rankOffset: number;
  options: RankingLayoutOptions;
}): Promise<Blob> => {
  const {
    brand: user,
    colorVariant: rankingColorVariant,
    footerIncludePhone: rankingFooterIncludePhone,
    footerIncludeWebsite: rankingFooterIncludeWebsite,
  } = args.options;
  const items = args.items.slice(0, args.items.length >= 10 && args.rankOffset === 0 ? 10 : 5);
  const hasBrandColors = Boolean(user?.brandColors?.primary && user?.brandColors?.secondary);
  const brandPrimary = user?.brandColors?.primary ?? '#3b82f6';
  const brandSecondary = user?.brandColors?.secondary ?? '#8b5cf6';
  const variant: RankingColorVariant = rankingColorVariant === 'brand' && !hasBrandColors ? 'classic' : rankingColorVariant;
  const theme =
    variant === 'brand'
      ? {
          background: '#0b0f18',
          ribbonStyle: 'gradient' as const,
          ribbonA: brandPrimary,
          ribbonB: brandSecondary,
        }
      : variant === 'dark'
        ? {
            background: '#070911',
            ribbonStyle: 'solid' as const,
            ribbonA: '#111827',
            ribbonB: '#111827',
          }
        : variant === 'red'
          ? {
              background: '#0b0f18',
              ribbonStyle: 'solid' as const,
              ribbonA: '#b91c1c',
              ribbonB: '#b91c1c',
            }
        : {
            background: '#0b0f18',
            ribbonStyle: 'gradient' as const,
            ribbonA: '#3b82f6',
            ribbonB: '#8b5cf6',
          };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context não disponível');

  canvas.width = args.format.width;
  canvas.height = args.format.height;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bg = items[0] ? await loadPoster(items[0], 'w780') : null;
  if (bg) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.filter = 'blur(22px)';
    drawImageCover(ctx, bg, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
  overlay.addColorStop(0, 'rgba(0,0,0,0.62)');
  overlay.addColorStop(0.5, 'rgba(0,0,0,0.40)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const brandLogo = await loadBrandLogo(user?.brandLogo);
  if (brandLogo) {
    drawBrandLogoWatermark(ctx, brandLogo, { alpha: 0.045, logoW: 160, tileW: 320, tileH: 260, rotationDeg: -18 });
  }

  const ambient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ambient.addColorStop(0, hexToRgba(theme.ribbonA, 0.18));
  ambient.addColorStop(1, hexToRgba(theme.ribbonB, 0.18));
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const vignette = ctx.createLinearGradient(0, Math.round(canvas.height * 0.35), 0, canvas.height);
  vignette.addColorStop(0, 'rgba(0,0,0,0.00)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, Math.round(canvas.height * 0.35), canvas.width, canvas.height);

  const ribbonHeight = 184;
  if (theme.ribbonStyle === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, canvas.width, ribbonHeight);
    g.addColorStop(0, theme.ribbonA);
    g.addColorStop(1, theme.ribbonB);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = theme.ribbonA;
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(canvas.width, 0);
  ctx.lineTo(canvas.width, ribbonHeight);
  ctx.lineTo(0, ribbonHeight - 64);
  ctx.closePath();
  ctx.fill();

  const pad = 60;
  const brandName = (user?.brandName || 'MediaHub').trim();
  const titleText = getRankingHeader(args.category);
  const titleBaseSize = 56;
  const titleMinSize = 38;
  const titleFontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  let reservedRightEdge = canvas.width - pad;
  let logoBoxX: number | null = null;
  let logoBoxY: number | null = null;
  let logoBoxW: number | null = null;
  let logoBoxH: number | null = null;
  let logoDrawX: number | null = null;
  let logoDrawY: number | null = null;
  let logoDrawW: number | null = null;
  let logoDrawH: number | null = null;

  if (brandLogo) {
    const maxW = 280;
    const maxH = 92;
    const scale = Math.min(maxW / brandLogo.width, maxH / brandLogo.height, 1);
    const w = Math.max(1, Math.round(brandLogo.width * scale));
    const h = Math.max(1, Math.round(brandLogo.height * scale));
    const boxPad = 12;
    const boxW = w + boxPad * 2;
    const boxH = h + boxPad * 2;
    const x = canvas.width - pad - boxW;
    const y = 36;
    reservedRightEdge = Math.min(reservedRightEdge, x - 16);
    logoBoxX = x;
    logoBoxY = y;
    logoBoxW = boxW;
    logoBoxH = boxH;
    logoDrawX = x + boxPad;
    logoDrawY = y + boxPad;
    logoDrawW = w;
    logoDrawH = h;
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(brandName, canvas.width - pad, 104);
    ctx.restore();
  }

  const titleLeft = pad;
  const titleRight = Math.max(titleLeft + 1, reservedRightEdge);
  const titleRegionW = Math.max(1, titleRight - titleLeft);
  const titleX = titleLeft + titleRegionW / 2;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `900 ${titleBaseSize}px ${titleFontFamily}`;
  const measuredW = ctx.measureText(titleText).width;
  if (measuredW > titleRegionW) {
    const scaledSize = Math.floor((titleBaseSize * titleRegionW) / measuredW);
    const nextSize = Math.max(titleMinSize, Math.min(titleBaseSize, scaledSize));
    ctx.font = `900 ${nextSize}px ${titleFontFamily}`;
  }
  ctx.fillText(titleText, titleX, 98);

  if (brandLogo && logoBoxX !== null && logoBoxY !== null && logoBoxW !== null && logoBoxH !== null && logoDrawX !== null && logoDrawY !== null && logoDrawW !== null && logoDrawH !== null) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxW, logoBoxH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxW, logoBoxH, 18);
    ctx.stroke();
    ctx.globalAlpha = 0.98;
    ctx.drawImage(brandLogo, logoDrawX, logoDrawY, logoDrawW, logoDrawH);
    ctx.restore();
  }

  if (!brandLogo) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 92px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(brandName.toUpperCase(), canvas.width / 2, 430);
    ctx.restore();
  }

  const footerPhone =
    rankingFooterIncludePhone && typeof user?.phone === 'string' && user.phone.trim() ? formatPhoneForDisplay(user.phone) : '';
  const footerWebsite =
    rankingFooterIncludeWebsite && typeof user?.website === 'string' && user.website.trim() ? formatWebsiteForDisplay(user.website) : '';
  const footerPad = 56;
  const footerH = 64;
  const footerY = footerPhone || footerWebsite ? canvas.height - footerPad + 6 - footerH : null;
  const contentTop = ribbonHeight + 34;
  const contentBottom = footerY !== null ? footerY - 34 : canvas.height - 84;
  const availableH = Math.max(1, contentBottom - contentTop);
  const gapY = 34;
  const gapX = 32;

  const isTenInSinglePage = args.items.length >= 10 && args.rankOffset === 0;
  const gridCols = isTenInSinglePage ? 3 : 2;
  const gridRows = isTenInSinglePage ? 3 : 2;

  const maxRowW = canvas.width - pad * 2;
  const minSmallH = isTenInSinglePage ? 248 : 260;
  const minBigH = isTenInSinglePage ? 420 : 520;

  let bigH = isTenInSinglePage ? Math.min(580, Math.max(430, Math.round(availableH * 0.31))) : Math.min(760, Math.max(560, Math.round(availableH * 0.48)));

  let remainingH = availableH - bigH - gapY;
  let smallH = Math.floor((remainingH - gapY * (gridRows - 1)) / gridRows);
  if (smallH < minSmallH) {
    const targetBigH = availableH - gapY - (minSmallH * gridRows + gapY * (gridRows - 1));
    bigH = Math.max(minBigH, Math.floor(targetBigH));
    if (isTenInSinglePage) bigH = Math.min(580, bigH);
    remainingH = availableH - bigH - gapY;
    smallH = Math.max(1, Math.floor((remainingH - gapY * (gridRows - 1)) / gridRows));
  }

  let smallW = Math.max(1, Math.round(smallH * (2 / 3)));
  const maxSmallWByWidth = Math.floor((maxRowW - gapX * (gridCols - 1)) / gridCols);
  if (smallW > maxSmallWByWidth) {
    smallW = Math.max(1, maxSmallWByWidth);
    smallH = Math.max(1, Math.round(smallW * 1.5));
  }

  const heroY = contentTop;
  const gridTopY = heroY + bigH + gapY;
  const gridW = smallW * gridCols + gapX * (gridCols - 1);
  const gridX = (canvas.width - gridW) / 2;

  const smallBadge = Math.max(52, Math.min(66, Math.round(smallW * 0.22)));
  const infoMinW = isTenInSinglePage ? 420 : 380;
  const maxPosterWByAspect = Math.round(bigH * (2 / 3));
  const maxPosterWByWidth = canvas.width - pad * 2 - gapX - infoMinW;
  const heroPosterW = Math.max(260, Math.min(maxPosterWByAspect, maxPosterWByWidth));
  const heroPosterH = bigH;
  const heroPosterX = pad;
  const heroPosterY = heroY;
  const heroInfoX = heroPosterX + heroPosterW + gapX;
  const heroInfoY = heroY;
  const heroInfoW = canvas.width - pad - heroInfoX;
  const heroInfoH = bigH;
  const heroItem = items[0];
  const heroPoster = heroItem ? await loadPoster(heroItem, 'w780') : null;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 14;
  drawRoundedRect(ctx, heroPosterX, heroPosterY, heroPosterW, heroPosterH, 22);
  ctx.clip();
  if (heroPoster) {
    drawImageCover(ctx, heroPoster, heroPosterX, heroPosterY, heroPosterW, heroPosterH);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(heroPosterX, heroPosterY, heroPosterW, heroPosterH);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, heroPosterX, heroPosterY, heroPosterW, heroPosterH, 22);
  ctx.stroke();

  const heroRank = args.rankOffset + 1;
  const heroBadge = Math.max(64, Math.min(82, Math.round(heroPosterW * 0.22)));
  const heroBx = heroPosterX + 16;
  const heroBy = heroPosterY + 16;
  drawRankBadgeSquare({
    ctx,
    x: heroBx,
    y: heroBy,
    size: heroBadge,
    text: `${heroRank}º`,
  });

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  drawRoundedRect(ctx, heroInfoX, heroInfoY, heroInfoW, heroInfoH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, heroInfoX, heroInfoY, heroInfoW, heroInfoH, 26);
  ctx.stroke();
  ctx.restore();

  const heroPad = isTenInSinglePage ? 22 : 26;
  const heroContentX = heroInfoX + heroPad;
  const heroContentW = heroInfoW - heroPad * 2;
  let heroCursorY = heroInfoY + (isTenInSinglePage ? 36 : 44);

  const heroTitle = (heroItem?.title || heroItem?.name || '').trim() || 'Título';
  const heroSynopsis = (heroItem?.overview || '').trim();
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  const titleSizes = isTenInSinglePage ? [38, 34, 30, 28] : [44, 40, 36, 32];
  let titleFontSize = isTenInSinglePage ? 38 : 44;
  let titleLines: string[] = [];
  for (const size of titleSizes) {
    ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const lines = wrapText(ctx, heroTitle, heroContentW - (isTenInSinglePage ? 8 : 0));
    const lineCount = Math.min(2, lines.length);
    const lineH = Math.round(size * 1.12);
    const needed = lineCount * lineH;
    if (needed <= (isTenInSinglePage ? 92 : 118)) {
      titleFontSize = size;
      titleLines = lines;
      break;
    }
  }
  ctx.font = `900 ${titleFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  const titleLineH = Math.round(titleFontSize * 1.12);
  const titleToRender = titleLines.length ? titleLines.slice(0, 2) : [heroTitle];
  for (let i = 0; i < titleToRender.length; i++) {
    const line = titleToRender[i] || '';
    const text = i === 1 && titleLines.length > 2 ? `${line}…` : line;
    ctx.fillText(text, heroContentX, heroCursorY + i * titleLineH);
  }
  heroCursorY += titleToRender.length * titleLineH + (isTenInSinglePage ? 20 : 18);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.restore();

  const ctaH = isTenInSinglePage ? 46 : 54;
  const ctaW = Math.min(heroContentW, isTenInSinglePage ? 320 : 360);
  const ctaX = heroInfoX + (heroInfoW - ctaW) / 2;
  const ctaY = heroInfoY + heroInfoH - heroPad - ctaH;

  if (heroSynopsis) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = isTenInSinglePage ? '500 21px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : '22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    const lineH = isTenInSinglePage ? 30 : 30;
    const maxSynopsisH = Math.max(0, ctaY - heroCursorY - 16);
    const maxLines = isTenInSinglePage ? Math.max(1, Math.min(3, Math.floor(maxSynopsisH / lineH))) : Math.max(2, Math.min(6, Math.floor(maxSynopsisH / lineH)));
    const lines = wrapText(ctx, heroSynopsis, heroContentW - (isTenInSinglePage ? 10 : 0));
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      let line = lines[i] || '';
      if (i === maxLines - 1 && lines.length > maxLines) line += '…';
      ctx.fillText(line, heroContentX, heroCursorY + (isTenInSinglePage ? 12 : 24) + i * lineH);
    }
    ctx.restore();
  }

  if (theme.ribbonStyle === 'gradient') {
    const g = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY + ctaH);
    g.addColorStop(0, theme.ribbonA);
    g.addColorStop(1, theme.ribbonB);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = theme.ribbonA;
  }
  drawRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, Math.round(ctaH / 2));
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = isTenInSinglePage ? '900 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Assista agora', ctaX + ctaW / 2, ctaY + (isTenInSinglePage ? 31 : 36));

  const slots = isTenInSinglePage
    ? Array.from({ length: 9 }, (_, idx) => {
        const rank = idx + 2;
        const row = Math.floor(idx / gridCols);
        const col = idx % gridCols;
        return { rank, x: gridX + col * (smallW + gapX), y: gridTopY + row * (smallH + gapY), w: smallW, h: smallH, badge: smallBadge };
      })
    : [
        { rank: 2, x: gridX, y: gridTopY, w: smallW, h: smallH, badge: smallBadge },
        { rank: 3, x: gridX + smallW + gapX, y: gridTopY, w: smallW, h: smallH, badge: smallBadge },
        { rank: 4, x: gridX, y: gridTopY + smallH + gapY, w: smallW, h: smallH, badge: smallBadge },
        { rank: 5, x: gridX + smallW + gapX, y: gridTopY + smallH + gapY, w: smallW, h: smallH, badge: smallBadge },
      ];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const item = items[slot.rank - 1];
    const poster = item ? await loadPoster(item, 'w780') : null;
    const x = slot.x;
    const y = slot.y;
    const w = slot.w;
    const h = slot.h;
    const externalLabelH = isTenInSinglePage ? 58 : 0;
    const posterH = isTenInSinglePage ? Math.max(120, h - externalLabelH) : h;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 14;
    drawRoundedRect(ctx, x, y, w, posterH, 22);
    ctx.clip();
    if (poster) {
      drawImageCover(ctx, poster, x, y, w, posterH);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, w, posterH);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, x, y, w, posterH, 22);
    ctx.stroke();

    const title = (item?.title || item?.name || '').trim();
    if (title) {
      if (isTenInSinglePage) {
        const labelY = y + posterH + 6;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.58)';
        drawRoundedRect(ctx, x, labelY, w, externalLabelH - 6, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, x, labelY, w, externalLabelH - 6, 14);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        const titleFontSize = Math.max(14, Math.min(16, Math.round(w * 0.078)));
        ctx.font = `700 ${titleFontSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tLines = wrapText(ctx, title, w - 16).slice(0, 2);
        const lineH = Math.round(titleFontSize * 1.08);
        const totalH = tLines.length * lineH;
        let textY = labelY + (externalLabelH - 6 - totalH) / 2;
        tLines.forEach((line) => {
          ctx.fillText(line, x + w / 2, textY);
          textY += lineH;
        });
        ctx.restore();
      } else {
        const overlayH = Math.min(90, Math.round(h * 0.24));
        const g = ctx.createLinearGradient(0, y + h - overlayH, 0, y + h);
        g.addColorStop(0, 'rgba(0,0,0,0.00)');
        g.addColorStop(0.25, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + h - overlayH, w, overlayH);
        ctx.fillStyle = '#ffffff';
        const titleFontSize = Math.max(18, Math.min(22, Math.round(w * 0.10)));
        ctx.font = `900 ${titleFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tLines = wrapText(ctx, title, w - 26);
        const line = tLines[0] ? (tLines.length > 1 ? `${tLines[0]}…` : tLines[0]) : '';
        ctx.fillText(line, x + w / 2, y + h - overlayH / 2 + 6);
      }
    }

    const actualRank = args.rankOffset + slot.rank;
    const badge = slot.badge;
    const bx = x + 14;
    const by = y + 14;
    drawRankBadgeSquare({
      ctx,
      x: bx,
      y: by,
      size: badge,
      text: `${actualRank}º`,
    });
  }

  if (footerY !== null) {
    const footerW = canvas.width - footerPad * 2;
    drawRankingFooter(ctx, { y: footerY, width: footerW, height: footerH, website: footerWebsite, phone: footerPhone });
  }

  return canvasToBlob(canvas, 'image/png', 1.0);
};


