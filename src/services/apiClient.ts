export type ApiError = {
  status: number;
  message: string;
};

const STORAGE_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
} as const;

const normalizeApiBaseUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.toLowerCase().endsWith('/api')) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
};

const isLocalApiBaseUrl = (raw: string): boolean => {
  try {
    const normalized = normalizeApiBaseUrl(raw);
    if (!normalized) return false;
    const url = new URL(normalized);
    const host = (url.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
};

/** Em produção, origem + `import.meta.env.BASE_URL` (ex.: app em /app/). Evita fetch em /api na raiz quando a SPA está em subcaminho. */
const getSameOriginApiBase = (): string => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const rawBase = import.meta.env.BASE_URL;
  if (typeof rawBase !== 'string' || rawBase === '/' || rawBase === '') return origin;
  const segment = rawBase.replace(/^\/+|\/+$/g, '');
  if (!segment) return origin;
  return `${origin}/${segment}`;
};

export const getApiBaseUrl = () => {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (typeof env === 'string' && env.trim().length > 0) {
    if (import.meta.env.DEV && isLocalApiBaseUrl(env)) return '';
    // Em produção, URL "local" no build aponta ao container/servidor — no browser do cliente não existe API aí.
    if (!import.meta.env.DEV && isLocalApiBaseUrl(env)) {
      return getSameOriginApiBase();
    }
    return normalizeApiBaseUrl(env);
  }
  if (!import.meta.env.DEV) {
    return typeof window !== 'undefined' ? getSameOriginApiBase() : '';
  }
  return '';
};

/** URL absoluta para um path da API (ex.: `/api/search/image?size=w500&path=…`). Respeita `VITE_API_BASE_URL`. */
export const buildApiUrl = (path: string): string => {
  const base = getApiBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};

/** IPv6 (::1) precisa de colchetes na URL; senão o browser interpreta mal o host. */
const hostForDirectDevApiUrl = (hostname: string): string => {
  const h = (hostname || '').trim();
  if (!h) return 'localhost';
  if (h.includes(':') && !h.startsWith('[')) return `[${h}]`;
  return h;
};

const normalizeHostnameNoBrackets = (hostname: string) =>
  String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

/** Loopback no browser: usar 127.0.0.1 na URL directa evita pedidos a [::1]:PORT falharem quando o Express ou o SO tratam IPv4/IPv6 de forma assimétrica (comum com Vite em `host: "::"`). */
const isBrowserLoopbackHostname = (hostname: string): boolean => {
  const h = normalizeHostnameNoBrackets(hostname);
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1' ||
    h === '::ffff:127.0.0.1'
  );
};

/** Alinha à `read-env-port.mjs`: se `VITE_DEV_API_PORT` falhar (define desatualizado), usa a porta em `VITE_API_BASE_URL`. */
const parseLocalhostPortFromViteApiBase = (raw: string): string => {
  const v = String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!v) return '';
  try {
    const u = new URL(v.includes('://') ? v : `http://${v}`);
    const host = (u.hostname || '').toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return '';
    if (!u.port) return '';
    const n = Number(u.port);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  } catch {
    return '';
  }
};

const resolveDevDirectApiPort = (): string => {
  const fromDefine = String(import.meta.env.VITE_DEV_API_PORT || '').trim();
  const nDefine = Number(fromDefine);
  if (fromDefine && Number.isFinite(nDefine) && nDefine > 0) return fromDefine;
  const fromBase = parseLocalhostPortFromViteApiBase(String(import.meta.env.VITE_API_BASE_URL || ''));
  if (fromBase) return fromBase;
  return '8081';
};

/**
 * Em dev, geração de vídeo pode levar minutos sem enviar bytes; o proxy do Vite às vezes derruba a conexão.
 * Use esta URL para POST/stream longos: vai direto ao Express (mesma máquina), evitando o proxy.
 */
export const buildLongRunningApiUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (base) return `${base}${normalized}`;
  if (import.meta.env.DEV) {
    const port = resolveDevDirectApiPort();
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const h = window.location.hostname;
      const hostInUrl = isBrowserLoopbackHostname(h) ? '127.0.0.1' : hostForDirectDevApiUrl(h);
      return `http://${hostInUrl}:${port}${normalized}`;
    }
    return `http://127.0.0.1:${port}${normalized}`;
  }
  if (typeof window !== 'undefined') return `${getSameOriginApiBase()}${normalized}`;
  return normalized;
};

const isHtmlResponse = (contentType: string, bodyPreview: string) => {
  const type = contentType.toLowerCase();
  if (type.includes('text/html') || type.includes('application/xhtml+xml')) return true;
  const preview = bodyPreview.trim().toLowerCase();
  return preview.startsWith('<!doctype') || preview.startsWith('<html');
};

const DEFAULT_TIMEOUT_MS = 15_000;

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const isLikelyNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const m = message.toLowerCase();
  return m.includes('failed to fetch') || m.includes('network') || m.includes('load failed');
};

const isAbortError = (error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error || '');
  return name === 'AbortError' || message.toLowerCase().includes('aborted');
};

const parseJsonResponse = async <T>(res: Response): Promise<T> => {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    return (await res.json()) as T;
  }

  const text = await res.text();
  if (isHtmlResponse(contentType, text.slice(0, 200))) {
    if (import.meta.env.DEV) {
      console.error('api: resposta não-JSON (HTML).', { status: res.status, contentType, url: res.url });
    }
    const err: ApiError = {
      status: res.status,
      message: 'Servidor respondeu de forma inesperada. Atualize a página e tente novamente.',
    };
    throw err;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    if (import.meta.env.DEV) {
      console.error('api: resposta não-JSON (inválida).', { status: res.status, contentType, url: res.url });
    }
    const err: ApiError = {
      status: res.status,
      message: 'Servidor respondeu de forma inesperada. Atualize a página e tente novamente.',
    };
    throw err;
  }
};

export const getAuthToken = (): string | null => {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (token && token.trim().length > 0) return token.trim();
  const cookie = typeof document !== 'undefined' ? document.cookie : '';
  if (cookie) {
    const match = cookie.split(';').map((s) => s.trim()).find((p) => p.startsWith(`${STORAGE_KEYS.token}=`));
    if (match) {
      const value = decodeURIComponent(match.slice(STORAGE_KEYS.token.length + 1));
      return value && value.trim().length > 0 ? value.trim() : null;
    }
  }
  return null;
};

export const setAuthToken = (token: string) => {
  localStorage.setItem(STORAGE_KEYS.token, token);
  if (typeof document !== 'undefined') {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${STORAGE_KEYS.token}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax`;
  }
};

export const clearAuthToken = () => {
  localStorage.removeItem(STORAGE_KEYS.token);
  if (typeof document !== 'undefined') {
    document.cookie = `${STORAGE_KEYS.token}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  }
};

export const getCachedAuthUserRaw = (): string | null => localStorage.getItem(STORAGE_KEYS.user);

export const setCachedAuthUserRaw = (value: string) => {
  localStorage.setItem(STORAGE_KEYS.user, value);
};

export const clearCachedAuthUser = () => {
  localStorage.removeItem(STORAGE_KEYS.user);
};

let lastWarmupAt = 0;

export const warmupApiConnection = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastWarmupAt < 15_000) return;
  lastWarmupAt = now;
  try {
    await fetchWithTimeout(
      buildApiUrl('/api/health'),
      { method: 'GET', headers: { Accept: 'application/json' } },
      4_000
    );
  } catch {
    void 0;
  }
};

/**
 * URLs candidatas para o mesmo host quando a API não está na raiz (ex.: SPA em /app e proxy em /app/api/...).
 */
export const collectSameOriginApiGetCandidates = (path: string): string[] => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const out: string[] = [buildApiUrl(normalized)];
  if (typeof window === 'undefined') return [...new Set(out)];
  const origin = window.location.origin;
  out.push(`${origin}${normalized}`);
  const { pathname } = window.location;
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    out.push(`${origin}/app${normalized}`);
  }
  const viteSeg = String(import.meta.env.BASE_URL || '/').replace(/^\/+|\/+$/g, '');
  if (viteSeg && viteSeg !== 'app') {
    out.push(`${origin}/${viteSeg}${normalized}`);
  }
  return [...new Set(out)];
};

/** GET com várias URLs candidatas; em 404 tenta a próxima (útil para /app vs raiz). */
export const apiRequestGetTryCandidates = async <T>(input: {
  path: string;
  auth?: boolean;
  timeoutMs?: number;
}): Promise<T> => {
  const urls = collectSameOriginApiGetCandidates(input.path);
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (input.auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastErr: ApiError = { status: 404, message: 'Rota não encontrada.' };

  for (const url of urls) {
    let res: Response | null = null;
    const attemptDelays = [0, 900];
    for (let attempt = 0; attempt < attemptDelays.length; attempt++) {
      if (attemptDelays[attempt] > 0) await sleep(attemptDelays[attempt]);
      try {
        res = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs);
        if (res.ok) break;
        if (res.status >= 500 && attempt < attemptDelays.length - 1) continue;
        break;
      } catch (e) {
        if (isLikelyNetworkError(e) && attempt < attemptDelays.length - 1) continue;
        if (isAbortError(e)) {
          lastErr = { status: 0, message: 'Tempo excedido. Aguarde alguns segundos e tente novamente.' };
        } else if (isLikelyNetworkError(e)) {
          lastErr = { status: 0, message: 'Não foi possível conectar ao servidor agora. Tente novamente em instantes.' };
        } else {
          lastErr = { status: 0, message: 'Não foi possível concluir. Tente novamente.' };
        }
        res = null;
        break;
      }
    }

    if (!res) continue;

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return await parseJsonResponse<T>(res);
    }

    let message = 'Não foi possível concluir. Tente novamente.';
    try {
      const payload = await parseJsonResponse<unknown>(res);
      if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
        message = (payload as { message: string }).message;
      }
    } catch {
      message = 'Não foi possível concluir. Tente novamente.';
    }
    lastErr = { status: res.status, message };
    if (res.status === 401 || res.status === 403) throw lastErr;
    if (res.status === 404) continue;
    throw lastErr;
  }

  throw lastErr;
};

export const apiRequest = async <T>(
  input: { path: string; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; auth?: boolean; timeoutMs?: number }
): Promise<T> => {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };

  if (input.auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response | null = null;
  const attemptDelays = [0, 900];
  for (let attempt = 0; attempt < attemptDelays.length; attempt++) {
    if (attemptDelays[attempt] > 0) await sleep(attemptDelays[attempt]);
    try {
      res = await fetchWithTimeout(`${baseUrl}${input.path}`, {
        method: input.method || 'GET',
        headers,
        body: input.body ? JSON.stringify(input.body) : undefined,
      }, input.timeoutMs);
      if (res.ok) break;
      if (res.status >= 500 && attempt < attemptDelays.length - 1) continue;
      break;
    } catch (e) {
      if (isLikelyNetworkError(e) && attempt < attemptDelays.length - 1) continue;
      const err: ApiError = {
        status: 0,
        message: isAbortError(e)
          ? 'Tempo excedido. Aguarde alguns segundos e tente novamente.'
          : isLikelyNetworkError(e)
            ? 'Não foi possível conectar ao servidor agora. Tente novamente em instantes.'
            : 'Não foi possível concluir. Tente novamente.',
      };
      throw err;
    }
  }

  if (!res) {
    const err: ApiError = { status: 0, message: 'Tempo excedido. Aguarde alguns segundos e tente novamente.' };
    throw err;
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return await parseJsonResponse<T>(res);
  }

  let message = 'Não foi possível concluir. Tente novamente.';
  try {
    const payload = await parseJsonResponse<unknown>(res);
    if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
      message = (payload as { message: string }).message;
    }
    if (
      import.meta.env.DEV &&
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { hint?: unknown }).hint === 'string'
    ) {
      console.warn('[api]', (payload as { hint: string }).hint);
    }
  } catch {
    // ignore
  }

  const err: ApiError = { status: res.status, message };
  throw err;
};

export const apiRequestRaw = async <T>(input: {
  path: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  auth?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<T> => {
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = { Accept: 'application/json', ...(input.headers || {}) };

  if (input.auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response | null = null;
  const attemptDelays = [0, 900];
  for (let attempt = 0; attempt < attemptDelays.length; attempt++) {
    if (attemptDelays[attempt] > 0) await sleep(attemptDelays[attempt]);
    try {
      res = await fetchWithTimeout(`${baseUrl}${input.path}`, {
        method: input.method || 'POST',
        headers,
        body: input.body,
      }, input.timeoutMs);
      if (res.ok) break;
      if (res.status >= 500 && attempt < attemptDelays.length - 1) continue;
      break;
    } catch (e) {
      if (isLikelyNetworkError(e) && attempt < attemptDelays.length - 1) continue;
      const err: ApiError = {
        status: 0,
        message: isAbortError(e)
          ? 'Tempo excedido. Aguarde alguns segundos e tente novamente.'
          : isLikelyNetworkError(e)
            ? 'Não foi possível conectar ao servidor agora. Tente novamente em instantes.'
            : 'Não foi possível concluir. Tente novamente.',
      };
      throw err;
    }
  }

  if (!res) {
    const err: ApiError = { status: 0, message: 'Tempo excedido. Aguarde alguns segundos e tente novamente.' };
    throw err;
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return await parseJsonResponse<T>(res);
  }

  let message = 'Não foi possível concluir. Tente novamente.';
  try {
    const payload = await parseJsonResponse<unknown>(res);
    if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
      message = (payload as { message: string }).message;
    }
    if (
      import.meta.env.DEV &&
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { hint?: unknown }).hint === 'string'
    ) {
      console.warn('[api]', (payload as { hint: string }).hint);
    }
  } catch {
    // ignore
  }

  const err: ApiError = { status: res.status, message };
  throw err;
};
