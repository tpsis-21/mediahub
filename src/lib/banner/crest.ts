import { getAuthToken } from '@/services/apiClient';
import { loadImage as loadBannerImage } from './image';

export const MH_BLOB_MIME_ATTR = 'data-mh-blob-mime';

export const footballCrestAuthHeaders = (extra?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = { Accept: 'image/*', ...(extra || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export const loadCrestImage = (src: string): Promise<HTMLImageElement | null> =>
  loadBannerImage(src, { onError: 'null', decode: true, crossOrigin: true });

export const candidateLooksLikeSvg = (candidate: string) => {
  const c = candidate.toLowerCase();
  return c.includes('.svg') || c.includes('image/svg') || c.startsWith('data:image/svg');
};

export const isDrawableCrestCandidate = (img: HTMLImageElement, candidate: string) => {
  if (!img.complete) return false;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w > 0 && h > 0) return true;
  if (candidateLooksLikeSvg(candidate)) return true;
  return false;
};

export const loadImageFirstAvailable = async (candidates: string[]) => {
  for (const candidate of candidates) {
    const img = await loadCrestImage(candidate);
    if (img && isDrawableCrestCandidate(img, candidate)) return img;
  }
  return null;
};

export const getDrawableImageIntrinsicSize = (img: HTMLImageElement, svgFallback = 512) => {
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (nw > 0 && nh > 0) return { iw: nw, ih: nh };
  const mime = (img.getAttribute(MH_BLOB_MIME_ATTR) || '').toLowerCase();
  if (mime.includes('svg')) return { iw: svgFallback, ih: svgFallback };
  const src = (img.currentSrc || img.src || '').toLowerCase();
  if (src.includes('svg') || src.includes('image/svg')) return { iw: svgFallback, ih: svgFallback };
  return { iw: nw, ih: nh };
};

export const isUsableCrestImageElement = (img: HTMLImageElement | null): boolean => {
  if (!img?.complete) return false;
  if (img.naturalWidth || img.width || img.naturalHeight || img.height) return true;
  const mime = (img.getAttribute(MH_BLOB_MIME_ATTR) || '').toLowerCase();
  if (mime.includes('svg')) return true;
  const src = (img.currentSrc || img.src || '').toLowerCase();
  return src.includes('svg') || src.includes('image/svg');
};

export const sniffImageMimeFromArrayBuffer = (buf: ArrayBuffer): string | null => {
  if (buf.byteLength < 12) return null;
  const u = new Uint8Array(buf.slice(0, 12));
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg';
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'image/png';
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return 'image/gif';
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) {
    return 'image/webp';
  }
  const headLen = Math.min(256, buf.byteLength);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf.slice(0, headLen))).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
};

export const loadImageFromBlobCore = (blob: Blob): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      const mime = (blob.type || '').trim();
      if (mime) img.setAttribute(MH_BLOB_MIME_ATTR, mime);
      const done = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(done).catch(done);
        } else {
          done();
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
};

export const rasterBlobToPngDataUrlImage = async (blob: Blob): Promise<HTMLImageElement | null> => {
  if (typeof createImageBitmap !== 'function') return null;
  const t = (blob.type || '').toLowerCase();
  if (t.includes('svg')) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const w = bmp.width;
    const h = bmp.height;
    if (!w || !h) {
      bmp.close?.();
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close?.();
      return null;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return await loadCrestImage(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
};

export const blobHeaderLooksLikeSvg = async (blob: Blob) => {
  try {
    const head = (await blob.slice(0, 512).text()).trimStart().toLowerCase();
    return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
  } catch {
    return false;
  }
};

export const normalizeFootballAssetInput = (rawUrl: string) => {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return `https://www.futebolnatv.com.br${value}`;
  }
  if (value.startsWith('upload/')) return `https://www.futebolnatv.com.br/${value}`;
  if (/^www\.futebolnatv\.com\.br(\/|$|\?|#)/i.test(value) && !/^https?:\/\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
};

export const getFootballCrestCacheKey = (rawUrl: string): string => {
  const n = normalizeFootballAssetInput(rawUrl);
  if (!n) return '';
  if (n.startsWith('data:')) return n;
  if (n.startsWith('/')) return n;
  try {
    const u = new URL(n.startsWith('//') ? `https:${n}` : n);
    u.hash = '';
    const proto = u.protocol === 'http:' ? 'https:' : u.protocol;
    return `${proto}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return n;
  }
};
