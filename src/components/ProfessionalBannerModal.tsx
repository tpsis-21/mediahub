
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mediaHubUi } from '../lib/mediahub-events';
import { X, Download, Send, Loader2 } from 'lucide-react';
import { MovieData } from '../services/searchService';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiRequest, apiRequestRaw } from '../services/apiClient';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import {
  renderProfessionalBannerBlob,
  type ProfessionalBannerTemplate,
} from '../lib/banner/professional-layout';

type BannerTemplate = ProfessionalBannerTemplate;

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
            onClick={() => mediaHubUi.openUserArea()}
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
      detailsGenres,
      brandLogo: user?.brandLogo,
      brandName: user?.brandName,
      includeFooterPhone,
      includeFooterWebsite,
      phone: user?.phone,
      website: user?.website,
    });

  const renderBannerBlobRef = useRef<typeof renderBannerBlob>(renderBannerBlob);
  renderBannerBlobRef.current = renderBannerBlob;

  useEffect(() => {
    const seq = ++previewSeq.current;
    const format = formatDimensions[selectedFormat];

    void (async () => {
      try {
        const previews: Array<{ id: number; url: string }> = await Promise.all(
          visibleTemplates.map(async (template: BannerTemplate) => {
            const blob = await renderBannerBlobRef.current({ template, format, mime: 'image/png', quality: 1.0 });
            return { id: template.id, url: URL.createObjectURL(blob) };
          })
        );

        if (seq !== previewSeq.current) return;
        Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));

        const next: Record<number, string> = {};
        previews.forEach((p: { id: number; url: string }) => {
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
              onClick={() => mediaHubUi.openUserArea()}
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
          <Button variant="outline" size="sm" onClick={() => mediaHubUi.openUserArea()}>
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
      <Card className={cardClassName} data-testid="professional-banner-modal">
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

