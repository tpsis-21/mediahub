
import JSZip from 'jszip';
import { MovieData } from './searchService';
import { getApiBaseUrl, getAuthToken } from './apiClient';

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

class ExportService {
  private getPosterProxyUrl(input: { posterPath: string; size: string; filename?: string; download?: boolean }) {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    params.set('size', input.size);
    params.set('path', input.posterPath);
    if (input.download) params.set('download', '1');
    if (input.filename) params.set('filename', input.filename);
    return `${baseUrl}/api/search/image?${params.toString()}`;
  }

  private getSearchImageProxyUrl(input: { path: string; size: string; filename?: string; download?: boolean }) {
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    params.set('size', input.size);
    params.set('path', input.path);
    if (input.download) params.set('download', '1');
    if (input.filename) params.set('filename', input.filename);
    return `${baseUrl}/api/search/image?${params.toString()}`;
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
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return undefined;
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

    const baseUrl = getApiBaseUrl();
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const res = await fetch(`${baseUrl}/api/trailer/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
        id: item.id,
        trailerId,
      }),
    });

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
            if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
              message = (payload as { message: string }).message;
            }
          } else {
            const text = await res.text();
            try {
              const payload = JSON.parse(text) as unknown;
              if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
                message = (payload as { message: string }).message;
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

    const title = item.title || item.name || 'trailer';
    const filename = `${this.safeFileBaseName(title)}_trailer.mp4`;
    const url = URL.createObjectURL(blob);
    this.clickDownload(url, filename);
  }

  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }

  async downloadTrailerBranding(
    item: MovieData,
    input: TrailerBrandingOptions
  ): Promise<void> {
    const blob = await this.generateTrailerBrandingBlob(item, input);
    this.downloadTrailerBrandingBlob(item, blob);
  }

  async generateTrailerBrandingBlob(item: MovieData, input: TrailerBrandingOptions): Promise<Blob> {
    return await this.fetchTrailerBrandingBlob(item, input, { layout: input.layout });
  }

  async generateTrailerBrandingPreviewBlob(item: MovieData, input: TrailerBrandingOptions): Promise<Blob> {
    return await this.fetchTrailerBrandingBlob(item, input, { layout: input.layout });
  }

  downloadTrailerBrandingBlob(item: MovieData, blob: Blob): void {
    const titleValue = item.title || item.name || 'video';
    const filename = `${this.safeFileBaseName(titleValue)}_video_branding_trailer.mp4`;
    const url = URL.createObjectURL(blob);
    this.clickDownload(url, filename);
  }

  private async fetchTrailerBrandingBlob(
    item: MovieData,
    input: TrailerBrandingOptions,
    options: { previewSeconds?: number; layout?: 'portrait' | 'feed' } = {}
  ): Promise<Blob> {
    const trailerId = this.extractTrailerIdFromInput(String(input.trailerId || input.trailerUrl || '').trim());
    if (!trailerId) throw new Error('Trailer indisponível no momento.');

    const baseUrl = getApiBaseUrl();
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const previewSecondsRaw = Number(options.previewSeconds);
    const previewSeconds =
      Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.round(previewSecondsRaw) : 0;
    const layout = options.layout === 'feed' ? 'feed' : 'portrait';

    const payload = {
      mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
      id: item.id,
      trailerId,
      includeLogo: input.includeLogo !== false,
      includeSynopsis: input.includeSynopsis !== false,
      includeCta: input.includeCta !== false,
      includePhone: input.includePhone !== false,
      includeWebsite: input.includeWebsite !== false,
      ctaText: input.ctaText,
      synopsisTheme: input.synopsisTheme,
      brandName: input.brandName,
      brandColors: input.brandColors,
      website: input.website,
      phone: input.phone,
      layout,
      preview: previewSeconds > 0,
      previewSeconds: previewSeconds > 0 ? previewSeconds : undefined,
      limitDuration: input.limitDuration === true ? true : undefined,
      maxDurationSeconds: typeof input.maxDurationSeconds === 'number' ? input.maxDurationSeconds : undefined,
    };

    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    let res: Response | null = null;
    const isNetworkError = (message: string) => {
      const m = message.toLowerCase();
      return m.includes('failed to fetch') || m.includes('network') || m.includes('load failed');
    };

    const attemptDelaysMs = [0, 900, 1800];
    for (let attempt = 0; attempt < attemptDelaysMs.length; attempt++) {
      if (attemptDelaysMs[attempt] > 0) await sleep(attemptDelaysMs[attempt]);
      try {
        res = await fetch(`${baseUrl}/api/video-branding/trailer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) break;
        if (res.status >= 500 && attempt < attemptDelaysMs.length - 1) continue;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (isNetworkError(message) && attempt < attemptDelaysMs.length - 1) continue;
        if (isNetworkError(message)) {
          throw new Error('Não foi possível conectar ao servidor agora. Tente novamente em instantes.');
        }
        throw new Error('Não foi possível gerar o vídeo agora. Tente novamente.');
      }
    }

    if (!res) {
      throw new Error('Não foi possível conectar ao servidor agora. Tente novamente em instantes.');
    }

    if (!res.ok) {
      let message = 'Não foi possível gerar o vídeo com trailer agora.';
      try {
        const payload = (await res.json()) as unknown;
        if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
          message = (payload as { message: string }).message;
        }
      } catch (error) {
        void error;
      }
      if (res.status === 401) {
        message = 'Faça login para usar este recurso.';
      } else if (res.status === 403) {
        if (!message || message.toLowerCase().includes('acesso negado')) {
          message = 'Disponível apenas para Premium. Atualize seu plano para gerar o vídeo.';
        }
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('Não foi possível gerar o vídeo. Tente novamente.');
    return blob;
  }

  async sendVideoToTelegram(blob: Blob, caption?: string): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const token = getAuthToken();
    if (!token) throw new Error('Faça login para usar este recurso.');

    const formData = new FormData();
    formData.append('video', blob, 'video.mp4');
    if (caption) formData.append('caption', caption);

    let res: Response;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);
    try {
      res = await fetch(`${baseUrl}/api/telegram/send-video-upload`, {
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
