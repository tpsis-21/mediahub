import type { MovieData } from '../../services/searchService';
import { canvasToBlob, drawRoundedRect, wrapTextSimple } from './canvas';
import { hexToRgba } from './colors';
import { loadImageOrThrow } from './image';
import { getPosterUrl } from './poster';

export type IndividualBannerTemplate = {
  id: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
};

export type IndividualBannerFormat = {
  width: number;
  height: number;
  label?: string;
};

export const DEFAULT_INDIVIDUAL_BANNER_TEMPLATES: IndividualBannerTemplate[] = [
  {
    id: 1,
    name: 'Padrão',
    primaryColor: '#3b82f6',
    secondaryColor: '#8b5cf6',
    gradientFrom: '#3b82f6',
    gradientTo: '#8b5cf6',
  },
  {
    id: 2,
    name: 'Escuro',
    primaryColor: '#111827',
    secondaryColor: '#111827',
    gradientFrom: '#070911',
    gradientTo: '#111827',
  },
  {
    id: 3,
    name: 'Vermelho',
    primaryColor: '#ef4444',
    secondaryColor: '#b91c1c',
    gradientFrom: '#ef4444',
    gradientTo: '#b91c1c',
  },
];

export const buildIndividualBannerTemplates = (brandColors?: {
  primary?: string;
  secondary?: string;
} | null): IndividualBannerTemplate[] => {
  if (brandColors?.primary && brandColors?.secondary) {
    return [
      {
        id: 100,
        name: 'Minha marca',
        primaryColor: brandColors.primary,
        secondaryColor: brandColors.secondary,
        gradientFrom: brandColors.primary,
        gradientTo: brandColors.secondary,
      },
      ...DEFAULT_INDIVIDUAL_BANNER_TEMPLATES,
    ];
  }
  return [...DEFAULT_INDIVIDUAL_BANNER_TEMPLATES];
};


export const generateIndividualBanner = async (
  movie: MovieData,
  template: IndividualBannerTemplate,
  format: IndividualBannerFormat
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context não disponível');
  }

  canvas.width = format.width;
  canvas.height = format.height;

    const title = movie.title || movie.name || 'Título';
    const year = movie.release_date || movie.first_air_date 
      ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
      : '';
    const synopsis = movie.overview || 'Sinopse não disponível para este conteúdo.';
    const rating = movie.vote_average || 0;
    const mediaType = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';

    const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    mainGradient.addColorStop(0, template.gradientFrom);
    mainGradient.addColorStop(1, template.gradientTo);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Carregar poster primeiro
    let posterImg: HTMLImageElement | null = null;
    if (movie.poster_path) {
      try {
        posterImg = await loadImageOrThrow(getPosterUrl({ posterPath: movie.poster_path, size: 'w780' }));
      } catch (error) {
        try {
          posterImg = await loadImageOrThrow(getPosterUrl({ posterPath: movie.poster_path, size: 'w500' }));
        } catch (fallbackError) {
          posterImg = null;
          void fallbackError;
        }
      }
    }

    if (posterImg) {
      const imgW = posterImg.width;
      const imgH = posterImg.height;
      const imgRatio = imgW / imgH;
      const canvasRatio = canvas.width / canvas.height;

      let drawW = canvas.width;
      let drawH = canvas.height;
      if (imgRatio > canvasRatio) {
        drawH = canvas.height;
        drawW = drawH * imgRatio;
      } else {
        drawW = canvas.width;
        drawH = drawW / imgRatio;
      }
      const drawX = (canvas.width - drawW) / 2;
      const drawY = (canvas.height - drawH) / 2;

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.filter = 'blur(18px)';
      ctx.drawImage(posterImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = mainGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const isSquareLayout = Math.abs(format.width - format.height) <= 1;
    const isStoryLayout = format.height >= 1700;

    if (isSquareLayout) {
      // Layout quadrado (1:1) - duas colunas
      const leftColumnWidth = canvas.width * 0.4;
      const rightColumnX = leftColumnWidth + 20;
      const rightColumnWidth = canvas.width - rightColumnX - 40;
      
      // COLUNA ESQUERDA - IMAGEM
      const posterMargin = 40;
      const posterWidth = leftColumnWidth - (posterMargin * 2);
      const posterHeight = posterWidth * 1.5;
      const posterX = posterMargin;
      const posterY = (canvas.height - posterHeight) / 2;

      if (posterImg) {
        // Desenhar poster com bordas arredondadas e sombra
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 10;
        
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 15);
        ctx.clip();
        ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
        ctx.restore();
        
        // Borda do poster
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 15);
        ctx.stroke();
      } else {
        // Placeholder melhorado
        ctx.fillStyle = '#4b5563';
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 15);
        ctx.fill();
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SEM IMAGEM', posterX + posterWidth/2, posterY + posterHeight/2 - 10);
        ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
      }

      // COLUNA DIREITA - CONTEÚDO
      let currentY = 80;
      
      // 1. TÍTULO
      ctx.fillStyle = 'white';
      ctx.font = '700 50px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      
      const titleLines = wrapTextSimple(ctx, title, rightColumnWidth);
      titleLines.forEach((line, index) => {
        ctx.fillText(line, rightColumnX, currentY + (index * 60));
      });

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      
      currentY += titleLines.length * 60 + 40;

      // 2. RETÂNGULO COM ANO E TIPO
      if (year || mediaType) {
        const badgeText = year ? `${year} • ${mediaType}` : mediaType;
        const badgeWidth = Math.min(rightColumnWidth, 320);
        const badgeHeight = 55;
        
        // Gradiente do badge
        const badgeGradient = ctx.createLinearGradient(
          rightColumnX, currentY, 
          rightColumnX + badgeWidth, currentY + badgeHeight
        );
        badgeGradient.addColorStop(0, template.primaryColor);
        badgeGradient.addColorStop(1, template.secondaryColor);
        
        ctx.fillStyle = badgeGradient;
        drawRoundedRect(ctx, rightColumnX, currentY, badgeWidth, badgeHeight, 27);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, rightColumnX + badgeWidth/2, currentY + 35);
        
        currentY += badgeHeight + 50;
      }

      const synopsisPanelX = rightColumnX;
      const synopsisPanelY = currentY;
      const synopsisPanelW = rightColumnWidth;
      const synopsisPanelPadding = 22;
      const synopsisLineHeight = 28;
      const synopsisMaxHeight = Math.max(170, canvas.height - synopsisPanelY - 150);

      ctx.font = '20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      const synopsisLines = wrapTextSimple(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
      const maxSynopsisLines = Math.max(
        4,
        Math.min(synopsisLines.length, Math.floor((synopsisMaxHeight - synopsisPanelPadding * 2) / synopsisLineHeight))
      );
      const synopsisPanelH = Math.min(synopsisMaxHeight, synopsisPanelPadding * 2 + maxSynopsisLines * synopsisLineHeight);

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      drawRoundedRect(ctx, synopsisPanelX, synopsisPanelY, synopsisPanelW, synopsisPanelH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      for (let i = 0; i < maxSynopsisLines; i++) {
        let line = synopsisLines[i];
        if (i === maxSynopsisLines - 1 && synopsisLines.length > maxSynopsisLines) {
          line += '…';
        }
        ctx.fillText(line, synopsisPanelX + synopsisPanelPadding, synopsisPanelY + synopsisPanelPadding + 24 + i * synopsisLineHeight);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // 5. BADGE DE AVALIAÇÃO (canto superior direito)
      if (rating > 0) {
        const ratingX = canvas.width - 140;
        const ratingY = 30;
        
        ctx.fillStyle = 'rgba(255, 193, 7, 0.95)';
        drawRoundedRect(ctx, ratingX, ratingY, 120, 45, 22);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`⭐ ${rating.toFixed(1)}`, ratingX + 60, ratingY + 28);
      }

    } else {
      // Layout vertical (4:5 e 9:16)
      const posterWidth = canvas.width * (isStoryLayout ? 0.6 : 0.52);
      const posterHeight = posterWidth * 1.5;
      const posterX = (canvas.width - posterWidth) / 2;
      const posterY = isStoryLayout ? 80 : 64;

      // IMAGEM
      if (posterImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 10;
        
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 20);
        ctx.clip();
        ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
        ctx.restore();
        
        // Borda
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 20);
        ctx.stroke();
      } else {
        // Placeholder
        ctx.fillStyle = '#4b5563';
        drawRoundedRect(ctx, posterX, posterY, posterWidth, posterHeight, 20);
        ctx.fill();
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SEM IMAGEM', posterX + posterWidth/2, posterY + posterHeight/2 - 20);
        ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
      }

      // TÍTULO abaixo do poster
      let currentY = posterY + posterHeight + (isStoryLayout ? 60 : 44);
      
      ctx.fillStyle = 'white';
      ctx.font = isStoryLayout
        ? '800 60px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
        : '800 50px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
      
      const titleLines = wrapTextSimple(ctx, title, canvas.width - (isStoryLayout ? 80 : 110));
      titleLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width/2, currentY + (index * (isStoryLayout ? 70 : 58)));
      });

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      
      currentY += titleLines.length * (isStoryLayout ? 70 : 58) + (isStoryLayout ? 40 : 28);

      // ANO E TIPO
      if (year) {
        ctx.font = isStoryLayout ? '700 32px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : '700 28px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.fillText(`${year} • ${mediaType}`, canvas.width/2, currentY);
        currentY += isStoryLayout ? 50 : 44;
      }

      // AVALIAÇÃO
      if (rating > 0) {
        ctx.font = isStoryLayout ? '700 28px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : '700 24px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
        currentY += isStoryLayout ? 60 : 48;
      }

      const synopsisPanelX = isStoryLayout ? 40 : 56;
      const synopsisPanelY = currentY;
      const synopsisPanelW = canvas.width - synopsisPanelX * 2;
      const synopsisPanelPadding = isStoryLayout ? 24 : 20;
      const synopsisLineHeight = isStoryLayout ? 30 : 27;
      const synopsisMaxHeight = Math.max(isStoryLayout ? 200 : 170, canvas.height - synopsisPanelY - (isStoryLayout ? 150 : 118));

      ctx.font = isStoryLayout ? '22px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : '20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      ctx.textAlign = 'left';
      const synopsisLines = wrapTextSimple(ctx, synopsis, synopsisPanelW - synopsisPanelPadding * 2);
      const maxLines = Math.max(
        isStoryLayout ? 4 : 3,
        Math.min(synopsisLines.length, Math.floor((synopsisMaxHeight - synopsisPanelPadding * 2) / synopsisLineHeight))
      );
      const synopsisPanelH = Math.min(synopsisMaxHeight, synopsisPanelPadding * 2 + maxLines * synopsisLineHeight);

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      drawRoundedRect(ctx, synopsisPanelX, synopsisPanelY, synopsisPanelW, synopsisPanelH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      for (let i = 0; i < maxLines; i++) {
        let line = synopsisLines[i];
        if (i === maxLines - 1 && synopsisLines.length > maxLines) {
          line += '…';
        }
        ctx.fillText(line, synopsisPanelX + synopsisPanelPadding, synopsisPanelY + synopsisPanelPadding + 26 + i * synopsisLineHeight);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // RODAPÉ (para ambos os formatos)
    const footerHeight = 92;
    const footerY = canvas.height - footerHeight;
    
    // Fundo do rodapé
    const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
    footerGradient.addColorStop(0, hexToRgba(template.primaryColor, 0.38));
    footerGradient.addColorStop(1, hexToRgba(template.secondaryColor, 0.78));
    
    ctx.fillStyle = footerGradient;
    ctx.fillRect(0, footerY, canvas.width, footerHeight);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Banner gerado no MediaHub', canvas.width / 2, footerY + 36);

  return canvasToBlob(canvas, 'image/png', 1.0);
};

