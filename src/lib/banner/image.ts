export type LoadImageOptions = {
  /** default: throw — Football usa 'null' */
  onError?: 'throw' | 'null';
  /** default: true; false em data:/blob: no Football */
  crossOrigin?: boolean;
  decode?: boolean;
};

export const loadImage = (src: string, options: LoadImageOptions = {}): Promise<HTMLImageElement | null> => {
  const onError = options.onError ?? 'throw';
  const wantsCrossOrigin = options.crossOrigin !== false;
  const wantsDecode = options.decode === true;

  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src.trim() : '';
    if (!url) {
      if (onError === 'null') resolve(null);
      else reject(new Error('Empty image src'));
      return;
    }

    const img = new Image();
    const isDataOrBlob = url.startsWith('data:') || url.startsWith('blob:');
    if (wantsCrossOrigin && !isDataOrBlob) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (wantsDecode && typeof img.decode === 'function') {
        void img
          .decode()
          .then(() => resolve(img))
          .catch(() => resolve(img));
        return;
      }
      resolve(img);
    };

    img.onerror = () => {
      if (onError === 'null') resolve(null);
      else reject(new Error(`Failed to load image: ${url}`));
    };

    img.src = url;
  });
};

export const loadImageOrThrow = async (src: string): Promise<HTMLImageElement> => {
  const img = await loadImage(src, { onError: 'throw', crossOrigin: true });
  if (!img) throw new Error(`Failed to load image: ${src}`);
  return img;
};
