
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mediaHubUi } from '../lib/mediahub-events';
import { X, Download, Archive, ArrowUp, ArrowDown, Loader2, Send } from 'lucide-react';
import { MediaType, MovieData, searchService } from '../services/searchService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import JSZip from 'jszip';
import { apiRequest, apiRequestGetTryCandidates, apiRequestRaw } from '../services/apiClient';
import { useToast } from '../hooks/use-toast';
import { formatPhoneForDisplay, formatWebsiteForDisplay, getSearchConfigToastCopy, isSearchConfigErrorMessage } from '../lib/utils';
import { getPosterUrl } from '../lib/banner';
import {
  generateRankingBannerEmAlta as generateRankingBannerEmAltaLib,
  generateRankingBannerTop10Cartaz as generateRankingBannerTop10CartazLib,
  type RankingLayoutOptions,
} from '../lib/banner/bulk-ranking-layout';
import {
  buildIndividualBannerTemplates,
  generateIndividualBanner,
  type IndividualBannerTemplate,
} from '../lib/banner/bulk-individual-layout';
import { ToastAction } from './ui/toast';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

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

type BannerTemplate = IndividualBannerTemplate;

type BannerFormat = {
  width: number;
  height: number;
  label: string;
};

type RankingColorVariant = 'classic' | 'dark' | 'red' | 'brand';
type ManualRankingMatch = {
  source: string;
  year?: string;
  candidates: MovieData[];
  selectedId: number | null;
};

const sanitizeManualRankingLine = (rawLine: string) => {
  const withoutQuotes = String(rawLine || '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!withoutQuotes) return '';
  const withoutEmojiPrefix = withoutQuotes.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u20E3\s•▪▫*\-_.]+/gu, '').trim();
  const withoutNumberPrefix = withoutEmojiPrefix
    .replace(/^(?:#\s*)?\d{1,2}\s*(?:[.)º°:-]+)?\s*/u, '')
    .replace(/^(?:top\s*)?\d{1,2}\s*[-:]\s*/iu, '')
    .trim();
  return withoutNumberPrefix;
};

const BulkBannerModal: React.FC<BulkBannerModalProps> = ({
  movies,
  onClose,
  initialMode = 'individual',
  initialRankingCategory = 'all',
  initialRankingTemplate = 'em-alta',
  initialRankingMovies,
  modeLocked = false,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<GeneratorMode>(initialMode);
  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'portrait' | 'story'>('square');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'running' | 'cancelling'>('idle');
  const [progress, setProgress] = useState(0);
  const [rankingTemplate, setRankingTemplate] = useState<RankingTemplateId>(initialRankingTemplate);
  const [rankingCategory, setRankingCategory] = useState<RankingCategory>(initialRankingCategory);
  const [rankingMovies, setRankingMovies] = useState<MovieData[]>(() => (initialRankingMovies || movies).slice(0, 10));
  const [rankingSource, setRankingSource] = useState<RankingSource>('auto');
  const [rankingManualText, setRankingManualText] = useState('');
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [currentExportDestination, setCurrentExportDestination] = useState<ExportDestination | null>(null);
  const [telegramCaption, setTelegramCaption] = useState('');
  const [rankingFooterIncludePhone, setRankingFooterIncludePhone] = useState(false);
  const [rankingFooterIncludeWebsite, setRankingFooterIncludeWebsite] = useState(false);
  const [rankingColorVariant, setRankingColorVariant] = useState<RankingColorVariant>('classic');
  const [rankingPreviewEmAltaUrl, setRankingPreviewEmAltaUrl] = useState<string | null>(null);
  const [rankingPreviewCartazUrl, setRankingPreviewCartazUrl] = useState<string | null>(null);
  const [manualRankingMatches, setManualRankingMatches] = useState<ManualRankingMatch[]>([]);
  const [lastManualBuildSignature, setLastManualBuildSignature] = useState('');
  const [isRankingPreviewLoading, setIsRankingPreviewLoading] = useState(false);
  const rankingPreviewEmAltaUrlRef = useRef<string | null>(null);
  const rankingPreviewCartazUrlRef = useRef<string | null>(null);
  const rankingPreviewSeq = useRef(0);
  const cancelGenerationRef = useRef(false);
  const generationRunRef = useRef(0);

  useEffect(() => {
    if (rankingSource !== 'manual') {
      setManualRankingMatches([]);
      setLastManualBuildSignature('');
    }
  }, [rankingSource]);

  const manualRankingSignature = useMemo(
    () =>
      rankingManualText
        .split('\n')
        .map((line) => sanitizeManualRankingLine(line))
        .filter((line) => line.length > 0)
        .slice(0, 10)
        .join('\n'),
    [rankingManualText]
  );

  const isManualRankingUpToDate =
    manualRankingMatches.length > 0 && manualRankingSignature.length > 0 && manualRankingSignature === lastManualBuildSignature;

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

  useEffect(() => {
    if (!rankingFooterWebsiteAvailable && rankingFooterIncludeWebsite) setRankingFooterIncludeWebsite(false);
    if (!rankingFooterPhoneAvailable && rankingFooterIncludePhone) setRankingFooterIncludePhone(false);
  }, [rankingFooterIncludePhone, rankingFooterIncludeWebsite, rankingFooterPhoneAvailable, rankingFooterWebsiteAvailable]);

  const throwIfGenerationCancelled = (runId: number) => {
    if (cancelGenerationRef.current || runId !== generationRunRef.current) {
      throw new Error('Operação cancelada pelo usuário.');
    }
  };

  const cancelGeneration = () => {
    if (!isGenerating) return;
    cancelGenerationRef.current = true;
    generationRunRef.current += 1;
    setGenerationStatus('cancelling');
  };

  const templates: BannerTemplate[] = useMemo(
    () => buildIndividualBannerTemplates(user?.brandColors),
    [user?.brandColors]
  );

  const formatDimensions: Record<'square' | 'portrait' | 'story', BannerFormat> = useMemo(
    () => ({
      square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
      portrait: { width: 1080, height: 1350, label: '1080x1350 (Feed)' },
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
          onClick={() => mediaHubUi.openAuth()}
        >
          Fazer login
        </ToastAction>
      ),
    });
  };

  const openSearchConfig = () => {
    if (!user) {
      mediaHubUi.openAuth();
      return;
    }
    if (user.type === 'admin') {
      mediaHubUi.openAdmin();
      return;
    }
    mediaHubUi.openUserArea();
  };

  const openTelegramConfig = () => {
    if (!user) {
      mediaHubUi.openAuth();
      return;
    }
    mediaHubUi.openUserArea();
  };

  const isTelegramChatIdConfigErrorMessage = (message: string) => /configure seu id do telegram/i.test(message);

  const handleLoadRankingAutomatic = async () => {
    if (isRankingLoading || isGenerating) return;
    setIsRankingLoading(true);
    try {
      const payload = await apiRequestGetTryCandidates<{ results?: MovieData[] }>({
        path: `/api/search/trending?mediaType=${rankingCategory}&language=pt-BR`,
        auth: Boolean(user),
      });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const normalized = results.map((item) => {
        if (!item || typeof item !== 'object') return item as MovieData;
        if (item.media_type === 'movie' || item.media_type === 'tv') return item;
        const hasMovieFields = typeof item.title === 'string' || typeof item.release_date === 'string';
        const hasTvFields = typeof item.name === 'string' || typeof item.first_air_date === 'string';
        if (hasMovieFields && !hasTvFields) return { ...item, media_type: 'movie' as const };
        if (hasTvFields) return { ...item, media_type: 'tv' as const };
        return item as MovieData;
      });
      const top10 = normalized.filter((item) => item && (item.media_type === 'movie' || item.media_type === 'tv')).slice(0, 10);

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
      const rawLines = rankingManualText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 10);

      if (rawLines.length === 0) {
        toast({ title: 'Lista vazia', description: 'Cole pelo menos 1 item.' });
        return;
      }
      const lines = rawLines
        .map((line) => sanitizeManualRankingLine(line))
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        toast({
          title: 'Lista inválida',
          description: 'Não reconheci títulos válidos. Envie uma linha por título, com ou sem emoji/numeração.',
          variant: 'destructive',
        });
        return;
      }

      const media: MediaType = rankingCategory === 'movie' ? 'movie' : rankingCategory === 'tv' ? 'tv' : 'multi';
      const matches: ManualRankingMatch[] = [];

      for (const line of lines) {
        const { title, year } = searchService.parseSearchQuery(line);
        const data = await searchService.searchByType(title, media, year, 'pt-BR');
        const candidates = Array.isArray(data?.results)
          ? data.results.filter((item, idx, arr) => idx === arr.findIndex((x) => x.id === item.id)).slice(0, 5)
          : [];
        matches.push({
          source: line,
          year,
          candidates,
          selectedId: candidates[0]?.id || null,
        });
      }

      const resolvedCount = matches.filter((item) => item.selectedId).length;
      if (resolvedCount === 0) {
        toast({
          title: 'Sem resultados',
          description: 'Não encontrei títulos da lista. Tente usar nome + ano, por exemplo: Zootopia 2 (2025).',
          variant: 'destructive',
        });
        return;
      }

      setManualRankingMatches(matches);
      setLastManualBuildSignature(lines.join('\n'));
      applyManualMatchesToRanking(matches);
      toast({
        title: 'Ranking carregado',
        description: `Fonte: lista manual (${resolvedCount}/${rawLines.length} itens reconhecidos). Confira os termos abaixo e ajuste se necessário.`,
      });
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

  const applyManualMatchesToRanking = (matches: ManualRankingMatch[]) => {
    const selectedByOrder: MovieData[] = [];
    for (const match of matches) {
      if (!match.selectedId) continue;
      const picked = match.candidates.find((item) => item.id === match.selectedId) || null;
      if (!picked) continue;
      if (selectedByOrder.some((item) => item.id === picked.id)) continue;
      selectedByOrder.push(picked);
    }
    if (selectedByOrder.length > 0) setRankingMovies(selectedByOrder.slice(0, 10));
  };

  const handleChangeManualMatch = (index: number, selectedIdRaw: string) => {
    const selectedId = Number(selectedIdRaw);
    setManualRankingMatches((current) => {
      const next = current.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, selectedId: Number.isFinite(selectedId) && selectedId > 0 ? selectedId : null };
      });
      applyManualMatchesToRanking(next);
      return next;
    });
  };

  const rankingLayoutOptions = useMemo(
    (): RankingLayoutOptions => ({
      colorVariant: rankingColorVariant,
      footerIncludePhone: rankingFooterIncludePhone,
      footerIncludeWebsite: rankingFooterIncludeWebsite,
      brand: {
        brandName: user?.brandName,
        brandColors: user?.brandColors,
        brandLogo: user?.brandLogo,
        phone: user?.phone,
        website: user?.website,
      },
    }),
    [
      rankingColorVariant,
      rankingFooterIncludePhone,
      rankingFooterIncludeWebsite,
      user?.brandName,
      user?.brandColors,
      user?.brandLogo,
      user?.phone,
      user?.website,
    ]
  );

  const generateRankingBannerEmAlta = (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rankOffset: number;
  }) =>
    generateRankingBannerEmAltaLib({
      ...args,
      format: { width: args.format.width, height: args.format.height },
      options: rankingLayoutOptions,
    });

  const generateRankingBannerTop10Cartaz = (args: {
    items: MovieData[];
    category: RankingCategory;
    format: BannerFormat;
    rangeLabel?: string;
    rankOffset: number;
  }) =>
    generateRankingBannerTop10CartazLib({
      ...args,
      format: { width: args.format.width, height: args.format.height },
      options: rankingLayoutOptions,
    });

  const generateRankingBannerEmAltaRef = useRef(generateRankingBannerEmAlta);
  const generateRankingBannerTop10CartazRef = useRef(generateRankingBannerTop10Cartaz);
  generateRankingBannerEmAltaRef.current = generateRankingBannerEmAlta;
  generateRankingBannerTop10CartazRef.current = generateRankingBannerTop10Cartaz;

  useEffect(() => {
    const seq = ++rankingPreviewSeq.current;
    setIsRankingPreviewLoading(true);

    const previewItems5: MovieData[] =
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

    const previewItems10: MovieData[] = Array.from({ length: 10 }, (_, idx) => {
      const existing = effectiveRankingMovies[idx];
      if (existing) return existing;
      return {
        id: 10_010_000 + idx,
        title: `Filme ${idx + 1}`,
        release_date: '',
        name: '',
        first_air_date: '',
        overview: idx === 0 ? 'Uma sinopse de exemplo para destacar o 1º lugar no modelo Stories.' : '',
        poster_path: '',
        backdrop_path: '',
        vote_average: 0,
        genre_ids: [],
        media_type: 'movie',
      };
    });

    void (async () => {
      try {
        const [emAltaBlob, cartazBlob] = await Promise.all([
          generateRankingBannerEmAltaRef.current({
            items: previewItems5,
            category: rankingCategory,
            format: formatDimensions.square,
            rankOffset: 0,
          }),
          generateRankingBannerTop10CartazRef.current({
            items: previewItems10,
            category: rankingCategory,
            format: formatDimensions.story,
            rangeLabel: '1–10',
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

  const generateBanner = async (movie: MovieData, template: BannerTemplate, format: BannerFormat): Promise<Blob> =>
    generateIndividualBanner(movie, template, format);

  const handleGenerateRankingBanners = async (destination: ExportDestination) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationStatus('running');
    setProgress(0);
    setCurrentExportDestination(destination);
    cancelGenerationRef.current = false;
    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;

    const items = effectiveRankingMovies;
    const generatedBanners: Array<{ filename: string; blob: Blob }> = [];

    const categoryLabel = rankingCategory === 'movie' ? 'filmes' : rankingCategory === 'tv' ? 'series' : 'geral';
    const dateLabel = new Date().toISOString().split('T')[0];

    const isStoryTop10SinglePage = rankingTemplate === 'top10-cartaz' && items.length >= 10;
    const pages = isStoryTop10SinglePage
      ? [items.slice(0, 10)]
      : items.length >= 10
        ? [items.slice(0, 5), items.slice(5, 10)]
        : items.length >= 5
          ? [items.slice(0, 5)]
          : [];
    if (pages.length === 0) {
      setIsGenerating(false);
      setGenerationStatus('idle');
      return;
    }

    const format = rankingTemplate === 'top10-cartaz' ? formatDimensions.story : formatDimensions.square;

    if (rankingColorVariant === 'brand' && !(user?.brandColors?.primary && user?.brandColors?.secondary)) {
      toast({
        title: 'Cores da marca não definidas',
        description: 'Defina as cores na Minha Área. Por enquanto, vamos usar a variação “Padrão”.',
      });
    }

    if (destination === 'telegram' && !user) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para enviar pelo Telegram.',
        variant: 'destructive',
      });
      setIsGenerating(false);
      setGenerationStatus('idle');
      setCurrentExportDestination(null);
      return;
    }

    if (destination === 'telegram') {
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
        setCurrentExportDestination(null);
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
          throwIfGenerationCancelled(runId);
          setProgress(50);

          const secondBlob =
            rankingTemplate === 'top10-cartaz'
              ? await generateRankingBannerTop10Cartaz({ items: pages[1], category: rankingCategory, format, rangeLabel: '6–10', rankOffset: 5 })
              : await generateRankingBannerEmAlta({ items: pages[1], category: rankingCategory, format, rankOffset: 5 });
          throwIfGenerationCancelled(runId);
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
          throwIfGenerationCancelled(runId);

          setProgress(100);
        } else {
          for (let i = 0; i < pages.length; i++) {
            throwIfGenerationCancelled(runId);
            const pageItems = pages[i];
            const pageIndex = i + 1;
            const rangeLabel = isStoryTop10SinglePage ? '1–10' : pageIndex === 1 ? '1–5' : '6–10';
            const rankOffset = isStoryTop10SinglePage ? 0 : pageIndex === 1 ? 0 : 5;
            const blob =
              rankingTemplate === 'top10-cartaz'
                ? await generateRankingBannerTop10Cartaz({ items: pageItems, category: rankingCategory, format, rangeLabel, rankOffset })
                : await generateRankingBannerEmAlta({ items: pageItems, category: rankingCategory, format, rankOffset });

            const perPageCaption =
              baseCaption ? `${baseCaption}\n\nTop 10 (${rangeLabel})` : `Top 10 (${rangeLabel})`;

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
            throwIfGenerationCancelled(runId);

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
        if (message.toLowerCase().includes('cancelada')) {
          toast({
            title: 'Geração cancelada',
            description: 'A operação foi interrompida com sucesso.',
          });
          return;
        }
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
        setGenerationStatus('idle');
        setCurrentExportDestination(null);
      }

      return;
    }

    try {
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i++) {
        throwIfGenerationCancelled(runId);
        const pageItems = pages[i];
        const pageIndex = i + 1;
        const rangeLabel = isStoryTop10SinglePage ? '1–10' : pageIndex === 1 ? '1–5' : '6–10';
        const rankOffset = isStoryTop10SinglePage ? 0 : pageIndex === 1 ? 0 : 5;
        const blob =
          rankingTemplate === 'top10-cartaz'
            ? await generateRankingBannerTop10Cartaz({ items: pageItems, category: rankingCategory, format, rangeLabel, rankOffset })
            : await generateRankingBannerEmAlta({ items: pageItems, category: rankingCategory, format, rankOffset });
        throwIfGenerationCancelled(runId);
        zip.file(`ranking_top10_${categoryLabel}_${dateLabel}_${rangeLabel}.png`, blob);

        setProgress(((i + 1) / pages.length) * 100);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      throwIfGenerationCancelled(runId);
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ranking_top10_${categoryLabel}_${dateLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Sucesso',
        description: 'Download iniciado.',
      });
      onClose();
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('cancelada')) {
        toast({
          title: 'Geração cancelada',
          description: 'A operação foi interrompida com sucesso.',
        });
        return;
      }
      toast({
        title: 'Erro',
        description: message || 'Não foi possível gerar agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationStatus('idle');
      setCurrentExportDestination(null);
    }
  };

  const handleGenerateBulkBanners = async (destination: ExportDestination) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationStatus('running');
    setProgress(0);
    setCurrentExportDestination(destination);
    cancelGenerationRef.current = false;
    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;
    
    const zip = new JSZip();
    const generatedBanners: Blob[] = [];
    const template = templates.find((t) => t.id === selectedTemplate) ?? templates[0];
    const format = formatDimensions[selectedFormat];
    
    try {
      for (let i = 0; i < movies.length; i++) {
        throwIfGenerationCancelled(runId);
        const movie = movies[i];
        
        const blob = await generateBanner(movie, template, format);
        throwIfGenerationCancelled(runId);
        
        const filename = `banner_${(movie.title || movie.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
        zip.file(filename, blob);
        generatedBanners.push(blob);
        
        setProgress(((i + 1) / movies.length) * 100);
      }
      
      if (destination === 'download') {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        throwIfGenerationCancelled(runId);
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `banners_${template.name.toLowerCase().replace(/\s+/g, '_')}_${selectedFormat}_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({
          title: 'Sucesso',
          description: 'Download iniciado.',
        });
        onClose();
        return;
      }

      if (!user) {
        toast({
          title: 'Login necessário',
          description: 'Faça login para enviar pelo Telegram.',
          variant: 'destructive',
        });
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
        return;
      }

      try {
        const caption = telegramCaption.trim();
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

        for (let i = 0; i < generatedBanners.length; i += 2) {
          throwIfGenerationCancelled(runId);
          const first = generatedBanners[i];
          const second = generatedBanners[i + 1];
          const params = new URLSearchParams();
          if (caption && i === 0) params.set('caption', caption);

          if (second) {
            await apiRequestRaw<{ ok: true }>({
              path: `/api/telegram/send-media-group-upload?${params.toString()}`,
              method: 'POST',
              auth: true,
              headers: { 'Content-Type': 'application/octet-stream' },
              body: await makeMediaGroupPayload(first, second),
              timeoutMs: 120_000,
            });
          } else {
            await apiRequestRaw<{ ok: true }>({
              path: `/api/telegram/send-upload?${params.toString()}`,
              method: 'POST',
              auth: true,
              headers: { 'Content-Type': first.type || 'image/png' },
              body: first,
              timeoutMs: 120_000,
            });
          }
        }

        toast({
          title: 'Sucesso',
          description: 'Enviado para o Telegram sem zip.',
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
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes('cancelada')) {
        toast({
          title: 'Geração cancelada',
          description: 'A operação foi interrompida com sucesso.',
        });
        return;
      }
      toast({
        title: 'Erro',
        description: message || 'Não foi possível gerar agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationStatus('idle');
      setCurrentExportDestination(null);
    }
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" data-testid="bulk-banner-modal">
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

          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm text-muted-foreground">Baixe o ZIP ou envie direto no Telegram.</div>
            {!user && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                Para enviar no Telegram, faça login.
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => mediaHubUi.openAuth()}
                    disabled={isGenerating}
                  >
                    Fazer login
                  </Button>
                </div>
              </div>
            )}
            {user && !user.telegramChatId?.trim() && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                Para enviar no Telegram, configure seu ID do Telegram na Minha Área.
                <div className="mt-2">
                  <Button type="button" variant="outline" onClick={openTelegramConfig} disabled={isGenerating}>
                    Abrir Minha Área
                  </Button>
                </div>
              </div>
            )}

          </div>

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
                        O sistema localiza cada linha na base de dados, ignora emojis/numeração e mantém a ordem da lista.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <p className="mr-auto self-center text-xs text-muted-foreground">
                        Após escolher um candidato, o ranking é atualizado automaticamente.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleBuildRankingFromManual()}
                        disabled={isGenerating || isRankingLoading || !rankingManualText.trim() || isManualRankingUpToDate}
                      >
                        {isRankingLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Montando…
                          </>
                        ) : isManualRankingUpToDate ? (
                          'Lista já carregada'
                        ) : manualRankingMatches.length > 0 ? (
                          'Atualizar busca da lista'
                        ) : (
                          'Buscar itens da lista'
                        )}
                      </Button>
                    </div>
                    {manualRankingMatches.length > 0 && (
                      <div className="space-y-3 rounded-md border p-3">
                        {(() => {
                          const ambiguousMatches = manualRankingMatches
                            .map((match, index) => ({ match, index }))
                            .filter((entry) => entry.match.candidates.length > 1);
                          const noResultCount = manualRankingMatches.filter((match) => match.candidates.length === 0).length;
                          const autoCount = manualRankingMatches.filter((match) => match.candidates.length === 1).length;
                          if (ambiguousMatches.length === 0 && noResultCount === 0) {
                            return (
                              <p className="text-sm text-muted-foreground">
                                Tudo certo: todos os termos tiveram resultado único e foram reconhecidos automaticamente.
                              </p>
                            );
                          }
                          return (
                            <div className="space-y-3">
                              <div className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm">
                                <p className="font-medium">Revisão necessária</p>
                                <p className="text-muted-foreground">
                                  {ambiguousMatches.length} {ambiguousMatches.length === 1 ? 'termo teve mais de um resultado' : 'termos tiveram mais de um resultado'}.
                                  {' '}Selecione o conteúdo correto antes de gerar o Top 10.
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Reconhecimento automático: {autoCount} • Sem resultado: {noResultCount}
                                </p>
                              </div>
                              <div className="space-y-3 max-h-[28rem] overflow-auto pr-1">
                                {ambiguousMatches.map(({ match, index }) => (
                                  <div key={`${match.source}-${index}`} className="grid gap-2 rounded-md border p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <Label className="text-xs text-muted-foreground">{`Termo ${index + 1}: ${match.source}`}</Label>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => handleChangeManualMatch(index, '')}
                                        disabled={isGenerating || isRankingLoading}
                                      >
                                        Limpar
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                      {match.candidates.map((candidate) => {
                                        const title = candidate.title || candidate.name || 'Sem título';
                                        const date = candidate.release_date || candidate.first_air_date || '';
                                        const year = date ? date.slice(0, 4) : '----';
                                        const mediaLabel = candidate.media_type === 'tv' ? 'Série' : 'Filme';
                                        const isSelected = candidate.id === match.selectedId;
                                        const posterSrc = candidate.poster_path
                                          ? getPosterUrl({ posterPath: candidate.poster_path, size: 'w185' })
                                          : '/placeholder.svg';
                                        return (
                                          <button
                                            key={`thumb-${candidate.id}-${index}`}
                                            type="button"
                                            onClick={() => handleChangeManualMatch(index, String(candidate.id))}
                                            className={`text-left rounded-md border p-1 transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:border-border'}`}
                                            disabled={isGenerating || isRankingLoading}
                                          >
                                            <div className="mb-1 flex items-center justify-end">
                                              <Checkbox checked={isSelected} />
                                            </div>
                                            <img src={posterSrc} alt={title} className="w-full aspect-[2/3] object-cover rounded-sm" loading="lazy" />
                                            <div className="mt-1 text-[10px] leading-tight line-clamp-2">{title}</div>
                                            <div className="text-[10px] text-muted-foreground">{`${year} · ${mediaLabel}`}</div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                                {noResultCount > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Alguns termos não retornaram resultados. Você pode ajustar a escrita da lista e montar novamente.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
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
                    className={`cursor-pointer rounded-lg border p-4 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-primary ${
                      rankingTemplate === 'em-alta' ? 'border-primary' : 'hover:border-border'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="em-alta" id="ranking-em-alta" className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">Top 10 — Quadrado (1–5 / 6–10)</div>
                        <div className="text-sm text-muted-foreground">Layout “Em alta” com destaque do 1º lugar.</div>
                        <div className="mt-3 overflow-hidden rounded-md border bg-muted/30 p-2">
                          <div className="mx-auto w-full max-w-[210px] rounded bg-black/15">
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
                    className={`cursor-pointer rounded-lg border p-4 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-primary ${
                      rankingTemplate === 'top10-cartaz' ? 'border-primary' : 'hover:border-border'
                    } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="top10-cartaz" id="ranking-top10-cartaz" className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">Top 10 — Stories (1–10)</div>
                        <div className="text-sm text-muted-foreground">Cartaz vertical com visual mais “cinema”.</div>
                        <div className="mt-3 overflow-hidden rounded-md border bg-muted/30 p-2">
                          <div className="mx-auto w-full max-w-[145px] rounded bg-black/15">
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
                <div className="mt-2 text-sm text-muted-foreground">
                  Quadrado: gera 2 imagens (1–5 e 6–10) quando houver 10 itens. Stories: gera 1 imagem (1–10) quando houver 10 itens.
                </div>
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
                    <ToggleGroupItem value="red" aria-label="Cores vermelhas">
                      Vermelho
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
                    {rankingFooterWebsiteAvailable && (
                      <Label className="flex items-center gap-2">
                        <Checkbox
                          checked={rankingFooterIncludeWebsite}
                          onCheckedChange={(v) => {
                            const next = Boolean(v);
                            setRankingFooterIncludeWebsite(next);
                            if (next) setRankingFooterIncludePhone(false);
                          }}
                          disabled={isGenerating}
                        />
                        Incluir site
                      </Label>
                    )}
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={rankingFooterIncludePhone}
                        onCheckedChange={(v) => {
                          const next = Boolean(v);
                          setRankingFooterIncludePhone(next);
                          if (next) setRankingFooterIncludeWebsite(false);
                        }}
                        disabled={isGenerating || !rankingFooterPhoneAvailable}
                      />
                      Incluir telefone
                    </Label>
                  </div>
                  {!rankingFooterWebsiteAvailable && !rankingFooterPhoneAvailable ? (
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
                <RadioGroupItem value="portrait" id="bulk-portrait" />
                <Label htmlFor="bulk-portrait" className="cursor-pointer">
                  {formatDimensions.portrait.label}
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
                <span>
                  {generationStatus === 'cancelling'
                    ? 'Cancelando…'
                    : currentExportDestination === 'telegram'
                      ? 'Enviando…'
                      : 'Gerando…'}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Botão de Geração */}
          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm font-semibold block">Mensagem para Telegram (opcional)</Label>
            <Textarea
              value={telegramCaption}
              onChange={(e) => setTelegramCaption(e.target.value)}
              rows={3}
              placeholder="Escreva uma mensagem (opcional)."
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Essa mensagem será usada apenas ao enviar no Telegram.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {isGenerating && (
              <Button
                type="button"
                variant="destructive"
                onClick={cancelGeneration}
                disabled={generationStatus === 'cancelling'}
                className="flex items-center gap-2"
              >
                {generationStatus === 'cancelling' ? (
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
              type="button"
              variant="outline"
              onClick={() => void (mode === 'ranking' ? handleGenerateRankingBanners('download') : handleGenerateBulkBanners('download'))}
              disabled={isGenerating || (mode === 'ranking' && effectiveRankingMovies.length < 5)}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span>{mode === 'ranking' ? 'Baixar ZIP do Top 10' : 'Baixar ZIP dos banners'}</span>
            </Button>

            <Button
              type="button"
              onClick={() => void (mode === 'ranking' ? handleGenerateRankingBanners('telegram') : handleGenerateBulkBanners('telegram'))}
              disabled={
                isGenerating ||
                (mode === 'ranking' && effectiveRankingMovies.length < 5) ||
                !user ||
                !user.telegramChatId?.trim()
              }
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{mode === 'ranking' ? 'Enviar Top 10 no Telegram' : 'Enviar ZIP no Telegram'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkBannerModal;


