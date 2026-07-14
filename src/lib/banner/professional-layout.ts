import type { MovieData } from '../../services/searchService';
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
  detailsGenres?: string[];
  brandLogo?: string | null;
  brandName?: string | null;
  includeFooterPhone?: boolean;
  includeFooterWebsite?: boolean;
  phone?: string | null;
  website?: string | null;
};

const WHATSAPP_ICON_URL = new URL('../../../anexos/pngtree-whatsapp-icon-png-image_6315990.png', import.meta.url).href;

const loadImage = (src: string) => loadImageOrThrow(src);


const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const out: string[] = [];
  const blocks = String(text ?? '').split('\n');

  const pushWrappedWord = (word: string) => {
    if (!word) return;
    if (ctx.measureText(word).width <= maxWidth) {
      out.push(word);
      return;
    }
    let part = '';
    for (const ch of word) {
      const test = part + ch;
      if (ctx.measureText(test).width > maxWidth && part) {
        out.push(part);
        part = ch;
      } else {
        part = test;
      }
    }
    if (part) out.push(part);
  };

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b].trim();
    if (!block) {
      out.push('');
      continue;
    }
    const words = block.split(/\s+/).filter(Boolean);
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        if (ctx.measureText(word).width <= maxWidth) {
          currentLine = word;
        } else {
          pushWrappedWord(word);
          currentLine = '';
        }
        continue;
      }

      const testLine = `${currentLine} ${word}`;
      if (ctx.measureText(testLine).width > maxWidth) {
        out.push(currentLine);
        if (ctx.measureText(word).width <= maxWidth) {
          currentLine = word;
        } else {
          pushWrappedWord(word);
          currentLine = '';
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) out.push(currentLine);
    if (b !== blocks.length - 1) out.push('');
  }

  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
};

const fitTextLines = (ctx: CanvasRenderingContext2D, args: {
  text: string;
  maxWidth: number;
  maxHeight: number;
  maxFontSize: number;
  minFontSize: number;
  font: { weight: string | number; family: string };
  lineHeightMultiplier: number;
}) => {
  const maxH = Math.max(1, args.maxHeight);
  const minSize = Math.max(8, Math.min(args.minFontSize, args.maxFontSize));
  for (let size = args.maxFontSize; size >= minSize; size -= 1) {
    const lineH = Math.ceil(size * args.lineHeightMultiplier);
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    ctx.font = `${args.font.weight} ${size}px ${args.font.family}`;
    const lines = wrapText(ctx, args.text, args.maxWidth).filter((l) => l.trim().length > 0);
    if (lines.length <= maxLines) return { lines, fontSize: size, lineHeight: lineH };
  }
  const fallbackSize = minSize;
  const fallbackLineH = Math.ceil(fallbackSize * args.lineHeightMultiplier);
  ctx.font = `${args.font.weight} ${fallbackSize}px ${args.font.family}`;
  const lines = wrapText(ctx, args.text, args.maxWidth).filter((l) => l.trim().length > 0);
  return { lines, fontSize: fallbackSize, lineHeight: fallbackLineH };
};

const getFooterSafeBottom = (canvasH: number, brandLogoImg: HTMLImageElement | null, isSquare: boolean) => {
  const footerHeight = 92;
  const footerY = canvasH - footerHeight;
  if (!brandLogoImg) return footerY - 16;
  const maxW = isSquare ? 640 : 760;
  const maxH = isSquare ? 160 : 200;
  const scale = Math.min(maxW / brandLogoImg.width, maxH / brandLogoImg.height, 1);
  const h = Math.max(1, Math.round(brandLogoImg.height * scale));
  return footerY - 18 - h - 18;
};

export const renderProfessionalBannerBlob = async (args: ProfessionalBannerRenderInput): Promise<Blob> => {
  const movie = args.movie;
  const title = args.title;
  const year = args.year;
  const synopsis = args.synopsis;
  const rating = args.rating;
  const detailsRating = args.detailsRating;
  const detailsGenres = args.detailsGenres || [];
  const mediaType = args.mediaTypeLabel;
  const selectedTagLabel = args.tagLabel;
  const user = {
    brandLogo: args.brandLogo,
    brandName: args.brandName,
    phone: args.phone,
    website: args.website,
  };
  const includeFooterPhone = Boolean(args.includeFooterPhone);
  const includeFooterWebsite = Boolean(args.includeFooterWebsite);
  const footerPhoneAvailable = typeof user.phone === 'string' && Boolean(user.phone.trim());
  const footerWebsiteAvailable = typeof user.website === 'string' && Boolean(user.website.trim());

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  canvas.width = args.format.width;
  canvas.height = args.format.height;
  const effectiveRating = typeof detailsRating === 'number' ? detailsRating : rating;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, args.template.gradientFrom);
  gradient.addColorStop(1, args.template.gradientTo);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Carregar poster primeiro
    let posterImg: HTMLImageElement | null = null;
    if (movie.poster_path) {
      try {
        posterImg = await loadImage(getPosterUrl({ posterPath: movie.poster_path, size: 'w780' }));
      } catch (error) {
        try {
          posterImg = await loadImage(getPosterUrl({ posterPath: movie.poster_path, size: 'w500' }));
        } catch (fallbackError) {
          posterImg = null;
          void fallbackError;
        }
      }
    }

    let brandLogoImg: HTMLImageElement | null = null;
    const brandLogoSrc = typeof user?.brandLogo === 'string' ? user.brandLogo.trim() : '';
    if (brandLogoSrc) {
      try {
        brandLogoImg = await loadImage(brandLogoSrc);
      } catch {
        brandLogoImg = null;
      }
    }

    let whatsappIconImg: HTMLImageElement | null = null;
    try {
      whatsappIconImg = await loadImage(WHATSAPP_ICON_URL);
    } catch {
      whatsappIconImg = null;
    }

    const isInspiredLayout = args.template.layout === 'inspired';
    if (posterImg) {
      const imgW = posterImg.width;
      const imgH = posterImg.height;
      const imgRatio = imgW / imgH;
      const canvasRatio = canvas.width / canvas.height;

      let drawW = canvas.width;
      let drawH = canvas.height;
      if (imgRatio > canvasRatio) {
        drawH = canvas.height;
        drawW = drawH * imgRatio;
      } else {
        drawW = canvas.width;
        drawH = drawW / imgRatio;
      }
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;

      ctx.save();
      ctx.globalAlpha = isInspiredLayout ? 1 : 0.68;
      ctx.filter = isInspiredLayout ? 'blur(12px)' : 'blur(14px)';
      ctx.drawImage(posterImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = isInspiredLayout ? 0.26 : 0.78;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.fillStyle = isInspiredLayout ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const isSquare = canvas.width === canvas.height;
    const cornerTagText = selectedTagLabel.trim();
    const drawCornerTag = (args2: { y: number; padX: number; maxW: number; h: number }) => {
      if (!cornerTagText) return;
      const padL = 12;
      const padR = 18;
      const circleD = Math.max(26, args2.h - 12);
      const gap = 10;
      const fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      let fontSize = Math.min(24, Math.max(14, Math.round(args2.h * 0.42)));

      let textW = 0;
      let pillW = 0;
      while (fontSize > 14) {
        ctx.font = `900 ${fontSize}px ${fontFamily}`;
        textW = Math.ceil(ctx.measureText(cornerTagText).width);
        pillW = padL + circleD + gap + textW + padR;
        if (pillW <= args2.maxW) break;
        fontSize -= 1;
      }
      ctx.font = `900 ${fontSize}px ${fontFamily}`;
      textW = Math.ceil(ctx.measureText(cornerTagText).width);
      pillW = Math.min(args2.maxW, padL + circleD + gap + textW + padR);
      const x = args2.padX;

      const g = ctx.createLinearGradient(x, args2.y, x + pillW, args2.y + args2.h);
      g.addColorStop(0, args.template.secondaryColor);
      g.addColorStop(1, args.template.primaryColor);
      ctx.save();
      ctx.globalAlpha = isSquare ? 0.94 : 0.98;
      if (!isSquare) {
        ctx.shadowColor = 'rgba(0,0,0,0.42)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, args2.y, pillW, args2.h, args2.h / 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = isSquare ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.30)';
      ctx.lineWidth = isSquare ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(x, args2.y, pillW, args2.h, args2.h / 2);
      ctx.stroke();

      const circleX = x + padL + circleD / 2;
      const circleY = args2.y + args2.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleD / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const playW = Math.max(10, Math.round(circleD * 0.34));
      const playH = Math.max(12, Math.round(circleD * 0.40));
      const playX = circleX - playW * 0.42;
      const playY = circleY - playH / 2;
      ctx.fillStyle = args.template.primaryColor;
      ctx.beginPath();
      ctx.moveTo(playX, playY);
      ctx.lineTo(playX + playW, playY + playH / 2);
      ctx.lineTo(playX, playY + playH);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.font = `900 ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textX = x + padL + circleD + gap;
      const textY = args2.y + args2.h / 2 + 1;
      ctx.fillText(cornerTagText, textX, textY);
      ctx.restore();
    };
    if (args.template.layout === 'inspired') {
      if (isSquare) {
        const footerHeight = 92;
        const footerGap = 18;
        const logoReserve = (() => {
          if (!brandLogoImg) return 0;
          const maxW = 560;
          const maxH = 120;
          const scale = Math.min(maxW / brandLogoImg.width, maxH / brandLogoImg.height, 1);
          const h = Math.max(1, Math.round(brandLogoImg.height * scale));
          return h + footerGap + 18;
        })();
        const safeBottom = canvas.height - footerHeight - 32 - logoReserve;
        const pad = 56;
        const accent = args.template.primaryColor;

        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, canvas.width, 82);
        ctx.restore();

        const posterW = 360;
        const posterH = 540;
        const posterX = pad;
        const contentAreaTop = 140;
        const contentAreaBottom = safeBottom;
        const availableHeight = Math.max(1, contentAreaBottom - contentAreaTop);
        const posterY = contentAreaTop + Math.max(0, Math.round((availableHeight - posterH) / 2));
        const contentTop = posterY;
        const contentBottom = posterY + posterH;

        if (posterImg) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 14;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 22);
          ctx.clip();
          ctx.drawImage(posterImg, posterX, posterY, posterW, posterH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 22);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 22);
          ctx.fill();
        }

        const rightX = posterX + posterW + 54;
        const rightW = canvas.width - rightX - pad;
        let y = contentTop;

        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0,0,0,0.30)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        const metaBadgeH = 54;
        const badgeGap = 34;
        const synopsisMinH = 220;
        const titleMaxH = Math.max(90, contentBottom - y - (metaBadgeH + badgeGap) - synopsisMinH - 18);
        const fittedTitle = fitTextLines(ctx, {
          text: title,
          maxWidth: rightW,
          maxHeight: titleMaxH,
          maxFontSize: 58,
          minFontSize: 24,
          font: { weight: 900, family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' },
          lineHeightMultiplier: 1.14,
        });
        ctx.font = `900 ${fittedTitle.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.textBaseline = 'top';
        fittedTitle.lines.forEach((line, idx) => {
          ctx.fillText(line, rightX, y + idx * fittedTitle.lineHeight);
        });
        ctx.textBaseline = 'alphabetic';
        y += fittedTitle.lines.length * fittedTitle.lineHeight + 24;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        const metaParts: string[] = [];
        metaParts.push(mediaType);
        const genres = detailsGenres.slice(0, 2).map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
        if (genres.length) metaParts.push(...genres);
        if (effectiveRating > 0) metaParts.push(`⭐ ${effectiveRating.toFixed(1)}`);
        if (year) metaParts.push(String(year));
        const meta = metaParts.join(' • ');
        const badgeH = 54;
        const badgePadX = 30;
        const badgeMaxW = rightW;
        const badgeMinW = Math.min(240, badgeMaxW);
        let badgeFontSize = 20;
        let badgeDisplayText = meta;
        ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        while (badgeFontSize > 15 && ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
          badgeFontSize -= 1;
          ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        }
        if (ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
          let trimmed = badgeDisplayText;
          while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > badgeMaxW - badgePadX * 2) {
            trimmed = trimmed.slice(0, -1).trimEnd();
          }
          badgeDisplayText = `${trimmed}…`;
        }
        const badgeTextW = ctx.measureText(badgeDisplayText).width;
        const badgeW = Math.max(badgeMinW, Math.min(badgeMaxW, Math.ceil(badgeTextW + badgePadX * 2)));
        const badgeG = ctx.createLinearGradient(rightX, y, rightX + badgeW, y + badgeH);
        badgeG.addColorStop(0, args.template.primaryColor);
        badgeG.addColorStop(1, args.template.secondaryColor);
        ctx.fillStyle = badgeG;
        ctx.beginPath();
        ctx.roundRect(rightX, y, badgeW, badgeH, 27);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(badgeDisplayText, rightX + badgeW / 2, y + 35);
        ctx.textAlign = 'left';
        y += badgeH + 34;

        const stripeW = 54;
        const panelX = rightX;
        const panelY = y;
        const panelW = rightW;
        const panelPadding = 22;
        const lineH = 30;
        const maxH = Math.max(0, contentBottom - panelY - 16);
        ctx.font = '22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        const lines = wrapText(ctx, synopsis, panelW - stripeW - panelPadding * 2);
        const maxLines = Math.max(1, Math.min(lines.length, Math.floor((maxH - panelPadding * 2) / lineH)));
        const panelH = Math.min(maxH, panelPadding * 2 + maxLines * lineH);

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = args.template.primaryColor;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, stripeW, panelH, 20);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(panelX + stripeW / 2, panelY + panelH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.font = '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SINOPSE', 0, 8);
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'left';
        for (let i = 0; i < maxLines; i++) {
          let line = lines[i];
          if (i === maxLines - 1 && lines.length > maxLines) line += '…';
          ctx.fillText(line, panelX + stripeW + panelPadding, panelY + panelPadding + 28 + i * lineH);
        }

      } else {
        const footerHeight = 92;
        const footerGap = 18;
        const logoReserve = (() => {
          if (!brandLogoImg) return 0;
          const maxW = 700;
          const maxH = 170;
          const scale = Math.min(maxW / brandLogoImg.width, maxH / brandLogoImg.height, 1);
          const h = Math.max(1, Math.round(brandLogoImg.height * scale));
          return h + footerGap + 18;
        })();
        const safeBottom = canvas.height - footerHeight - 32 - logoReserve;
        const pad = 64;
        const headerH1 = 140;
        const headerH2 = 96;
        const bottomLimit = safeBottom - 18;

        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = args.template.primaryColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(canvas.width * 0.72, 0);
        ctx.lineTo(canvas.width * 0.50, headerH1);
        ctx.lineTo(0, headerH1);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = args.template.secondaryColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(canvas.width * 0.54, 0);
        ctx.lineTo(canvas.width * 0.38, headerH2);
        ctx.lineTo(0, headerH2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const metaBadgeH = 58;
        const badgeGap = 12;
        let titleMinH = 150;
        let synopsisMinH = 220;
        const posterY = headerH1 + 24;
        const posterGap = 84;
        const titleTopPad = 10;

        const computeMaxPosterHByContent = () =>
          bottomLimit - posterY - posterGap - titleTopPad - titleMinH - 14 - (metaBadgeH + badgeGap) - synopsisMinH - 18;

        let maxPosterHByContent = computeMaxPosterHByContent();
        if (maxPosterHByContent < 520) {
          titleMinH = 140;
          synopsisMinH = 200;
          maxPosterHByContent = computeMaxPosterHByContent();
        }
        if (maxPosterHByContent < 420) {
          titleMinH = 120;
          synopsisMinH = 170;
          maxPosterHByContent = computeMaxPosterHByContent();
        }

        let posterW = Math.min(760, canvas.width - pad * 2);
        let posterH = Math.round(posterW * 1.48);
        const maxPosterH = Math.max(1, Math.floor(Math.min(canvas.height * 0.58, Math.max(1, maxPosterHByContent))));
        if (posterH > maxPosterH) {
          const scale = maxPosterH / posterH;
          posterW = Math.max(1, Math.round(posterW * scale));
          posterH = Math.max(1, Math.round(posterH * scale));
        }

        const posterX = Math.round((canvas.width - posterW) / 2);

        if (posterImg) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.50)';
          ctx.shadowBlur = 28;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 18;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 30);
          ctx.clip();
          ctx.drawImage(posterImg, posterX, posterY, posterW, posterH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 30);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 30);
          ctx.fill();
        }

        let y = posterY + posterH + posterGap + titleTopPad;
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        const titleMaxH = Math.max(1, bottomLimit - y - (metaBadgeH + badgeGap) - synopsisMinH - 18);
        const fittedTitle = fitTextLines(ctx, {
          text: title,
          maxWidth: canvas.width - pad * 2,
          maxHeight: titleMaxH,
          maxFontSize: 64,
          minFontSize: 22,
          font: { weight: 900, family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' },
          lineHeightMultiplier: 1.16,
        });
        ctx.font = `900 ${fittedTitle.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        fittedTitle.lines.forEach((line, idx) => {
          ctx.fillText(line, canvas.width / 2, y + idx * fittedTitle.lineHeight);
        });
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        y += fittedTitle.lines.length * fittedTitle.lineHeight + 10;

        const badgeParts: string[] = [];
        badgeParts.push(mediaType);
        const genres = detailsGenres.slice(0, 2).map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
        if (genres.length) badgeParts.push(...genres);
        if (effectiveRating > 0) badgeParts.push(`⭐ ${effectiveRating.toFixed(1)}`);
        if (year) badgeParts.push(String(year));
        const badgeText = badgeParts.join(' • ');
        const badgeH = 58;
        const badgeMaxW = canvas.width - pad * 2;
        const badgeMinW = Math.min(280, badgeMaxW);
        const badgePadX = 30;
        let badgeFontSize = 24;
        let badgeDisplayText = badgeText;
        ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        while (badgeFontSize > 18 && ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
          badgeFontSize -= 1;
          ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        }
        if (ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
          let trimmed = badgeDisplayText;
          while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > badgeMaxW - badgePadX * 2) {
            trimmed = trimmed.slice(0, -1).trimEnd();
          }
          badgeDisplayText = `${trimmed}…`;
        }
        const badgeW = Math.max(
          badgeMinW,
          Math.min(badgeMaxW, Math.ceil(ctx.measureText(badgeDisplayText).width + badgePadX * 2))
        );
        const badgeX = (canvas.width - badgeW) / 2;
        const badgeG = ctx.createLinearGradient(badgeX, y, badgeX + badgeW, y + badgeH);
        badgeG.addColorStop(0, args.template.primaryColor);
        badgeG.addColorStop(1, args.template.secondaryColor);
        ctx.fillStyle = badgeG;
        ctx.beginPath();
        ctx.roundRect(badgeX, y, badgeW, badgeH, 29);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.fillText(badgeDisplayText, canvas.width / 2, y + 39);
        y += badgeH + badgeGap;

        const panelX = pad;
        const panelY = y;
        const panelW = canvas.width - pad * 2;
        const panelPadding = 22;
        const lineH = 34;
        const maxH = Math.max(0, bottomLimit - panelY - 10);
        ctx.font = '26px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        const sLines = wrapText(ctx, synopsis, panelW - panelPadding * 2);
        const maxLines = Math.max(1, Math.min(sLines.length, Math.floor((maxH - panelPadding * 2) / lineH)));
        const panelH = Math.min(maxH, panelPadding * 2 + maxLines * lineH);

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 22);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'left';
        for (let i = 0; i < maxLines; i++) {
          let line = sLines[i];
          if (i === maxLines - 1 && sLines.length > maxLines) line += '…';
          ctx.fillText(line, panelX + panelPadding, panelY + panelPadding + 34 + i * lineH);
        }
      }
    } else if (isSquare) {
      // Layout quadrado (1:1) - duas colunas (texto sempre alinhado à lateral da capa)
      const leftColumnWidth = canvas.width * 0.4;
      const rightColumnX = leftColumnWidth + 20;
      const rightColumnWidth = canvas.width - rightColumnX - 40;
      const safeBottom = getFooterSafeBottom(canvas.height, brandLogoImg, true);
      
      // COLUNA ESQUERDA - IMAGEM
      const posterMargin = 40;
      const posterWidth = leftColumnWidth - (posterMargin * 2);
      const posterHeight = posterWidth * 1.5;
      const posterX = posterMargin;
      const contentAreaTop = 40;
      const contentAreaBottom = safeBottom;
      const posterY =
        contentAreaTop +
        Math.max(0, Math.round((Math.max(1, contentAreaBottom - contentAreaTop) - posterHeight) / 2));

      if (posterImg) {
        // Desenhar poster com bordas arredondadas e sombra
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 10;
        
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
        ctx.clip();
        ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
        ctx.restore();
        
        // Borda do poster
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
        ctx.stroke();
      } else {
        // Placeholder melhorado
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
        ctx.fill();
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SEM IMAGEM', posterX + posterWidth/2, posterY + posterHeight/2 - 10);
        ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
      }

      // COLUNA DIREITA - CONTEÚDO (sempre dentro da altura da capa)
      const contentTop = posterY;
      const contentBottom = posterY + posterHeight;
      const contentHeight = Math.max(1, contentBottom - contentTop);
      const rowGap = 16;
      const badgeHeight = 52;
      const synopsisMinH = Math.max(140, Math.round(contentHeight * 0.36));
      let currentY = contentTop;

      // 1) TÍTULO
      ctx.fillStyle = 'white';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      const reservedAfterTitle = badgeHeight + rowGap + synopsisMinH;
      const titleMaxH = Math.max(60, contentBottom - currentY - reservedAfterTitle);
      const fittedTitle = fitTextLines(ctx, {
        text: title,
        maxWidth: rightColumnWidth,
        maxHeight: titleMaxH,
        maxFontSize: 50,
        minFontSize: 20,
        font: { weight: 700, family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' },
        lineHeightMultiplier: 1.18,
      });
      ctx.font = `700 ${fittedTitle.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      const titleMaxLines = Math.max(1, Math.floor(titleMaxH / fittedTitle.lineHeight));
      const titleLines = fittedTitle.lines.slice(0, titleMaxLines);
      if (fittedTitle.lines.length > titleLines.length && titleLines.length) {
        const lastIndex = titleLines.length - 1;
        titleLines[lastIndex] = `${titleLines[lastIndex].replace(/\s+$/g, '')}…`;
      }
      ctx.textBaseline = 'top';
      ctx.save();
      ctx.beginPath();
      ctx.rect(rightColumnX, contentTop, rightColumnWidth, titleMaxH + 6);
      ctx.clip();
      titleLines.forEach((line, index) => {
        ctx.fillText(line, rightColumnX, currentY + index * fittedTitle.lineHeight);
      });
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      currentY += titleLines.length * fittedTitle.lineHeight + rowGap;

      // 2) BADGE
      const badgeParts: string[] = [];
      if (mediaType) badgeParts.push(mediaType);
      const genres = detailsGenres.slice(0, 2).map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
      if (genres.length) badgeParts.push(...genres);
      if (effectiveRating > 0) badgeParts.push(`⭐ ${effectiveRating.toFixed(1)}`);
      if (year) badgeParts.push(String(year));
      const badgeText = badgeParts.join(' • ');
      const badgeMaxW = rightColumnWidth;
      const badgeMinW = Math.min(260, badgeMaxW);
      const badgePadX = 28;
      let badgeFontSize = 22;
      let badgeDisplayText = badgeText;
      ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      while (badgeFontSize > 16 && ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
        badgeFontSize -= 1;
        ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      }
      if (ctx.measureText(badgeDisplayText).width > badgeMaxW - badgePadX * 2) {
        let trimmed = badgeDisplayText;
        while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > badgeMaxW - badgePadX * 2) {
          trimmed = trimmed.slice(0, -1).trimEnd();
        }
        badgeDisplayText = `${trimmed}…`;
      }
      const badgeWidth = Math.max(
        badgeMinW,
        Math.min(badgeMaxW, Math.ceil(ctx.measureText(badgeDisplayText).width + badgePadX * 2))
      );
      const badgeGradient = ctx.createLinearGradient(
        rightColumnX, currentY,
        rightColumnX + badgeWidth, currentY + badgeHeight
      );
      badgeGradient.addColorStop(0, args.template.primaryColor);
      badgeGradient.addColorStop(1, args.template.secondaryColor);
      ctx.fillStyle = badgeGradient;
      ctx.beginPath();
      ctx.roundRect(rightColumnX, currentY, badgeWidth, badgeHeight, 26);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.font = `900 ${badgeFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rightColumnX + 12, currentY, badgeWidth - 24, badgeHeight);
      ctx.clip();
      ctx.fillText(badgeDisplayText, rightColumnX + badgeWidth / 2, currentY + 34);
      ctx.restore();
      currentY += badgeHeight + rowGap;

      // 3) SINOPSE
      const synopsisPanelX = rightColumnX;
      const synopsisPanelY = currentY;
      const synopsisPanelW = rightColumnWidth;
      const synopsisPanelPadding = 22;
      const synopsisLineHeight = 28;
      const synopsisMaxHeight = Math.max(1, contentBottom - synopsisPanelY);
      ctx.font = '20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      const synopsisLines = wrapText(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
      const maxSynopsisLines = Math.max(
        1,
        Math.min(synopsisLines.length, Math.floor((synopsisMaxHeight - synopsisPanelPadding * 2) / synopsisLineHeight))
      );
      const synopsisPanelH = Math.max(1, Math.min(synopsisMaxHeight, synopsisPanelPadding * 2 + maxSynopsisLines * synopsisLineHeight));
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(synopsisPanelX, synopsisPanelY, synopsisPanelW, synopsisPanelH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        synopsisPanelX + synopsisPanelPadding,
        synopsisPanelY + synopsisPanelPadding,
        synopsisPanelW - synopsisPanelPadding * 2,
        synopsisPanelH - synopsisPanelPadding * 2
      );
      ctx.clip();
      for (let i = 0; i < maxSynopsisLines; i++) {
        let line = synopsisLines[i];
        if (i === maxSynopsisLines - 1 && synopsisLines.length > maxSynopsisLines) {
          line += '…';
        }
        ctx.fillText(line, synopsisPanelX + synopsisPanelPadding, synopsisPanelY + synopsisPanelPadding + 24 + i * synopsisLineHeight);
      }
      ctx.restore();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

    } else {
      // Layout vertical (9:16)
      const safeBottom = getFooterSafeBottom(canvas.height, brandLogoImg, false);
      const bottomPad = 12;
      const posterY = 64;
      const posterGap = 34;
      const yearBlockH = year ? 44 : 0;
      const ratingBlockH = rating > 0 ? 48 : 0;
      const bottomLimit = safeBottom - bottomPad;
      let synopsisMinH = 180;
      let minTitleMaxH = 160;

      const computeMaxPosterHeightByContent = () =>
        bottomLimit - posterY - posterGap - (yearBlockH + ratingBlockH + synopsisMinH + 22) - minTitleMaxH;

      let maxPosterHeightByContent = computeMaxPosterHeightByContent();
      if (maxPosterHeightByContent < 140) {
        synopsisMinH = 150;
        minTitleMaxH = 140;
        maxPosterHeightByContent = computeMaxPosterHeightByContent();
      }
      if (maxPosterHeightByContent < 120) {
        synopsisMinH = 120;
        minTitleMaxH = 120;
        maxPosterHeightByContent = computeMaxPosterHeightByContent();
      }

      const desiredPosterW = canvas.width * 0.42;
      const desiredPosterH = desiredPosterW * 1.5;
      const maxPosterHeightByRatio = Math.round(canvas.height * 0.28);
      const posterHeight = Math.max(
        1,
        Math.floor(Math.min(desiredPosterH, maxPosterHeightByRatio, Math.max(1, maxPosterHeightByContent)))
      );
      const posterWidth = posterHeight * (2 / 3);
      const posterX = (canvas.width - posterWidth) / 2;

      // IMAGEM
      if (posterImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 10;
        
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
        ctx.clip();
        ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
        ctx.restore();
        
        // Borda
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
        ctx.stroke();
      } else {
        // Placeholder
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
        ctx.fill();
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SEM IMAGEM', posterX + posterWidth/2, posterY + posterHeight/2 - 20);
        ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
      }

      // TÍTULO abaixo do poster
      let currentY = posterY + posterHeight + posterGap;
      
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      const reservedAfterTitle = yearBlockH + ratingBlockH + synopsisMinH + 22;
      const titleMaxH = Math.max(1, bottomLimit - currentY - reservedAfterTitle);
      const fittedTitle = fitTextLines(ctx, {
        text: title,
        maxWidth: canvas.width - 80,
        maxHeight: titleMaxH,
        maxFontSize: 60,
        minFontSize: 16,
        font: { weight: 800, family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' },
        lineHeightMultiplier: 1.18,
      });
      ctx.font = `800 ${fittedTitle.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      const titleMaxLines = Math.max(1, Math.floor(Math.max(1, titleMaxH) / fittedTitle.lineHeight));
      const titleLines = fittedTitle.lines.slice(0, titleMaxLines);
      if (fittedTitle.lines.length > titleLines.length && titleLines.length) {
        const lastIndex = titleLines.length - 1;
        let last = titleLines[lastIndex].trimEnd();
        while (last.length > 0 && ctx.measureText(`${last}…`).width > canvas.width - 80) {
          last = last.slice(0, -1).trimEnd();
        }
        titleLines[lastIndex] = `${last}…`;
      }
      titleLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, currentY + index * fittedTitle.lineHeight);
      });

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      
      currentY += titleLines.length * fittedTitle.lineHeight + 20;

      // ANO E TIPO
      if (year) {
        ctx.font = '700 30px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.fillText(`${year} • ${mediaType}`, canvas.width/2, currentY);
        currentY += 44;
      }

      // AVALIAÇÃO
      if (rating > 0) {
        ctx.font = '700 26px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
        currentY += 48;
      }

      const synopsisPanelX = 40;
      const synopsisPanelY = currentY;
      const synopsisPanelW = canvas.width - 80;
      const synopsisPanelPadding = 20;
      const synopsisLineHeight = 26;
      const synopsisMaxHeight = Math.max(0, bottomLimit - synopsisPanelY);

      ctx.font = '20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      const synopsisLines = wrapText(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
      const maxLines = Math.max(
        1,
        Math.min(synopsisLines.length, Math.floor((synopsisMaxHeight - synopsisPanelPadding * 2) / synopsisLineHeight))
      );
      const synopsisPanelH = Math.min(synopsisMaxHeight, synopsisPanelPadding * 2 + maxLines * synopsisLineHeight);

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.roundRect(synopsisPanelX, synopsisPanelY, synopsisPanelW, synopsisPanelH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      for (let i = 0; i < maxLines; i++) {
        let line = synopsisLines[i];
        if (i === maxLines - 1 && synopsisLines.length > maxLines) {
          line += '…';
        }
        ctx.fillText(line, synopsisPanelX + synopsisPanelPadding, synopsisPanelY + synopsisPanelPadding + 26 + i * synopsisLineHeight);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    const tagY = isSquare ? 16 : 20;
    const tagPadX = isSquare ? 28 : 38;
    const tagH = isSquare ? 50 : 64;
    const tagMaxW = Math.min(canvas.width - tagPadX * 2, Math.round(canvas.width * 0.74));
    drawCornerTag({ y: tagY, padX: tagPadX, maxW: tagMaxW, h: tagH });

    // RODAPÉ (para ambos os formatos)
    const footerHeight = 92;
    const footerY = canvas.height - footerHeight;
    
    // Fundo do rodapé
    const isInspiredSquareFooter = args.template.layout === 'inspired' && canvas.width === canvas.height;
    if (isInspiredSquareFooter) {
      const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, canvas.height);
      footerGradient.addColorStop(0, args.template.primaryColor);
      footerGradient.addColorStop(1, args.template.secondaryColor);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(0, footerY, canvas.width, footerHeight);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = args.template.primaryColor;
      ctx.fillRect(0, footerY, canvas.width, 14);
      ctx.restore();
    } else {
      const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
      footerGradient.addColorStop(0, 'rgba(0,0,0,0.65)');
      footerGradient.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);
    }

    const footerPadding = 40;
    const footerChoice: 'phone' | 'website' | 'none' = includeFooterPhone ? 'phone' : includeFooterWebsite ? 'website' : 'none';
    const phoneText =
      footerChoice === 'phone' && footerPhoneAvailable && typeof user?.phone === 'string' ? formatPhoneForDisplay(user.phone) : '';
    const websiteText =
      footerChoice === 'website' && footerWebsiteAvailable && typeof user?.website === 'string' ? formatWebsiteForDisplay(user.website) : '';

    if (brandLogoImg) {
      const isSquareFooter = canvas.width === canvas.height;
      const maxW = isSquareFooter ? 640 : 760;
      const maxH = isSquareFooter ? 160 : 200;
      const scale = Math.min(maxW / brandLogoImg.width, maxH / brandLogoImg.height, 1);
      const w = Math.max(1, Math.round(brandLogoImg.width * scale));
      const h = Math.max(1, Math.round(brandLogoImg.height * scale));
      const x = Math.round((canvas.width - w) / 2);
      const y = Math.max(18, footerY - 18 - h);
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.shadowColor = 'rgba(0,0,0,0.40)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(brandLogoImg, x, y, w, h);
      ctx.restore();
    }

    const drawWhatsappIcon = (x: number, y: number, size: number) => {
      if (whatsappIconImg) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.drawImage(whatsappIconImg, x, y, size, size);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.fillStyle = '#25D366';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, Math.round(size * 0.12));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.34, y + size * 0.43);
      ctx.lineTo(x + size * 0.46, y + size * 0.31);
      ctx.lineTo(x + size * 0.62, y + size * 0.41);
      ctx.lineTo(x + size * 0.55, y + size * 0.50);
      ctx.lineTo(x + size * 0.62, y + size * 0.59);
      ctx.lineTo(x + size * 0.46, y + size * 0.69);
      ctx.lineTo(x + size * 0.34, y + size * 0.57);
      ctx.lineTo(x + size * 0.41, y + size * 0.50);
      ctx.stroke();
      ctx.restore();
    };

    const footerKind: 'phone' | 'website' | 'none' = phoneText ? 'phone' : websiteText ? 'website' : 'none';
    const footerText = footerKind === 'phone' ? phoneText : footerKind === 'website' ? websiteText : '';
    if (footerKind !== 'none') {
      const isSquareFooter = canvas.width === canvas.height;
      const baseY = footerY + Math.round(footerHeight / 2);
      const maxW = Math.max(120, canvas.width - footerPadding * 2);
      let fontSize = isSquareFooter ? 26 : 28;

      const measureGroup = (size: number) => {
        ctx.font = `800 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        const textW = ctx.measureText(footerText).width;
        if (footerKind === 'phone') {
          const iconSize = Math.max(26, Math.round(size * 1.7));
          const iconGap = Math.max(12, Math.round(size * 0.55));
          return { total: iconSize + iconGap + textW, iconSize, iconGap, textW };
        }
        return { total: textW, iconSize: 0, iconGap: 0, textW };
      };

      let m = measureGroup(fontSize);
      while (m.total > maxW && fontSize > 12) {
        fontSize -= 1;
        m = measureGroup(fontSize);
      }

      const startX = Math.round((canvas.width - m.total) / 2);
      let x = startX;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (footerKind === 'phone') {
        const iconY = Math.round(baseY - m.iconSize / 2);
        drawWhatsappIcon(x, iconY, m.iconSize);
        x += m.iconSize + m.iconGap;
      }
      ctx.fillText(footerText, x, baseY);
    }

    if (!brandLogoImg && footerKind === 'none') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Banner gerado no MediaHub', canvas.width / 2, footerY + 36);
    }

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), args.mime, args.quality);
    });

  return blob;
};

