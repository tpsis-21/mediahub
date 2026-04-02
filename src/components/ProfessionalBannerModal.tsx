
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, Send, Loader2 } from 'lucide-react';
import { MovieData } from '../services/searchService';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiRequest, apiRequestRaw, buildApiUrl } from '../services/apiClient';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../lib/utils';

const WHATSAPP_ICON_URL = new URL('../../anexos/pngtree-whatsapp-icon-png-image_6315990.png', import.meta.url).href;

interface ProfessionalBannerModalProps {
  movie: MovieData;
  initialDestination?: 'download' | 'telegram';
  mode?: 'modal' | 'inline';
  onClose: () => void;
}

const ProfessionalBannerModal: React.FC<ProfessionalBannerModalProps> = ({ movie, mode = 'modal', onClose }) => {
  const { user, isPremiumActive, isPremiumExpired } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const toastLoginRequired = useCallback(() => {
    toast({
      title: "Login necessário",
      description: "Sua sessão expirou ou você não está logado. Por favor, faça login novamente.",
      variant: "destructive",
      action: (
        <Button variant="outline" size="sm" onClick={() => navigate("/login")}>
          Fazer Login
        </Button>
      ),
    });
  }, [navigate, toast]);

  useEffect(() => {
    if (!user) {
      toastLoginRequired();
      onClose();
      return;
    }

    if (!isPremiumActive()) {
      toast({
        title: isPremiumExpired() ? "Assinatura expirada" : "Recurso Premium",
        description: isPremiumExpired()
          ? "Este recurso está indisponível porque sua assinatura Premium expirou."
          : "Este recurso é exclusivo para usuários Premium.",
        variant: "destructive",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}
          >
            Ver plano
          </Button>
        ),
      });
      onClose();
    }
  }, [isPremiumActive, isPremiumExpired, onClose, toastLoginRequired, toast, user]);

  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'vertical'>('square');
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'running' | 'cancelling'>('idle');
  const [taskAction, setTaskAction] = useState<'download' | 'telegram' | null>(null);
  const [taskStage, setTaskStage] = useState<'gerando' | 'enviando' | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const previewUrlsRef = useRef<Record<number, string>>({});
  const previewSeq = useRef(0);
  const [includeFooterPhone, setIncludeFooterPhone] = useState(false);
  const [includeFooterWebsite, setIncludeFooterWebsite] = useState(false);
  const [tagPreset, setTagPreset] = useState<'tip' | 'highlight' | 'available' | 'custom'>('highlight');
  const [customTag, setCustomTag] = useState('');
  const [includeSynopsisInCaption, setIncludeSynopsisInCaption] = useState(true);
  const [caption, setCaption] = useState('');
  const [captionDirty, setCaptionDirty] = useState(false);
  const [detailsGenres, setDetailsGenres] = useState<string[]>([]);
  const [detailsRating, setDetailsRating] = useState<number | null>(null);
  const generationRunRef = useRef(0);
  const cancelRequestedRef = useRef(false);

  const title = movie.title || movie.name || 'Título';
  const year = movie.release_date || movie.first_air_date 
    ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
    : '';
  const synopsis = movie.overview || 'Sinopse não disponível para este conteúdo.';
  const rating = movie.vote_average || 0;
  const mediaType = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
  const selectedTagLabel = useMemo(() => {
    if (tagPreset === 'tip') return 'Dica de Conteúdo';
    if (tagPreset === 'highlight') return 'Conteúdo destaque';
    if (tagPreset === 'available') return 'Conteúdo disponível';
    return customTag.trim();
  }, [customTag, tagPreset]);

  const buildCaption = useCallback((args: { includeSynopsis: boolean }) => {
    const lines: string[] = [];
    const header = `${title}${year ? ` (${year})` : ''}`;
    lines.push(header);

    lines.push(`Tipo: ${movie.media_type === 'movie' ? 'Filme' : 'Série'}`);

    const effectiveRating = typeof detailsRating === 'number' ? detailsRating : rating;
    if (Number.isFinite(effectiveRating) && effectiveRating > 0) {
      lines.push(`Avaliação: ${effectiveRating.toFixed(1)}/10`);
    }

    const rawSynopsis = typeof movie.overview === 'string' ? movie.overview.trim() : '';
    if (args.includeSynopsis && rawSynopsis) {
      lines.push(rawSynopsis);
    }

    return lines.join('\n\n');
  }, [detailsRating, movie.media_type, movie.overview, rating, title, year]);

  useEffect(() => {
    if (!captionDirty) {
      setCaption(buildCaption({ includeSynopsis: includeSynopsisInCaption }));
    }
  }, [buildCaption, captionDirty, includeSynopsisInCaption]);
  
  type BannerTemplate = {
    id: number;
    name: string;
    layout: 'classic' | 'inspired';
    primaryColor: string;
    secondaryColor: string;
    gradientFrom: string;
    gradientTo: string;
  };

  const brandPrimary = user?.brandColors?.primary;
  const brandSecondary = user?.brandColors?.secondary;
  const footerPhoneAvailable = typeof user?.phone === 'string' && Boolean(user.phone.trim());
  const footerWebsiteAvailable = typeof user?.website === 'string' && Boolean(user.website.trim());

  useEffect(() => {
    if (!footerWebsiteAvailable && includeFooterWebsite) setIncludeFooterWebsite(false);
    if (!footerPhoneAvailable && includeFooterPhone) setIncludeFooterPhone(false);
  }, [footerPhoneAvailable, footerWebsiteAvailable, includeFooterPhone, includeFooterWebsite]);

  useEffect(() => {
    type SearchDetailsResponse = {
      vote_average?: number;
      genres?: Array<{ id?: number | null; name?: string }>;
    };

    let canceled = false;
    const shouldFetchDetails = Boolean(movie && typeof movie.id === 'number' && movie.id > 0 && movie.id < 10_000_000);
    if (!shouldFetchDetails) {
      setDetailsGenres([]);
      setDetailsRating(null);
      return () => {
        canceled = true;
      };
    }

    void (async () => {
      try {
        const details = await apiRequest<SearchDetailsResponse>({
          path: `/api/search/details?mediaType=${encodeURIComponent(movie.media_type)}&id=${encodeURIComponent(String(movie.id))}&language=pt-BR`,
          auth: Boolean(user),
        });

        if (canceled) return;
        const genres =
          Array.isArray(details?.genres)
            ? details.genres.map((g) => (typeof g?.name === 'string' ? g.name.trim() : '')).filter(Boolean)
            : [];
        setDetailsGenres(genres);
        setDetailsRating(typeof details?.vote_average === 'number' ? details.vote_average : null);
      } catch {
        if (canceled) return;
        setDetailsGenres([]);
        setDetailsRating(null);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [movie, user]);

  const templates: BannerTemplate[] = useMemo(() => {
    const baseTemplates: BannerTemplate[] = [
      {
        id: 1,
        name: 'Padrão',
        layout: 'inspired',
        primaryColor: '#3b82f6',
        secondaryColor: '#8b5cf6',
        gradientFrom: '#3b82f6',
        gradientTo: '#8b5cf6',
      },
      {
        id: 2,
        name: 'Escuro',
        layout: 'inspired',
        primaryColor: '#111827',
        secondaryColor: '#111827',
        gradientFrom: '#070911',
        gradientTo: '#111827',
      },
      {
        id: 3,
        name: 'Vermelho',
        layout: 'inspired',
        primaryColor: '#ef4444',
        secondaryColor: '#b91c1c',
        gradientFrom: '#ef4444',
        gradientTo: '#b91c1c',
      },
    ];

    const hasBrandColors = Boolean(brandPrimary && brandSecondary);
    if (!hasBrandColors) return baseTemplates;

    return [
      {
        id: 100,
        name: 'Minha marca',
        primaryColor: brandPrimary!,
        secondaryColor: brandSecondary!,
        gradientFrom: brandPrimary!,
        gradientTo: brandSecondary!,
        layout: 'inspired',
      },
      ...baseTemplates,
    ];
  }, [brandPrimary, brandSecondary]);

  const visibleTemplates: BannerTemplate[] = useMemo(() => {
    return templates.filter((t) => t.layout === 'inspired');
  }, [templates]);

  const formatDimensions = useMemo(
    () => ({
      square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
      vertical: { width: 1080, height: 1920, label: '1080x1920 (Vertical)' },
    }),
    []
  );

  const getPosterUrl = (args: { posterPath: string; size: string }) => {
    const params = new URLSearchParams();
    params.set('size', args.size);
    params.set('path', args.posterPath);
    return buildApiUrl(`/api/search/image?${params.toString()}`);
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      
      img.src = src;
    });
  };

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

  useEffect(() => {
    if (!visibleTemplates.some((t) => t.id === selectedTemplate)) {
      setSelectedTemplate(visibleTemplates[0]?.id ?? 1);
    }
  }, [selectedTemplate, visibleTemplates]);

  const renderBannerBlob = async (args: {
    template: BannerTemplate;
    format: { width: number; height: number };
    mime: 'image/png' | 'image/jpeg';
    quality: number;
  }): Promise<Blob> => {
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

  const renderBannerBlobRef = useRef<typeof renderBannerBlob>(renderBannerBlob);
  renderBannerBlobRef.current = renderBannerBlob;

  useEffect(() => {
    const seq = ++previewSeq.current;
    const format = formatDimensions[selectedFormat];

    void (async () => {
      try {
        const previews = await Promise.all(
          visibleTemplates.map(async (template: BannerTemplate) => {
            const blob = await renderBannerBlobRef.current({ template, format, mime: 'image/png', quality: 1.0 });
            return { id: template.id, url: URL.createObjectURL(blob) };
          })
        );

        if (seq !== previewSeq.current) return;
        Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));

        const next: Record<number, string> = {};
        previews.forEach((p) => {
          next[p.id] = p.url;
        });
        previewUrlsRef.current = next;
        setPreviewUrls(next);
      } catch {
        if (seq !== previewSeq.current) return;
        setPreviewUrls({});
      }
    })();

    return () => {
      previewSeq.current = seq + 1;
    };
  }, [
    formatDimensions,
    detailsGenres,
    detailsRating,
    footerPhoneAvailable,
    footerWebsiteAvailable,
    includeFooterPhone,
    includeFooterWebsite,
    movie,
    selectedFormat,
    tagPreset,
    customTag,
    visibleTemplates,
    user?.brandLogo,
    user?.phone,
    user?.website,
  ]);

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleBannerError = (error: unknown) => {
    console.error('Erro ao gerar banner:', error);

    const message =
      typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : error instanceof Error
          ? error.message
          : '';

    const status =
      typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status: unknown }).status === 'number'
        ? (error as { status: number }).status
        : undefined;

    if (message.includes('401') || message.includes('autenticado') || status === 401) {
      toastLoginRequired();
      return;
    }

    if ((message && message.toLowerCase().includes('expirad')) || (message.includes('403') || status === 403)) {
      if (message && message.toLowerCase().includes('expirad')) {
        toast({
          title: "Assinatura expirada",
          description: "Sua assinatura Premium expirou. Renove para continuar usando este recurso.",
          variant: "destructive",
          action: (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}
            >
              Ver plano
            </Button>
          ),
        });
        return;
      }
      toast({
        title: "Acesso restrito",
        description: "Este recurso é exclusivo para usuários Premium.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}>
            Ver plano
          </Button>
        ),
      });
      return;
    }

    toast({
      description:
        message && message.toLowerCase().includes('tempo excedido')
          ? 'Tempo excedido ao enviar. Às vezes o Telegram entrega com atraso — aguarde alguns segundos e tente novamente.'
          : message || 'Erro ao gerar banner. Tente novamente.',
      variant: 'destructive',
    });
  };

  const cancelBannerTask = () => {
    if (taskStatus !== 'running') return;
    cancelRequestedRef.current = true;
    generationRunRef.current += 1;
    setTaskStatus('cancelling');
    setTaskStage(null);
  };

  const generateBannerBlob = async (destination: 'download' | 'telegram') => {
    const format = formatDimensions[selectedFormat];
    const template = visibleTemplates.find((t) => t.id === selectedTemplate) ?? visibleTemplates[0] ?? templates[0];
    const mime = destination === 'telegram' ? 'image/jpeg' : 'image/png';
    const quality = destination === 'telegram' ? 0.92 : 1.0;
    const blob = await renderBannerBlobRef.current({ template, format, mime, quality });
    return { blob, destination };
  };

  const handleDownloadBanner = () => {
    if (isGenerating || taskStatus !== 'idle') return;
    setIsGenerating(true);
    setTaskStatus('running');
    setTaskAction('download');
    setTaskStage('gerando');
    cancelRequestedRef.current = false;
    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;

    void (async () => {
      try {
        const { blob } = await generateBannerBlob('download');
        if (cancelRequestedRef.current || runId !== generationRunRef.current) throw new Error('Operação cancelada pelo usuário.');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `banner_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Sucesso',
          description: 'Banner gerado e baixado com sucesso!',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        if (message.toLowerCase().includes('cancelada')) {
          toast({
            title: 'Geração cancelada',
            description: 'A geração do banner foi cancelada.',
          });
          return;
        }
        handleBannerError(error);
      } finally {
        setIsGenerating(false);
        setTaskStatus('idle');
        setTaskAction(null);
        setTaskStage(null);
      }
    })();
  };

  const handleSendBannerToTelegram = () => {
    if (isGenerating || taskStatus !== 'idle') return;
    setIsGenerating(true);
    setTaskStatus('running');
    setTaskAction('telegram');
    setTaskStage('gerando');
    cancelRequestedRef.current = false;
    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;

    void (async () => {
      try {
        if (!user) {
          toastLoginRequired();
          return;
        }

        const { blob } = await generateBannerBlob('telegram');
        if (cancelRequestedRef.current || runId !== generationRunRef.current) throw new Error('Operação cancelada pelo usuário.');
        setTaskStage('enviando');

        const text = (captionDirty ? caption : buildCaption({ includeSynopsis: includeSynopsisInCaption })).trim();
        const params = new URLSearchParams();
        if (text) params.set('caption', text);

        await apiRequestRaw<{ ok: true }>({
          path: `/api/telegram/send-upload?${params.toString()}`,
          method: 'POST',
          auth: true,
          headers: { 'Content-Type': blob.type },
          body: blob,
          timeoutMs: 45_000,
        });

        toast({
          title: 'Sucesso',
          description: 'Banner enviado para o Telegram.',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        if (message.toLowerCase().includes('cancelada')) {
          toast({
            title: 'Geração cancelada',
            description: 'A geração do banner foi cancelada.',
          });
          return;
        }
        handleBannerError(error);
      } finally {
        setIsGenerating(false);
        setTaskStatus('idle');
        setTaskAction(null);
        setTaskStage(null);
      }
    })();
  };

  const cardClassName =
    mode === 'inline'
      ? 'w-full max-w-none max-h-[70vh] overflow-y-auto'
      : 'w-full max-w-4xl max-h-[90vh] overflow-y-auto';

  const content = (
      <Card className={cardClassName}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Gerar Banner - {title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Gere o banner e, no final, escolha se quer baixar ou enviar pelo Telegram.
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <Label className="text-lg font-semibold block">Mensagem do Telegram (opcional)</Label>

            <Label className="flex items-center gap-2">
              <Checkbox
                checked={includeSynopsisInCaption}
                onCheckedChange={(checked) => {
                  const next = Boolean(checked);
                  setIncludeSynopsisInCaption(next);
                  if (!captionDirty) {
                    setCaption(buildCaption({ includeSynopsis: next }));
                  }
                }}
              />
              Incluir sinopse
            </Label>

            <Textarea
              value={captionDirty ? caption : (caption || buildCaption({ includeSynopsis: includeSynopsisInCaption }))}
              onChange={(e) => {
                setCaption(e.target.value);
                setCaptionDirty(true);
              }}
              rows={6}
              placeholder="Edite a mensagem (opcional)."
            />
            {!user && (
              <div className="text-sm text-muted-foreground">
                Faça login para enviar pelo Telegram. O download continua disponível.
              </div>
            )}
          </div>

          {/* Seleção de Formato */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Formato do Banner</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'square' | 'vertical')}
              className="flex flex-row space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="square" />
                <Label htmlFor="square" className="cursor-pointer">
                  {formatDimensions.square.label}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vertical" id="vertical" />
                <Label htmlFor="vertical" className="cursor-pointer">
                  {formatDimensions.vertical.label}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Personalização */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Personalização</Label>
            <div className="rounded-lg border bg-background p-4 space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-semibold block">Tag do banner</Label>
                <RadioGroup
                  value={tagPreset}
                  onValueChange={(value) => setTagPreset(value as 'tip' | 'highlight' | 'available' | 'custom')}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="tip" id="tag-tip" />
                    Dica de Conteúdo
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="highlight" id="tag-highlight" />
                    Conteúdo destaque
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="available" id="tag-available" />
                    Conteúdo disponível
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="custom" id="tag-custom" />
                    Personalizado
                  </Label>
                </RadioGroup>

                {tagPreset === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="customTag" className="text-sm text-muted-foreground">
                      Texto da tag
                    </Label>
                    <Input
                      id="customTag"
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      placeholder="Ex.: Imperdível"
                      disabled={isGenerating}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold block">Rodapé do banner (opcional)</Label>
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
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={includeFooterPhone}
                    onCheckedChange={(v) => {
                      const next = Boolean(v);
                      setIncludeFooterPhone(next);
                      if (next) setIncludeFooterWebsite(false);
                    }}
                    disabled={isGenerating || !footerPhoneAvailable}
                  />
                  Incluir telefone
                </Label>
              </div>
              {!footerWebsiteAvailable && !footerPhoneAvailable ? (
                <p className="text-sm text-muted-foreground">Para habilitar, cadastre site e/ou telefone na Minha Área.</p>
              ) : (
                <p className="text-sm text-muted-foreground">O texto aparece no rodapé junto da logo.</p>
              )}
              </div>
            </div>
          </div>

          {/* Seleção de Template */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Escolha um Template</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visibleTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  aria-pressed={selectedTemplate === template.id}
                  aria-label={`Selecionar modelo ${template.name}`}
                  className={`border-2 rounded-lg p-2 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div className="rounded-lg overflow-hidden bg-black/20">
                    {previewUrls[template.id] ? (
                      <img
                        src={previewUrls[template.id]}
                        alt={`Prévia do modelo ${template.name}`}
                        className="w-full h-auto block"
                        style={{ aspectRatio: selectedFormat === 'square' ? '1 / 1' : '9 / 16' }}
                      />
                    ) : (
                      <div
                        className="w-full"
                        style={{
                          aspectRatio: selectedFormat === 'square' ? '1 / 1' : '9 / 16',
                          background: `linear-gradient(135deg, ${template.gradientFrom}, ${template.gradientTo})`,
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-2 text-center text-sm font-bold">{template.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Botão de Download */}
          <div className="space-y-2">
            {taskStatus !== 'idle' && (
              <p className="text-xs text-muted-foreground">
                {taskStatus === 'cancelling'
                  ? 'Cancelando geração...'
                  : taskAction === 'telegram'
                    ? taskStage === 'enviando'
                      ? 'Enviando no Telegram...'
                      : 'Gerando banner para envio...'
                    : 'Gerando banner para download...'}
              </p>
            )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {taskStatus !== 'idle' && (
              <Button
                variant="destructive"
                onClick={cancelBannerTask}
                disabled={taskStatus === 'cancelling'}
                className="flex items-center gap-2"
              >
                {taskStatus === 'cancelling' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  'Cancelar geração'
                )}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDownloadBanner}
              disabled={isGenerating || taskStatus !== 'idle'}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>
                {isGenerating ? 'Gerando...' : 'Baixar banner'}
              </span>
            </Button>
            <Button
              onClick={handleSendBannerToTelegram}
              disabled={isGenerating || taskStatus !== 'idle'}
              className="flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>{isGenerating ? 'Gerando...' : 'Enviar no Telegram'}</span>
            </Button>
          </div>
          </div>
        </CardContent>
      </Card>
  );

  if (mode === 'inline') {
    return <div className="w-full">{content}</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {content}
    </div>
  );
};

export default ProfessionalBannerModal;
