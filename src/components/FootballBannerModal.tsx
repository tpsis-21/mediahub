import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mediaHubUi } from '../lib/mediahub-events';
import { Download, Loader2, Copy, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import {
  apiRequest,
  apiRequestGetTryCandidates,
  apiRequestRaw,
  buildLongRunningApiUrl,
  collectSameOriginApiGetCandidates,
  getAuthToken,
  type ApiError,
} from '../services/apiClient';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { ToastAction } from './ui/toast';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { formatPhoneForDisplay, formatWebsiteForDisplay } from '../lib/utils';
import { loadImage as loadBannerImage } from '../lib/banner';
import {
  MH_BLOB_MIME_ATTR,
  blobHeaderLooksLikeSvg,
  footballCrestAuthHeaders,
  getDrawableImageIntrinsicSize,
  getFootballCrestCacheKey,
  isUsableCrestImageElement,
  loadImageFirstAvailable,
  loadImageFromBlobCore,
  normalizeFootballAssetInput,
  rasterBlobToPngDataUrlImage,
  sniffImageMimeFromArrayBuffer,
} from '../lib/banner/crest';
import {
  configureFootballLayoutLoaders,
  generateFootballBanners,
  FOOTBALL_BANNER_TEMPLATES,
  FOOTBALL_TEMPLATE_DEFAULT_COLORS,
  footballMatchKey,
  getDefaultFootballScheduleDate,
  normalizeFootballScheduleCrests,
  readCachedFootballSchedule,
  writeCachedFootballSchedule,
  buildMatchesText,
  formatDatePtBr,
  hasRenderableCrest,
  type BannerFormat,
  type FootballBannerTemplateId,
  type FootballScheduleResponse,
} from '../lib/banner/football-layout';

/** Limite de logs de debug por sessão do browser (evita spam no ingest). */
let dbgCrestRemoteFailLogs = 0;
let dbgCrestEmptyNormalizedLogs = 0;
let dbgCrestProxy400Logs = 0;
let dbgCrestLoadEntryLogs = 0;
let dbgMimeCoerceLogs = 0;
let dbgBlobDecodeFailLogs = 0;
let dbgScheduleEffectOpenLogs = 0;

const DEBUG_AGENT_INGEST_URL = 'http://127.0.0.1:7360/ingest/2d4625cb-a796-43ae-818f-8ba3f0811ba4';

/** Em dev (ou VITE_DEBUG_AGENT_LOG=true + API com DEBUG_AGENT_LOG=1), grava NDJSON. Ingest local só em DEV. */
const postFootballBannerDebugLog = (payload: {
  runId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
}) => {
  if (!import.meta.env.DEV && import.meta.env.VITE_DEBUG_AGENT_LOG !== 'true') return;

  const body = JSON.stringify({ sessionId: '3ee3aa', timestamp: Date.now(), ...payload });
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_AGENT_LOG === 'true') {
    const urls = collectSameOriginApiGetCandidates('/api/debug/agent-log');
    void fetch(urls[0] ?? '/api/debug/agent-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }
  // Nunca bater em localhost de debug em builds de produção.
  if (import.meta.env.DEV) {
    void fetch(DEBUG_AGENT_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3ee3aa' },
      body,
    }).catch(() => {});
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const key = 'mh_football_crest_dbg';
      const prev = sessionStorage.getItem(key);
      const arr: unknown[] = prev ? (JSON.parse(prev) as unknown[]) : [];
      arr.push(JSON.parse(body) as object);
      sessionStorage.setItem(key, JSON.stringify(arr.slice(-50)));
    }
  } catch {
    void 0;
  }
};

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  loadBannerImage(src, { onError: 'null', decode: true, crossOrigin: true });

const loadImageFromBlob = async (blob: Blob): Promise<HTMLImageElement | null> => {
  const img = await loadImageFromBlobCore(blob);
  if (img && (img.naturalWidth || img.width)) return img;
  const typeSvg = (blob.type || '').toLowerCase().includes('svg');
  if (img?.complete && typeSvg) return img;
  const viaBmp = await rasterBlobToPngDataUrlImage(blob);
  if (viaBmp && (viaBmp.naturalWidth || viaBmp.width)) return viaBmp;
  if (img?.complete && !blob.type && (await blobHeaderLooksLikeSvg(blob))) {
    // Sem type no Blob, <img> fica 0×0 e blob: não contém "svg" — isUsableCrestImageElement precisa do MIME.
    img.setAttribute(MH_BLOB_MIME_ATTR, 'image/svg+xml');
    // #region agent log
    postFootballBannerDebugLog({
      hypothesisId: 'H6',
      location: 'FootballBannerModal.tsx:loadImageFromBlob',
      message: 'svg_sniff_mime_set',
      data: { blobSize: blob.size },
    });
    // #endregion
    return img;
  }
  // #region agent log
  if (dbgBlobDecodeFailLogs < 8) {
    dbgBlobDecodeFailLogs += 1;
    postFootballBannerDebugLog({
      hypothesisId: 'H14',
      location: 'FootballBannerModal.tsx:loadImageFromBlob',
      message: 'blob_decode_failed',
      data: {
        blobType: (blob.type || '').slice(0, 64),
        blobSize: blob.size,
        hadImg: Boolean(img),
        complete: Boolean(img?.complete),
      },
    });
  }
  // #endregion
  return null;
};

/** Resposta com `Blob.type` vazio ou `Content-Type` genérico quebra decode/SVG sniff. */
const coerceBlobImageMimeFromResponse = async (res: Response, blob: Blob): Promise<Blob> => {
  if ((blob.type || '').trim()) return blob;
  let mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  try {
    const ab = await blob.arrayBuffer();
    const headerUnusable =
      !mime.startsWith('image/') || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
    if (headerUnusable) {
      const sniffed = sniffImageMimeFromArrayBuffer(ab);
      if (sniffed) mime = sniffed;
      // #region agent log
      if (dbgMimeCoerceLogs < 8) {
        dbgMimeCoerceLogs += 1;
        postFootballBannerDebugLog({
          hypothesisId: 'H13',
          location: 'FootballBannerModal.tsx:coerceBlobImageMimeFromResponse',
          message: 'mime_coerce_attempt',
          data: {
            responseMime: (res.headers.get('content-type') || '').slice(0, 80),
            sniffedMime: sniffed || '',
            blobSize: blob.size,
          },
        });
      }
      // #endregion
    }
    if (!mime.startsWith('image/')) return new Blob([ab]);
    return new Blob([ab], { type: mime });
  } catch {
    return blob;
  }
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
  const path = `/api/assets/image?url=${encodeURIComponent(url)}`;
  for (const fetchUrl of collectSameOriginApiGetCandidates(path)) {
    try {
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'image/*' },
      });
      if (!res.ok) continue;
      const blobRaw = await res.blob();
      if (!blobRaw || blobRaw.size === 0) continue;
      const blob = await coerceBlobImageMimeFromResponse(res, blobRaw);
      const img = await loadImageFromBlob(blob);
      if (img) return img;
    } catch {
      continue;
    }
  }
  return null;
};

/** Em dev: mesmo host (proxy Vite) primeiro; URL directa ao Express por último — evita falhar só na primeira tentativa com [::1]:PORT; vídeos longos continuam a usar `buildLongRunningApiUrl` noutros módulos. */
const collectApiGetCandidatesDevDirectFirst = (apiPath: string): string[] => {
  const rest = collectSameOriginApiGetCandidates(apiPath);
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return Array.from(new Set([...rest, buildLongRunningApiUrl(apiPath)]));
  }
  return rest;
};

const resolveFootballAssetCandidates = (rawUrl: string) => {
  const normalized = normalizeFootballAssetInput(rawUrl);
  if (!normalized) return [];
  if (normalized.startsWith('data:')) return [normalized];
  if (normalized.startsWith('/')) {
    return [normalized];
  }
  const absolute = normalized;
  const httpsCandidate = absolute.replace(/^http:\/\//i, 'https://');
  const crestPath = `/api/football/crest?url=${encodeURIComponent(absolute)}`;
  return Array.from(
    new Set(
      [...collectApiGetCandidatesDevDirectFirst(crestPath), httpsCandidate, absolute].filter(Boolean)
    )
  );
};

const loadFootballCrestImage = async (rawUrl: string): Promise<HTMLImageElement | null> => {
  const normalized = normalizeFootballAssetInput(rawUrl);
  // #region agent log
  if (dbgCrestLoadEntryLogs < 10) {
    dbgCrestLoadEntryLogs += 1;
    postFootballBannerDebugLog({
      hypothesisId: 'H12',
      location: 'FootballBannerModal.tsx:loadFootballCrestImage',
      message: 'crest_load_entry',
      data: {
        rawLen: typeof rawUrl === 'string' ? rawUrl.length : 0,
        normalizedLen: normalized.length,
        normalizedKind: normalized.startsWith('data:')
          ? 'data'
          : normalized.startsWith('/')
            ? 'path'
            : normalized
              ? 'remote'
              : 'empty',
      },
    });
  }
  // #endregion
  if (normalized.includes('/assets/img/loadteam.png')) return null;
  if (!normalized) {
    // #region agent log
    if (dbgCrestEmptyNormalizedLogs < 4) {
      dbgCrestEmptyNormalizedLogs += 1;
      postFootballBannerDebugLog({
        hypothesisId: 'H3',
        location: 'FootballBannerModal.tsx:loadFootballCrestImage',
        message: 'crest_empty_normalized',
        data: { rawLen: typeof rawUrl === 'string' ? rawUrl.length : 0 },
      });
    }
    // #endregion
    return null;
  }
  if (normalized.startsWith('data:') || normalized.startsWith('/')) {
    return await loadImageFirstAvailable(resolveFootballAssetCandidates(rawUrl));
  }

  const crestProxyStatuses: number[] = [];
  const token = getAuthToken();
  if (token) {
    const assetPath = `/api/assets/image?url=${encodeURIComponent(normalized)}`;
    for (const fetchUrl of collectApiGetCandidatesDevDirectFirst(assetPath)) {
      try {
        const res = await fetch(fetchUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, Accept: 'image/*' },
        });
        if (!res.ok) continue;
        const blobRaw = await res.blob();
        if (blobRaw && blobRaw.size > 0) {
          const blob = await coerceBlobImageMimeFromResponse(res, blobRaw);
          const fromBlob = await loadImageFromBlob(blob);
          if (fromBlob) return fromBlob;
        }
      } catch {
        continue;
      }
    }
  }

  const candidates = resolveFootballAssetCandidates(rawUrl);
  // fetch → blob evita falhas de CORS/canvas com <img crossOrigin> em alguns browsers/proxies.
  for (const url of candidates) {
    if (!/\/api\/football\/crest\?/i.test(url)) continue;
    try {
      const base = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
      const crestPostEndpoint = `${base.origin}${base.pathname}`;
      // GET limita `url` (3000 chars no Express); o URI completo pode estourar proxies (414). POST JSON até 16k.
      const crestPostRecoverStatuses = new Set([
        400, 401, 403, 408, 413, 414, 429, 431, 494, 500, 502, 503, 504,
      ]);
      const longCrestTarget = normalized.length > 900;
      const longCrestRequestUrl = url.length > 2200;
      let postAttempted = false;
      const tryCrestProxyPost = async (reason: string, getStatus: number) => {
        if (postAttempted) return null;
        postAttempted = true;
        const postRes = await fetch(crestPostEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: footballCrestAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url: normalized }),
        });
        if (!postRes.ok) return null;
        // #region agent log
        postFootballBannerDebugLog({
          hypothesisId: 'H15',
          location: 'FootballBannerModal.tsx:loadFootballCrestImage',
          message:
            reason === 'bad_ct'
              ? 'crest_proxy_post_recovered_after_bad_ct'
              : reason === 'small_body'
                ? 'crest_proxy_post_recovered_after_small_get_body'
                : 'crest_proxy_post_recovered',
          data: {
            reason,
            getStatus,
            postStatus: postRes.status,
            normalizedLen: normalized.length,
            requestUrlLen: url.length,
          },
        });
        // #endregion
        return postRes;
      };

      let res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: footballCrestAuthHeaders(),
      });
      const tryPostOnFail =
        !res.ok && (longCrestTarget || longCrestRequestUrl || crestPostRecoverStatuses.has(res.status));
      if (tryPostOnFail) {
        const pr = await tryCrestProxyPost('get_fail', res.status);
        if (pr) res = pr;
      }
      crestProxyStatuses.push(res.status);
      if (!res.ok) {
        if (res.status === 400 && dbgCrestProxy400Logs < 2) {
          dbgCrestProxy400Logs += 1;
          // #region agent log
          postFootballBannerDebugLog({
            hypothesisId: 'H11',
            location: 'FootballBannerModal.tsx:loadFootballCrestImage',
            message: 'crest_proxy_400',
            data: { requestUrlLen: url.length },
          });
          // #endregion
        }
        continue;
      }
      let ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) {
        // #region agent log
        postFootballBannerDebugLog({
          hypothesisId: 'H7',
          location: 'FootballBannerModal.tsx:loadFootballCrestImage',
          message: 'crest_proxy_non_image_ct',
          data: { ct: ct.slice(0, 80), status: res.status },
        });
        // #endregion
        const pr = await tryCrestProxyPost('bad_ct', res.status);
        if (pr) {
          res = pr;
          ct = (res.headers.get('content-type') || '').toLowerCase();
        }
        if (ct.includes('text/html') || ct.includes('application/json')) continue;
      }
      let blobRaw = await res.blob();
      if (!blobRaw || blobRaw.size < 24) {
        const pr = await tryCrestProxyPost('small_body', res.status);
        if (pr) {
          res = pr;
          ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html') || ct.includes('application/json')) continue;
          blobRaw = await res.blob();
        }
        if (!blobRaw || blobRaw.size < 24) continue;
      }
      const blob = await coerceBlobImageMimeFromResponse(res, blobRaw);
      const fromBlob = await loadImageFromBlob(blob);
      if (fromBlob) return fromBlob;
    } catch {
      continue;
    }
  }

  const finalImg = await loadImageFirstAvailable(candidates);
  if (!finalImg && dbgCrestRemoteFailLogs < 6) {
    dbgCrestRemoteFailLogs += 1;
    // #region agent log
    postFootballBannerDebugLog({
      hypothesisId: 'H1,H5',
      location: 'FootballBannerModal.tsx:loadFootballCrestImage',
      message: 'crest_remote_failed',
      data: {
        host: (() => {
          try {
            return new URL(normalized.startsWith('//') ? `https:${normalized}` : normalized).hostname;
          } catch {
            return '';
          }
        })(),
        crestProxyStatuses,
        candidateCount: candidates.length,
        hasToken: Boolean(token),
      },
    });
    // #endregion
  }
  return finalImg;
};


configureFootballLayoutLoaders({
  loadImage,
  loadBrandLogoImage,
  loadFootballCrestImage,
  loadImageFirstAvailable,
  debugLog: postFootballBannerDebugLog,
});

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
      await apiRequestGetTryCandidates<{ date?: string }>({
        path: `/api/football/schedule/refresh?date=${encodeURIComponent(dateIso)}`,
        auth: true,
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
          <ToastAction altText="Fazer login" onClick={() => mediaHubUi.openAuth()}>
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
          <ToastAction altText="Ver plano" onClick={() => mediaHubUi.openUserArea()}>
            Ver plano
          </ToastAction>
        ),
      });
      onClose();
    }
  }, [isOpen, isPremiumActive, isPremiumExpired, onClose, toast, user]);

  const applySchedule = useCallback((data: FootballScheduleResponse) => {
    const normalized = normalizeFootballScheduleCrests(data);
    setSchedule(normalized);
    setMatchSelection(() => {
      const next: Record<string, boolean> = {};
      for (const match of normalized?.matches || []) {
        next[footballMatchKey(match)] = true;
      }
      return next;
    });
  }, []);

  const fetchSchedule = useCallback(async (targetDate?: string, opts?: { silent?: boolean; loadingFromCache?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    try {
      const query = targetDate ? `?date=${encodeURIComponent(targetDate)}` : '';
      const data = await apiRequestGetTryCandidates<FootballScheduleResponse>({
        path: `/api/football/schedule${query}`,
        auth: true,
        // Servidor pode embutir escudos (data URLs); precisa de margem acima do enrich + inline.
        timeoutMs: 55_000,
      });
      lastScheduleFetchAtRef.current = Date.now();
      applySchedule(data);
      writeCachedFootballSchedule(data);
      if (Array.isArray(data.matches) && data.matches.length > 0) {
        emptyScheduleRetryCountRef.current = 0;
        clearEmptyScheduleRetryTimer();
      }
    } catch (e: unknown) {
      const err = e as Partial<ApiError> | null;
      const status = typeof err?.status === 'number' ? err.status : 0;
      // Com cache já aplicado, `silent: true` saltava o toast — sessão expirada deixava escudos/dados velhos sem aviso.
      if (opts?.silent && opts?.loadingFromCache && (status === 401 || status === 403)) {
        toast({
          title: 'Sessão expirada',
          description: 'Os jogos vêm do cache local. Faça login novamente para atualizar dados e escudos.',
          variant: 'destructive',
          action: (
            <ToastAction altText="Fazer login" onClick={() => mediaHubUi.openAuth()}>
              Fazer login
            </ToastAction>
          ),
        });
      }
      if (!schedule?.matches?.length) {
        const expectedDate = typeof targetDate === 'string' && targetDate.trim() ? targetDate.trim() : getDefaultFootballScheduleDate();
        const cached = readCachedFootballSchedule(expectedDate);
        if (cached?.matches?.length && (!targetDate || cached.date === targetDate)) {
          applySchedule(cached);
          return;
        }
        const serverMsg = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : '';
        let description = serverMsg || 'Não foi possível carregar os jogos agora. Tente novamente.';
        if (status === 401) {
          description = 'Sessão expirada ou não autenticado. Faça login novamente.';
          try {
            mediaHubUi.openAuth();
          } catch {
            void 0;
          }
        } else if (status === 403) {
          description = serverMsg || 'Acesso negado. Verifique se sua conta tem permissão (Premium).';
        } else if (status === 0 && !serverMsg) {
          description =
            'Não foi possível conectar à API. Se o site e a API estão em domínios diferentes, defina VITE_API_BASE_URL no build e ALLOWED_ORIGIN no servidor (inclua www e sem www, se usar os dois).';
        }
        toast({
          title: 'Erro',
          description,
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
    if (!isOpen) {
      // Reabrir o modal deve voltar a pedir o calendário; com estado em memória o skip de 15min
      // bloqueava fetch e o servidor não via /api/football/schedule (ring só com clear).
      lastScheduleFetchAtRef.current = 0;
      return;
    }
    // O efeito de auth/premium corre no mesmo ciclo e chama onClose() sem fechar o Dialog de forma síncrona.
    // Aqui exigimos apenas contexto de usuário/plano; o token pode vir por cookie/sessão no próprio request.
    if (!user || !isPremiumActive()) return;
    const now = Date.now();
    const skip15mRecent =
      Boolean(schedule?.matches?.length) &&
      lastScheduleFetchAtRef.current > 0 &&
      now - lastScheduleFetchAtRef.current < 15 * 60 * 1000;
    // #region agent log
    if (dbgScheduleEffectOpenLogs < 12) {
      dbgScheduleEffectOpenLogs += 1;
      postFootballBannerDebugLog({
        hypothesisId: 'H32',
        location: 'FootballBannerModal.tsx:schedule_load_effect',
        message: 'schedule_effect_open',
        data: {
          skip15mRecent,
          matchCount: schedule?.matches?.length ?? 0,
          lastAgeMs:
            lastScheduleFetchAtRef.current > 0 ? now - lastScheduleFetchAtRef.current : -1,
          runId: 'post-fix',
        },
      });
    }
    // #endregion
    if (skip15mRecent) return;
    const expectedDate = getDefaultFootballScheduleDate();
    const cached = readCachedFootballSchedule(expectedDate);
    if (cached?.matches?.length) {
      lastScheduleFetchAtRef.current = now;
      applySchedule(cached);
      void fetchSchedule(expectedDate, { silent: true, loadingFromCache: true });
      return;
    }
    void fetchSchedule(expectedDate);
  }, [applySchedule, fetchSchedule, isOpen, isPremiumActive, schedule?.matches?.length, user]);

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
      // Antes: `every(!home && !away)` só atualizava se TODOS os jogos estivessem sem os dois escudos.
      // Com um único URL (mesmo inválido) num jogo, o refresh nunca corria → canvas sem escudos.
      const shouldAttemptRefreshForCrests =
        matchesForGeneration.length > 0 &&
        matchesForGeneration.some(
          (m) => !hasRenderableCrest(m.homeCrestUrl) || !hasRenderableCrest(m.awayCrestUrl),
        );

      if (shouldAttemptRefreshForCrests) {
        try {
          await triggerScheduleRefresh(schedule.date);
          const refreshed = await apiRequestGetTryCandidates<FootballScheduleResponse>({
            path: `/api/football/schedule?date=${encodeURIComponent(schedule.date)}`,
            auth: true,
            timeoutMs: 55_000,
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
      <DialogContent
        variant="complex"
        className="max-w-6xl h-[92vh] overflow-hidden"
        data-testid="football-banner-modal"
      >
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
                        src={t.previewUrl}
                        alt={`Exemplo do template ${t.name}`}
                        className="rounded-md aspect-[4/5] w-20 sm:w-24 bg-muted object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.dataset.fallbackTried === '1') return;
                          el.dataset.fallbackTried = '1';
                          const anexosFallback: Record<string, string> = {
                            informativo: '/anexos/Modelo%201%20jogos%20do%20dia/ideia-de-montagem.png',
                            promo: '/anexos/modelo%202jogos%20do%20dia/exemplo-modelo2.png',
                            clean: '/anexos/modelo%203/exemplo.png',
                          };
                          const next = anexosFallback[t.id];
                          if (next) el.src = next;
                        }}
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

