
import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';

interface ProfessionalBannerModalProps {
  movie: MovieData;
  onClose: () => void;
}

const ProfessionalBannerModal: React.FC<ProfessionalBannerModalProps> = ({ movie, onClose }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'vertical'>('square');
  const [isGenerating, setIsGenerating] = useState(false);

  const title = movie.title || movie.name || 'Título';
  const year = movie.release_date || movie.first_air_date 
    ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
    : '';
  const synopsis = movie.overview || 'Sinopse não disponível para este conteúdo.';
  const rating = movie.vote_average || 0;
  const mediaType = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
  
  const templates = [
    {
      id: 1,
      name: 'Template Cinematográfico',
      primaryColor: user?.brandColors?.primary || '#3b82f6',
      secondaryColor: user?.brandColors?.secondary || '#8b5cf6',
      bgColor: 'linear-gradient(135deg, #1e3a8a, #7c3aed)'
    },
    {
      id: 2,
      name: 'Template Elegante',
      primaryColor: '#374151',
      secondaryColor: '#6b7280',
      bgColor: 'linear-gradient(135deg, #374151, #6b7280)'
    },
    {
      id: 3,
      name: 'Template Escuro',
      primaryColor: '#000000',
      secondaryColor: '#1f2937',
      bgColor: 'linear-gradient(135deg, #000000, #1f2937)'
    }
  ];

  const formatDimensions = {
    square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
    vertical: { width: 1080, height: 1920, label: '1080x1920 (Vertical)' }
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
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
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  const generateBanner = async () => {
    setIsGenerating(true);
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      const format = formatDimensions[selectedFormat];
      const template = templates.find(t => t.id === selectedTemplate)!;
      
      canvas.width = format.width;
      canvas.height = format.height;

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      if (template.id === 1) {
        gradient.addColorStop(0, template.primaryColor);
        gradient.addColorStop(1, template.secondaryColor);
      } else if (template.id === 2) {
        gradient.addColorStop(0, '#374151');
        gradient.addColorStop(1, '#6b7280');
      } else {
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(1, '#1f2937');
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (selectedFormat === 'square') {
        // Layout de duas colunas para formato quadrado (1:1)
        const columnWidth = canvas.width / 2;
        const posterWidth = columnWidth * 0.75;
        const posterHeight = posterWidth * 1.5;
        const posterX = (columnWidth - posterWidth) / 2;
        const posterY = (canvas.height - posterHeight) / 2;

        // Carregar e desenhar poster na coluna esquerda
        try {
          const posterUrl = movie.poster_path 
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : '';
          
          if (posterUrl) {
            const posterImg = await loadImage(posterUrl);
            
            // Desenhar poster com bordas arredondadas
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
            ctx.clip();
            ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
            ctx.restore();
            
            // Sombra do poster
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
            ctx.stroke();
            ctx.shadowColor = 'transparent';
          }
        } catch (error) {
          console.log('Erro ao carregar poster, usando placeholder');
          // Desenhar placeholder
          ctx.fillStyle = '#4b5563';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
          ctx.fill();
          
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'bold 32px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('POSTER', posterX + posterWidth/2, posterY + posterHeight/2);
        }

        // Coluna direita - conteúdo
        const rightColumnX = columnWidth + 20;
        const rightColumnWidth = columnWidth - 40;
        
        // Título
        ctx.fillStyle = 'white';
        ctx.font = 'bold 52px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        
        const titleLines = wrapText(ctx, title, rightColumnWidth);
        let currentY = 100;
        
        titleLines.forEach((line, index) => {
          ctx.fillText(line, rightColumnX, currentY + (index * 65));
        });
        
        currentY += titleLines.length * 65 + 30;

        // Ano e tipo em retângulo com gradiente
        if (year || mediaType) {
          const badgeText = year ? `${year} • ${mediaType}` : mediaType;
          const badgeWidth = Math.min(rightColumnWidth - 20, 320);
          const badgeHeight = 55;
          
          // Gradiente do badge
          const badgeGradient = ctx.createLinearGradient(
            rightColumnX, currentY, 
            rightColumnX + badgeWidth, currentY + badgeHeight
          );
          badgeGradient.addColorStop(0, template.primaryColor);
          badgeGradient.addColorStop(1, template.secondaryColor);
          
          ctx.fillStyle = badgeGradient;
          ctx.beginPath();
          ctx.roundRect(rightColumnX, currentY, badgeWidth, badgeHeight, 27);
          ctx.fill();
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 26px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, rightColumnX + badgeWidth/2, currentY + 35);
          
          currentY += badgeHeight + 50;
        }

        // Sinopse
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('SINOPSE', rightColumnX, currentY);
        
        currentY += 35;
        
        ctx.font = '20px Arial';
        const synopsisLines = wrapText(ctx, synopsis, rightColumnWidth - 20);
        const maxLines = Math.min(synopsisLines.length, 6);
        
        for (let i = 0; i < maxLines; i++) {
          let line = synopsisLines[i];
          if (i === maxLines - 1 && synopsisLines.length > maxLines) {
            line += '...';
          }
          ctx.fillText(line, rightColumnX, currentY + (i * 28));
        }

        // Rating badge no canto superior direito
        if (rating > 0) {
          const ratingBadgeX = canvas.width - 160;
          const ratingBadgeY = 30;
          
          ctx.fillStyle = 'rgba(255, 193, 7, 0.95)';
          ctx.beginPath();
          ctx.roundRect(ratingBadgeX, ratingBadgeY, 130, 45, 22);
          ctx.fill();
          
          ctx.fillStyle = 'black';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, ratingBadgeX + 65, ratingBadgeY + 28);
        }

      } else {
        // Layout vertical
        const posterWidth = canvas.width * 0.65;
        const posterHeight = posterWidth * 1.5;
        const posterX = (canvas.width - posterWidth) / 2;
        const posterY = 80;

        // Carregar e desenhar poster
        try {
          const posterUrl = movie.poster_path 
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : '';
          
          if (posterUrl) {
            const posterImg = await loadImage(posterUrl);
            
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
            ctx.clip();
            ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
            ctx.restore();
            
            // Borda do poster
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 3;
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
            ctx.stroke();
          }
        } catch (error) {
          // Placeholder
          ctx.fillStyle = '#4b5563';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
          ctx.fill();
          
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'bold 40px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('POSTER', posterX + posterWidth/2, posterY + posterHeight/2);
        }

        // Título abaixo do poster
        let currentY = posterY + posterHeight + 70;
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 64px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        
        const titleLines = wrapText(ctx, title, canvas.width - 80);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, canvas.width/2, currentY + (index * 75));
        });
        
        currentY += titleLines.length * 75 + 40;

        // Ano, rating e tipo
        if (year) {
          ctx.font = 'bold 36px Arial';
          ctx.fillText(year.toString(), canvas.width/2, currentY);
          currentY += 50;
        }

        if (rating > 0) {
          ctx.font = 'bold 32px Arial';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
          currentY += 50;
        }

        // Tipo de mídia
        ctx.font = 'bold 28px Arial';
        ctx.fillText(mediaType, canvas.width/2, currentY);
      }

      // Rodapé (para ambos os formatos)
      const footerHeight = 100;
      const footerY = canvas.height - footerHeight;
      
      // Fundo do rodapé
      const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
      footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
      footerGradient.addColorStop(1, 'rgba(0,0,0,0.95)');
      
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);

      // Conteúdo do rodapé
      ctx.fillStyle = 'white';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'left';
      
      const footerY1 = footerY + 25;
      const footerY2 = footerY + 55;
      
      // Lado esquerdo - Badge "EXPERIMENTE O TESTE GRÁTIS"
      ctx.fillStyle = template.primaryColor;
      ctx.beginPath();
      ctx.roundRect(20, footerY1 - 5, 250, 30, 15);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', 145, footerY1 + 12);

      // Nome da marca (se disponível)
      if (user?.brandName) {
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(user.brandName.toUpperCase(), 20, footerY2 + 12);
      }
      
      // Lado direito - Ícones de dispositivos
      const iconY = footerY + 50;
      const iconSpacing = 100;
      const startX = canvas.width - 420;
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      
      // Ícones de dispositivos (usando texto Unicode)
      const devices = ['📱', '💻', '📺', '✅'];
      const deviceLabels = ['Mobile', 'PC', 'TV', 'Qualidade'];
      
      devices.forEach((icon, index) => {
        const x = startX + (index * iconSpacing);
        ctx.font = '24px Arial';
        ctx.fillText(icon, x, iconY - 10);
        ctx.font = 'bold 12px Arial';
        ctx.fillText(deviceLabels[index], x, iconY + 15);
      });

      // Download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `banner_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          toast({
            title: "Sucesso",
            description: "Banner gerado e baixado com sucesso!",
          });
        }
      }, 'image/png', 1.0);

    } catch (error) {
      console.error('Erro ao gerar banner:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar banner. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Gerar Banner - {title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seleção de Formato */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Formato do Banner</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'square' | 'vertical')}
              className="flex flex-row space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="square" />
                <Label htmlFor="square" className="cursor-pointer">
                  {formatDimensions.square.label}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vertical" id="vertical" />
                <Label htmlFor="vertical" className="cursor-pointer">
                  {formatDimensions.vertical.label}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seleção de Template */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Escolha um Template</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`cursor-pointer border-2 rounded-lg p-2 transition-all ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 shadow-lg'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div 
                    className="rounded-lg p-4 text-center text-white"
                    style={{ background: template.bgColor }}
                  >
                    <div className="text-sm font-bold mb-2">
                      {template.name}
                    </div>
                    <div className="text-xs opacity-80">
                      {title}
                    </div>
                    {year && <div className="text-xs mt-1">{year}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Botão de Download */}
          <div className="flex justify-end">
            <Button
              onClick={generateBanner}
              disabled={isGenerating}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>
                {isGenerating ? 'Gerando...' : `Gerar Banner (${formatDimensions[selectedFormat].label})`}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfessionalBannerModal;
