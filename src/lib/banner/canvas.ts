/** Helpers de canvas compartilhados pelos modais de banner. */

export const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  const anyCtx = ctx as CanvasRenderingContext2D & {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };
  if (typeof anyCtx.roundRect === 'function') {
    anyCtx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

export const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao gerar imagem'));
        },
        type,
        quality
      );
      return;
    }

    const anyCanvas = canvas as HTMLCanvasElement & {
      toBuffer?: (mime?: string) => Buffer;
    };
    if (typeof anyCanvas.toBuffer === 'function') {
      try {
        const buffer = anyCanvas.toBuffer(type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
        resolve(new Blob([buffer], { type: type || 'image/png' }));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Falha ao gerar imagem'));
      }
      return;
    }

    reject(new Error('Canvas sem toBlob/toBuffer'));
  });
};

export const wrapTextSimple = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
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

  if (currentLine) lines.push(currentLine);
  return lines;
};
