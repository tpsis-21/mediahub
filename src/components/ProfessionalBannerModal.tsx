
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
      
      img.onload = () => {
        console.log('Imagem carregada com sucesso:', src);
        resolve(img);
      };
      
      img.onerror = (error) => {
        console.error('Erro ao carregar imagem:', src, error);
        reject(new Error(`Failed to load image: ${src}`));
      };
      
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

      // Carregar poster
      let posterImg: HTMLImageElement | null = null;
      if (movie.poster_path) {
        const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
        console.log('Tentando carregar poster:', posterUrl);
        
        try {
          posterImg = await loadImage(posterUrl);
        } catch (error) {
          console.error('Falha ao carregar poster:', error);
        }
      }

      if (selectedFormat === 'square') {
        // Layout quadrado melhorado (1:1)
        const posterSize = 320;
        const posterX = 50;
        const posterY = (canvas.height - posterSize * 1.5) / 2;
        const posterWidth = posterSize;
        const posterHeight = posterSize * 1.5;
        
        const contentX = posterX + posterWidth + 40;
        const contentWidth = canvas.width - contentX - 50;

        // POSTER
        if (posterImg) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 15;
          ctx.shadowOffsetX = 8;
          ctx.shadowOffsetY = 8;
          
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 12);
          ctx.clip();
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
          ctx.restore();
          
          // Borda
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 12);
          ctx.stroke();
        }

        // CONTEÚDO
        let currentY = 120;
        
        // Título
        ctx.fillStyle = 'white';
        ctx.font = 'bold 42px Arial, sans-serif';
        ctx.textAlign = 'left';
        
        const titleLines = wrapText(ctx, title, contentWidth);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, contentX, currentY + (index * 50));
        });
        currentY += titleLines.length * 50 + 25;

        // Badge Ano/Tipo
        if (year || mediaType) {
          const badgeText = year ? `${year} • ${mediaType}` : mediaType;
          const badgeWidth = 280;
          const badgeHeight = 45;
          
          const badgeGradient = ctx.createLinearGradient(
            contentX, currentY, 
            contentX + badgeWidth, currentY + badgeHeight
          );
          badgeGradient.addColorStop(0, template.primaryColor);
          badgeGradient.addColorStop(1, template.secondaryColor);
          
          ctx.fillStyle = badgeGradient;
          ctx.beginPath();
          ctx.roundRect(contentX, currentY, badgeWidth, badgeHeight, 22);
          ctx.fill();
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 18px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, contentX + badgeWidth/2, currentY + 28);
          currentY += badgeHeight + 30;
        }

        // Rótulo Sinopse
        ctx.save();
        ctx.translate(contentX + 12, currentY + 60);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SINOPSE', 0, 0);
        ctx.restore();

        // Texto da Sinopse
        const synopsisX = contentX + 35;
        const synopsisWidth = contentWidth - 50;
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        
        const synopsisLines = wrapText(ctx, synopsis, synopsisWidth);
        const maxLines = Math.min(synopsisLines.length, 7);
        
        for (let i = 0; i < maxLines; i++) {
          let line = synopsisLines[i];
          if (i === maxLines - 1 && synopsisLines.length > maxLines) {
            line += '...';
          }
          ctx.fillText(line, synopsisX, currentY + (i * 22));
        }

        // Badge de Avaliação
        if (rating > 0) {
          const ratingX = canvas.width - 120;
          const ratingY = 25;
          
          ctx.fillStyle = 'rgba(255, 193, 7, 0.9)';
          ctx.beginPath();
          ctx.roundRect(ratingX, ratingY, 100, 40, 20);
          ctx.fill();
          
          ctx.fillStyle = 'black';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, ratingX + 50, ratingY + 25);
        }

      } else {
        // Layout vertical melhorado (9:16)
        const posterWidth = canvas.width * 0.55;
        const posterHeight = posterWidth * 1.5;
        const posterX = (canvas.width - posterWidth) / 2;
        const posterY = 60;

        // POSTER
        if (posterImg) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 10;
          ctx.shadowOffsetY = 10;
          
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
          ctx.clip();
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
          ctx.restore();
          
          // Borda
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
          ctx.stroke();
        }

        // CONTEÚDO ABAIXO DO POSTER
        let currentY = posterY + posterHeight + 50;
        
        // Título
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const titleLines = wrapText(ctx, title, canvas.width - 80);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, canvas.width/2, currentY + (index * 60));
        });
        currentY += titleLines.length * 60 + 30;

        // Ano e Tipo
        if (year) {
          ctx.font = 'bold 28px Arial';
          ctx.fillText(`${year} • ${mediaType}`, canvas.width/2, currentY);
          currentY += 40;
        }

        // Avaliação
        if (rating > 0) {
          ctx.font = 'bold 24px Arial';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
          currentY += 45;
        }

        // Sinopse
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        const synopsisLines = wrapText(ctx, synopsis, canvas.width - 80);
        const maxLines = Math.min(synopsisLines.length, 5);
        
        for (let i = 0; i < maxLines; i++) {
          let line = synopsisLines[i];
          if (i === maxLines - 1 && synopsisLines.length > maxLines) {
            line += '...';
          }
          const lineWidth = ctx.measureText(line).width;
          const lineX = (canvas.width - lineWidth) / 2;
          ctx.fillText(line, lineX, currentY + (i * 28));
        }
      }

      // RODAPÉ
      const footerHeight = 90;
      const footerY = canvas.height - footerHeight;
      
      const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
      footerGradient.addColorStop(0, 'rgba(0,0,0,0.7)');
      footerGradient.addColorStop(1, 'rgba(0,0,0,0.9)');
      
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);

      // Conteúdo do rodapé
      let footerX = 25;
      
      // Badge principal
      const badgeWidth = 260;
      ctx.fillStyle = template.primaryColor;
      ctx.beginPath();
      ctx.roundRect(footerX, footerY + 20, badgeWidth, 30, 15);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', footerX + badgeWidth/2, footerY + 38);
      
      footerX += badgeWidth + 30;

      // Ícones de dispositivos
      const iconSize = 20;
      const iconSpacing = 70;
      
      ctx.fillStyle = 'white';
      ctx.font = `${iconSize}px Arial`;
      ctx.textAlign = 'center';
      
      const devices = [
        { icon: '📱', label: 'Mobile' },
        { icon: '💻', label: 'PC' },
        { icon: '📺', label: 'TV' },
        { icon: '✅', label: 'HD' }
      ];
      
      devices.forEach((device, index) => {
        const x = footerX + (index * iconSpacing);
        ctx.font = `${iconSize}px Arial`;
        ctx.fillText(device.icon, x, footerY + 35);
        ctx.font = '10px Arial';
        ctx.fillText(device.label, x, footerY + 60);
      });

      // Download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `banner_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setTimeout(() => URL.revokeObjectURL(url), 100);
          
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
