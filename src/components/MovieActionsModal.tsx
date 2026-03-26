import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Download, Image, Loader2, Play, RefreshCw, Send } from 'lucide-react';
import { MovieData, searchService } from '../services/searchService';
import type { TrailerBrandingOptions, TrailerBrandingStage } from '../services/exportService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { apiRequest } from '../services/apiClient';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { ToastAction } from './ui/toast';

const ProfessionalBannerModal = lazy(() => import('./ProfessionalBannerModal'));

interface MovieActionsModalProps {
  movie: MovieData;
  imageUrl: string;
  onClose: () => void;
  mode?: 'modal' | 'page';
}

type BrandingTaskHistoryItem = {
  id: string;
  action: 'preview' | 'download';
  status: 'success' | 'error' | 'cancelled';
  detail: string;
  createdAt: number;
};

const MovieActionsModal: React.FC<MovieActionsModalProps> = ({ movie, imageUrl, onClose, mode = 'modal' }) => {
  const { user, isPremiumActive } = useAuth();
  const { toast } = useToast();
  const BRANDING_CTA_MAX_CHARS = 40;

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

  const [showBannerInline, setShowBannerInline] = useState(false);
  const [bannerInitialDestination, setBannerInitialDestination] = useState<'download' | 'telegram'>('download');
  const [showVideoInline, setShowVideoInline] = useState(false);
  const [showVideoBrandingInline, setShowVideoBrandingInline] = useState(false);
  const [brandingTrailerSource, setBrandingTrailerSource] = useState<'auto' | 'url'>('auto');
  const [brandingManualUrl, setBrandingManualUrl] = useState('');
  const [brandingTrailerLayout, setBrandingTrailerLayout] = useState<'portrait' | 'feed'>('portrait');
  const [brandingIncludeLogo, setBrandingIncludeLogo] = useState(() => Boolean(user?.brandLogo));
  const [brandingIncludeCta, setBrandingIncludeCta] = useState(true);
  const [brandingLimitDuration, setBrandingLimitDuration] = useState(false);
  const [brandingIncludeWebsite, setBrandingIncludeWebsite] = useState(false);
  const [brandingIncludePhone, setBrandingIncludePhone] = useState(false);
  const [brandingCtaText, setBrandingCtaText] = useState('Dica de Conteúdo');
  const [brandingSynopsisTheme, setBrandingSynopsisTheme] = useState<
    'elegant-black' | 'highlight-yellow' | 'brand'
  >('brand');
  const [isDownloadingBrandingVideo, setIsDownloadingBrandingVideo] = useState(false);
  const [isGeneratingBrandingPreview, setIsGeneratingBrandingPreview] = useState(false);
  const [brandingTaskStatus, setBrandingTaskStatus] = useState<'idle' | 'running' | 'cancelling'>('idle');
  const [brandingTaskStage, setBrandingTaskStage] = useState<TrailerBrandingStage | null>(null);
  const [brandingTaskProgress, setBrandingTaskProgress] = useState(0);
  const [brandingTaskAction, setBrandingTaskAction] = useState<'preview' | 'download' | null>(null);
  const [brandingTaskHistory, setBrandingTaskHistory] = useState<BrandingTaskHistoryItem[]>([]);
  const [brandingPreviewUrl, setBrandingPreviewUrl] = useState<string | null>(null);
  const [brandingPreviewBlob, setBrandingPreviewBlob] = useState<Blob | null>(null);
  const brandingPreviewUrlRef = useRef<string | null>(null);
  const brandingTaskAbortRef = useRef<AbortController | null>(null);
  const [showTelegramInline, setShowTelegramInline] = useState(false);
  const [telegramPurpose, setTelegramPurpose] = useState<'cover' | 'video'>('cover');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingTrailerVideo, setIsDownloadingTrailerVideo] = useState(false);
  const [isSendingTrailerToTelegram, setIsSendingTrailerToTelegram] = useState(false);
  const [telegramIncludeCover, setTelegramIncludeCover] = useState(true);
  const [telegramIncludeSynopsis, setTelegramIncludeSynopsis] = useState(true);
  const [telegramIncludeTrailer, setTelegramIncludeTrailer] = useState(false);
  const [telegramTrailerId, setTelegramTrailerId] = useState<string>('');
  const [telegramTrailerError, setTelegramTrailerError] = useState<string | null>(null);
  const [manualTrailerUrl, setManualTrailerUrl] = useState('');
  const [telegramText, setTelegramText] = useState('');
  const [telegramTextDirty, setTelegramTextDirty] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const trailerLoadPromiseRef = useRef<Promise<string> | null>(null);

  const title = movie.title || movie.name || 'Título não disponível';
  const releaseDate = movie.release_date || movie.first_air_date || '';
  const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
  const brandingPhoneAvailable = typeof user?.phone === 'string' && Boolean(user.phone.trim());
  const brandingWebsiteAvailable = typeof user?.website === 'string' && Boolean(user.website.trim());
  const previewPrimary =
    typeof user?.brandColors?.primary === 'string' && user.brandColors.primary.trim() ? user.brandColors.primary.trim() : '#7c3aed';
  const previewSecondary =
    typeof user?.brandColors?.secondary === 'string' && user.brandColors.secondary.trim() ? user.brandColors.secondary.trim() : '#ec4899';
  const getBrandingThemePreviewStyle = (
    theme: 'elegant-black' | 'highlight-yellow' | 'brand'
  ) => {
    if (theme === 'elegant-black') return { backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.92), rgba(17,24,39,0.92))' };
    if (theme === 'highlight-yellow') return { backgroundImage: 'linear-gradient(90deg, rgba(251,191,36,0.92), rgba(217,119,6,0.92))' };
    if (theme === 'brand') return { backgroundImage: `linear-gradient(90deg, ${previewPrimary}, ${previewSecondary})` };
    return { backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.92), rgba(17,24,39,0.92))' };
  };

  const updateBrandingPreview = (next: Blob | null) => {
    const current = brandingPreviewUrlRef.current;
    if (current) URL.revokeObjectURL(current);
    const url = next ? URL.createObjectURL(next) : null;
    brandingPreviewUrlRef.current = url;
    setBrandingPreviewUrl(url);
    setBrandingPreviewBlob(next);
  };

  useEffect(() => {
    return () => {
      brandingTaskAbortRef.current?.abort();
      const current = brandingPreviewUrlRef.current;
      if (current) URL.revokeObjectURL(current);
    };
  }, []);

  useEffect(() => {
    if (!showVideoBrandingInline) return;
    updateBrandingPreview(null);
  }, [showVideoBrandingInline]);

  useEffect(() => {
    updateBrandingPreview(null);
  }, [
    brandingTrailerLayout,
    brandingIncludeLogo,
    brandingIncludeCta,
    brandingIncludeWebsite,
    brandingIncludePhone,
    brandingCtaText,
    brandingSynopsisTheme,
    brandingLimitDuration,
    brandingTrailerSource,
    brandingManualUrl,
  ]);

  useEffect(() => {
    if (!brandingPhoneAvailable && brandingIncludePhone) setBrandingIncludePhone(false);
    if (!brandingWebsiteAvailable && brandingIncludeWebsite) setBrandingIncludeWebsite(false);
  }, [brandingIncludePhone, brandingIncludeWebsite, brandingPhoneAvailable, brandingWebsiteAvailable]);

  useEffect(() => {
    setTelegramTrailerId('');
    setTelegramTrailerError(null);
    setManualTrailerUrl('');
    trailerLoadPromiseRef.current = null;
  }, [movie.id, movie.media_type]);

  const openSearchConfig = useCallback(() => {
    if (!user) {
      window.dispatchEvent(new Event('mediahub:openAuthModal'));
      return;
    }

    if (user.type === 'admin') {
      window.dispatchEvent(new Event('mediahub:openAdminModal'));
      return;
    }

    window.dispatchEvent(new Event('mediahub:openUserAreaModal'));
  }, [user]);

  const openTelegramConfig = useCallback(() => {
    if (!user) {
      window.dispatchEvent(new Event('mediahub:openAuthModal'));
      return;
    }
    window.dispatchEvent(new Event('mediahub:openUserAreaModal'));
  }, [user]);

  const buildTelegramText = (args: { includeSynopsis: boolean; includeTrailer: boolean; trailerUrl: string }) => {
    const lines: string[] = [];
    const header = `${title}${year ? ` (${year})` : ''}`;
    lines.push(header);

    if (args.includeSynopsis && movie.overview?.trim()) {
      lines.push(movie.overview.trim());
    }

    return lines.join('\n\n');
  };

  const buildBrandingTelegramText = (args: { includeSynopsis: boolean; includeCta: boolean; includePhone: boolean; ctaText: string }) => {
    const lines: string[] = [];
    const header = `${title}${year ? ` (${year})` : ''}`;
    lines.push(header);

    if (args.includeSynopsis && movie.overview?.trim()) {
      lines.push(movie.overview.trim());
    }

    if (args.includeCta) {
      const cta = args.ctaText.trim() || 'Dica de Conteúdo';
      if (cta) lines.push(cta);
    }

    const website = user?.website ? formatWebsiteForDisplay(user.website) : '';
    const phone = user?.phone ? formatPhoneForDisplay(user.phone) : '';
    if (args.includePhone) {
      if (phone) lines.push(phone);
      else if (website) lines.push(website);
    } else {
      if (website) lines.push(website);
    }

    return lines.join('\n\n');
  };

  const ensureTrailerId = useCallback(async (options: { force?: boolean } = {}): Promise<string> => {
    if (!options.force && telegramTrailerId) return telegramTrailerId;
    if (trailerLoadPromiseRef.current) return await trailerLoadPromiseRef.current;

    const promise = (async () => {
      setIsLoadingTrailer(true);
      setTelegramTrailerError(null);
      try {
        let trailerData = await searchService.getVideos(movie.media_type, movie.id, 'pt-BR');
        let trailers =
          trailerData.results?.filter((video) => video.type === 'Trailer' && video.site === 'YouTube' && video.key) || [];

        // Se não encontrar trailer em PT-BR, tenta em inglês
        if (trailers.length === 0) {
          try {
            trailerData = await searchService.getVideos(movie.media_type, movie.id, 'en-US');
            trailers =
              trailerData.results?.filter((video) => video.type === 'Trailer' && video.site === 'YouTube' && video.key) ||
              [];
          } catch {
            // ignora erro no fallback
          }
        }

        if (trailers.length === 0) {
          const message = 'Não encontrei trailer oficial para este conteúdo.';
          setTelegramTrailerError(message);
          return '';
        }

        const trailerId = String(trailers[0].key || '').trim();
        if (!trailerId) {
          setTelegramTrailerError('Trailer indisponível no momento.');
          return '';
        }
        setTelegramTrailerId(trailerId);
        return trailerId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar trailer. Tente novamente.';
        toast({
          title: 'Erro ao buscar trailer',
          description: message,
          variant: 'destructive',
          action: (
            <ToastAction altText="Abrir configurações" onClick={openSearchConfig}>
              Abrir configurações
            </ToastAction>
          ),
        });
        const friendly = 'Não foi possível buscar o trailer agora.';
        setTelegramTrailerError(friendly);
        return '';
      } finally {
        setIsLoadingTrailer(false);
        trailerLoadPromiseRef.current = null;
      }
    })();

    trailerLoadPromiseRef.current = promise;
    return await promise;
  }, [movie.id, movie.media_type, openSearchConfig, telegramTrailerId, toast]);

  useEffect(() => {
    if (!showVideoBrandingInline) return;
    if (telegramTrailerId || telegramTrailerError || isLoadingTrailer) return;
    void ensureTrailerId();
  }, [
    showVideoBrandingInline,
    movie.id,
    movie.media_type,
    telegramTrailerId,
    telegramTrailerError,
    isLoadingTrailer,
    ensureTrailerId,
  ]);

  const extractTrailerIdFromInput = (url: string): string => {
    const value = String(url || '').trim();
    if (!value) return '';

    const watchMatch = /[?&]v=([^&]+)/.exec(value);
    if (watchMatch?.[1]) return watchMatch[1].trim();

    const shortMatch = /youtu\.be\/([^?&/]+)/.exec(value);
    if (shortMatch?.[1]) return shortMatch[1].trim();

    const embedMatch = /youtube\.com\/embed\/([^?&/]+)/.exec(value);
    if (embedMatch?.[1]) return embedMatch[1].trim();

    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '');
    if (/^[a-zA-Z0-9_-]{6,32}$/.test(cleaned)) return cleaned;
    return '';
  };

  const manualTrailerId = extractTrailerIdFromInput(manualTrailerUrl);

  const resolveTrailerId = async () => {
    const manualValue = manualTrailerUrl.trim();
    if (manualValue) {
      const trailerId = extractTrailerIdFromInput(manualValue);
      if (!trailerId) {
        throw new Error('Valor inválido. Use o ID do trailer ou um link válido.');
      }
      return trailerId;
    }

    const automaticId = await ensureTrailerId();
    if (!automaticId) {
      throw new Error('Não localizei trailer automático. Informe o ID do trailer (ou um link).');
    }
    return automaticId;
  };

  const openTelegramComposer = (purpose: 'cover' | 'video') => {
    setTelegramPurpose(purpose);
    const nextIncludeCover = purpose === 'cover';
    const nextIncludeTrailer = purpose === 'video';
    setTelegramIncludeCover(nextIncludeCover);
    setTelegramIncludeTrailer(nextIncludeTrailer);
    setTelegramTrailerError(null);
    if (!telegramTextDirty) {
      const nextText = buildTelegramText({
        includeSynopsis: telegramIncludeSynopsis,
        includeTrailer: nextIncludeTrailer,
        trailerUrl: '',
      });
      setTelegramText(nextText);
      setTelegramTextDirty(false);
    }
    setShowTelegramInline(true);
  };

  const closeTelegramComposer = () => {
    setShowTelegramInline(false);
  };

  const handleCopySynopsis = async () => {
    try {
      const text = (movie.overview || '').trim();
      if (!text) {
        toast({ title: 'Aviso', description: 'Este conteúdo não possui sinopse.', variant: 'destructive' });
        return;
      }
      const { exportService } = await import('../services/exportService');
      await exportService.copyToClipboard(text);
      toast({ title: 'Sucesso', description: 'Sinopse copiada.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar a sinopse.', variant: 'destructive' });
    }
  };

  const handleDownloadTrailerVideo = async () => {
    if (isDownloadingTrailerVideo) return;
    setIsDownloadingTrailerVideo(true);
    try {
      const trailerId = await resolveTrailerId();
      if (!trailerId) return;
      const { exportService } = await import('../services/exportService');
      await exportService.downloadTrailerVideo(movie, trailerId);
      toast({ title: 'Sucesso!', description: 'Download do trailer iniciado.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível baixar o trailer.';
      if (message === 'Faça login para usar este recurso.') {
        toastLoginRequired('baixar o trailer');
        return;
      }
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setIsDownloadingTrailerVideo(false);
    }
  };

  const buildTrailerTelegramText = () => {
    const lines: string[] = [];
    const header = `${title}${year ? ` (${year})` : ''}`;
    lines.push(header);

    lines.push(`Tipo: ${movie.media_type === 'movie' ? 'Filme' : 'Série'}`);

    if (Number.isFinite(movie.vote_average) && movie.vote_average > 0) {
      lines.push(`Avaliação: ${movie.vote_average.toFixed(1)}/10`);
    }

    const synopsis = typeof movie.overview === 'string' ? movie.overview.trim() : '';
    if (synopsis) {
      lines.push(synopsis);
    }

    return lines.join('\n\n');
  };

  const handleSendTrailerToTelegram = async () => {
    if (!user) {
      toastLoginRequired('enviar para o Telegram');
      return;
    }
    if (!canSendTelegram) {
      toast({
        title: 'Telegram não configurado',
        description: 'Configure seu ID do Telegram na Minha Área para enviar.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
            Abrir Minha Área
          </ToastAction>
        ),
      });
      return;
    }
    if (isSendingTrailerToTelegram) return;

    setIsSendingTrailerToTelegram(true);
    try {
      const trailerId = await resolveTrailerId();
      if (!trailerId) return;
      const text = buildTrailerTelegramText();

      toast({ title: 'Enviando…', description: 'Enviando trailer para o Telegram.' });
      await apiRequest<{ ok: boolean; warning?: boolean }>({
        path: '/api/telegram/send-trailer-video',
        method: 'POST',
        auth: true,
        body: { trailerId, caption: text, mediaType: movie.media_type, id: movie.id },
        timeoutMs: 120_000,
      });
      toast({ title: 'Sucesso', description: 'Trailer enviado para o Telegram.' });
    } catch (e) {
      const rawMessage = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      const message =
        rawMessage && rawMessage.toLowerCase().includes('tempo excedido')
          ? 'Tempo excedido ao enviar. Às vezes o Telegram entrega com atraso — aguarde alguns segundos e tente novamente.'
          : rawMessage;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível enviar via Telegram. Aguarde alguns segundos e tente novamente.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
            Abrir Minha Área
          </ToastAction>
        ),
      });
    } finally {
      setIsSendingTrailerToTelegram(false);
    }
  };

  const getBrandingBaseInput = (): TrailerBrandingOptions => ({
    brandName: user?.brandName,
    brandColors: user?.brandColors,
    brandLogo: user?.brandLogo,
    website: user?.website,
    phone: user?.phone,
    includeLogo: brandingIncludeLogo,
    includeSynopsis: true,
    includeCta: brandingIncludeCta,
    includePhone: brandingPhoneAvailable && brandingIncludePhone && !brandingIncludeWebsite,
    includeWebsite: brandingWebsiteAvailable && brandingIncludeWebsite && !brandingIncludePhone,
    ctaText: brandingCtaText,
    synopsisTheme: brandingSynopsisTheme,
    layout: brandingTrailerLayout,
    limitDuration: brandingLimitDuration,
  });

  const resolveBrandingTrailerId = async () => {
    if (brandingTrailerSource === 'url') {
      const manualValue = brandingManualUrl.trim();
      if (!manualValue) throw new Error('Informe o ID do trailer (ou um link).');
      const trailerId = extractTrailerIdFromInput(manualValue);
      if (!trailerId) throw new Error('Valor inválido. Use o ID do trailer ou um link válido.');
      return trailerId;
    }
    // Auto
    const automaticId = await ensureTrailerId();
    if (!automaticId) throw new Error('Não localizei trailer automático. Informe o ID do trailer (ou um link).');
    return automaticId;
  };

  const brandingStageLabel = (() => {
    if (brandingTaskStatus === 'cancelling') return 'Cancelando geração...';
    if (!brandingTaskStage) return null;
    if (brandingTaskStage === 'resolvendo-trailer') return 'Buscando trailer...';
    if (brandingTaskStage === 'gerando-servidor') return 'Gerando vídeo no servidor...';
    if (brandingTaskStage === 'gerando-local') return 'Gerando vídeo localmente...';
    if (brandingTaskStage === 'finalizando') return 'Finalizando vídeo...';
    return null;
  })();

  const isBrandingTaskRunning = brandingTaskStatus === 'running' || brandingTaskStatus === 'cancelling';
  const brandingProgressValue = Math.max(0, Math.min(100, Math.round(brandingTaskProgress)));

  const appendBrandingTaskHistory = (
    action: 'preview' | 'download',
    status: 'success' | 'error' | 'cancelled',
    detail: string
  ) => {
    setBrandingTaskHistory((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action,
        status,
        detail,
        createdAt: Date.now(),
      },
      ...current,
    ].slice(0, 5));
  };

  useEffect(() => {
    if (!isBrandingTaskRunning || !brandingTaskStage) return;
    const stageBase: Record<TrailerBrandingStage, number> = {
      'resolvendo-trailer': 16,
      'gerando-servidor': 54,
      'gerando-local': 66,
      'finalizando': 90,
    };
    const stageCap: Record<TrailerBrandingStage, number> = {
      'resolvendo-trailer': 34,
      'gerando-servidor': 84,
      'gerando-local': 88,
      'finalizando': 97,
    };
    setBrandingTaskProgress((current) => Math.max(current, stageBase[brandingTaskStage]));
    const timer = window.setInterval(() => {
      setBrandingTaskProgress((current) => {
        if (brandingTaskStatus === 'cancelling') return Math.min(99, current + 1);
        const cap = stageCap[brandingTaskStage];
        if (current >= cap) return current;
        return Math.min(cap, current + 1);
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [isBrandingTaskRunning, brandingTaskStage, brandingTaskStatus]);

  const cancelBrandingGeneration = () => {
    if (!brandingTaskAbortRef.current) return;
    setBrandingTaskStatus('cancelling');
    brandingTaskAbortRef.current.abort();
  };

  const handleDownloadBrandingVideo = async () => {
    if (isDownloadingBrandingVideo || isBrandingTaskRunning) return;
    setIsDownloadingBrandingVideo(true);
    setBrandingTaskStatus('running');
    setBrandingTaskStage('resolvendo-trailer');
    setBrandingTaskAction('download');
    setBrandingTaskProgress(6);
    const controller = new AbortController();
    brandingTaskAbortRef.current = controller;
    const { exportService } = await import('../services/exportService');
    const baseInput = getBrandingBaseInput();

    try {
      toast({
        title: 'Iniciando download…',
        description: 'Gerando vídeo completo com trailer.',
      });

      const trailerId = await resolveBrandingTrailerId();
      await exportService.downloadTrailerBranding(
        movie,
        { ...baseInput, trailerId },
        {
          signal: controller.signal,
          onStageChange: setBrandingTaskStage,
        }
      );
      setBrandingTaskProgress(100);
      appendBrandingTaskHistory('download', 'success', 'Download iniciado com sucesso.');

      toast({
        title: 'Sucesso!',
        description: 'Download iniciado.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível gerar o vídeo. Tente novamente.';
      if (message.toLowerCase().includes('cancelada')) {
        appendBrandingTaskHistory('download', 'cancelled', 'Geração cancelada pelo usuário.');
        toast({
          title: 'Geração cancelada',
          description: 'A geração foi cancelada com sucesso.',
        });
        return;
      }
      if (message === 'Faça login para usar este recurso.') {
        toastLoginRequired('gerar o vídeo branding');
        return;
      }
      toast({
        title: 'Erro no Download',
        description: message,
        variant: 'destructive',
        action: (
          <ToastAction altText="Tentar novamente" onClick={handleDownloadBrandingVideo}>
            Tentar novamente
          </ToastAction>
        ),
      });
      appendBrandingTaskHistory('download', 'error', message);
    } finally {
      if (brandingTaskAbortRef.current === controller) {
        brandingTaskAbortRef.current = null;
      }
      setIsDownloadingBrandingVideo(false);
      setBrandingTaskStatus('idle');
      setBrandingTaskStage(null);
      setBrandingTaskAction(null);
      window.setTimeout(() => setBrandingTaskProgress(0), 600);
    }
  };

  const handlePreviewBrandingVideo = async () => {
    if (isGeneratingBrandingPreview || isBrandingTaskRunning) return;
    setIsGeneratingBrandingPreview(true);
    setBrandingTaskStatus('running');
    setBrandingTaskStage('resolvendo-trailer');
    setBrandingTaskAction('preview');
    setBrandingTaskProgress(6);
    const controller = new AbortController();
    brandingTaskAbortRef.current = controller;
    const { exportService } = await import('../services/exportService');
    const baseInput = getBrandingBaseInput();

    try {
      toast({
        title: 'Gerando vídeo…',
        description: 'Aguarde enquanto geramos o vídeo.',
      });

      const trailerId = await resolveBrandingTrailerId();
      const blob = await exportService.generateTrailerBrandingBlob(
        movie,
        { ...baseInput, trailerId },
        {
          signal: controller.signal,
          onStageChange: setBrandingTaskStage,
        }
      );
      updateBrandingPreview(blob);
      setBrandingTaskProgress(100);
      appendBrandingTaskHistory('preview', 'success', 'Vídeo completo gerado com sucesso.');

      toast({
        title: 'Vídeo pronto!',
        description: 'Confira o vídeo completo e depois faça o download.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível gerar o vídeo. Tente novamente.';
      if (message.toLowerCase().includes('cancelada')) {
        appendBrandingTaskHistory('preview', 'cancelled', 'Geração cancelada pelo usuário.');
        toast({
          title: 'Geração cancelada',
          description: 'A geração foi cancelada com sucesso.',
        });
        return;
      }
      if (message === 'Faça login para usar este recurso.') {
        toastLoginRequired('gerar o preview do vídeo');
        return;
      }
      toast({
        title: 'Erro no vídeo',
        description: message,
        variant: 'destructive',
        action: (
          <ToastAction altText="Tentar novamente" onClick={handlePreviewBrandingVideo}>
            Tentar novamente
          </ToastAction>
        ),
      });
      appendBrandingTaskHistory('preview', 'error', message);
    } finally {
      if (brandingTaskAbortRef.current === controller) {
        brandingTaskAbortRef.current = null;
      }
      setIsGeneratingBrandingPreview(false);
      setBrandingTaskStatus('idle');
      setBrandingTaskStage(null);
      setBrandingTaskAction(null);
      window.setTimeout(() => setBrandingTaskProgress(0), 600);
    }
  };

  const handleSendBrandingToTelegram = async () => {
    if (!brandingPreviewBlob) return;
    if (isSendingTelegram) return;
    setIsSendingTelegram(true);
    try {
      const { exportService } = await import('../services/exportService');
      const caption = 'Novo vídeo Branding 🎬✨';

      toast({ title: 'Enviando...', description: 'Enviando vídeo para o Telegram.' });

      await exportService.sendVideoToTelegram(brandingPreviewBlob, caption);

      toast({ title: 'Sucesso!', description: 'Vídeo enviado para o Telegram.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar.';
      if (message === 'Faça login para usar este recurso.') {
        toastLoginRequired('enviar o vídeo para o Telegram');
        return;
      }
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const handleDownloadCover = async () => {
    if (isDownloading) return;


    try {
      toast({
        title: 'Iniciando download…',
        description: 'Se o navegador bloquear pop-ups, permita e tente novamente.',
      });

      const { exportService } = await import('../services/exportService');
      await exportService.downloadCover(movie);

      toast({
        title: 'Sucesso!',
        description: 'Download iniciado.',
      });
    } catch (error) {
      console.error('Erro no download:', error);
      toast({
        title: 'Erro no Download',
        description: error instanceof Error ? error.message : 'Erro ao baixar a imagem. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendTelegram = async (afterSuccess?: () => void) => {
    if (!user) return;
    if (isSendingTelegram) return;

    const text = telegramText.trim();
    const includeCover = telegramIncludeCover && Boolean(movie.poster_path);

    if (!text && !includeCover) {
      toast({
        title: 'Aviso',
        description: 'Informe o texto ou selecione uma imagem.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTelegram(true);
    try {
      await apiRequest<{ ok: boolean; warning?: boolean }>({
        path: '/api/telegram/send',
        method: 'POST',
        auth: true,
        body: {
          text,
          includeCover,
          posterPath: includeCover ? movie.poster_path : undefined,
        },
        timeoutMs: 45_000,
      });

      toast({
        title: 'Sucesso',
        description: 'Enviado para o Telegram.',
      });
      (afterSuccess || closeTelegramComposer)();
    } catch (e) {
      const rawMessage = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      const message =
        rawMessage && rawMessage.toLowerCase().includes('tempo excedido')
          ? 'Tempo excedido ao enviar. Às vezes o Telegram entrega com atraso — aguarde alguns segundos e tente novamente.'
          : rawMessage;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível enviar via Telegram. Aguarde alguns segundos e tente novamente.',
        variant: 'destructive',
        action: (
          <ToastAction altText="Abrir Minha Área" onClick={openTelegramConfig}>
            Abrir Minha Área
          </ToastAction>
        ),
      });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const canSendTelegram = Boolean(user?.telegramChatId?.trim());

  const content = (
    <div
      className={
        mode === 'modal'
          ? 'flex h-[88vh] max-h-[88vh] sm:h-[90vh] sm:max-h-[90vh] flex-col'
          : 'flex min-h-[70vh] flex-col rounded-2xl border bg-background shadow-sm'
      }
    >
      <div className="border-b px-6 py-4">
        {mode === 'page' ? (
          <div className="space-y-1 text-left">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold leading-none tracking-tight">Ações</h1>
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {title}
              {year ? ` (${year})` : ''}
            </div>
          </div>
        ) : (
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>Ações</DialogTitle>
            <div className="text-sm text-muted-foreground truncate">
              {title}
              {year ? ` (${year})` : ''}
            </div>
          </DialogHeader>
        )}
      </div>

      <div className="flex-1 overflow-hidden md:grid md:grid-cols-[280px,1fr]">
            <aside className="hidden md:block border-r bg-muted/10 p-4 overflow-y-auto">
              <div className="space-y-3">
                <div className="aspect-[2/3] w-full overflow-hidden rounded-lg border bg-muted">
                  <img
                    src={imageUrl}
                    alt={`Capa de ${title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="font-semibold leading-tight">
                    {title}
                    {year ? ` (${year})` : ''}
                  </div>
                  <div className="text-sm text-muted-foreground">Selecione uma ação para baixar ou enviar para o Telegram.</div>
                </div>

                <div className="text-sm text-muted-foreground line-clamp-6">{(movie.overview || 'Sinopse não disponível').trim()}</div>
              </div>
            </aside>

            <div className="overflow-y-auto p-4 sm:p-6">
              <div className="space-y-4">
                <div className="md:hidden flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
                  <div className="h-14 w-10 overflow-hidden rounded-md bg-muted">
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight truncate">
                      {title}
                      {year ? ` (${year})` : ''}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      Selecione uma ação para baixar ou enviar para o Telegram.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Download className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium">Baixar capa</div>
                          <div className="text-sm text-muted-foreground">Download direto ou envio via Telegram (com ou sem sinopse).</div>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadCover}
                          disabled={isDownloading}
                          className="sm:min-w-[130px] justify-center"
                        >
                          Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setShowBannerInline(false);
                            if (showTelegramInline && telegramPurpose === 'cover') {
                              closeTelegramComposer();
                              return;
                            }
                            openTelegramComposer('cover');
                          }}
                          className="sm:min-w-[130px] justify-center"
                        >
                          Telegram
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <Copy className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium">Copiar sinopse</div>
                          <div className="text-sm text-muted-foreground">Copia o texto da sinopse para colar onde quiser.</div>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <Button type="button" variant="outline" size="sm" onClick={handleCopySynopsis} className="sm:min-w-[130px] justify-center">
                          Copiar
                        </Button>
                      </div>
                    </div>
                  </div>

                  {user && isPremiumActive() && (
                    <>
                      <div className="rounded-xl border bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <Image className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                Criar banner
                                <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-orange-500 text-white border-0">
                                  BETA
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">Gere e faça download ou envie para o Telegram.</div>
                            </div>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowTelegramInline(false);
                                setShowVideoInline(false);
                                if (!showBannerInline) {
                                  setBannerInitialDestination('download');
                                }
                                setShowBannerInline((prev) => !prev);
                              }}
                              className="sm:min-w-[130px] justify-center"
                            >
                              {showBannerInline ? 'Ocultar' : 'Criar'}
                            </Button>
                          </div>
                        </div>

                        <Suspense fallback={null}>
                          {showBannerInline && (
                            <div className="mt-4 border-t pt-4">
                              <ProfessionalBannerModal
                                mode="inline"
                                movie={movie}
                                initialDestination={bannerInitialDestination}
                                onClose={() => setShowBannerInline(false)}
                              />
                            </div>
                          )}
                        </Suspense>
                      </div>

                      <div className="rounded-xl border bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <Play className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-medium">Vídeo trailer</div>
                              <div className="text-sm text-muted-foreground">Baixe o trailer ou envie para o Telegram.</div>
                            </div>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowBannerInline(false);
                                setShowVideoBrandingInline(false);
                                if (!showVideoInline) {
                                  void ensureTrailerId();
                                }
                                setShowVideoInline((prev) => !prev);
                              }}
                              className="sm:min-w-[130px] justify-center"
                            >
                              {showVideoInline ? 'Ocultar' : 'Criar'}
                            </Button>
                          </div>
                        </div>

                        {showVideoInline && (
                          <div className="mt-4 border-t pt-4 space-y-4">
                            <div className="rounded-md border p-4 space-y-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm font-medium">Trailer</div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    await ensureTrailerId();
                                  }}
                                  disabled={isLoadingTrailer}
                                >
                                  {isLoadingTrailer ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                  Buscar trailer
                                </Button>
                              </div>

                              {telegramTrailerError && (
                                <div className="space-y-2">
                                  <div className="text-sm text-muted-foreground">{telegramTrailerError}</div>
                                  <div className="grid gap-2">
                                    <Label htmlFor={`manualTrailerUrl-${movie.id}`}>Trailer (ID ou link)</Label>
                                    <Input
                                      id={`manualTrailerUrl-${movie.id}`}
                                      value={manualTrailerUrl}
                                      onChange={(e) => setManualTrailerUrl(e.target.value)}
                                      placeholder="Ex: dQw4w9WgXcQ"
                                      autoComplete="off"
                                    />
                                    {manualTrailerUrl.trim() && !manualTrailerId && (
                                      <div className="text-xs text-destructive">Valor inválido. Use o ID do trailer ou um link válido.</div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleDownloadTrailerVideo()}
                                  disabled={isLoadingTrailer || isDownloadingTrailerVideo}
                                >
                                  {isLoadingTrailer || isDownloadingTrailerVideo ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <Download className="h-4 w-4 mr-2" />
                                  )}
                                  Baixar trailer
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleSendTrailerToTelegram()}
                                  disabled={isLoadingTrailer || isSendingTrailerToTelegram}
                                >
                                  {isLoadingTrailer || isSendingTrailerToTelegram ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <Send className="h-4 w-4 mr-2" />
                                  )}
                                  Enviar no Telegram
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                              <Play className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                Video Branding
                                <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-orange-500 text-white border-0">
                                  BETA
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">Gera um vídeo com trailer, logo e CTA.</div>
                            </div>
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowBannerInline(false);
                                setShowVideoInline(false);
                                if (!showVideoBrandingInline) {
                                  setBrandingIncludeLogo(Boolean(user?.brandLogo));
                                }
                                setShowVideoBrandingInline((prev) => !prev);
                              }}
                              className="sm:min-w-[130px] justify-center"
                            >
                              {showVideoBrandingInline ? 'Ocultar' : 'Criar'}
                            </Button>
                          </div>
                        </div>

                        {showVideoBrandingInline && (
                          <div className="mt-4 border-t pt-4 space-y-6">
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-base font-semibold">Origem do Trailer</Label>
                                    <RadioGroup
                                      value={brandingTrailerSource}
                                      onValueChange={(v) => setBrandingTrailerSource(v as 'auto' | 'url')}
                                      className="mt-2 flex flex-col gap-2"
                                    >
                                      <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="auto" id="source-auto" />
                                        <Label htmlFor="source-auto" className="cursor-pointer">Automático</Label>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="url" id="source-url" />
                                        <Label htmlFor="source-url" className="cursor-pointer">Trailer (Manual)</Label>
                                      </div>
                                    </RadioGroup>
                                  </div>

                                  {brandingTrailerSource === 'url' && (
                                    <div className="space-y-2">
                                      <Label htmlFor="manual-url">Trailer (ID ou link)</Label>
                                      <Input
                                        id="manual-url"
                                        placeholder="Ex: dQw4w9WgXcQ"
                                        value={brandingManualUrl}
                                        onChange={(e) => setBrandingManualUrl(e.target.value)}
                                      />
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                     <div className="flex items-center justify-between gap-3">
                                       <Label htmlFor="cta-text">Texto do CTA</Label>
                                       <div className="text-xs text-muted-foreground">
                                         {Math.min(brandingCtaText.replace(/\r/g, '').length, BRANDING_CTA_MAX_CHARS)}/{BRANDING_CTA_MAX_CHARS}
                                       </div>
                                     </div>
                                     <Textarea
                                       id="cta-text"
                                       value={brandingCtaText}
                                       onChange={(e) => {
                                         let next = e.target.value.replace(/\r/g, '');
                                         if (next.length > BRANDING_CTA_MAX_CHARS) next = next.slice(0, BRANDING_CTA_MAX_CHARS);
                                         const parts = next.split('\n');
                                         if (parts.length > 2) next = `${parts[0]}\n${parts.slice(1).join(' ')}`;
                                         setBrandingCtaText(next);
                                       }}
                                      placeholder="Dica de Conteúdo!"
                                       rows={2}
                                       className="resize-none"
                                       disabled={!brandingIncludeCta}
                                       maxLength={BRANDING_CTA_MAX_CHARS}
                                     />
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <Label className="text-base font-semibold">Personalização</Label>
                                  <div className="grid grid-cols-1 gap-3">
                                    <Label className="flex items-center gap-2 cursor-pointer">
                                      <Checkbox
                                        checked={brandingIncludeLogo}
                                        onCheckedChange={(v) => {
                                          const next = Boolean(v);
                                          if (next && !user?.brandLogo) {
                                            toast({
                                              title: 'Logo não configurada',
                                              description: 'Envie sua logo na Minha Área para usar no vídeo.',
                                              variant: 'destructive',
                                            });
                                            setBrandingIncludeLogo(false);
                                            return;
                                          }
                                          setBrandingIncludeLogo(next);
                                        }}
                                      />
                                      Incluir logo
                                    </Label>
                                    <Label className="flex items-center gap-2 cursor-pointer">
                                      <Checkbox checked={brandingIncludeCta} onCheckedChange={(v) => setBrandingIncludeCta(Boolean(v))} />
                                      Incluir CTA
                                    </Label>
                                    <Label className="flex items-center gap-2 cursor-pointer">
                                      <Checkbox checked={brandingLimitDuration} onCheckedChange={(v) => setBrandingLimitDuration(Boolean(v))} />
                                      Limitar a 1m30s
                                    </Label>
                                  </div>

                                  <div className="space-y-2 pt-2 border-t">
                                    <Label htmlFor="synopsis-theme" className="text-sm font-medium">Tema do vídeo</Label>
                                    <Select value={brandingSynopsisTheme} onValueChange={(v) => setBrandingSynopsisTheme(v as typeof brandingSynopsisTheme)}>
                                      <SelectTrigger id="synopsis-theme">
                                        <SelectValue placeholder="Selecione um tema" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="elegant-black">
                                          <div className="flex items-center gap-2">
                                            <span className="h-4 w-4 rounded-sm border" style={getBrandingThemePreviewStyle('elegant-black')} />
                                            Preto (Elegante)
                                          </div>
                                        </SelectItem>
                                        <SelectItem value="brand">
                                          <div className="flex items-center gap-2">
                                            <span className="h-4 w-4 rounded-sm border" style={getBrandingThemePreviewStyle('brand')} />
                                            Marca (Gradiente)
                                          </div>
                                        </SelectItem>
                                        <SelectItem value="highlight-yellow">
                                          <div className="flex items-center gap-2">
                                            <span className="h-4 w-4 rounded-sm border" style={getBrandingThemePreviewStyle('highlight-yellow')} />
                                            Destaque (Amarelo)
                                          </div>
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                <div className="space-y-2 pt-2 border-t">
                                  <Label htmlFor="branding-layout" className="text-sm font-medium">Formato</Label>
                                  <Select value={brandingTrailerLayout} onValueChange={(v) => setBrandingTrailerLayout(v as typeof brandingTrailerLayout)}>
                                    <SelectTrigger id="branding-layout">
                                      <SelectValue placeholder="Selecione um formato" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="portrait">1080x1920 (Storie)</SelectItem>
                                      <SelectItem value="feed">1080x1350 (Feed)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                  <div className="space-y-2 pt-2 border-t">
                                    <Label className="text-sm font-medium">Contato (Opcional)</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {brandingPhoneAvailable && (
                                        <Label className="flex items-center gap-2 cursor-pointer">
                                          <Checkbox
                                            checked={brandingIncludePhone}
                                            onCheckedChange={(v) => {
                                              const next = Boolean(v);
                                              setBrandingIncludePhone(next);
                                              if (next) setBrandingIncludeWebsite(false);
                                            }}
                                          />
                                          Mostrar telefone
                                        </Label>
                                      )}
                                      {brandingWebsiteAvailable && (
                                        <Label className="flex items-center gap-2 cursor-pointer">
                                          <Checkbox
                                            checked={brandingIncludeWebsite}
                                            onCheckedChange={(v) => {
                                              const next = Boolean(v);
                                              setBrandingIncludeWebsite(next);
                                              if (next) setBrandingIncludePhone(false);
                                            }}
                                          />
                                          Mostrar site
                                        </Label>
                                      )}
                                    </div>
                                    {!brandingPhoneAvailable && !brandingWebsiteAvailable && (
                                      <p className="text-xs text-muted-foreground">
                                        Para exibir contato no vídeo, cadastre telefone ou site na Minha Área.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col items-center gap-3 pt-6 border-t mt-6">
                                {brandingStageLabel && (
                                  <p className="text-sm text-muted-foreground">{brandingStageLabel}</p>
                                )}
                                {isBrandingTaskRunning && (
                                  <div className="w-full max-w-lg space-y-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>{brandingTaskAction === 'download' ? 'Gerando para download' : 'Gerando prévia'}</span>
                                      <span>{brandingProgressValue}%</span>
                                    </div>
                                    <Progress value={brandingProgressValue} className="h-2" />
                                  </div>
                                )}
                                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                                  <Button
                                    onClick={handlePreviewBrandingVideo}
                                    disabled={isBrandingTaskRunning}
                                    className="w-full sm:min-w-[200px] font-semibold shadow-md"
                                    size="lg"
                                  >
                                    {isGeneratingBrandingPreview ? (
                                      <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Gerando Vídeo...
                                      </>
                                    ) : (
                                      <>
                                        <Play className="mr-2 h-5 w-5 fill-current" />
                                        Gerar Vídeo
                                      </>
                                    )}
                                  </Button>
                                  {isBrandingTaskRunning && (
                                    <Button
                                      variant="destructive"
                                      onClick={cancelBrandingGeneration}
                                      disabled={brandingTaskStatus === 'cancelling'}
                                      className="w-full sm:min-w-[160px]"
                                      size="lg"
                                    >
                                      {brandingTaskStatus === 'cancelling' ? (
                                        <>
                                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                          Cancelando...
                                        </>
                                      ) : (
                                        'Cancelar geração'
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {brandingTaskHistory.length > 0 && (
                                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                                  <div className="text-xs font-semibold tracking-wide text-muted-foreground">
                                    Últimas gerações
                                  </div>
                                  <div className="space-y-2">
                                    {brandingTaskHistory.map((item) => {
                                      const badgeVariant =
                                        item.status === 'success' ? 'default' : item.status === 'cancelled' ? 'secondary' : 'destructive';
                                      const actionLabel = item.action === 'download' ? 'Download' : 'Prévia';
                                      const dateLabel = new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      });
                                      return (
                                        <div key={item.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5">
                                          <div className="min-w-0">
                                            <div className="text-xs font-medium">
                                              {actionLabel} • {dateLabel}
                                            </div>
                                            <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
                                          </div>
                                          <Badge variant={badgeVariant}>
                                            {item.status === 'success' ? 'Sucesso' : item.status === 'cancelled' ? 'Cancelado' : 'Erro'}
                                          </Badge>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {brandingPreviewUrl && (
                              <div className="space-y-6 border-t pt-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex flex-col items-center gap-2 text-center">
                                  <h3 className="text-xl font-bold">Seu vídeo está pronto!</h3>
                                  <p className="text-sm text-muted-foreground max-w-[400px]">
                                    Confira o vídeo abaixo. Se gostar, faça o download ou envie diretamente para o Telegram.
                                  </p>
                                </div>
                                
                                <div
                                  className={`${
                                    brandingTrailerLayout === 'feed'
                                      ? 'aspect-[4/5] max-w-[420px]'
                                      : 'aspect-[9/16] max-w-[320px]'
                                  } max-h-[520px] w-full mx-auto overflow-hidden rounded-xl border-4 border-neutral-900 bg-black shadow-2xl ring-1 ring-white/10 relative group`}
                                >
                                  <video
                                    src={brandingPreviewUrl}
                                    controls
                                    className="h-full w-full object-contain"
                                  />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 max-w-lg mx-auto">
                                  <Button
                                    variant="outline"
                                    onClick={handleDownloadBrandingVideo}
                                    disabled={isDownloadingBrandingVideo || isBrandingTaskRunning}
                                    className="w-full h-12 text-base shadow-sm"
                                  >
                                    {isDownloadingBrandingVideo ? (
                                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    ) : (
                                      <Download className="mr-2 h-5 w-5" />
                                    )}
                                    Baixar Vídeo
                                  </Button>
                                  <Button
                                    variant="default"
                                    onClick={handleSendBrandingToTelegram}
                                    disabled={isSendingTelegram || isBrandingTaskRunning}
                                    className="w-full h-12 text-base shadow-sm bg-[#229ED9] hover:bg-[#229ED9]/90 text-white transition-all hover:scale-[1.02]"
                                  >
                                    {isSendingTelegram ? (
                                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    ) : (
                                      <Send className="mr-2 h-5 w-5" />
                                    )}
                                    Enviar no Telegram
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {showTelegramInline && (
                    <div className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">Telegram {telegramPurpose === 'video' ? '— Trailer' : '— Capa'}</div>
                        <Button type="button" variant="outline" size="sm" onClick={closeTelegramComposer} disabled={isSendingTelegram}>
                          Ocultar
                        </Button>
                      </div>

                      <div className="mt-4 space-y-4">
                        {!user && (
                          <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                            Faça login para enviar via Telegram.
                            <div className="mt-2">
                              <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new Event('mediahub:openAuthModal'))}>
                                Fazer login
                              </Button>
                            </div>
                          </div>
                        )}

                        {user && !canSendTelegram && (
                          <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                            Configure seu ID do Telegram na Minha Área para enviar.
                            <div className="mt-2">
                              <Button type="button" variant="outline" onClick={openTelegramConfig}>
                                Abrir Minha Área
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {telegramPurpose === 'cover' && (
                            <Label className="flex items-center gap-2">
                              <Checkbox
                                checked={telegramIncludeCover && Boolean(movie.poster_path)}
                                onCheckedChange={(checked) => setTelegramIncludeCover(Boolean(checked))}
                                disabled={!movie.poster_path}
                              />
                              Incluir capa
                            </Label>
                          )}
                          <Label className="flex items-center gap-2">
                            <Checkbox
                              checked={telegramIncludeSynopsis}
                              onCheckedChange={(checked) => {
                                const next = Boolean(checked);
                                setTelegramIncludeSynopsis(next);
                                if (!telegramTextDirty) {
                                  setTelegramText(buildTelegramText({ includeSynopsis: next, includeTrailer: telegramIncludeTrailer, trailerUrl: '' }));
                                }
                              }}
                            />
                            Incluir sinopse
                          </Label>
                          {telegramPurpose === 'video' && (
                            <Label className="flex items-center gap-2">
                              <Checkbox
                                checked={telegramIncludeTrailer}
                                onCheckedChange={(checked) => {
                                  const next = Boolean(checked);
                                  setTelegramIncludeTrailer(next);
                                  setTelegramTrailerError(null);
                                  if (!next) {
                                    if (!telegramTextDirty) {
                                      setTelegramText(buildTelegramText({ includeSynopsis: telegramIncludeSynopsis, includeTrailer: false, trailerUrl: '' }));
                                    }
                                    return;
                                  }

                                  if (!telegramTextDirty) {
                                    setTelegramText(buildTelegramText({ includeSynopsis: telegramIncludeSynopsis, includeTrailer: true, trailerUrl: '' }));
                                  }
                                }}
                              />
                              Incluir trailer
                            </Label>
                          )}
                        </div>

                        {telegramPurpose === 'video' && telegramIncludeTrailer && (
                          <div className="rounded-md border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">Trailer</div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const trailerId = await ensureTrailerId();
                                  if (!trailerId) return;
                                  if (!telegramTextDirty) setTelegramText(buildTelegramText({ includeSynopsis: telegramIncludeSynopsis, includeTrailer: true, trailerUrl: '' }));
                                }}
                                disabled={isLoadingTrailer}
                              >
                                {isLoadingTrailer ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                Buscar trailer
                              </Button>
                            </div>
                            {telegramTrailerError && (
                              <div className="mt-2 space-y-2">
                                <div className="text-sm text-muted-foreground">
                                  Não localizei trailer automaticamente. Cole o ID do trailer (ou um link) para enviar o vídeo.
                                </div>
                                <Input
                                  value={manualTrailerUrl}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setManualTrailerUrl(next);
                                    if (!telegramTextDirty && telegramIncludeTrailer) {
                                      setTelegramText(buildTelegramText({ includeSynopsis: telegramIncludeSynopsis, includeTrailer: true, trailerUrl: '' }));
                                    }
                                  }}
                                  placeholder="Ex: dQw4w9WgXcQ"
                                  autoComplete="off"
                                />
                                {manualTrailerUrl.trim() && !manualTrailerId && (
                                  <div className="text-xs text-destructive">Valor inválido. Use o ID do trailer ou um link válido.</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid gap-2">
                          <Label htmlFor={`telegramText-${movie.id}`}>Mensagem</Label>
                          <Textarea
                            id={`telegramText-${movie.id}`}
                            value={telegramText}
                            onChange={(e) => {
                              setTelegramText(e.target.value);
                              setTelegramTextDirty(true);
                            }}
                            rows={8}
                            placeholder="Edite o texto que será enviado."
                          />
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="text-sm font-medium">Prévia</div>
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 items-start">
                            <div className="w-full">
                              {telegramPurpose === 'cover' && telegramIncludeCover && movie.poster_path ? (
                                <img
                                  src={imageUrl}
                                  alt={`Prévia da capa de ${title}`}
                                  className="w-full max-w-[120px] rounded-md object-cover aspect-[2/3]"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full max-w-[120px] rounded-md bg-muted aspect-[2/3]" aria-hidden="true" />
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words max-h-48 overflow-auto">
                              {telegramText.trim() ? telegramText.trim() : 'Sem texto.'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                          <Button type="button" variant="outline" onClick={closeTelegramComposer} disabled={isSendingTelegram}>
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleSendTelegram(closeTelegramComposer)}
                            disabled={
                              !user ||
                              !canSendTelegram ||
                              isSendingTelegram ||
                              (telegramPurpose === 'video' && telegramIncludeTrailer && isLoadingTrailer)
                            }
                          >
                            {isSendingTelegram ? 'Enviando…' : 'Enviar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Fechar
                  </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (mode === 'page') return content;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        setShowBannerInline(false);
        setShowVideoInline(false);
        setShowVideoBrandingInline(false);
        setShowTelegramInline(false);
        onClose();
      }}
    >
      <DialogContent variant="complex" className="sm:max-w-3xl lg:max-w-5xl overflow-hidden p-0">
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default MovieActionsModal;
