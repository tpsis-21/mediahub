// Utility to extract dominant colors from an image
export const extractColorsFromImage = (imageFile: File): Promise<{ primary: string; secondary: string }> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      // Redimensionar para análise mais rápida
      const maxSize = 100;
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // Contar cores (ignorando transparência e cores muito claras/escuras)
      const colorMap = new Map<string, number>();
      
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // Ignorar pixels transparentes
        if (a < 128) continue;
        
        // Ignorar cores muito claras ou muito escuras
        const brightness = (r + g + b) / 3;
        if (brightness < 50 || brightness > 200) continue;
        
        // Agrupar cores similares (reduzir precisão)
        const groupedR = Math.floor(r / 16) * 16;
        const groupedG = Math.floor(g / 16) * 16;
        const groupedB = Math.floor(b / 16) * 16;
        
        const colorKey = `${groupedR},${groupedG},${groupedB}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
      }
      
      // Encontrar as duas cores mais dominantes
      const sortedColors = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 cores
      
      if (sortedColors.length === 0) {
        // Fallback para cores padrão
        resolve({
          primary: '#3b82f6',
          secondary: '#8b5cf6'
        });
        return;
      }
      
      // Converter de volta para hex
      const rgbToHex = (r: number, g: number, b: number) => {
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      };
      
      const [r1, g1, b1] = sortedColors[0][0].split(',').map(Number);
      const primaryColor = rgbToHex(r1, g1, b1);
      
      // Para a cor secundária, pegar a segunda mais dominante ou gerar uma variação
      let secondaryColor;
      if (sortedColors.length > 1) {
        const [r2, g2, b2] = sortedColors[1][0].split(',').map(Number);
        secondaryColor = rgbToHex(r2, g2, b2);
        
        // Verificar se as cores são muito similares
        const colorDistance = Math.sqrt(
          Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
        );
        
        if (colorDistance < 50) {
          // Gerar variação da cor primária
          const variation = 0.3;
          const r2_varied = Math.max(0, Math.min(255, r1 + (Math.random() - 0.5) * 255 * variation));
          const g2_varied = Math.max(0, Math.min(255, g1 + (Math.random() - 0.5) * 255 * variation));
          const b2_varied = Math.max(0, Math.min(255, b1 + (Math.random() - 0.5) * 255 * variation));
          secondaryColor = rgbToHex(Math.floor(r2_varied), Math.floor(g2_varied), Math.floor(b2_varied));
        }
      } else {
        // Gerar cor complementar
        const hsl = rgbToHsl(r1, g1, b1);
        const complementaryHue = (hsl.h + 180) % 360;
        const complementaryRgb = hslToRgb(complementaryHue, hsl.s, Math.max(0.3, hsl.l));
        secondaryColor = rgbToHex(complementaryRgb.r, complementaryRgb.g, complementaryRgb.b);
      }
      
      resolve({
        primary: primaryColor,
        secondary: secondaryColor
      });
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for color extraction'));
    };
    
    img.src = URL.createObjectURL(imageFile);
  });
};

// Helper functions for color conversion
const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }
  
  return { h: h * 360, s, l };
};

const hslToRgb = (h: number, s: number, l: number) => {
  h /= 360;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};
