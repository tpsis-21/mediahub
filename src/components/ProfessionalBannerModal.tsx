
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
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
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
        // Layout quadrado (1:1) - duas colunas
        const leftColumnWidth = canvas.width * 0.4;
        const rightColumnX = leftColumnWidth + 20;
        const rightColumnWidth = canvas.width - rightColumnX - 40;
        
        // COLUNA ESQUERDA - CAPA
        const posterMargin = 40;
        const posterWidth = leftColumnWidth - (posterMargin * 2);
        const posterHeight = posterWidth * 1.5;
        const posterX = posterMargin;
        const posterY = (canvas.height - posterHeight) / 2;

        try {
          if (movie.poster_path) {
            const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
            console.log('Carregando poster:', posterUrl);
            const posterImg = await loadImage(posterUrl);
            
            // Desenhar poster com bordas arredondadas e sombra
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 10;
            ctx.shadowOffsetY = 10;
            
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
            ctx.clip();
            ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
            ctx.restore();
            
            // Borda do poster
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
            ctx.stroke();
          }
        } catch (error) {
          console.error('Erro ao carregar poster:', error);
          // Placeholder caso não carregue
          ctx.fillStyle = '#4b5563';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
          ctx.fill();
          
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'bold 32px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('POSTER', posterX + posterWidth/2, posterY + posterHeight/2);
        }

        // COLUNA DIREITA - CONTEÚDO
        let currentY = 80;
        
        // 1. TÍTULO
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'left';
        
        const titleLines = wrapText(ctx, title, rightColumnWidth);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, rightColumnX, currentY + (index * 60));
        });
        
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
          ctx.beginPath();
          ctx.roundRect(rightColumnX, currentY, badgeWidth, badgeHeight, 27);
          ctx.fill();
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 22px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, rightColumnX + badgeWidth/2, currentY + 35);
          
          currentY += badgeHeight + 50;
        }

        // 3. RÓTULO VERTICAL "SINOPSE"
        ctx.save();
        ctx.translate(rightColumnX + 15, currentY + 80);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SINOPSE', 0, 0);
        ctx.restore();

        // 4. SINOPSE
        ctx.fillStyle = 'white';
        ctx.font = '18px Arial';
        ctx.textAlign = 'left';
        
        const synopsisX = rightColumnX + 40;
        const synopsisWidth = rightColumnWidth - 60;
        const synopsisLines = wrapText(ctx, synopsis, synopsisWidth);
        const maxSynopsisLines = Math.min(synopsisLines.length, 8);
        
        for (let i = 0; i < maxSynopsisLines; i++) {
          let line = synopsisLines[i];
          if (i === maxSynopsisLines - 1 && synopsisLines.length > maxSynopsisLines) {
            line += '...';
          }
          ctx.fillText(line, synopsisX, currentY + (i * 25));
        }

        // 5. BADGE DE AVALIAÇÃO (canto superior direito)
        if (rating > 0) {
          const ratingX = canvas.width - 140;
          const ratingY = 30;
          
          ctx.fillStyle = 'rgba(255, 193, 7, 0.95)';
          ctx.beginPath();
          ctx.roundRect(ratingX, ratingY, 120, 45, 22);
          ctx.fill();
          
          ctx.fillStyle = 'black';
          ctx.font = 'bold 18px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, ratingX + 60, ratingY + 28);
        }

      } else {
        // Layout vertical (9:16)
        const posterWidth = canvas.width * 0.6;
        const posterHeight = posterWidth * 1.5;
        const posterX = (canvas.width - posterWidth) / 2;
        const posterY = 80;

        // CAPA
        try {
          if (movie.poster_path) {
            const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
            console.log('Carregando poster vertical:', posterUrl);
            const posterImg = await loadImage(posterUrl);
            
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 10;
            ctx.shadowOffsetY = 10;
            
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
            ctx.clip();
            ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
            ctx.restore();
            
            // Borda
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
            ctx.stroke();
          }
        } catch (error) {
          console.error('Erro ao carregar poster vertical:', error);
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

        // TÍTULO abaixo do poster
        let currentY = posterY + posterHeight + 60;
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 56px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const titleLines = wrapText(ctx, title, canvas.width - 80);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, canvas.width/2, currentY + (index * 70));
        });
        
        currentY += titleLines.length * 70 + 40;

        // ANO E TIPO
        if (year) {
          ctx.font = 'bold 32px Arial';
          ctx.fillText(`${year} • ${mediaType}`, canvas.width/2, currentY);
          currentY += 50;
        }

        // AVALIAÇÃO
        if (rating > 0) {
          ctx.font = 'bold 28px Arial';
          ctx.fillText(`⭐ ${rating.toFixed(1)}`, canvas.width/2, currentY);
          currentY += 60;
        }

        // SINOPSE CENTRALIZADA
        ctx.font = '22px Arial';
        ctx.textAlign = 'left';
        const synopsisLines = wrapText(ctx, synopsis, canvas.width - 100);
        const maxLines = Math.min(synopsisLines.length, 6);
        
        for (let i = 0; i < maxLines; i++) {
          let line = synopsisLines[i];
          if (i === maxLines - 1 && synopsisLines.length > maxLines) {
            line += '...';
          }
          const lineWidth = ctx.measureText(line).width;
          const lineX = (canvas.width - lineWidth) / 2;
          ctx.fillText(line, lineX, currentY + (i * 30));
        }
      }

      // RODAPÉ (para ambos os formatos)
      const footerHeight = 100;
      const footerY = canvas.height - footerHeight;
      
      // Fundo do rodapé
      const footerGradient = ctx.createLinearGradient(0, footerY, 0, canvas.height);
      footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
      footerGradient.addColorStop(1, 'rgba(0,0,0,0.95)');
      
      ctx.fillStyle = footerGradient;
      ctx.fillRect(0, footerY, canvas.width, footerHeight);

      // Conteúdo do rodapé
      let footerX = 30;
      
      // Badge "EXPERIMENTE O TESTE GRÁTIS"
      const badgeWidth = 280;
      ctx.fillStyle = template.primaryColor;
      ctx.beginPath();
      ctx.roundRect(footerX, footerY + 25, badgeWidth, 35, 17);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', footerX + badgeWidth/2, footerY + 47);
      
      footerX += badgeWidth + 40;

      // Nome da marca (se disponível)
      if (user?.brandName) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(user.brandName.toUpperCase(), footerX, footerY + 75);
        footerX += 120;
      }
      
      // Ícones de dispositivos
      const iconSize = 24;
      const iconSpacing = 80;
      
      ctx.fillStyle = 'white';
      ctx.font = `${iconSize}px Arial`;
      ctx.textAlign = 'center';
      
      // Celular
      ctx.fillText('📱', footerX, footerY + 40);
      ctx.font = '12px Arial';
      ctx.fillText('Mobile', footerX, footerY + 65);
      footerX += iconSpacing;
      
      // PC
      ctx.font = `${iconSize}px Arial`;
      ctx.fillText('💻', footerX, footerY + 40);
      ctx.font = '12px Arial';
      ctx.fillText('PC', footerX, footerY + 65);
      footerX += iconSpacing;
      
      // TV
      ctx.font = `${iconSize}px Arial`;
      ctx.fillText('📺', footerX, footerY + 40);
      ctx.font = '12px Arial';
      ctx.fillText('TV', footerX, footerY + 65);
      footerX += iconSpacing;
      
      // Qualidade
      ctx.font = `${iconSize}px Arial`;
      ctx.fillText('✅', footerX, footerY + 40);
      ctx.font = '12px Arial';
      ctx.fillText('Qualidade', footerX, footerY + 65);

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
