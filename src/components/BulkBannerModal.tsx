
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, Archive, ArrowUp, ArrowDown, Loader2, Send } from 'lucide-react';
import { MediaType, MovieData, searchService } from '../services/searchService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import JSZip from 'jszip';
import { apiRequest, apiRequestRaw, getApiBaseUrl } from '../services/apiClient';
import { useToast } from '../hooks/use-toast';
import { formatPhoneForDisplay, formatWebsiteForDisplay, getSearchConfigToastCopy, isSearchConfigErrorMessage } from '../lib/utils';
import { ToastAction } from './ui/toast';
import { Textarea } from './ui/textarea';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Checkbox } from './ui/checkbox';

type GeneratorMode = 'individual' | 'ranking';
type RankingTemplateId = 'em-alta' | 'top10-cartaz';
type RankingCategory = 'movie' | 'tv' | 'all';
type RankingSource = 'auto' | 'manual';
type ExportDestination = 'download' | 'telegram';

interface BulkBannerModalProps {
  movies: MovieData[];
  onClose: () => void;
  initialMode?: GeneratorMode;
  initialRankingCategory?: RankingCategory;
  initialRankingTemplate?: RankingTemplateId;
  initialRankingMovies?: MovieData[];
  modeLocked?: boolean;
}

type BannerTemplate = {
  id: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
};

type BannerFormat = {
  width: number;
  height: number;
  label: string;
};

type RankingColorVariant = 'classic' | 'dark' | 'brand';

const BulkBannerModal: React.FC<BulkBannerModalProps> = ({
  movies,
  onClose,
  initialMode = 'individual',
  initialRankingCategory = 'all',
  initialRankingTemplate = 'em-alta',
  initialRankingMovies,
  modeLocked = false,
}) => {
  const { user, isPremiumActive, isPremiumExpired } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<GeneratorMode>(initialMode);
  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'story'>('square');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rankingTemplate, setRankingTemplate] = useState<RankingTemplateId>(initialRankingTemplate);
  const [rankingCategory, setRankingCategory] = useState<RankingCategory>(initialRankingCategory);
  const [rankingMovies, setRankingMovies] = useState<MovieData[]>(() => (initialRankingMovies || movies).slice(0, 10));
  const [rankingSource, setRankingSource] = useState<RankingSource>('auto');
  const [rankingManualText, setRankingManualText] = useState('');
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [exportDestination, setExportDestination] = useState<ExportDestination>('download');
  const [telegramCaption, setTelegramCaption] = useState('');
  const [rankingFooterIncludePhone, setRankingFooterIncludePhone] = useState(false);
  const [rankingFooterIncludeWebsite, setRankingFooterIncludeWebsite] = useState(false);
  const [rankingColorVariant, setRankingColorVariant] = useState<RankingColorVariant>('classic');
  const [rankingPreviewEmAltaUrl, setRankingPreviewEmAltaUrl] = useState<string | null>(null);
  const [rankingPreviewCartazUrl, setRankingPreviewCartazUrl] = useState<string | null>(null);
  const [isRankingPreviewLoading, setIsRankingPreviewLoading] = useState(false);
  const rankingPreviewEmAltaUrlRef = useRef<string | null>(null);
  const rankingPreviewCartazUrlRef = useRef<string | null>(null);
  const rankingPreviewSeq = useRef(0);

  useEffect(() => {
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
  }, [isPremiumActive, isPremiumExpired, onClose, toast, user]);

  const rankingFooterText = useMemo(() => {
    const phone = typeof user?.phone === 'string' ? formatPhoneForDisplay(user.phone) : '';
    const website = typeof user?.website === 'string' ? formatWebsiteForDisplay(user.website) : '';
    const parts: string[] = [];
    if (rankingFooterIncludeWebsite && website) parts.push(website);
    if (rankingFooterIncludePhone && phone) parts.push(phone);
    return parts.join(' • ');
  }, [rankingFooterIncludePhone, rankingFooterIncludeWebsite, user?.phone, user?.website]);

  const rankingFooterPhoneAvailable = typeof user?.phone === 'string' && Boolean(user.phone.trim());
  const rankingFooterWebsiteAvailable = typeof user?.website === 'string' && Boolean(user.website.trim());

  const templates: BannerTemplate[] = useMemo(() => {
    const baseTemplates: BannerTemplate[] = [
      {
        id: 1,
        name: 'Cinematográfico Azul',
        primaryColor: '#1e40af',
        secondaryColor: '#3b82f6',
        gradientFrom: '#1e3a8a',
        gradientTo: '#3b82f6'
      },
      {
        id: 2,
        name: 'Dourado Premium',
        primaryColor: '#d97706',
        secondaryColor: '#f59e0b',
        gradientFrom: '#92400e',
        gradientTo: '#d97706'
      },
      {
        id: 3,
        name: 'Verde Elegante',
        primaryColor: '#059669',
        secondaryColor: '#10b981',
        gradientFrom: '#047857',
        gradientTo: '#059669'
      },
      {
        id: 4,
        name: 'Roxo Moderno',
        primaryColor: '#7c3aed',
        secondaryColor: '#8b5cf6',
        gradientFrom: '#6d28d9',
        gradientTo: '#7c3aed'
      },
      {
        id: 5,
        name: 'Preto Elegante',
        primaryColor: '#1f2937',
        secondaryColor: '#374151',
        gradientFrom: '#000000',
        gradientTo: '#1f2937'
      }
    ];

    if (user?.brandColors?.primary && user?.brandColors?.secondary) {
      const primary = user.brandColors.primary;
      const secondary = user.brandColors.secondary;
      return [
        {
          id: 100,
          name: 'Cores da Minha Marca',
          primaryColor: primary,
          secondaryColor: secondary,
          gradientFrom: primary,
          gradientTo: secondary,
        },
        {
          id: 101,
          name: 'Minha Marca (invertido)',
          primaryColor: primary,
          secondaryColor: secondary,
          gradientFrom: secondary,
          gradientTo: primary,
        },
        ...baseTemplates,
      ];
    }

    return baseTemplates;
  }, [user?.brandColors?.primary, user?.brandColors?.secondary]);

  const formatDimensions: Record<'square' | 'story', BannerFormat> = useMemo(
    () => ({
      square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
      story: { width: 1080, height: 1920, label: '1080x1920 (Stories)' },
    }),
    []
  );

  const effectiveRankingMovies = useMemo(() => rankingMovies.slice(0, 10), [rankingMovies]);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
    return 'Não foi possível concluir. Tente novamente.';
  };

  const toastLoginRequired = (activityLabel: string) => {
    toast({
      title: 'Login necessário',
      description: `Para ${activityLabel}, crie uma conta ou faça login.`,
      variant: 'destructive',
      action: (
        <ToastAction
          altText="Fazer login"
          onClick={() => window.dispatchEvent(new Event('mediahub:openAuthModal'))}
        >
          Fazer login
        </ToastAction>
      ),
    });
  };

  const openSearchConfig = () => {
    if (!user) {
      window.dispatchEvent(new Event('mediahub:openAuthModal'));
      return;
    }
    if (user.type === 'admin') {
      window.dispatchEvent(new Event('mediahub:openAdminModal'));
      return;
    }
    window.dispatchEvent(new Event('mediahub:openUserAreaModal'));
  };

  const openTelegramConfig = () => {
    if (!user) {
      window.dispatchEvent(new Event('mediahub:openAuthModal'));
      return;
    }
    window.dispatchEvent(new Event('mediahub:openUserAreaModal'));
  };

  const isTelegramChatIdConfigErrorMessage = (message: string) => /configure seu id do telegram/i.test(message);

  const handleLoadRankingAutomatic = async () => {
    if (isRankingLoading || isGenerating) return;
    setIsRankingLoading(true);
    try {
      const payload = await apiRequest<{ results?: MovieData[] }>({
        path: `/api/search/trending?mediaType=${rankingCategory}&language=pt-BR`,
        auth: Boolean(user),
      });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const top10 = results.filter((item) => item && (item.media_type === 'movie' || item.media_type === 'tv')).slice(0, 10);

      if (top10.length === 0) {
        toast({ title: 'Sem dados', description: 'Não foi possível carregar o Top 10 agora.' });
        return;
      }

      setRankingMovies(top10);
      toast({ title: 'Ranking carregado', description: 'Ranking atualizado com os dados mais recentes.' });
    } catch (error) {
      const message = getErrorMessage(error);

      if (message === 'Não autenticado.') {
        toastLoginRequired('carregar o Top 10 automático');
        return;
      }
      if (isSearchConfigErrorMessage(message)) {
        const { title, description, actionLabel } = getSearchConfigToastCopy({
          rawMessage: message,
          isLoggedIn: Boolean(user),
          isAdmin: user?.type === 'admin',
        });
        toast({
          title,
          description,
          variant: 'destructive',
          action: (
            <ToastAction altText={actionLabel} onClick={openSearchConfig}>
              {actionLabel}
            </ToastAction>
          ),
        });
        return;
      }

      toast({ title: 'Erro ao carregar Top 10', description: message, variant: 'destructive' });
    } finally {
      setIsRankingLoading(false);
    }
  };

  const handleBuildRankingFromManual = async () => {
    if (isRankingLoading || isGenerating) return;
    setIsRankingLoading(true);
    try {
      const lines = rankingManualText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 10);

      if (lines.length === 0) {
        toast({ title: 'Lista vazia', description: 'Cole pelo menos 1 item.' });
        return;
      }

      const resolved: MovieData[] = [];
      const media: MediaType = rankingCategory === 'movie' ? 'movie' : rankingCategory === 'tv' ? 'tv' : 'multi';

      for (const line of lines) {
        const { title, year } = searchService.parseSearchQuery(line);
        const data = await searchService.searchByType(title, media, year, 'pt-BR');
        const first = Array.isArray(data?.results) ? data.results[0] : null;
        if (!first) continue;
        if (resolved.some((m) => m.id === first.id)) continue;
        resolved.push(first);
      }

      if (resolved.length === 0) {
        toast({ title: 'Sem resultados', description: 'Não foi possível montar o ranking com a lista informada.' });
        return;
      }

      setRankingMovies(resolved.slice(0, 10));
      toast({ title: 'Ranking carregado', description: 'Fonte: lista manual.' });
    } catch (error) {
      const message = getErrorMessage(error);

      if (message === 'Não autenticado.') {
        toastLoginRequired('montar ranking automático');
        return;
      }
      if (isSearchConfigErrorMessage(message)) {
        const { title, description, actionLabel } = getSearchConfigToastCopy({
          rawMessage: message,
          isLoggedIn: Boolean(user),
          isAdmin: user?.type === 'admin',
        });
        toast({
          title,
          description,
          variant: 'destructive',
          action: (
            <ToastAction altText={actionLabel} onClick={openSearchConfig}>
              {actionLabel}
            </ToastAction>
          ),
        });
        return;
      }

      toast({ title: 'Erro ao montar ranking', description: message, variant: 'destructive' });
    } finally {
      setIsRankingLoading(false);
    }
  };

  const getRankingLabel = (category: RankingCategory) => {
    if (category === 'movie') return 'Filmes';
    if (category === 'tv') return 'Séries';
    return 'Geral';
  };

  const getRankingHeader = (category: RankingCategory, rangeLabel?: string) => {
    const base =
      category === 'movie'
        ? 'Top 10 Filmes da Semana'
        : category === 'tv'
          ? 'Top 10 Séries da Semana'
          : 'Top 10 Conteúdos da Semana';
    return base;
  };

  const getPosterUrl = (args: { posterPath: string; size: string }) => {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    params.set('size', args.size);
    params.set('path', args.posterPath);
    return `${baseUrl}/api/search/image?${params.toString()}`;
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        resolve(img);
      };
      
      img.onerror = (error) => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      
      img.src = src;
    });
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao gerar imagem'));
        },
        type,
        quality
      );
    });
  };

  const moveRankingItem = (index: number, direction: -1 | 1) => {
    setRankingMovies((current) => {
      const next = [...current];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
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
      return await loadImage(getPosterUrl({ posterPath: movie.poster_path, size }));
    } catch {
      return null;
    }
  };

  const loadBrandLogo = async () => {
    const src = typeof user?.brandLogo === 'string' ? user.brandLogo.trim() : '';
    if (!src) return null;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src.startsWith('data:') ? src : src;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao carregar logo'));
      });
      return img;
    } catch {
      return null;
    }
  };

  const generateRankingBannerEmAlta = async (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rankOffset: number;
  }): Promise<Blob> => {
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
          : {
              background: '#0b0f18',
              overlayWarmA: '#ff8c00',
              overlayWarmB: '#ff8c00',
              headerStyle: 'solid' as const,
              headerA: 'rgba(185, 28, 28, 0.95)',
              headerB: 'rgba(185, 28, 28, 0.95)',
            };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context não disponível');

    canvas.width = args.format.width;
    canvas.height = args.format.height;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const main = items[0];
    const posterMain = main ? await loadPoster(main, 'w780') : null;
    if (posterMain) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.filter = 'blur(16px)';
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
    } else {
      warm.addColorStop(0, 'rgba(255, 140, 0, 0.00)');
      warm.addColorStop(1, 'rgba(255, 140, 0, 0.55)');
    }
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const padding = 56;
    const gap = 16;
    const heroPosterW = Math.round(canvas.width * 0.29);
    const heroPosterH = Math.round(canvas.height * 0.47);
    const heroPosterX = padding;
    const heroPosterY = 104;

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

    const brandName = (user?.brandName || 'MediaHub').trim();

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

    if (args.rankOffset > 0) {
      const brandLogo = await loadBrandLogo();
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

      const footerReserve = rankingFooterText ? 140 : 64;
      const topY = 244;
      const availableH = Math.max(1, canvas.height - topY - footerReserve - padding);
      const labelH = 48;
      const gapX = 22;
      const gapY = 28;

      let cardW = Math.floor((canvas.width - padding * 2 - gapX * 2) / 3);
      let posterH = Math.floor(cardW * 1.45);
      let cellH = posterH + labelH;
      while (cellH * 2 + gapY > availableH && cardW > 140) {
        cardW -= 4;
        posterH = Math.floor(cardW * 1.45);
        cellH = posterH + labelH;
      }
      const row1Y = topY;
      const row2Y = row1Y + cellH + gapY;

      const positions: Array<{ x: number; y: number; i: number }> = [
        { x: padding, y: row1Y, i: 0 },
        { x: padding + (cardW + gapX), y: row1Y, i: 1 },
        { x: padding + (cardW + gapX) * 2, y: row1Y, i: 2 },
        { x: (canvas.width - (cardW * 2 + gapX)) / 2, y: row2Y, i: 3 },
        { x: (canvas.width - (cardW * 2 + gapX)) / 2 + (cardW + gapX), y: row2Y, i: 4 },
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
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x, posterY, posterW, posterH);
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, x, posterY, posterW, posterH, 20);
        ctx.stroke();

        const title = (item?.title || item?.name || '').trim();
        if (title) {
          const pillH = 40;
          const pillY = posterY + posterH + 8;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          drawRoundedRect(ctx, x, pillY, posterW, pillH, 16);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 1;
          drawRoundedRect(ctx, x, pillY, posterW, pillH, 16);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = '900 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
          ctx.textAlign = 'center';
          const lines = wrapText(ctx, title, posterW - 22);
          const line = lines[0] ? (lines.length > 1 ? `${lines[0]}…` : lines[0]) : '';
          ctx.fillText(line, x + posterW / 2, pillY + 26);
        }

        const rankText = `${args.rankOffset + pos.i + 1}º`;
        const badgeSize = 44;
        const bx = x + posterW - badgeSize - 10;
        const by = posterY + 10;
        const badgeGradient = ctx.createLinearGradient(bx, by, bx + badgeSize, by + badgeSize);
        badgeGradient.addColorStop(0, '#fbbf24');
        badgeGradient.addColorStop(1, '#d97706');
        ctx.fillStyle = badgeGradient;
        drawRoundedRect(ctx, bx, by, badgeSize, badgeSize, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, bx, by, badgeSize, badgeSize, 14);
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rankText, bx + badgeSize / 2, by + 28);
      }

      if (rankingFooterText) {
        const footerH = 54;
        const footerW = canvas.width - padding * 2;
        const footerX = padding;
        const footerY = canvas.height - padding + 12 - footerH;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '800 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rankingFooterText, canvas.width / 2, footerY + 36);
      }

      return canvasToBlob(canvas, 'image/png', 1.0);
    }

    const heroRankText = `${args.rankOffset + 1}º`;
    const heroBadgeSize = 54;
    const heroBx = heroPosterX + 14;
    const heroBy = heroPosterY + 14;
    const heroBadgeGradient = ctx.createLinearGradient(heroBx, heroBy, heroBx + heroBadgeSize, heroBy + heroBadgeSize);
    heroBadgeGradient.addColorStop(0, '#fbbf24');
    heroBadgeGradient.addColorStop(1, '#d97706');
    ctx.fillStyle = heroBadgeGradient;
    drawRoundedRect(ctx, heroBx, heroBy, heroBadgeSize, heroBadgeSize, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, heroBx, heroBy, heroBadgeSize, heroBadgeSize, 16);
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = '900 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(heroRankText, heroBx + heroBadgeSize / 2, heroBy + 35);

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

    const brandLogo = await loadBrandLogo();
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

    let y = Math.max(infoY + 118, headerContentBottom + 28);
    if (logoRect) {
      y = Math.max(y, logoRect.y + logoRect.h + 28);
    }
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
    y += limitedTitleLines.length * titleLineH + 14;

    type SearchDetailsResponse = {
      vote_average?: number;
      genres?: Array<{ id?: number | null; name?: string }>;
    };

    let rating = typeof main?.vote_average === 'number' ? main.vote_average : 0;
    let genres: string[] = [];
    const shouldFetchDetails = Boolean(main && typeof main.id === 'number' && main.id > 0 && main.id < 10_000_000);
    if (shouldFetchDetails) {
      try {
        const details = await apiRequest<SearchDetailsResponse>({
          path: `/api/search/details?mediaType=${encodeURIComponent(main!.media_type)}&id=${encodeURIComponent(String(main!.id))}&language=pt-BR`,
          auth: Boolean(user),
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
      ctx.fillText(metaParts.join('  •  '), infoX + 32, y + 20);
      y += 34;
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

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 25);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ASSISTA AGORA!', ctaX + ctaW / 2, ctaY + 33);

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
        const pillH = 40;
        const pillY = yItem + posterH + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        drawRoundedRect(ctx, x, pillY, itemW, pillH, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, x, pillY, itemW, pillH, 16);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '900 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        const lines = wrapText(ctx, title, itemW - 20);
        const line = lines[0] ? (lines.length > 1 ? `${lines[0]}…` : lines[0]) : '';
        ctx.fillText(line, x + itemW / 2, pillY + 26);
      }

      const rankText = `${args.rankOffset + i + 1}º`;
      const badgeSize = 44;
      const bx = x + itemW - badgeSize - 10;
      const by = yItem + 10;
      const badgeGradient = ctx.createLinearGradient(bx, by, bx + badgeSize, by + badgeSize);
      badgeGradient.addColorStop(0, '#fbbf24');
      badgeGradient.addColorStop(1, '#d97706');
      ctx.fillStyle = badgeGradient;
      drawRoundedRect(ctx, bx, by, badgeSize, badgeSize, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, bx, by, badgeSize, badgeSize, 14);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = '900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rankText, bx + badgeSize / 2, by + 28);
    }

    if (rankingFooterText) {
      const footerH = 54;
      const footerW = canvas.width - padding * 2;
      const footerX = padding;
      const footerY = canvas.height - padding + 12 - footerH;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 18);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '800 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rankingFooterText, canvas.width / 2, footerY + 36);
    }

    return canvasToBlob(canvas, 'image/png', 1.0);
  };

  const generateRankingBannerTop10Cartaz = async (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rangeLabel?: string;
    rankOffset: number;
  }): Promise<Blob> => {
    const items = args.items.slice(0, 5);
    const hasBrandColors = Boolean(user?.brandColors?.primary && user?.brandColors?.secondary);
    const brandPrimary = user?.brandColors?.primary ?? '#3b82f6';
    const brandSecondary = user?.brandColors?.secondary ?? '#8b5cf6';
    const variant: RankingColorVariant = rankingColorVariant === 'brand' && !hasBrandColors ? 'classic' : rankingColorVariant;
    const theme =
      variant === 'brand'
        ? {
            ribbonStyle: 'gradient' as const,
            ribbonA: brandPrimary,
            ribbonB: brandSecondary,
          }
        : variant === 'dark'
          ? {
              ribbonStyle: 'solid' as const,
              ribbonA: '#111827',
              ribbonB: '#111827',
            }
          : {
              ribbonStyle: 'solid' as const,
              ribbonA: '#b91c1c',
              ribbonB: '#b91c1c',
            };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context não disponível');

    canvas.width = args.format.width;
    canvas.height = args.format.height;

    ctx.fillStyle = '#0b0b0f';
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
    const brandLogo = await loadBrandLogo();
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

    const footerPad = 56;
    const footerH = 64;
    const footerY = rankingFooterText ? canvas.height - footerPad + 6 - footerH : null;
    const contentTop = ribbonHeight + 34;
    const contentBottom = footerY !== null ? footerY - 34 : canvas.height - 84;
    const availableH = Math.max(1, contentBottom - contentTop);
    const gapY = 34;
    const gapX = 32;

    const bigH = Math.min(680, Math.max(520, Math.round(availableH * 0.44)));
    const bigW = Math.round(bigH * (2 / 3));
    const bigX = (canvas.width - bigW) / 2;
    const bigY = contentTop;

    const remainingH = Math.max(1, contentBottom - (bigY + bigH) - gapY);
    const smallH = Math.max(280, Math.floor((remainingH - gapY) / 2));
    const smallW = Math.round(smallH * (2 / 3));
    const gridW = smallW * 2 + gapX;
    const gridX = (canvas.width - gridW) / 2;
    const row1Y = bigY + bigH + gapY;
    const row2Y = row1Y + smallH + gapY;

    const slots = [
      { rank: 1, x: bigX, y: bigY, w: bigW, h: bigH, badge: 70 },
      { rank: 2, x: gridX, y: row1Y, w: smallW, h: smallH, badge: 58 },
      { rank: 3, x: gridX + smallW + gapX, y: row1Y, w: smallW, h: smallH, badge: 58 },
      { rank: 4, x: gridX, y: row2Y, w: smallW, h: smallH, badge: 58 },
      { rank: 5, x: gridX + smallW + gapX, y: row2Y, w: smallW, h: smallH, badge: 58 },
    ];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const item = items[i];
      const poster = item ? await loadPoster(item, 'w780') : null;
      const x = slot.x;
      const y = slot.y;
      const w = slot.w;
      const h = slot.h;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 14;
      drawRoundedRect(ctx, x, y, w, h, 22);
      ctx.clip();
      if (poster) {
        drawImageCover(ctx, poster, x, y, w, h);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, w, h);
      }

      const title = (item?.title || item?.name || '').trim();
      if (title) {
        const overlayH = Math.min(92, Math.round(h * 0.22));
        const g = ctx.createLinearGradient(0, y + h - overlayH, 0, y + h);
        g.addColorStop(0, 'rgba(0,0,0,0.00)');
        g.addColorStop(0.25, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + h - overlayH, w, overlayH);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        const tLines = wrapText(ctx, title, w - 26);
        const line = tLines[0] ? (tLines.length > 1 ? `${tLines[0]}…` : tLines[0]) : '';
        ctx.fillText(line, x + w / 2, y + h - 22);
      }
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, x, y, w, h, 22);
      ctx.stroke();

      const actualRank = args.rankOffset + slot.rank;
      const badge = slot.badge;
      const bx = x + 14;
      const by = y + 14;
      const badgeGradient = ctx.createLinearGradient(bx, by, bx + badge, by + badge);
      badgeGradient.addColorStop(
        0,
        actualRank === 1 ? '#fbbf24' : actualRank === 2 ? '#d1d5db' : actualRank === 3 ? '#f59e0b' : '#fcd34d'
      );
      badgeGradient.addColorStop(1, '#78350f');
      ctx.fillStyle = badgeGradient;
      ctx.beginPath();
      ctx.arc(bx + badge / 2, by + badge / 2, badge / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = '900 30px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${actualRank}º`, bx + badge / 2, by + 42);
    }

    if (rankingFooterText) {
      const pad = 56;
      const footerH = 64;
      const footerW = canvas.width - pad * 2;
      const footerX = pad;
      const footerY = canvas.height - pad + 6 - footerH;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, footerX, footerY, footerW, footerH, 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '900 24px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rankingFooterText, canvas.width / 2, footerY + 42);
    }

    return canvasToBlob(canvas, 'image/png', 1.0);
  };

  const generateRankingBannerEmAltaRef = useRef(generateRankingBannerEmAlta);
  const generateRankingBannerTop10CartazRef = useRef(generateRankingBannerTop10Cartaz);
  generateRankingBannerEmAltaRef.current = generateRankingBannerEmAlta;
  generateRankingBannerTop10CartazRef.current = generateRankingBannerTop10Cartaz;

  useEffect(() => {
    const seq = ++rankingPreviewSeq.current;
    setIsRankingPreviewLoading(true);

    const previewItems: MovieData[] =
      effectiveRankingMovies.length >= 5
        ? effectiveRankingMovies.slice(0, 5)
        : Array.from({ length: 5 }, (_, idx) => ({
            id: 10_000_000 + idx,
            title: `Filme ${idx + 1}`,
            release_date: '',
            name: '',
            first_air_date: '',
            overview: '',
            poster_path: '',
            backdrop_path: '',
            vote_average: 0,
            genre_ids: [],
            media_type: 'movie',
          }));

    void (async () => {
      try {
        const [emAltaBlob, cartazBlob] = await Promise.all([
          generateRankingBannerEmAltaRef.current({
            items: previewItems,
            category: rankingCategory,
            format: formatDimensions.square,
            rankOffset: 0,
          }),
          generateRankingBannerTop10CartazRef.current({
            items: previewItems,
            category: rankingCategory,
            format: formatDimensions.story,
            rangeLabel: '1–5',
            rankOffset: 0,
          }),
        ]);

        if (seq !== rankingPreviewSeq.current) return;

        const nextEmAltaUrl = URL.createObjectURL(emAltaBlob);
        const nextCartazUrl = URL.createObjectURL(cartazBlob);

        if (rankingPreviewEmAltaUrlRef.current) URL.revokeObjectURL(rankingPreviewEmAltaUrlRef.current);
        if (rankingPreviewCartazUrlRef.current) URL.revokeObjectURL(rankingPreviewCartazUrlRef.current);

        rankingPreviewEmAltaUrlRef.current = nextEmAltaUrl;
        rankingPreviewCartazUrlRef.current = nextCartazUrl;

        setRankingPreviewEmAltaUrl(nextEmAltaUrl);
        setRankingPreviewCartazUrl(nextCartazUrl);
      } catch {
        if (seq !== rankingPreviewSeq.current) return;
        setRankingPreviewEmAltaUrl(null);
        setRankingPreviewCartazUrl(null);
      } finally {
        if (seq === rankingPreviewSeq.current) setIsRankingPreviewLoading(false);
      }
    })();

    return () => {
      rankingPreviewSeq.current = seq + 1;
    };
  }, [
    effectiveRankingMovies,
    formatDimensions.square,
    formatDimensions.story,
    rankingCategory,
    rankingColorVariant,
    rankingFooterText,
    user?.brandLogo,
    user?.brandName,
    user?.brandColors?.primary,
    user?.brandColors?.secondary,
  ]);

  useEffect(() => {
    return () => {
      if (rankingPreviewEmAltaUrlRef.current) URL.revokeObjectURL(rankingPreviewEmAltaUrlRef.current);
      if (rankingPreviewCartazUrlRef.current) URL.revokeObjectURL(rankingPreviewCartazUrlRef.current);
    };
  }, []);

  const generateBanner = async (movie: MovieData, template: BannerTemplate, format: BannerFormat): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context não disponível');
    }

    canvas.width = format.width;
    canvas.height = format.height;

      const title = movie.title || movie.name || 'Título';
      const year = movie.release_date || movie.first_air_date 
        ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
        : '';
      const synopsis = movie.overview || 'Sinopse não disponível para este conteúdo.';
      const rating = movie.vote_average || 0;
      const mediaType = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';

      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
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
        ctx.globalAlpha = 0.55;
        ctx.filter = 'blur(18px)';
        ctx.drawImage(posterImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (selectedFormat === 'square') {
        // Layout quadrado (1:1) - duas colunas
        const leftColumnWidth = canvas.width * 0.4;
        const rightColumnX = leftColumnWidth + 20;
        const rightColumnWidth = canvas.width - rightColumnX - 40;
        
        // COLUNA ESQUERDA - IMAGEM
        const posterMargin = 40;
        const posterWidth = leftColumnWidth - (posterMargin * 2);
        const posterHeight = posterWidth * 1.5;
        const posterX = posterMargin;
        const posterY = (canvas.height - posterHeight) / 2;

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

        // COLUNA DIREITA - CONTEÚDO
        let currentY = 80;
        
        // 1. TÍTULO
        ctx.fillStyle = 'white';
        ctx.font = '700 50px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        
        const titleLines = wrapText(ctx, title, rightColumnWidth);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, rightColumnX, currentY + (index * 60));
        });

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        currentY += titleLines.length * 60 + 40;

        // 2. RETÂNGULO COM ANO E TIPO
        if (year || mediaType) {
          const badgeText = year ? `${year} • ${mediaType}` : mediaType;
          const badgeWidth = Math.min(rightColumnWidth, 320);
          const badgeHeight = 55;
          
          // Gradiente do badge
          const badgeGradient = ctx.createLinearGradient(
            rightColumnX, currentY, 
            rightColumnX + badgeWidth, currentY + badgeHeight
          );
          badgeGradient.addColorStop(0, template.primaryColor);
          badgeGradient.addColorStop(1, template.secondaryColor);
          
          ctx.fillStyle = badgeGradient;
          ctx.beginPath();
          ctx.roundRect(rightColumnX, currentY, badgeWidth, badgeHeight, 27);
          ctx.fill();
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 22px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, rightColumnX + badgeWidth/2, currentY + 35);
          
          currentY += badgeHeight + 50;
        }

        const synopsisPanelX = rightColumnX;
        const synopsisPanelY = currentY;
        const synopsisPanelW = rightColumnWidth;
        const synopsisPanelPadding = 22;
        const synopsisLineHeight = 28;
        const synopsisMaxHeight = Math.max(170, canvas.height - synopsisPanelY - 150);

        ctx.font = '20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'left';
        const synopsisLines = wrapText(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
        const maxSynopsisLines = Math.max(
          4,
          Math.min(synopsisLines.length, Math.floor((synopsisMaxHeight - synopsisPanelPadding * 2) / synopsisLineHeight))
        );
        const synopsisPanelH = Math.min(synopsisMaxHeight, synopsisPanelPadding * 2 + maxSynopsisLines * synopsisLineHeight);

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

        for (let i = 0; i < maxSynopsisLines; i++) {
          let line = synopsisLines[i];
          if (i === maxSynopsisLines - 1 && synopsisLines.length > maxSynopsisLines) {
            line += '…';
          }
          ctx.fillText(line, synopsisPanelX + synopsisPanelPadding, synopsisPanelY + synopsisPanelPadding + 24 + i * synopsisLineHeight);
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // 5. BADGE DE AVALIAÇÃO (canto superior direito)
        if (rating > 0) {
          const ratingX = canvas.width - 140;
          const ratingY = 30;
          
          ctx.fillStyle = 'rgba(255, 193, 7, 0.95)';
          ctx.beginPath();
          ctx.roundRect(ratingX, ratingY, 120, 45, 22);
          ctx.fill();
          
          ctx.fillStyle = 'black';
          ctx.font = 'bold 18px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, ratingX + 60, ratingY + 28);
        }

      } else {
        // Layout vertical (9:16)
        const posterWidth = canvas.width * 0.6;
        const posterHeight = posterWidth * 1.5;
        const posterX = (canvas.width - posterWidth) / 2;
        const posterY = 80;

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
        let currentY = posterY + posterHeight + 60;
        
        ctx.fillStyle = 'white';
        ctx.font = '800 60px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        
        const titleLines = wrapText(ctx, title, canvas.width - 80);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, canvas.width/2, currentY + (index * 70));
        });

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        currentY += titleLines.length * 70 + 40;

        // ANO E TIPO
        if (year) {
          ctx.font = '700 32px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
          ctx.fillText(`${year} • ${mediaType}`, canvas.width/2, currentY);
          currentY += 50;
        }

        // AVALIAÇÃO
        if (rating > 0) {
          ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
          currentY += 60;
        }

        const synopsisPanelX = 40;
        const synopsisPanelY = currentY;
        const synopsisPanelW = canvas.width - 80;
        const synopsisPanelPadding = 24;
        const synopsisLineHeight = 30;
        const synopsisMaxHeight = Math.max(200, canvas.height - synopsisPanelY - 150);

        ctx.font = '22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.textAlign = 'left';
        const synopsisLines = wrapText(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
        const maxLines = Math.max(
          4,
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

      // RODAPÉ (para ambos os formatos)
      const footerHeight = 92;
      const footerY = canvas.height - footerHeight;
      
      // Fundo do rodapé
      const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
      footerGradient.addColorStop(0, 'rgba(0,0,0,0.65)');
      footerGradient.addColorStop(1, 'rgba(0,0,0,0.92)');
      
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Banner gerado no MediaHub', canvas.width / 2, footerY + 36);

    return canvasToBlob(canvas, 'image/png', 1.0);
  };

  const handleGenerateRankingBanners = async () => {
    setIsGenerating(true);
    setProgress(0);

    const items = effectiveRankingMovies;
    const zip = new JSZip();

    const categoryLabel = rankingCategory === 'movie' ? 'filmes' : rankingCategory === 'tv' ? 'series' : 'geral';
    const dateLabel = new Date().toISOString().split('T')[0];

    const pages = items.length >= 10 ? [items.slice(0, 5), items.slice(5, 10)] : items.length >= 5 ? [items.slice(0, 5)] : [];
    if (pages.length === 0) {
      setIsGenerating(false);
      return;
    }

    const format = rankingTemplate === 'top10-cartaz' ? formatDimensions.story : formatDimensions.square;

    if (rankingColorVariant === 'brand' && !(user?.brandColors?.primary && user?.brandColors?.secondary)) {
      toast({
        title: 'Cores da marca não definidas',
        description: 'Defina as cores na Minha Área. Por enquanto, vamos usar a variação “Padrão”.',
      });
    }

    if (exportDestination === 'telegram' && !user) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para enviar pelo Telegram.',
        variant: 'destructive',
      });
      setIsGenerating(false);
      return;
    }

    if (exportDestination === 'telegram') {
      if (!user?.telegramChatId?.trim()) {
        toast({
          title: 'Configuração necessária',
          description: 'Configure seu ID do Telegram na Minha Área para enviar.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
              Abrir Minha Área
            </ToastAction>
          ),
        });
        setIsGenerating(false);
        return;
      }

      try {
        const baseCaption = telegramCaption.trim();

        if (pages.length === 2) {
          const makePayload = async (first: Blob, second: Blob) => {
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

          const firstBlob =
            rankingTemplate === 'top10-cartaz'
              ? await generateRankingBannerTop10Cartaz({ items: pages[0], category: rankingCategory, format, rangeLabel: '1–5', rankOffset: 0 })
              : await generateRankingBannerEmAlta({ items: pages[0], category: rankingCategory, format, rankOffset: 0 });
          setProgress(50);

          const secondBlob =
            rankingTemplate === 'top10-cartaz'
              ? await generateRankingBannerTop10Cartaz({ items: pages[1], category: rankingCategory, format, rangeLabel: '6–10', rankOffset: 5 })
              : await generateRankingBannerEmAlta({ items: pages[1], category: rankingCategory, format, rankOffset: 5 });
          setProgress(85);

          const caption = baseCaption ? `${baseCaption}\n\nTop 10 (1–10)` : 'Top 10 (1–10)';
          const params = new URLSearchParams();
          if (caption) params.set('caption', caption);

          await apiRequestRaw<{ ok: true }>({
            path: `/api/telegram/send-media-group-upload?${params.toString()}`,
            method: 'POST',
            auth: true,
            headers: { 'Content-Type': 'application/octet-stream' },
            body: await makePayload(firstBlob, secondBlob),
            timeoutMs: 120_000,
          });

          setProgress(100);
        } else {
          for (let i = 0; i < pages.length; i++) {
            const pageItems = pages[i];
            const pageIndex = i + 1;
            const rangeLabel = pageIndex === 1 ? '1–5' : '6–10';
            const rankOffset = pageIndex === 1 ? 0 : 5;
            const blob =
              rankingTemplate === 'top10-cartaz'
                ? await generateRankingBannerTop10Cartaz({ items: pageItems, category: rankingCategory, format, rangeLabel, rankOffset })
                : await generateRankingBannerEmAlta({ items: pageItems, category: rankingCategory, format, rankOffset });

            const perPageCaption =
              pageIndex === 1 ? (baseCaption ? `${baseCaption}\n\nTop 10 (${rangeLabel})` : `Top 10 (${rangeLabel})`) : `Top 10 (${rangeLabel})`;

            const params = new URLSearchParams();
            if (perPageCaption) params.set('caption', perPageCaption);

            await apiRequestRaw<{ ok: true }>({
              path: `/api/telegram/send-upload?${params.toString()}`,
              method: 'POST',
              auth: true,
              headers: { 'Content-Type': 'image/png' },
              body: blob,
              timeoutMs: 45_000,
            });

            setProgress(((i + 1) / pages.length) * 100);
          }
        }

        toast({
          title: 'Sucesso',
          description: 'Enviado para o Telegram.',
        });
        onClose();
      } catch (error) {
        const message = getErrorMessage(error);
        if (message === 'Não autenticado.') {
          toastLoginRequired('enviar pelo Telegram');
          return;
        }
        const shouldOpenUserArea = isTelegramChatIdConfigErrorMessage(message);
        toast({
          title: 'Erro',
          description: message || 'Não foi possível enviar via Telegram.',
          variant: 'destructive',
          action: shouldOpenUserArea ? (
            <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
              Abrir Minha Área
            </ToastAction>
          ) : undefined,
        });
      } finally {
        setIsGenerating(false);
      }

      return;
    }

    for (let i = 0; i < pages.length; i++) {
      const pageItems = pages[i];
      const pageIndex = i + 1;
      const rangeLabel = pageIndex === 1 ? '1–5' : '6–10';
      const rankOffset = pageIndex === 1 ? 0 : 5;
      const blob =
        rankingTemplate === 'top10-cartaz'
          ? await generateRankingBannerTop10Cartaz({ items: pageItems, category: rankingCategory, format, rangeLabel, rankOffset })
          : await generateRankingBannerEmAlta({ items: pageItems, category: rankingCategory, format, rankOffset });
      zip.file(`ranking_top10_${categoryLabel}_${dateLabel}_${rangeLabel}.png`, blob);

      setProgress(((i + 1) / pages.length) * 100);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    if (exportDestination === 'download') {
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ranking_top10_${categoryLabel}_${dateLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsGenerating(false);
      onClose();
      return;
    }

    setIsGenerating(false);
    onClose();
  };

  const handleGenerateBulkBanners = async () => {
    setIsGenerating(true);
    setProgress(0);
    
    const zip = new JSZip();
    const template = templates.find(t => t.id === selectedTemplate)!;
    const format = formatDimensions[selectedFormat];
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      
      const blob = await generateBanner(movie, template, format);
      
      const filename = `banner_${(movie.title || movie.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
      zip.file(filename, blob);
      
      setProgress(((i + 1) / movies.length) * 100);
    }
    
    console.log('Gerando arquivo ZIP...');
    // Gerar e baixar o ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    if (exportDestination === 'download') {
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `banners_${template.name.toLowerCase().replace(/\s+/g, '_')}_${selectedFormat}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsGenerating(false);
      onClose();
      return;
    }

    if (!user) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para enviar pelo Telegram.',
        variant: 'destructive',
      });
      setIsGenerating(false);
      return;
    }

    if (!user.telegramChatId?.trim()) {
      toast({
        title: 'Configuração necessária',
        description: 'Configure seu ID do Telegram na Minha Área para enviar.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
            Abrir Minha Área
          </ToastAction>
        ),
      });
      setIsGenerating(false);
      return;
    }

    try {
      const caption = telegramCaption.trim();
      const params = new URLSearchParams();
      if (caption) params.set('caption', caption);

      await apiRequestRaw<{ ok: true }>({
        path: `/api/telegram/send-document-upload?${params.toString()}`,
        method: 'POST',
        auth: true,
        headers: { 'Content-Type': 'application/zip' },
        body: zipBlob,
        timeoutMs: 120_000,
      });

      toast({
        title: 'Sucesso',
        description: 'Enviado para o Telegram.',
      });
      onClose();
    } catch (error) {
      const message = getErrorMessage(error);

      if (message === 'Não autenticado.') {
        toastLoginRequired('enviar pelo Telegram');
        return;
      }

      const shouldOpenUserArea = isTelegramChatIdConfigErrorMessage(message);
      toast({
        title: 'Erro',
        description: message || 'Não foi possível enviar via Telegram.',
        variant: 'destructive',
        action: shouldOpenUserArea ? (
          <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
            Abrir Minha Área
          </ToastAction>
        ) : undefined,
      });
    } finally {
      setIsGenerating(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center space-x-2">
            <Archive className="h-5 w-5" />
            <span>
              {modeLocked && mode === 'ranking'
                ? 'Gerar banner Top 10'
                : mode === 'ranking'
                  ? 'Ranking Top 10 - Banners'
                  : `Geração em Lote - ${movies.length} banners`}
            </span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {!modeLocked && (
            <div>
              <Label className="text-lg font-semibold mb-3 block">Tipo de Geração</Label>
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as GeneratorMode)}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
                disabled={isGenerating}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="individual" id="mode-individual" />
                  <Label htmlFor="mode-individual" className="cursor-pointer">
                    Banners individuais (ZIP)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ranking" id="mode-ranking" />
                  <Label htmlFor="mode-ranking" className="cursor-pointer">
                    Ranking Top 10 (modelos)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Escolha exportar por download ou enviar pelo Telegram.
            </div>
            <ToggleGroup
              type="single"
              value={exportDestination}
              onValueChange={(value) => {
                const next = value === 'telegram' ? 'telegram' : 'download';
                setExportDestination(next);
              }}
              className="justify-start sm:justify-end"
            >
              <ToggleGroupItem value="download" aria-label="Download" className="gap-2" disabled={isGenerating}>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="telegram" aria-label="Telegram" className="gap-2" disabled={isGenerating}>
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Telegram</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {exportDestination === 'telegram' && (
            <div className="rounded-md border p-4 space-y-3">
              {!user && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                  Faça login para enviar via Telegram.
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.dispatchEvent(new Event('mediahub:openAuthModal'))}
                      disabled={isGenerating}
                    >
                      Fazer login
                    </Button>
                  </div>
                </div>
              )}

              <Label className="text-lg font-semibold block">Mensagem do Telegram</Label>
              <Textarea
                value={telegramCaption}
                onChange={(e) => setTelegramCaption(e.target.value)}
                rows={5}
                placeholder="Escreva uma mensagem (opcional)."
                disabled={isGenerating}
              />
            </div>
          )}

          {mode === 'ranking' ? (
            <>
              <div className="rounded-lg border p-4 bg-muted/30 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold block">Fonte do ranking</Label>
                    <RadioGroup
                      value={rankingSource}
                      onValueChange={(value) => setRankingSource(value as RankingSource)}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
                      disabled={isGenerating || isRankingLoading}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="auto" id="ranking-source-auto" />
                        <Label htmlFor="ranking-source-auto" className="cursor-pointer">
                          Ranking automático
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="manual" id="ranking-source-manual" />
                        <Label htmlFor="ranking-source-manual" className="cursor-pointer">
                          Lista manual
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold block">Categoria</Label>
                    <RadioGroup
                      value={rankingCategory}
                      onValueChange={(value) => setRankingCategory(value as RankingCategory)}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
                      disabled={isGenerating || isRankingLoading}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="movie" id="ranking-movie" />
                        <Label htmlFor="ranking-movie" className="cursor-pointer">
                          Filmes
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="tv" id="ranking-tv" />
                        <Label htmlFor="ranking-tv" className="cursor-pointer">
                          Séries
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="ranking-all" />
                        <Label htmlFor="ranking-all" className="cursor-pointer">
                          Geral
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                {rankingSource === 'auto' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Carregue o Top 10 automaticamente. Gere 2 banners (1–5 e 6–10) quando houver 10 itens.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleLoadRankingAutomatic()}
                      disabled={isGenerating || isRankingLoading}
                      className="sm:shrink-0"
                    >
                      {isRankingLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Carregando…
                        </>
                      ) : (
                        'Carregar ranking'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="ranking-manual-text" className="text-sm font-semibold block">
                        Lista manual (1 por linha)
                      </Label>
                      <Textarea
                        id="ranking-manual-text"
                        value={rankingManualText}
                        onChange={(e) => setRankingManualText(e.target.value)}
                        rows={6}
                        className="resize-none"
                        placeholder={'Ex:\nDona Beija\nA Conexão Sueca\nJustiça Artificial'}
                        disabled={isGenerating || isRankingLoading}
                      />
                      <p className="text-sm text-muted-foreground">
                        O sistema vai localizar cada item na base de dados e manter a ordem da lista.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleBuildRankingFromManual()}
                        disabled={isGenerating || isRankingLoading || !rankingManualText.trim()}
                      >
                        {isRankingLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Montando…
                          </>
                        ) : (
                          'Montar ranking'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-lg font-semibold mb-3 block">Modelo</Label>
                <RadioGroup
                  value={rankingTemplate}
                  onValueChange={(value) => setRankingTemplate(value as RankingTemplateId)}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2"
                  disabled={isGenerating}
                >
                  <Label
                    htmlFor="ranking-em-alta"
                    className={`cursor-pointer rounded-lg border p-4 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-500 ${
                      rankingTemplate === 'em-alta' ? 'border-purple-500' : 'hover:border-gray-300'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="em-alta" id="ranking-em-alta" className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">Top 10 — Quadrado (1–5 / 6–10)</div>
                        <div className="text-sm text-muted-foreground">Layout “Em alta” com destaque do 1º lugar.</div>
                        <div className="mt-3 overflow-hidden rounded-md border bg-muted/30 p-2">
                          <div className="mx-auto w-full max-w-[260px] rounded bg-black/15">
                            {rankingPreviewEmAltaUrl ? (
                              <img
                                src={rankingPreviewEmAltaUrl}
                                alt="Prévia do modelo Top 10 quadrado"
                                className={`w-full h-auto object-contain ${isRankingPreviewLoading ? 'opacity-70' : 'opacity-100'}`}
                                loading="lazy"
                              />
                            ) : (
                              <div className="aspect-square w-full bg-muted animate-pulse" aria-hidden="true" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Label>

                  <Label
                    htmlFor="ranking-top10-cartaz"
                    className={`cursor-pointer rounded-lg border p-4 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-purple-500 ${
                      rankingTemplate === 'top10-cartaz' ? 'border-purple-500' : 'hover:border-gray-300'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="top10-cartaz" id="ranking-top10-cartaz" className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">Top 10 — Stories (1–5 / 6–10)</div>
                        <div className="text-sm text-muted-foreground">Cartaz vertical com visual mais “cinema”.</div>
                        <div className="mt-3 overflow-hidden rounded-md border bg-muted/30 p-2">
                          <div className="mx-auto w-full max-w-[180px] rounded bg-black/15">
                            {rankingPreviewCartazUrl ? (
                              <img
                                src={rankingPreviewCartazUrl}
                                alt="Prévia do modelo Top 10 stories"
                                className={`w-full h-auto object-contain ${isRankingPreviewLoading ? 'opacity-70' : 'opacity-100'}`}
                                loading="lazy"
                              />
                            ) : (
                              <div className="aspect-[9/16] w-full bg-muted animate-pulse" aria-hidden="true" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Label>
                </RadioGroup>
                <div className="mt-2 text-sm text-muted-foreground">Cada geração cria 2 imagens: 1–5 e 6–10 (quando houver 10 itens).</div>
              </div>

              <div className="space-y-2">
                <Label className="text-lg font-semibold mb-3 block">Cores do modelo</Label>
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <ToggleGroup
                    type="single"
                    value={rankingColorVariant}
                    onValueChange={(v) => v && setRankingColorVariant(v as RankingColorVariant)}
                    className="flex flex-wrap gap-2 justify-start"
                    disabled={isGenerating}
                  >
                    <ToggleGroupItem value="classic" aria-label="Cores padrão">
                      Padrão
                    </ToggleGroupItem>
                    <ToggleGroupItem value="dark" aria-label="Cores escuras">
                      Escuro
                    </ToggleGroupItem>
                    <ToggleGroupItem value="brand" aria-label="Cores da marca">
                      Minha marca
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {rankingColorVariant === 'brand' && !(user?.brandColors?.primary && user?.brandColors?.secondary) ? (
                    <p className="text-sm text-muted-foreground">
                      Defina as cores na Minha Área para usar “Minha marca”.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      O preview acima reflete a variação de cor escolhida.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-lg font-semibold mb-3 block">Rodapé do banner (opcional)</Label>
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={rankingFooterIncludeWebsite}
                        onCheckedChange={(v) => setRankingFooterIncludeWebsite(Boolean(v))}
                        disabled={isGenerating || !rankingFooterWebsiteAvailable}
                      />
                      Incluir site
                    </Label>
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={rankingFooterIncludePhone}
                        onCheckedChange={(v) => setRankingFooterIncludePhone(Boolean(v))}
                        disabled={isGenerating || !rankingFooterPhoneAvailable}
                      />
                      Incluir telefone
                    </Label>
                  </div>
                  {!rankingFooterWebsiteAvailable || !rankingFooterPhoneAvailable ? (
                    <p className="text-sm text-muted-foreground">
                      Para habilitar, cadastre site e/ou telefone na Minha Área.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">O texto aparece centralizado na parte de baixo.</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-lg font-semibold mb-3 block">Ranking (ordem de 1 a 10)</Label>
                <div className="max-h-64 overflow-y-auto rounded-lg border bg-background">
                  <div className="divide-y">
                    {effectiveRankingMovies.map((movie, index) => (
                      <div key={`${movie.id}:${index}`} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-10 text-center font-semibold">{String(index + 1).padStart(2, '0')}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{movie.title || movie.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {movie.media_type === 'tv' ? 'Série' : 'Filme'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => moveRankingItem(index, -1)}
                            disabled={isGenerating || index === 0}
                            aria-label={`Mover ${movie.title || movie.name} para cima`}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => moveRankingItem(index, 1)}
                            disabled={isGenerating || index === effectiveRankingMovies.length - 1}
                            aria-label={`Mover ${movie.title || movie.name} para baixo`}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {effectiveRankingMovies.length < 5
                    ? 'Carregue pelo menos 5 itens para gerar o banner.'
                    : effectiveRankingMovies.length < 10
                      ? 'Com menos de 10 itens, o ZIP terá apenas o banner 1–5.'
                      : 'Com 10 itens, o ZIP terá os banners 1–5 e 6–10.'}
                </div>
              </div>
            </>
          ) : (
            <>
          {/* Seleção de Formato */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Formato dos Banners</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'square' | 'story')}
              className="flex flex-row space-x-6"
              disabled={isGenerating}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="bulk-square" />
                <Label htmlFor="bulk-square" className="cursor-pointer">
                  {formatDimensions.square.label}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="story" id="bulk-story" />
                <Label htmlFor="bulk-story" className="cursor-pointer">
                  {formatDimensions.story.label}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seleção de Template */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Template Único para Todos</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`border-2 rounded-lg p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                    selectedTemplate === template.id
                      ? 'border-purple-500 shadow-lg scale-[1.02]'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isGenerating && setSelectedTemplate(template.id)}
                  disabled={isGenerating}
                >
                  <div className="rounded-lg overflow-hidden">
                    <div
                      className="h-24 p-3 text-white"
                      style={{
                        background: `linear-gradient(135deg, ${template.gradientFrom}, ${template.gradientTo})`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold leading-none">{template.name}</div>
                        <div className="flex items-center gap-1">
                          <span
                            className="h-3 w-3 rounded-full border border-white/40"
                            style={{ backgroundColor: template.primaryColor }}
                            aria-hidden="true"
                          />
                          <span
                            className="h-3 w-3 rounded-full border border-white/40"
                            style={{ backgroundColor: template.secondaryColor }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="col-span-1 aspect-[2/3] rounded bg-black/25" aria-hidden="true" />
                        <div className="col-span-2 space-y-1.5">
                          <div className="h-2.5 rounded bg-white/40 w-11/12" aria-hidden="true" />
                          <div className="h-2.5 rounded bg-white/35 w-8/12" aria-hidden="true" />
                          <div className="mt-1.5 h-6 rounded-full bg-white/85" aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Filmes */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Filmes Selecionados</Label>
            <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {movies.map((movie) => (
                  <div key={movie.id} className="flex items-center space-x-2 text-sm">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span className="truncate">
                      {movie.title || movie.name} 
                      {(movie.release_date || movie.first_air_date) && (
                        <span className="text-gray-500">
                          ({new Date(movie.release_date || movie.first_air_date!).getFullYear()})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
            </>
          )}

          {/* Progress Bar */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Gerando banners...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Botão de Geração */}
          <div className="flex justify-end">
            <Button
              onClick={mode === 'ranking' ? handleGenerateRankingBanners : handleGenerateBulkBanners}
              disabled={isGenerating || (mode === 'ranking' && effectiveRankingMovies.length < 5)}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{exportDestination === 'telegram' ? 'Enviando...' : 'Gerando...'}</span>
                </>
              ) : (
                <>
                  {exportDestination === 'telegram' ? <Send className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  <span>
                    {exportDestination === 'telegram'
                      ? mode === 'ranking'
                        ? 'Enviar Top 10 para Telegram'
                        : 'Enviar ZIP para Telegram'
                      : mode === 'ranking'
                        ? modeLocked
                          ? 'Gerar banner Top 10'
                          : `Gerar Ranking Top 10 (${effectiveRankingMovies.length} itens)`
                        : `Gerar ${movies.length} Banners (${formatDimensions[selectedFormat].label})`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkBannerModal;
