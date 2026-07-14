export const parseHex = (input: string): { r: number; g: number; b: number } | null => {
  const raw = (input || '').trim().replace('#', '');
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (raw.length === 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return null;
};

export const hexToRgba = (input: string, alpha: number) => {
  const a = Math.max(0, Math.min(1, alpha));
  const rgb = parseHex(input);
  if (!rgb || [rgb.r, rgb.g, rgb.b].some((n) => Number.isNaN(n))) return `rgba(0,0,0,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
};

export const rgbString = (c: { r: number; g: number; b: number }) => `rgb(${c.r},${c.g},${c.b})`;

export const mixRgb = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
) => {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
};
