
import JSZip from 'jszip';
import { MovieData } from './searchService';
import { buildApiUrl, buildLongRunningApiUrl, getAuthToken } from './apiClient';

export interface ExportData {
  movies: MovieData[];
  exportDate: string;
  metadata: {
    totalItems: number;
    exportedBy: string;
  };
}

export type PromoVideoOptions = {
  width?: number;
  height?: number;
  durationMs?: number;
  brandName?: string;
  brandColors?: { primary?: string; secondary?: string };
};

export type VideoBrandingOptions = PromoVideoOptions & {
  brandLogo?: string | null;
  includeBackdrop?: boolean;
  includeLogo?: boolean;
  includeSynopsis?: boolean;
  includeCta?: boolean;
  includePhone?: boolean;
  includeWebsite?: boolean;
  ctaText?: string;
  website?: string;
  phone?: string;
};

export type TrailerBrandingOptions = {
  trailerId?: string;
  trailerUrl?: string;
  layout?: 'portrait' | 'feed';
  includeLogo?: boolean;
  includeSynopsis?: boolean;
  includeCta?: boolean;
  includePhone?: boolean;
  includeWebsite?: boolean;
  ctaText?: string;
  brandName?: string;
  brandColors?: { primary?: string; secondary?: string };
  brandLogo?: string | null;
  website?: string;
  phone?: string;
  synopsisTheme?: 'elegant-black' | 'brand' | 'highlight-yellow';
  limitDuration?: boolean;
  maxDurationSeconds?: number;
};

export type TrailerBrandingStage =
  | 'resolvendo-trailer'
  | 'gerando-servidor'
  | 'gerando-local'
  | 'finalizando';

export type TrailerBrandingRuntimeOptions = {
  previewSeconds?: number;
  layout?: 'portrait' | 'feed';
  signal?: AbortSignal;
  onStageChange?: (stage: TrailerBrandingStage) => void;
};

class ExportService {
  private readonly cancelMessage = 'Operação cancelada pelo usuário.';

  private isNetworkFetchFailureMessage(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('failed to fetch') ||
      m.includes('load failed') ||
      m.includes('networkerror') ||
      m.includes('network request failed') ||
      m.includes('econnrefused') ||
      m.includes('err_failed')
    );
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new Error(this.cancelMessage);
  }

  private createAbortControllerWithTimeout(timeoutMs: number, signal?: AbortSignal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return {
      controller,
      cleanup: () => {
        window.clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onAbort);
      },
    };
  }

  private getPosterProxyUrl(input: { posterPath: string; size: string; filename?: string; download?: boolean }) {
    const params = new URLSearchParams();
    params.set('size', input.size);
    params.set('path', input.posterPath);
    if (input.download) params.set('download', '1');
    if (input.filename) params.set('filename', input.filename);
    return buildApiUrl(`/api/search/image?${params.toString()}`);
  }

  private getSearchImageProxyUrl(input: { path: string; size: string; filename?: string; download?: boolean }) {
    const params = new URLSearchParams();
    params.set('size', input.size);
    params.set('path', input.path);
    if (input.download) params.set('download', '1');
    if (input.filename) params.set('filename', input.filename);
    return buildApiUrl(`/api/search/image?${params.toString()}`);
  }

  private safeFileBaseName(value: string) {
    return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 80) || 'imagem';
  }

  private extractTrailerIdFromInput(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const watchMatch = /[?&]v=([^&]+)/.exec(raw);
    if (watchMatch?.[1]) return watchMatch[1].trim();

    const shortMatch = /youtu\.be\/([^?&/]+)/.exec(raw);
    if (shortMatch?.[1]) return shortMatch[1].trim();

    const embedMatch = /youtube\.com\/embed\/([^?&/]+)/.exec(raw);
    if (embedMatch?.[1]) return embedMatch[1].trim();

    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    if (/^[a-zA-Z0-9_-]{6,32}$/.test(cleaned)) return cleaned;
    return '';
  }

  private async fetchTrailerVideoBlobFromServer(
    item: MovieData,
    trailerId?: string,
    options: { previewSeconds?: number; signal?: AbortSignal } = {}
  ): Promise<Blob> {
    this.throwIfAborted(options.signal);
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const requestBody = JSON.stringify({
      mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
      id: item.id,
      trailerId: trailerId && trailerId.trim() ? trailerId.trim() : undefined,
      previewSeconds:
        typeof options.previewSeconds === 'number' && options.previewSeconds > 0
          ? Math.min(Math.max(Math.round(options.previewSeconds), 6), 30)
          : undefined,
    });
    const requestAttempts = [0, 900, 2000];
    let res: Response | null = null;
    for (let attempt = 0; attempt < requestAttempts.length; attempt++) {
      this.throwIfAborted(options.signal);
      if (requestAttempts[attempt] > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, requestAttempts[attempt]));
      }
      const timeoutMs =
        typeof options.previewSeconds === 'number' && options.previewSeconds > 0 ? 240_000 : 900_000;
      const timeoutControl = this.createAbortControllerWithTimeout(timeoutMs, options.signal);
      try {
        res = await fetch(buildLongRunningApiUrl('/api/trailer/download'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: requestBody,
          signal: timeoutControl.controller.signal,
        });
        if (res.ok) break;
        if (attempt < requestAttempts.length - 1 && res.status >= 500) continue;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        if ((error instanceof Error && error.name === 'AbortError') || message.toLowerCase().includes('aborted')) {
          if (options.signal?.aborted) throw new Error(this.cancelMessage);
        }
        if (attempt < requestAttempts.length - 1) continue;
        throw new Error('Não foi possível conectar ao servidor agora. Tente novamente em instantes.');
      } finally {
        timeoutControl.cleanup();
      }
    }
    if (!res) throw new Error('Não foi possível conectar ao servidor agora. Tente novamente em instantes.');

    if (!res.ok) {
      let message = 'Não foi possível baixar o trailer.';
      if (res.status === 401) {
        message = 'Faça login para usar este recurso.';
      } else if (res.status === 403) {
        message = 'Acesso negado.';
      } else {
        try {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.toLowerCase().includes('application/json')) {
            const payload = (await res.json()) as unknown;
            if (payload && typeof payload === 'object') {
              const o = payload as { message?: string; hint?: string };
              if (typeof o.message === 'string') message = o.message;
              if (typeof o.hint === 'string' && o.hint.trim()) {
                message = `${message} ${o.hint.trim()}`;
              }
            }
          } else {
            const text = await res.text();
            try {
              const payload = JSON.parse(text) as unknown;
              if (payload && typeof payload === 'object') {
                const o = payload as { message?: string; hint?: string };
                if (typeof o.message === 'string') message = o.message;
                if (typeof o.hint === 'string' && o.hint.trim()) {
                  message = `${message} ${o.hint.trim()}`;
                }
              }
            } catch {
              void 0;
            }
          }
        } catch {
          void 0;
        }
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Não foi possível baixar o trailer.');
    }
    return blob;
  }

  private clickDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (url.startsWith('blob:')) {
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          void e;
        }
      }, 120_000);
    }
  }

  private getSupportedVideoMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    const candidates = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return undefined;
  }

  private getVideoExtensionFromMimeType(mimeType?: string) {
    const raw = String(mimeType || '').toLowerCase();
    if (raw.includes('mp4')) return 'mp4';
    if (raw.includes('webm')) return 'webm';
    return 'webm';
  }

  private wrapLinesByWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
    const safe = String(text || '').replace(/\s+/g, ' ').trim();
    if (!safe) return [];
    const words = safe.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
      lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
    }
    return lines.slice(0, maxLines);
  }

  private wrapLinesByWidthNoEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const safe = String(text || '').replace(/\s+/g, ' ').trim();
    if (!safe) return [];
    const words = safe.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private drawRoundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
  }

  private async decodeImage(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }) => void }> {
    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, rect) => {
          ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
        },
      };
    }

    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Falha ao decodificar imagem'));
        image.src = url;
      });
      return {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, rect) => {
          ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
        },
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async fetchPosterBlob(posterPath: string, sizes: string[]): Promise<Blob> {
    let lastErr: Error | null = null;
    for (const size of sizes) {
      try {
        const url = this.getPosterProxyUrl({ posterPath, size });
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha ao baixar a imagem');
        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error('Falha ao baixar a imagem');
        return blob;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('Falha ao baixar a imagem');
      }
    }
    throw lastErr || new Error('Falha ao baixar a imagem');
  }

  private async fetchSearchImageBlob(path: string, sizes: string[]): Promise<Blob> {
    let lastErr: Error | null = null;
    for (const size of sizes) {
      try {
        const url = this.getSearchImageProxyUrl({ path, size });
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha ao baixar a imagem');
        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error('Falha ao baixar a imagem');
        return blob;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('Falha ao baixar a imagem');
      }
    }
    throw lastErr || new Error('Falha ao baixar a imagem');
  }

  private async mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const run = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    };

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
    await Promise.all(runners);
    return results;
  }

  async downloadSelectedCovers(items: MovieData[]): Promise<void> {
    if (items.length === 0) {
      throw new Error('Nenhum item selecionado');
    }

    const zip = new JSZip();
    const errors: string[] = [];

    const sizes = ['w780', 'w500', 'w342', 'w185'];
    const concurrency = 6;

    const results = await this.mapWithConcurrency(items, concurrency, async (item) => {
      if (!item.poster_path) {
        return { ok: false as const, name: item.title || item.name || 'Item', reason: 'Sem imagem disponível' };
      }

      try {
        const blob = await this.fetchPosterBlob(item.poster_path, sizes);
        const title = item.title || item.name || 'imagem';
        const filename = `${item.id}_${this.safeFileBaseName(title)}.jpg`;
        zip.file(filename, blob);
        return { ok: true as const };
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Erro desconhecido';
        return { ok: false as const, name: item.title || item.name || 'Item', reason };
      }
    });

    for (const r of results) {
      if (!r.ok) errors.push(`${r.name}: ${r.reason}`);
    }

    const filesCount = Object.keys(zip.files).length;
    if (filesCount === 0) {
      throw new Error('Nenhuma imagem foi baixada com sucesso. Tente novamente.');
    }

    const content = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });

    const url = URL.createObjectURL(content);
    this.clickDownload(url, `mediahub_${new Date().toISOString().split('T')[0]}.zip`);
    URL.revokeObjectURL(url);
  }

  async downloadCover(item: MovieData): Promise<void> {
    if (!item.poster_path) {
      throw new Error('Este item não possui imagem disponível');
    }

    try {
      const title = item.title || item.name || 'imagem';
      const filename = `${this.safeFileBaseName(title)}.jpg`;
      const blob = await this.fetchPosterBlob(item.poster_path, ['w780', 'w500', 'w342', 'w185']);
      const url = URL.createObjectURL(blob);
      this.clickDownload(url, filename);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('Erro ao iniciar download. Tente novamente.');
    }
  }

  async downloadPromoVideo(item: MovieData, options: PromoVideoOptions = {}): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Download indisponível no momento');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Seu navegador não suporta gerar vídeo automaticamente.');
    }

    if (!item.poster_path) {
      throw new Error('Este item não possui imagem disponível');
    }

    const mimeType = this.getSupportedVideoMimeType();
    if (!mimeType) {
      throw new Error('Seu navegador não suporta exportar vídeo neste formato.');
    }

    const width = Number.isFinite(options.width) ? Number(options.width) : 1280;
    const height = Number.isFinite(options.height) ? Number(options.height) : 720;
    const durationMs = Number.isFinite(options.durationMs) ? Math.max(2500, Number(options.durationMs)) : 6000;
    const title = item.title || item.name || 'video';
    const filename = `${this.safeFileBaseName(title)}_video.webm`;

    const posterBlob = await this.fetchPosterBlob(item.poster_path, ['w780', 'w500', 'w342', 'w185']);
    const decoded = await this.decodeImage(posterBlob);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar o vídeo');

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const primary = options.brandColors?.primary || '#7c3aed';
    const secondary = options.brandColors?.secondary || '#2563eb';
    const brandName = (options.brandName || '').trim();
    const textPrimary = '#ffffff';
    const overlay = 'rgba(0,0,0,0.55)';

    const padding = Math.round(Math.min(width, height) * 0.06);
    const posterAreaW = Math.round(width * 0.42);
    const posterAreaH = height - padding * 2;
    const posterAreaX = padding;
    const posterAreaY = padding;

    const posterScale = Math.min(posterAreaW / decoded.width, posterAreaH / decoded.height);
    const basePosterW = Math.round(decoded.width * posterScale);
    const basePosterH = Math.round(decoded.height * posterScale);
    const posterX = posterAreaX + Math.round((posterAreaW - basePosterW) / 2);
    const posterY = posterAreaY + Math.round((posterAreaH - basePosterH) / 2);

    const rightX = posterAreaX + posterAreaW + padding;
    const rightW = width - rightX - padding;

    const roundRectPath = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      const anyCtx = context as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
      if (typeof anyCtx.roundRect === 'function') {
        anyCtx.roundRect(x, y, w, h, radius);
        return;
      }
      context.moveTo(x + radius, y);
      context.arcTo(x + w, y, x + w, y + h, radius);
      context.arcTo(x + w, y + h, x, y + h, radius);
      context.arcTo(x, y + h, x, y, radius);
      context.arcTo(x, y, x + w, y, radius);
      context.closePath();
    };

    const drawFrame = (progress: number) => {
      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, primary);
      gradient.addColorStop(1, secondary);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);

      const zoom = 1 + 0.06 * progress;
      const posterW = Math.round(basePosterW * zoom);
      const posterH = Math.round(basePosterH * zoom);
      const posterDx = posterX - Math.round((posterW - basePosterW) / 2);
      const posterDy = posterY - Math.round((posterH - basePosterH) / 2);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = Math.round(width * 0.02);
      ctx.shadowOffsetY = Math.round(height * 0.01);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      const radius = Math.round(Math.min(width, height) * 0.02);
      ctx.beginPath();
      roundRectPath(ctx, posterDx - 6, posterDy - 6, posterW + 12, posterH + 12, radius);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, posterDx, posterDy, posterW, posterH, radius);
      ctx.clip();
      decoded.draw(ctx, { x: posterDx, y: posterDy, w: posterW, h: posterH });
      ctx.restore();

      ctx.fillStyle = textPrimary;
      ctx.textBaseline = 'top';

      const titleFontSize = Math.max(34, Math.round(width * 0.036));
      ctx.font = `700 ${titleFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      const titleLines: string[] = [];
      const words = title.split(/\s+/).filter(Boolean);
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= rightW) {
          current = next;
        } else {
          if (current) titleLines.push(current);
          current = word;
        }
      }
      if (current) titleLines.push(current);
      const maxTitleLines = 3;
      const clippedTitleLines = titleLines.slice(0, maxTitleLines);

      let textY = padding;
      for (const line of clippedTitleLines) {
        ctx.fillText(line, rightX, textY);
        textY += Math.round(titleFontSize * 1.15);
      }

      const yearRaw = item.release_date || item.first_air_date || '';
      const year = yearRaw ? new Date(yearRaw).getFullYear() : '';
      const metaFont = Math.max(18, Math.round(width * 0.018));
      ctx.font = `600 ${metaFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.globalAlpha = 0.92;
      ctx.fillText(`${item.media_type === 'movie' ? 'Filme' : 'Série'}${year ? ` • ${year}` : ''}`, rightX, textY + Math.round(metaFont * 0.3));
      ctx.globalAlpha = 1;

      if (brandName) {
        const brandFont = Math.max(18, Math.round(width * 0.018));
        ctx.font = `700 ${brandFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.globalAlpha = 0.95;
        ctx.fillText(brandName, rightX, height - padding - Math.round(brandFont * 1.2));
        ctx.globalAlpha = 1;
      }
    };

    const renderPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob || blob.size === 0) {
          reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
          return;
        }
        resolve(blob);
      };
      recorder.onerror = () => reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
    });

    drawFrame(0);
    recorder.start(250);

    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / durationMs);
        drawFrame(progress);
        if (elapsed >= durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    recorder.stop();
    const output = await renderPromise;
    const url = URL.createObjectURL(output);
    this.clickDownload(url, filename);
  }

  async downloadVideoBranding(
    item: MovieData,
    input: VideoBrandingOptions = {}
  ): Promise<void> {
    const { blob, mimeType, titleValue } = await this.renderVideoBrandingBlob(item, input);
    const filename = `${this.safeFileBaseName(titleValue)}_video_branding.webm`;
    const url = URL.createObjectURL(blob);
    this.clickDownload(url, filename);
  }

  async generateVideoBrandingPreviewBlob(item: MovieData, input: VideoBrandingOptions = {}): Promise<{ blob: Blob; mimeType: string }> {
    const { blob, mimeType } = await this.renderVideoBrandingBlob(item, { ...input, durationMs: 3500 });
    return { blob, mimeType };
  }

  private async renderVideoBrandingBlob(
    item: MovieData,
    input: VideoBrandingOptions
  ): Promise<{ blob: Blob; mimeType: string; titleValue: string }> {
    if (typeof window === 'undefined') {
      throw new Error('Download indisponível no momento');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Seu navegador não suporta gerar vídeo automaticamente.');
    }

    if (!item.poster_path) {
      throw new Error('Este item não possui imagem disponível');
    }

    const mimeType = this.getSupportedVideoMimeType();
    if (!mimeType) {
      throw new Error('Seu navegador não suporta exportar vídeo neste formato.');
    }

    const width = Number.isFinite(input.width) ? Number(input.width) : 1280;
    const height = Number.isFinite(input.height) ? Number(input.height) : 720;
    const durationMs = Number.isFinite(input.durationMs) ? Math.max(3000, Number(input.durationMs)) : 7000;
    const titleValue = item.title || item.name || 'video';

    const includeBackdrop = input.includeBackdrop !== false;
    const includeLogo = input.includeLogo !== false;
    const includeSynopsis = input.includeSynopsis !== false;
    const includeCta = input.includeCta !== false;

    const posterBlob = await this.fetchPosterBlob(item.poster_path, ['w780', 'w500', 'w342', 'w185']);
    const posterDecoded = await this.decodeImage(posterBlob);

    const backdropPath = includeBackdrop && item.backdrop_path ? item.backdrop_path : null;
    const backdropDecoded = backdropPath
      ? await this.decodeImage(await this.fetchSearchImageBlob(backdropPath, ['w1280', 'w780', 'w500']))
      : null;

    const logoDataUrl = includeLogo ? (typeof input.brandLogo === 'string' ? input.brandLogo.trim() : '') : '';
    const logoDecoded =
      logoDataUrl && logoDataUrl.startsWith('data:')
        ? await this.decodeImage(await (await fetch(logoDataUrl)).blob())
        : null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar o vídeo');

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const primary = input.brandColors?.primary || '#7c3aed';
    const secondary = input.brandColors?.secondary || '#2563eb';
    const brandName = (input.brandName || '').trim();
    const website = input.includeWebsite === false ? '' : (input.website || '').trim();
    const phone = input.includePhone === false ? '' : (input.phone || '').trim();
    const ctaText = (input.ctaText || 'Dica de Conteúdo').trim() || 'Dica de Conteúdo';

    const padding = Math.round(Math.min(width, height) * 0.06);
    const posterAreaW = Math.round(width * 0.34);
    const posterAreaH = height - padding * 2;
    const posterAreaX = padding;
    const posterAreaY = padding;

    const posterScale = Math.min(posterAreaW / posterDecoded.width, posterAreaH / posterDecoded.height);
    const basePosterW = Math.round(posterDecoded.width * posterScale);
    const basePosterH = Math.round(posterDecoded.height * posterScale);
    const posterX = posterAreaX + Math.round((posterAreaW - basePosterW) / 2);
    const posterY = posterAreaY + Math.round((posterAreaH - basePosterH) / 2);

    const rightX = posterAreaX + posterAreaW + padding;
    const rightW = width - rightX - padding;

    const roundRectPath = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      const anyCtx = context as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
      if (typeof anyCtx.roundRect === 'function') {
        anyCtx.roundRect(x, y, w, h, radius);
        return;
      }
      context.moveTo(x + radius, y);
      context.arcTo(x + w, y, x + w, y + h, radius);
      context.arcTo(x + w, y + h, x, y + h, radius);
      context.arcTo(x, y + h, x, y, radius);
      context.arcTo(x, y, x + w, y, radius);
      context.closePath();
    };

    const wrapText = (text: string, maxWidth: number, maxLines: number, font: string) => {
      ctx.font = font;
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth) {
          current = next;
          continue;
        }
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
      }
      if (current && lines.length < maxLines) lines.push(current);
      if (lines.length === maxLines && words.length > 0) {
        const last = lines[lines.length - 1];
        let clipped = last;
        while (clipped.length > 0 && ctx.measureText(`${clipped}…`).width > maxWidth) {
          clipped = clipped.slice(0, -1);
        }
        lines[lines.length - 1] = clipped ? `${clipped}…` : last;
      }
      return lines;
    };

    const drawBackdrop = () => {
      if (!backdropDecoded) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, primary);
        gradient.addColorStop(1, secondary);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        return;
      }
      const scale = Math.max(width / backdropDecoded.width, height / backdropDecoded.height);
      const dw = Math.round(backdropDecoded.width * scale);
      const dh = Math.round(backdropDecoded.height * scale);
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);
      backdropDecoded.draw(ctx, { x: dx, y: dy, w: dw, h: dh });
    };

    const drawFrame = (progress: number) => {
      ctx.clearRect(0, 0, width, height);

      drawBackdrop();

      const overlay = ctx.createLinearGradient(0, 0, width, height);
      overlay.addColorStop(0, 'rgba(0,0,0,0.68)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.54)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);

      const accent = ctx.createLinearGradient(0, 0, width, 0);
      accent.addColorStop(0, primary);
      accent.addColorStop(1, secondary);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      const zoom = 1 + 0.05 * progress;
      const posterW = Math.round(basePosterW * zoom);
      const posterH = Math.round(basePosterH * zoom);
      const posterDx = posterX - Math.round((posterW - basePosterW) / 2);
      const posterDy = posterY - Math.round((posterH - basePosterH) / 2);
      const radius = Math.round(Math.min(width, height) * 0.02);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.round(width * 0.02);
      ctx.shadowOffsetY = Math.round(height * 0.01);
      ctx.beginPath();
      roundRectPath(ctx, posterDx, posterDy, posterW, posterH, radius);
      ctx.clip();
      posterDecoded.draw(ctx, { x: posterDx, y: posterDy, w: posterW, h: posterH });
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';

      const titleFont = Math.max(36, Math.round(width * 0.038));
      const titleLines = wrapText(
        titleValue,
        rightW,
        2,
        `800 ${titleFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`
      );
      let y = padding;
      ctx.font = `800 ${titleFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      for (const line of titleLines) {
        ctx.fillText(line, rightX, y);
        y += Math.round(titleFont * 1.15);
      }

      const yearRaw = item.release_date || item.first_air_date || '';
      const year = yearRaw ? new Date(yearRaw).getFullYear() : '';
      const metaFont = Math.max(18, Math.round(width * 0.018));
      ctx.globalAlpha = 0.92;
      ctx.font = `700 ${metaFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.fillText(`${item.media_type === 'movie' ? 'Filme' : 'Série'}${year ? ` • ${year}` : ''}`, rightX, y + Math.round(metaFont * 0.25));
      ctx.globalAlpha = 1;
      y += Math.round(metaFont * 2.1);

      if (includeSynopsis && item.overview?.trim()) {
        const synopsisFont = Math.max(18, Math.round(width * 0.017));
        ctx.globalAlpha = 0.9;
        const synopsisLines = wrapText(
          item.overview.trim(),
          rightW,
          5,
          `500 ${synopsisFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`
        );
        ctx.font = `500 ${synopsisFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        for (const line of synopsisLines) {
          ctx.fillText(line, rightX, y);
          y += Math.round(synopsisFont * 1.35);
        }
        ctx.globalAlpha = 1;
        y += Math.round(synopsisFont * 0.8);
      }

      if (includeCta) {
        const ctaFont = Math.max(20, Math.round(width * 0.02));
        const ctaH = Math.round(ctaFont * 2.2);
        const ctaW = Math.min(rightW, Math.round(width * 0.42));
        const ctaX = rightX;
        const ctaY = Math.min(height - padding - ctaH - 10, y);
        const ctaRadius = Math.round(ctaH / 2);

        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, ctaX, ctaY, ctaW, ctaH, ctaRadius);
        const ctaGradient = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY);
        ctaGradient.addColorStop(0, primary);
        ctaGradient.addColorStop(1, secondary);
        ctx.fillStyle = ctaGradient;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${ctaFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textBaseline = 'middle';
        const text = ctaText.toUpperCase();
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, ctaX + Math.round((ctaW - textWidth) / 2), ctaY + Math.round(ctaH / 2));
        ctx.restore();
      }

      const footerFont = Math.max(18, Math.round(width * 0.017));
      const footerLines: string[] = [];
      if (brandName) footerLines.push(brandName);
      if (website) footerLines.push(website);
      if (phone) footerLines.push(phone);

      if (footerLines.length > 0) {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${footerFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        const footer = footerLines.join(' • ');
        const footerY = height - padding - Math.round(footerFont * 1.25);
        ctx.fillText(footer, rightX, footerY);
        ctx.globalAlpha = 1;
      }

      if (logoDecoded) {
        const logoMax = Math.round(Math.min(width, height) * 0.12);
        const scale = Math.min(logoMax / logoDecoded.width, logoMax / logoDecoded.height);
        const lw = Math.round(logoDecoded.width * scale);
        const lh = Math.round(logoDecoded.height * scale);
        const lx = width - padding - lw;
        const ly = padding;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(width * 0.012);
        ctx.shadowOffsetY = Math.round(height * 0.006);
        ctx.globalAlpha = 0.95;
        logoDecoded.draw(ctx, { x: lx, y: ly, w: lw, h: lh });
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    };

    const renderPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob || blob.size === 0) {
          reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
          return;
        }
        resolve(blob);
      };
      recorder.onerror = () => reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
    });

    drawFrame(0);
    recorder.start(250);

    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / durationMs);
        drawFrame(progress);
        if (elapsed >= durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    recorder.stop();
    const blob = await renderPromise;
    return { blob, mimeType, titleValue };
  }

  async downloadTrailerVideo(item: MovieData, trailerInput: string): Promise<void> {
    const trailerId = this.extractTrailerIdFromInput(trailerInput);
    if (!trailerId) {
      throw new Error('Trailer indisponível no momento');
    }
    const blob = await this.fetchTrailerVideoBlobFromServer(item, trailerId);

    const title = item.title || item.name || 'trailer';
    const extension = this.getVideoExtensionFromMimeType(blob.type);
    const filename = `${this.safeFileBaseName(title)}_trailer.${extension}`;
    const url = URL.createObjectURL(blob);
    this.clickDownload(url, filename);
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }

  private async renderTrailerBrandingBlobClient(
    item: MovieData,
    input: TrailerBrandingOptions,
    options: TrailerBrandingRuntimeOptions = {}
  ): Promise<Blob> {
    this.throwIfAborted(options.signal);
    options.onStageChange?.('resolvendo-trailer');
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('Geração local indisponível.');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('Seu navegador não suporta gerar vídeo automaticamente.');
    }
    const mimeType = this.getSupportedVideoMimeType();
    if (!mimeType) throw new Error('Seu navegador não suporta exportar vídeo neste formato.');

    const trailerId = this.extractTrailerIdFromInput(String(input.trailerId || input.trailerUrl || '').trim());
    const trailerBlob = await this.fetchTrailerVideoBlobFromServer(item, trailerId || undefined, {
      previewSeconds: options.previewSeconds,
      signal: options.signal,
    });
    this.throwIfAborted(options.signal);
    const trailerUrl = URL.createObjectURL(trailerBlob);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = trailerUrl;

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(new Error(this.cancelMessage));
          return;
        }
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Não foi possível carregar o trailer.'));
        };
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
          if (options.signal) options.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(new Error(this.cancelMessage));
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onError);
        if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true });
      });
      this.throwIfAborted(options.signal);
      options.onStageChange?.('gerando-local');

      const layout = options.layout === 'feed' ? 'feed' : 'portrait';
      const width = layout === 'feed' ? 864 : 720;
      const height = layout === 'feed' ? 1080 : 1280;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível preparar o vídeo.');

      stream = new MediaStream();
      const canvasStream = canvas.captureStream(24);
      for (const track of canvasStream.getVideoTracks()) stream.addTrack(track);
      try {
        const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream?.()
          || (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
        if (capture) {
          for (const track of capture.getAudioTracks()) stream.addTrack(track);
        }
      } catch {
        void 0;
      }

      recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      const logoDataUrl = typeof input.brandLogo === 'string' ? input.brandLogo.trim() : '';
      const logoDecoded =
        input.includeLogo !== false && logoDataUrl.startsWith('data:')
          ? await this.decodeImage(await (await fetch(logoDataUrl)).blob())
          : null;

      const primary = input.brandColors?.primary || '#3b82f6';
      const secondary = input.brandColors?.secondary || '#8b5cf6';
      const title = (item.title || item.name || 'Título').trim();
      const synopsis = String(item.overview || '').replace(/\s+/g, ' ').trim();
      const cta = (input.ctaText || 'Dica de Conteúdo').trim() || 'Dica de Conteúdo';
      const brandName = (input.brandName || '').trim() || 'MediaHub';
      const website = input.includeWebsite === false ? '' : String(input.website || '').trim();
      const phone = input.includePhone === false ? '' : String(input.phone || '').trim();

      const previewSecondsRaw = Number(options.previewSeconds);
      const previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.round(previewSecondsRaw), 30) : 0;
      const maxDurationRaw = Number(input.maxDurationSeconds);
      const customMaxDuration =
        Number.isFinite(maxDurationRaw) && maxDurationRaw > 0
          ? Math.min(Math.max(Math.round(maxDurationRaw), 10), 180)
          : null;
      const sourceDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      let targetDurationSec = sourceDuration > 0 ? sourceDuration : customMaxDuration || 45;
      if (input.limitDuration === true) {
        targetDurationSec = Math.min(targetDurationSec, 90);
      } else if (customMaxDuration) {
        targetDurationSec = Math.min(targetDurationSec, customMaxDuration);
      }
      if (previewSeconds > 0) {
        targetDurationSec = Math.min(targetDurationSec, previewSeconds);
      }
      targetDurationSec = Math.max(6, targetDurationSec);
      const targetDurationMs = Math.round(targetDurationSec * 1000);

      const pad = Math.round(width * 0.05);
      const yearText = (() => {
        const raw = (item.media_type === 'tv' ? item.first_air_date : item.release_date) || '';
        const match = /^(\d{4})-/.exec(String(raw));
        return match ? match[1] : '';
      })();
      const ratingText = typeof item.vote_average === 'number' && item.vote_average > 0 ? item.vote_average.toFixed(1) : '';
      const headerText = 'Assista agora';
      const mediaLabel = item.media_type === 'tv' ? 'SÉRIE' : 'FILME';
      const genreText = (() => {
        const genresUnknown = (item as unknown as { genres?: Array<{ name?: string }>; genre_names?: string[] });
        const fromGenres = Array.isArray(genresUnknown.genres) ? genresUnknown.genres.map((g) => String(g?.name || '').trim()).filter(Boolean) : [];
        if (fromGenres.length) return fromGenres.slice(0, 2).join(' • ');
        const fromNames = Array.isArray(genresUnknown.genre_names) ? genresUnknown.genre_names.map((g) => String(g || '').trim()).filter(Boolean) : [];
        if (fromNames.length) return fromNames.slice(0, 2).join(' • ');
        return '';
      })();
      const seasonsText = (() => {
        if (item.media_type !== 'tv') return '';
        const maybe = item as unknown as {
          number_of_seasons?: unknown;
          season_count?: unknown;
          seasons?: unknown;
        };
        const fromNumber =
          typeof maybe.number_of_seasons === 'number'
            ? maybe.number_of_seasons
            : typeof maybe.season_count === 'number'
              ? maybe.season_count
              : NaN;
        const seasonsCount =
          Number.isFinite(fromNumber) && fromNumber > 0
            ? Math.round(fromNumber)
            : Array.isArray(maybe.seasons)
              ? maybe.seasons.length
              : 0;
        if (!seasonsCount) return '';
        return `${seasonsCount} ${seasonsCount === 1 ? 'TEMPORADA' : 'TEMPORADAS'}`;
      })();
      const synopsisAccent =
        input.synopsisTheme === 'highlight-yellow'
          ? '#facc15'
          : input.synopsisTheme === 'elegant-black'
            ? '#0f172a'
            : primary;
      let posterDecoded: Awaited<ReturnType<typeof this.decodeImage>> | null = null;
      if (item.poster_path) {
        try {
          const posterBlob = await this.fetchPosterBlob(item.poster_path, ['w780', 'w500', 'w342']);
          posterDecoded = await this.decodeImage(posterBlob);
        } catch {
          posterDecoded = null;
        }
      }
      let headerBackgroundDecoded: Awaited<ReturnType<typeof this.decodeImage>> | null = null;
      try {
        const headerBgBlob = await (await fetch('/anexos/bg.jpg')).blob();
        if (headerBgBlob && headerBgBlob.size > 0) {
          headerBackgroundDecoded = await this.decodeImage(headerBgBlob);
        }
      } catch {
        headerBackgroundDecoded = null;
      }
      let whatsappIconDecoded: Awaited<ReturnType<typeof this.decodeImage>> | null = null;
      try {
        const waIconBlob = await (await fetch('/anexos/pngtree-whatsapp-icon-png-image_6315990.png')).blob();
        if (waIconBlob && waIconBlob.size > 0) {
          whatsappIconDecoded = await this.decodeImage(waIconBlob);
        }
      } catch {
        whatsappIconDecoded = null;
      }

      const drawFrame = () => {
        const isFeed = layout === 'feed';
        const headerH = isFeed ? Math.round(height * 0.15) : Math.round(height * 0.13);
        const videoH = isFeed ? Math.round(height * 0.48) : Math.round(height * 0.34);
        const videoY = headerH;
        const bottomY = videoY + videoH;
        const bottomH = height - bottomY;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        if (headerBackgroundDecoded) {
          const bgScale = Math.max(width / Math.max(1, headerBackgroundDecoded.width), headerH / Math.max(1, headerBackgroundDecoded.height));
          const bgW = Math.round(Math.max(1, headerBackgroundDecoded.width) * bgScale);
          const bgH = Math.round(Math.max(1, headerBackgroundDecoded.height) * bgScale);
          const bgX = Math.round((width - bgW) / 2);
          const bgY = Math.round((headerH - bgH) / 2);
          headerBackgroundDecoded.draw(ctx, { x: bgX, y: bgY, w: bgW, h: bgH });
        } else {
          ctx.save();
          try {
            ctx.filter = 'blur(18px)';
          } catch {
            void 0;
          }
          const hdrSrcW = Math.max(1, video.videoWidth || width);
          const hdrSrcH = Math.max(1, video.videoHeight || height);
          const hdrScale = Math.max(width / hdrSrcW, headerH / hdrSrcH);
          const hdrDw = Math.round(hdrSrcW * hdrScale);
          const hdrDh = Math.round(hdrSrcH * hdrScale);
          const hdrDx = Math.round((width - hdrDw) / 2);
          const hdrDy = Math.round((headerH - hdrDh) / 2);
          ctx.drawImage(video, hdrDx, hdrDy, hdrDw, hdrDh);
          ctx.restore();
        }

        ctx.save();
        const headerTheme = ctx.createLinearGradient(0, 0, width, headerH);
        headerTheme.addColorStop(0, primary);
        headerTheme.addColorStop(1, secondary);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = headerTheme;
        ctx.fillRect(0, 0, width, headerH);
        ctx.restore();

        const hdrOverlay = ctx.createLinearGradient(0, 0, width, headerH);
        hdrOverlay.addColorStop(0, 'rgba(0,0,0,0.62)');
        hdrOverlay.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = hdrOverlay;
        ctx.fillRect(0, 0, width, headerH);

        const headerPadX = pad;
        const headerCenterY = Math.round(headerH * 0.5);
        const iconSize = Math.round(headerH * 0.38);
        const iconX = headerPadX;
        const iconY = Math.round(headerCenterY - iconSize / 2);
        const iconR = Math.round(iconSize / 2);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeStyle = secondary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(iconX + iconR, iconY + iconR, iconR, 0, Math.PI * 2);
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const triPad = Math.round(iconSize * 0.3);
        ctx.moveTo(iconX + triPad, iconY + triPad);
        ctx.lineTo(iconX + triPad, iconY + iconSize - triPad);
        ctx.lineTo(iconX + iconSize - triPad * 0.9, iconY + iconR);
        ctx.closePath();
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        ctx.font = `800 ${Math.round(width * (layout === 'feed' ? 0.06 : 0.055))}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        ctx.fillText(headerText, iconX + iconSize + Math.round(width * 0.03), headerCenterY);
        ctx.restore();

        if (logoDecoded && input.includeLogo !== false) {
          const logoMax = Math.round(headerH * 0.62);
          const ratio = Math.min(logoMax / logoDecoded.height, 1);
          const lw = Math.max(1, Math.round(logoDecoded.width * ratio));
          const lh = Math.max(1, Math.round(logoDecoded.height * ratio));
          const lx = width - pad - lw;
          const ly = Math.round(headerCenterY - lh / 2);
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = 14;
          logoDecoded.draw(ctx, { x: lx, y: ly, w: lw, h: lh });
          ctx.restore();
        } else {
          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 10;
          ctx.font = `700 ${Math.round(width * 0.036)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillText(brandName, width - pad, headerCenterY);
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillRect(0, headerH - Math.round(height * 0.01), width, Math.round(height * 0.01));

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, videoY, width, videoH);
        const srcW = Math.max(1, video.videoWidth || width);
        const srcH = Math.max(1, video.videoHeight || height);
        const scale = Math.min(width / srcW, videoH / srcH);
        const dw = Math.round(srcW * scale);
        const dh = Math.round(srcH * scale);
        const dx = Math.round((width - dw) / 2);
        const dy = Math.round(videoY + (videoH - dh) / 2);
        ctx.drawImage(video, dx, dy, dw, dh);

        if (posterDecoded) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, bottomY, width, bottomH);
          ctx.clip();
          try {
            ctx.filter = 'blur(20px)';
          } catch {
            void 0;
          }
          const pScale = Math.max(width / Math.max(1, posterDecoded.width), bottomH / Math.max(1, posterDecoded.height));
          const pW = Math.round(Math.max(1, posterDecoded.width) * pScale);
          const pH = Math.round(Math.max(1, posterDecoded.height) * pScale);
          const pX = Math.round((width - pW) / 2);
          const pY = Math.round(bottomY + (bottomH - pH) / 2);
          ctx.globalAlpha = 0.72;
          posterDecoded.draw(ctx, { x: pX, y: pY, w: pW, h: pH });
          ctx.restore();
        } else {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, bottomY, width, bottomH);
          ctx.clip();
          try {
            ctx.filter = 'blur(26px)';
          } catch {
            void 0;
          }
          const bScale = Math.max(width / srcW, bottomH / srcH);
          const bDw = Math.round(srcW * bScale);
          const bDh = Math.round(srcH * bScale);
          const bDx = Math.round((width - bDw) / 2);
          const bDy = Math.round(bottomY + (bottomH - bDh) / 2);
          ctx.drawImage(video, bDx, bDy, bDw, bDh);
          ctx.restore();
        }
        const bottomOverlay = ctx.createLinearGradient(0, bottomY, 0, height);
        bottomOverlay.addColorStop(0, 'rgba(0,0,0,0.14)');
        bottomOverlay.addColorStop(1, 'rgba(0,0,0,0.58)');
        ctx.fillStyle = bottomOverlay;
        ctx.fillRect(0, bottomY, width, bottomH);
        const bottomTheme = ctx.createLinearGradient(0, bottomY, width, height);
        bottomTheme.addColorStop(0, `${primary}4D`);
        bottomTheme.addColorStop(1, `${secondary}26`);
        ctx.fillStyle = bottomTheme;
        ctx.globalAlpha = 0.24;
        ctx.fillRect(0, bottomY, width, bottomH);
        ctx.globalAlpha = 1;

        const titleX = pad;
        const phoneRowY = height - Math.round(pad * 0.32);

        if (layout === 'feed') {
          const posterH = Math.round(bottomH * 0.82);
          const posterW = Math.round(posterH * 0.66);
          const posterX = pad;
          const posterY = bottomY + Math.round(bottomH * 0.08);
          const posterRadius = Math.round(posterW * 0.08);

          if (posterDecoded) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 22;
            ctx.shadowOffsetY = 10;
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.clip();
            posterDecoded.draw(ctx, { x: posterX, y: posterY, w: posterW, h: posterH });
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 2;
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.stroke();
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.fill();
          }

          const infoX = posterX + posterW + Math.round(pad * 0.7);
          const infoW = width - infoX - pad;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = `900 ${Math.round(width * 0.058)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          const titleLines = this.wrapLinesByWidth(ctx, title, infoW, 2);
          let ty = posterY + Math.round(posterH * 0.06);
          for (const line of titleLines) {
            ctx.fillText(line, infoX, ty);
            ty += Math.round(width * 0.066);
          }
          const meta = [
            mediaLabel,
            yearText,
            seasonsText,
            ratingText ? `NOTA ${ratingText}/10` : '',
          ].filter(Boolean).join(' • ');
          ctx.font = `700 ${Math.round(width * 0.026)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText(meta, infoX, ty + Math.round(width * 0.01));
          ctx.restore();

          const synopsisY = posterY + Math.round(posterH * 0.46);
          const synopsisH = posterY + posterH - synopsisY - Math.round(pad * 0.9);
          const synopsisX = infoX;
          const synopsisW = infoW;
          const tagW = Math.max(52, Math.round(width * 0.06));

          if (synopsis && input.includeSynopsis !== false && synopsisH > 70) {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, synopsisW, synopsisH, 22);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1;
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, synopsisW, synopsisH, 22);
            ctx.stroke();

            ctx.fillStyle = synopsisAccent;
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, tagW, synopsisH, 22);
            ctx.fill();

            ctx.save();
            ctx.translate(synopsisX + Math.round(tagW / 2), synopsisY + Math.round(synopsisH / 2));
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.round(width * 0.022)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            ctx.fillText('SINOPSE', 0, 0);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.font = `650 ${Math.round(width * 0.024)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            const sx = synopsisX + tagW + Math.round(pad * 0.45);
            const sy = synopsisY + Math.round(pad * 0.25);
            const lines = this.wrapLinesByWidth(ctx, synopsis, synopsisW - tagW - Math.round(pad * 0.8), 5);
            let lY = sy;
            for (const line of lines) {
              ctx.fillText(line, sx, lY);
              lY += Math.round(width * 0.032);
            }
            ctx.restore();
          }
        } else {
          const posterW = Math.round(width * 0.215);
          const posterH = Math.round(posterW * 1.45);
          const posterX = pad;
          const posterY = bottomY + Math.round(bottomH * 0.06);
          const posterRadius = Math.round(width * 0.025);

          if (posterDecoded) {
            ctx.save();
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.clip();
            posterDecoded.draw(ctx, { x: posterX, y: posterY, w: posterW, h: posterH });
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.stroke();
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.drawRoundRectPath(ctx, posterX, posterY, posterW, posterH, posterRadius);
            ctx.fill();
          }

          const infoX = posterX + posterW + Math.round(width * 0.03);
          const infoW = width - infoX - pad;
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.font = `900 ${Math.round(width * 0.078)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          const titleLines = this.wrapLinesByWidth(ctx, title, infoW, 2);
          let infoY = posterY + Math.round(width * 0.01);
          for (const line of titleLines) {
            ctx.fillText(line, infoX, infoY);
            infoY += Math.round(width * 0.083);
          }

          const meta = [
            mediaLabel,
            genreText,
            yearText,
            seasonsText,
            ratingText ? `NOTA ${ratingText}/10` : '',
          ].filter(Boolean).join(' • ');
          ctx.font = `800 ${Math.round(width * 0.035)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
          ctx.fillStyle = synopsisAccent;
          ctx.fillText(meta, infoX, infoY + Math.round(width * 0.006));
          ctx.restore();

          const synopsisY = posterY + posterH + Math.round(height * 0.016);
          const footerReserve = (phone || website) ? Math.round(height * 0.165) : Math.round(height * 0.06);
          const synopsisH = height - synopsisY - footerReserve;
          const synopsisX = pad;
          const synopsisW = width - pad * 2;
          const tagW = Math.max(56, Math.round(width * 0.085));

          if (synopsis && input.includeSynopsis !== false && synopsisH > 120) {
            ctx.fillStyle = 'rgba(0,0,0,0.42)';
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, synopsisW, synopsisH, 24);
            ctx.fill();
            ctx.strokeStyle = `${secondary}80`;
            ctx.lineWidth = 1.4;
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, synopsisW, synopsisH, 24);
            ctx.stroke();

            const synTagGradient = ctx.createLinearGradient(synopsisX, synopsisY, synopsisX + tagW, synopsisY + synopsisH);
            synTagGradient.addColorStop(0, primary);
            synTagGradient.addColorStop(1, secondary);
            ctx.fillStyle = synTagGradient;
            this.drawRoundRectPath(ctx, synopsisX, synopsisY, tagW, synopsisH, 24);
            ctx.fill();

            ctx.save();
            ctx.translate(synopsisX + Math.round(tagW / 2), synopsisY + Math.round(synopsisH / 2));
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.round(width * 0.03)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            ctx.fillText('SINOPSE', 0, 0);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.94)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            let synopsisFont = Math.round(width * 0.026);
            let lineHeight = Math.round(synopsisFont * 1.42);
            const sx = synopsisX + tagW + Math.round(pad * 0.45);
            const sy = synopsisY + Math.round(pad * 0.22);
            const textWidth = synopsisW - tagW - Math.round(pad * 0.7);
            const textHeight = synopsisH - Math.round(pad * 0.4);
            let lines = this.wrapLinesByWidthNoEllipsis(ctx, synopsis, textWidth);
            for (let fs = Math.round(width * 0.026); fs >= Math.round(width * 0.02); fs--) {
              synopsisFont = fs;
              lineHeight = Math.round(fs * 1.4);
              ctx.font = `500 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
              lines = this.wrapLinesByWidthNoEllipsis(ctx, synopsis, textWidth);
              if (lines.length * lineHeight <= textHeight) break;
            }
            ctx.font = `500 ${synopsisFont}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            let lY = sy;
            for (const line of lines) {
              if (lY + lineHeight > sy + textHeight) break;
              ctx.fillText(line, sx, lY);
              lY += lineHeight;
            }
            ctx.restore();
          }
        }

        if (phone || website) {
          const value = phone || website;
          if (value) {
            const icon = Math.round(width * 0.045);
            const iconR = Math.round(icon / 2);
            const fontPx = Math.round(width * 0.038);
            const gap = Math.round(width * 0.02);
            ctx.save();
            ctx.font = `800 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            const textW = Math.round(ctx.measureText(value).width);
            const groupW = icon + gap + textW;
            const groupX = Math.round((width - groupW) / 2);
            const iconCx = groupX + iconR;
            const iconCy = phoneRowY - iconR - Math.round(height * 0.02);

            const hasPhone = Boolean(phone);
            if (hasPhone) {
              if (whatsappIconDecoded) {
                const iconSize = Math.round(icon * 1.06);
                whatsappIconDecoded.draw(ctx, {
                  x: Math.round(iconCx - iconSize / 2),
                  y: Math.round(iconCy - iconSize / 2),
                  w: iconSize,
                  h: iconSize,
                });
              } else {
                ctx.fillStyle = input.brandColors?.secondary || '#22c55e';
                ctx.beginPath();
                ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `900 ${Math.round(width * 0.024)}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
                ctx.fillText('W', iconCx, iconCy);
              }
            }

            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 10;
            ctx.font = `800 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
            ctx.fillText(value, groupX + (hasPhone ? icon + gap : 0), phoneRowY - Math.round(height * 0.02));
            ctx.restore();
          }
        }
      };

      const renderPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          if (!blob || blob.size === 0) {
            reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
            return;
          }
          resolve(blob);
        };
        recorder.onerror = () => reject(new Error('Não foi possível gerar o vídeo. Tente novamente.'));
      });

      drawFrame();
      video.currentTime = 0;
      try {
        await video.play();
      } catch {
        throw new Error('Não foi possível iniciar o trailer no navegador. Tente novamente.');
      }
      recorder.start(250);

      const startedAt = performance.now();
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          if (options.signal?.aborted) {
            reject(new Error(this.cancelMessage));
            return;
          }
          drawFrame();
          const elapsed = performance.now() - startedAt;
          if (elapsed >= targetDurationMs || video.ended) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      this.throwIfAborted(options.signal);
      options.onStageChange?.('finalizando');

      recorder.stop();
      const output = await renderPromise;
      return output;
    } finally {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        void 0;
      }
      try {
        video.pause();
      } catch {
        void 0;
      }
      try {
        stream?.getTracks().forEach((track) => track.stop());
      } catch {
        void 0;
      }
      try {
        URL.revokeObjectURL(trailerUrl);
      } catch {
        void 0;
      }
    }
  }

  async downloadTrailerBranding(
    item: MovieData,
    input: TrailerBrandingOptions,
    runtime: TrailerBrandingRuntimeOptions = {}
  ): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');
    const payload: Record<string, string> = {
      mediaType: (item.media_type || 'movie') === 'tv' ? 'tv' : 'movie',
      id: String(item.id),
      trailerId: String(input.trailerId || ''),
      layout: String(runtime.layout || input.layout || 'portrait'),
      includeLogo: input.includeLogo === false ? '0' : '1',
      includeCta: input.includeCta === false ? '0' : '1',
      includePhone: input.includePhone ? '1' : '0',
      includeWebsite: input.includeWebsite ? '1' : '0',
      ctaText: String(input.ctaText || ''),
      synopsisTheme: String(input.synopsisTheme || ''),
      limitDuration: input.limitDuration ? '1' : '0',
      maxDurationSeconds:
        typeof input.maxDurationSeconds === 'number' && Number.isFinite(input.maxDurationSeconds)
          ? String(Math.round(input.maxDurationSeconds))
          : '',
      previewSeconds:
        typeof runtime.previewSeconds === 'number' && runtime.previewSeconds > 0
          ? String(Math.min(Math.round(runtime.previewSeconds), 30))
          : '',
      download: '1',
    };

    // Para submit de form (sem header Authorization), usamos cookie de sessão curta.
    // Mantém duração alinhada ao login padrão para não "deslogar" visualmente após downloads longos.
    document.cookie = `auth_token=${encodeURIComponent(token)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = buildLongRunningApiUrl('/api/video-branding/trailer');
    form.style.display = 'none';
    Object.entries(payload).forEach(([key, value]) => {
      const inputEl = document.createElement('input');
      inputEl.type = 'hidden';
      inputEl.name = key;
      inputEl.value = value;
      form.appendChild(inputEl);
    });
    document.body.appendChild(form);
    try {
      form.submit();
    } finally {
      try {
        form.remove();
      } catch {
        void 0;
      }
    }
  }

  async generateTrailerBrandingBlob(
    item: MovieData,
    input: TrailerBrandingOptions,
    runtime: TrailerBrandingRuntimeOptions = {}
  ): Promise<Blob> {
    return await this.fetchTrailerBrandingBlob(item, input, { ...runtime, layout: runtime.layout || input.layout });
  }

  async generateTrailerBrandingPreviewBlob(
    item: MovieData,
    input: TrailerBrandingOptions,
    runtime: TrailerBrandingRuntimeOptions = {}
  ): Promise<Blob> {
    const previewSeconds =
      typeof runtime.previewSeconds === 'number' && runtime.previewSeconds > 0
        ? Math.min(Math.round(runtime.previewSeconds), 30)
        : 12;
    return await this.fetchTrailerBrandingBlob(item, input, {
      ...runtime,
      previewSeconds,
      layout: runtime.layout || input.layout,
    });
  }

  downloadTrailerBrandingBlob(item: MovieData, blob: Blob): void {
    const titleValue = item.title || item.name || 'video';
    const extension = this.getVideoExtensionFromMimeType(blob.type);
    const filename = `${this.safeFileBaseName(titleValue)}_video_branding_trailer.${extension}`;
    const url = URL.createObjectURL(blob);
    this.clickDownload(url, filename);
  }

  private async fetchTrailerBrandingBlobFromServer(
    item: MovieData,
    input: TrailerBrandingOptions,
    options: TrailerBrandingRuntimeOptions = {}
  ): Promise<Blob> {
    this.throwIfAborted(options.signal);
    options.onStageChange?.('gerando-servidor');
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const timeoutMs = options.previewSeconds && options.previewSeconds > 0 ? 180_000 : 900_000;
    const requestBody = JSON.stringify({
      mediaType: (item.media_type || 'movie') === 'tv' ? 'tv' : 'movie',
      id: item.id,
      voteAverage: typeof item.vote_average === 'number' ? item.vote_average : undefined,
      trailerId: input.trailerId,
      layout: options.layout || input.layout,
      brandName: input.brandName,
      brandColors: input.brandColors,
      brandLogo: input.brandLogo,
      website: input.website,
      phone: input.phone,
      includeLogo: input.includeLogo,
      includeSynopsis: true,
      includeCta: input.includeCta,
      includePhone: input.includePhone,
      includeWebsite: input.includeWebsite,
      ctaText: input.ctaText,
      synopsisTheme: input.synopsisTheme,
      limitDuration: input.limitDuration,
      maxDurationSeconds: input.maxDurationSeconds,
      previewSeconds: options.previewSeconds,
    });

    const requestAttempts = [0, 1200];
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < requestAttempts.length; attempt++) {
      this.throwIfAborted(options.signal);
      if (requestAttempts[attempt] > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, requestAttempts[attempt]));
      }
      const timeoutControl = this.createAbortControllerWithTimeout(timeoutMs, options.signal);
      try {
        const res = await fetch(buildLongRunningApiUrl('/api/video-branding/trailer'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: requestBody,
          signal: timeoutControl.controller.signal,
        });

        if (!res.ok) {
          let message = 'Não foi possível gerar o vídeo com trailer agora.';
          try {
            const payload = (await res.json()) as { message?: string };
            if (payload && typeof payload.message === 'string') message = payload.message;
          } catch {
            void 0;
          }
          if (res.status === 401) message = 'Faça login para usar este recurso.';
          if (res.status === 403 && (!message || message.toLowerCase().includes('acesso negado'))) {
            message = 'Disponível apenas para Premium. Atualize seu plano para usar este recurso.';
          }
          throw new Error(message);
        }

        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error('Não foi possível gerar o vídeo com trailer agora.');
        return blob;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        if ((error instanceof Error && error.name === 'AbortError') || message.toLowerCase().includes('aborted')) {
          if (options.signal?.aborted) throw new Error(this.cancelMessage);
          throw new Error('Tempo excedido ao gerar o vídeo com trailer. Tente novamente.');
        }
        const normalized = error instanceof Error ? error : new Error(message);
        if (attempt < requestAttempts.length - 1 && this.isNetworkFetchFailureMessage(message)) {
          lastError = normalized;
          continue;
        }
        throw normalized;
      } finally {
        timeoutControl.cleanup();
      }
    }
    throw lastError || new Error('Não foi possível gerar o vídeo com trailer agora.');
  }

  private async fetchTrailerBrandingBlob(
    item: MovieData,
    input: TrailerBrandingOptions,
    options: TrailerBrandingRuntimeOptions = {}
  ): Promise<Blob> {
    this.throwIfAborted(options.signal);
    let serverSideError: Error | null = null;
    try {
      return await this.fetchTrailerBrandingBlobFromServer(item, input, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (message.toLowerCase().includes('cancelada')) {
        throw error instanceof Error ? error : new Error(message);
      }
      const shouldFallback = this.isNetworkFetchFailureMessage(message);
      if (!shouldFallback) throw error instanceof Error ? error : new Error(message);
      serverSideError = error instanceof Error ? error : new Error(message);
    }

    const delays = [0, 900];
    let lastError: unknown = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      this.throwIfAborted(options.signal);
      if (delays[attempt] > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delays[attempt]));
      try {
        return await this.renderTrailerBrandingBlobClient(item, input, options);
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) {
      if (serverSideError && !this.isNetworkFetchFailureMessage(lastError.message)) {
        throw serverSideError;
      }
      if (this.isNetworkFetchFailureMessage(lastError.message)) {
        throw new Error(
          import.meta.env.DEV
            ? 'Conexão interrompida durante a geração do vídeo (download longo ou API reiniciou). Veja o terminal do servidor; em seguida tente de novo.'
            : 'Não foi possível concluir a geração do vídeo. Tente novamente em instantes.'
        );
      }
      throw lastError;
    }
    throw new Error('Não foi possível gerar o vídeo com trailer agora.');
  }

  async sendVideoToTelegram(blob: Blob, caption?: string): Promise<void> {
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const formData = new FormData();
    const extension = this.getVideoExtensionFromMimeType(blob.type);
    formData.append('video', blob, `video.${extension}`);
    if (caption) formData.append('caption', caption);

    let res: Response;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);
    try {
      res = await fetch(buildApiUrl('/api/telegram/send-video-upload'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if ((error instanceof Error && error.name === 'AbortError') || message.toLowerCase().includes('aborted')) {
        throw new Error('Tempo excedido ao enviar. Às vezes o Telegram entrega com atraso — aguarde alguns segundos e tente novamente.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let message = 'Não foi possível enviar o vídeo para o Telegram.';
      try {
        const payload = (await res.json()) as { message?: string };
        if (payload && typeof payload.message === 'string') message = payload.message;
      } catch (error) {
        void error;
      }
      if (res.status === 401) {
        message = 'Faça login para usar este recurso.';
      } else if (res.status === 403) {
        if (!message || message.toLowerCase().includes('acesso negado')) {
          message = 'Disponível apenas para Premium. Atualize seu plano para enviar o vídeo.';
        }
      }
      throw new Error(message);
    }
  }
}

export const exportService = new ExportService();
