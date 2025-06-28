
import React, { useState } from 'react';
import { X, Download, Smartphone, Monitor, Tv, Shield, Check } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

interface ProfessionalBannerModalProps {
  movie: MovieData;
  onClose: () => void;
}

const ProfessionalBannerModal: React.FC<ProfessionalBannerModalProps> = ({ movie, onClose }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'story'>('square');

  const title = movie.title || movie.name || 'Título';
  const year = movie.release_date || movie.first_air_date 
    ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
    : '';
  const imageUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
    : '/placeholder.svg';

  const templates = [
    {
      id: 1,
      name: 'Cinematográfico Azul',
      primaryColor: '#1e40af',
      secondaryColor: '#3b82f6',
      gradientFrom: '#1e3a8a',
      gradientTo: '#3b82f6'
    },
    {
      id: 2,
      name: 'Dourado Premium',
      primaryColor: '#d97706',
      secondaryColor: '#f59e0b',
      gradientFrom: '#92400e',
      gradientTo: '#d97706'
    },
    {
      id: 3,
      name: 'Verde Elegante',
      primaryColor: '#059669',
      secondaryColor: '#10b981',
      gradientFrom: '#047857',
      gradientTo: '#059669'
    },
    {
      id: 4,
      name: 'Roxo Moderno',
      primaryColor: '#7c3aed',
      secondaryColor: '#8b5cf6',
      gradientFrom: '#6d28d9',
      gradientTo: '#7c3aed'
    },
    {
      id: 5,
      name: 'Preto Elegante',
      primaryColor: '#1f2937',
      secondaryColor: '#374151',
      gradientFrom: '#000000',
      gradientTo: '#1f2937'
    }
  ];

  const formatDimensions = {
    square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
    story: { width: 1080, height: 1920, label: '1080x1920 (Stories)' }
  };

  const handleDownloadBanner = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const format = formatDimensions[selectedFormat];
    const template = templates.find(t => t.id === selectedTemplate)!;
    
    canvas.width = format.width;
    canvas.height = format.height;

    try {
      // Carregar a imagem da capa
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Fundo principal
      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (selectedFormat === 'square') {
        // Layout quadrado (1080x1080)
        const leftColumnWidth = canvas.width * 0.35;
        const rightColumnWidth = canvas.width * 0.65;
        const rightColumnStart = leftColumnWidth;
        
        // Desenhar a capa na coluna esquerda
        const coverMargin = 30;
        const coverWidth = leftColumnWidth - (coverMargin * 2);
        const coverHeight = canvas.height - 200;
        const coverY = 30;
        
        ctx.drawImage(img, coverMargin, coverY, coverWidth, coverHeight);
        
        // Título na coluna direita
        ctx.fillStyle = 'white';
        ctx.font = 'bold 56px Arial, sans-serif';
        ctx.textAlign = 'left';
        
        const titleWords = title.split(' ');
        let titleLine = '';
        let titleY = 100;
        const titleLineHeight = 70;
        const titleMaxWidth = rightColumnWidth - 80;
        
        for (let i = 0; i < titleWords.length; i++) {
          const testLine = titleLine + titleWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > titleMaxWidth && i > 0) {
            ctx.fillText(titleLine, rightColumnStart + 40, titleY);
            titleLine = titleWords[i] + ' ';
            titleY += titleLineHeight;
          } else {
            titleLine = testLine;
          }
        }
        ctx.fillText(titleLine, rightColumnStart + 40, titleY);
        
        // Retângulo com gradiente para categoria
        const rectY = titleY + 60;
        const rectGradient = ctx.createLinearGradient(rightColumnStart + 40, rectY, rightColumnStart + 280, rectY + 60);
        rectGradient.addColorStop(0, template.primaryColor);
        rectGradient.addColorStop(1, template.secondaryColor);
        ctx.fillStyle = rectGradient;
        ctx.beginPath();
        ctx.roundRect(rightColumnStart + 40, rectY, 280, 60, 30);
        ctx.fill();
        
        // Texto no retângulo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
        ctx.fillText(`${categoryText} ${year}`, rightColumnStart + 180, rectY + 40);
        
        // Rótulo SINOPSE vertical
        ctx.save();
        ctx.translate(rightColumnStart + 40, rectY + 140);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SINOPSE', 0, 0);
        ctx.restore();
        
        // Sinopse
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        const synopsis = movie.overview || 'Sinopse não disponível';
        wrapText(ctx, synopsis, rightColumnStart + 80, rectY + 140, rightColumnWidth - 120, 26, 12);
        
        // Avaliação no canto superior direito
        if (movie.vote_average > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.beginPath();
          ctx.roundRect(canvas.width - 140, 30, 120, 50, 25);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${movie.vote_average.toFixed(1)}`, canvas.width - 80, 60);
        }
        
        // Rodapé
        const footerY = canvas.height - 150;
        const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, footerY + 150);
        footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        footerGradient.addColorStop(1, template.gradientFrom);
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, footerY, canvas.width, 150);
        
        // Elementos do rodapé
        drawFooterElements(ctx, canvas.width, footerY, template);
        
      } else {
        // Layout vertical (1080x1920) - Stories
        const headerHeight = 300;
        const footerHeight = 200;
        const contentHeight = canvas.height - headerHeight - footerHeight;
        
        // Header com capa em destaque
        const coverSize = 200;
        const coverX = (canvas.width - coverSize) / 2;
        const coverY = 50;
        
        ctx.drawImage(img, coverX, coverY, coverSize, coverSize * 1.5);
        
        // Título abaixo da capa
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const titleWords = title.split(' ');
        let titleLine = '';
        let titleY = coverY + 320;
        const titleLineHeight = 60;
        const titleMaxWidth = canvas.width - 80;
        
        for (let i = 0; i < titleWords.length; i++) {
          const testLine = titleLine + titleWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > titleMaxWidth && i > 0) {
            ctx.fillText(titleLine, canvas.width / 2, titleY);
            titleLine = titleWords[i] + ' ';
            titleY += titleLineHeight;
          } else {
            titleLine = testLine;
          }
        }
        ctx.fillText(titleLine, canvas.width / 2, titleY);
        
        // Retângulo com categoria
        const rectY = titleY + 40;
        const rectWidth = 300;
        const rectX = (canvas.width - rectWidth) / 2;
        const rectGradient = ctx.createLinearGradient(rectX, rectY, rectX + rectWidth, rectY + 60);
        rectGradient.addColorStop(0, template.primaryColor);
        rectGradient.addColorStop(1, template.secondaryColor);
        ctx.fillStyle = rectGradient;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectWidth, 60, 30);
        ctx.fill();
        
        // Texto no retângulo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
        ctx.fillText(`${categoryText} ${year}`, canvas.width / 2, rectY + 40);
        
        // Sinopse centralizada
        ctx.fillStyle = 'white';
        ctx.font = '22px Arial';
        ctx.textAlign = 'left';
        const synopsis = movie.overview || 'Sinopse não disponível';
        wrapText(ctx, synopsis, 60, rectY + 120, canvas.width - 120, 30, 15);
        
        // Avaliação
        if (movie.vote_average > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.beginPath();
          ctx.roundRect(canvas.width - 140, 30, 120, 50, 25);
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`⭐ ${movie.vote_average.toFixed(1)}`, canvas.width - 80, 60);
        }
        
        // Rodapé
        const footerY = canvas.height - footerHeight;
        const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, footerY + footerHeight);
        footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        footerGradient.addColorStop(1, template.gradientFrom);
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, footerY, canvas.width, footerHeight);
        
        // Elementos do rodapé para stories
        drawFooterElementsStory(ctx, canvas.width, footerY, template);
      }

      // Download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `banner_professional_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      });

      onClose();
    } catch (error) {
      console.error('Erro ao gerar banner:', error);
      // Fallback sem imagem
      generateFallbackBanner();
    }
  };

  const generateFallbackBanner = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const format = formatDimensions[selectedFormat];
    const template = templates.find(t => t.id === selectedTemplate)!;
    
    canvas.width = format.width;
    canvas.height = format.height;

    // Mesmo código do banner mas sem a imagem da capa
    const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    mainGradient.addColorStop(0, template.gradientFrom);
    mainGradient.addColorStop(1, template.gradientTo);
    ctx.fillStyle = mainGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Placeholder para capa
    if (selectedFormat === 'square') {
      const leftColumnWidth = canvas.width * 0.35;
      const coverMargin = 30;
      const coverWidth = leftColumnWidth - (coverMargin * 2);
      const coverHeight = canvas.height - 200;
      
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(coverMargin, 30, coverWidth, coverHeight);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CAPA', leftColumnWidth / 2, canvas.height / 2);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `banner_professional_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    });
  };

  // Função para quebrar texto
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number = 10) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    let lineCount = 0;

    for (let i = 0; i < words.length && lineCount < maxLines; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    if (lineCount < maxLines) {
      ctx.fillText(line, x, currentY);
    }
  };

  // Função para desenhar elementos do rodapé (formato quadrado)
  const drawFooterElements = (ctx: CanvasRenderingContext2D, canvasWidth: number, footerY: number, template: any) => {
    let currentX = 40;
    const iconY = footerY + 80;

    // Badge "EXPERIMENTE O TESTE GRÁTIS"
    ctx.fillStyle = template.primaryColor;
    ctx.beginPath();
    ctx.roundRect(currentX, footerY + 30, 300, 50, 25);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', currentX + 150, footerY + 60);
    
    currentX += 350;

    // Ícones de dispositivos
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    
    // Smartphone
    ctx.fillStyle = 'white';
    ctx.font = '32px Arial';
    ctx.fillText('📱', currentX, iconY);
    ctx.font = '14px Arial';
    ctx.fillText('Celular', currentX, iconY + 25);
    currentX += 80;
    
    // TV
    ctx.font = '32px Arial';
    ctx.fillText('📺', currentX, iconY);
    ctx.font = '14px Arial';
    ctx.fillText('Smart TV', currentX, iconY + 25);
    currentX += 100;
    
    // Computer
    ctx.font = '32px Arial';
    ctx.fillText('💻', currentX, iconY);
    ctx.font = '14px Arial';
    ctx.fillText('Computador', currentX, iconY + 25);
    currentX += 120;
    
    // Selo "Qualidade Garantida"
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(currentX, footerY + 40, 150, 40, 20);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ Qualidade Garantida', currentX + 75, footerY + 65);
  };

  // Função para desenhar elementos do rodapé (formato stories)
  const drawFooterElementsStory = (ctx: CanvasRenderingContext2D, canvasWidth: number, footerY: number, template: any) => {
    // Badge centralizado
    const badgeWidth = 350;
    const badgeX = (canvasWidth - badgeWidth) / 2;
    
    ctx.fillStyle = template.primaryColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, footerY + 20, badgeWidth, 50, 25);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', canvasWidth / 2, footerY + 50);
    
    // Ícones centralizados
    const iconsY = footerY + 100;
    const iconSpacing = 150;
    const startX = (canvasWidth - (iconSpacing * 3)) / 2;
    
    ctx.fillStyle = 'white';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    
    // Smartphone
    ctx.fillText('📱', startX, iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Celular', startX, iconsY + 25);
    
    // TV
    ctx.font = '32px Arial';
    ctx.fillText('📺', startX + iconSpacing, iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Smart TV', startX + iconSpacing, iconsY + 25);
    
    // Computer
    ctx.font = '32px Arial';
    ctx.fillText('💻', startX + (iconSpacing * 2), iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Computador', startX + (iconSpacing * 2), iconsY + 25);
    
    // Selo centralizado
    const sealWidth = 200;
    const sealX = (canvasWidth - sealWidth) / 2;
    
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(sealX, footerY + 150, sealWidth, 40, 20);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ Qualidade Garantida', canvasWidth / 2, footerY + 175);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
          <CardTitle className="text-white">Banner Profissional</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Seleção de Formato */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Formato do Banner</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'square' | 'story')}
              className="flex flex-row space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="square" />
                <Label htmlFor="square" className="cursor-pointer">
                  {formatDimensions.square.label}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="story" id="story" />
                <Label htmlFor="story" className="cursor-pointer">
                  {formatDimensions.story.label}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seleção de Template */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Escolha um Template Profissional</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`cursor-pointer border-2 rounded-lg p-3 transition-all ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 shadow-lg scale-105'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div 
                    className="rounded-lg p-4 text-center text-white font-semibold text-sm"
                    style={{
                      background: `linear-gradient(135deg, ${template.gradientFrom}, ${template.gradientTo})`
                    }}
                  >
                    {template.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Melhorado */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Preview Profissional</Label>
            <div className="flex justify-center">
              <div 
                className="rounded-lg overflow-hidden shadow-2xl"
                style={{
                  width: selectedFormat === 'square' ? '300px' : '200px',
                  height: selectedFormat === 'square' ? '300px' : '350px',
                  background: `linear-gradient(135deg, ${templates.find(t => t.id === selectedTemplate)?.gradientFrom}, ${templates.find(t => t.id === selectedTemplate)?.gradientTo})`
                }}
              >
                <div className="h-full flex flex-col justify-between p-4 text-white">
                  <div>
                    <h2 className="text-lg font-bold mb-2">{title}</h2>
                    <Badge 
                      className="mb-2"
                      style={{ backgroundColor: templates.find(t => t.id === selectedTemplate)?.primaryColor }}
                    >
                      {movie.media_type === 'movie' ? 'FILME' : 'SÉRIE'} {year}
                    </Badge>
                  </div>
                  
                  <div className="text-xs opacity-90">
                    <p>Layout profissional com capa, sinopse e elementos visuais</p>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex space-x-2">
                      <Smartphone className="h-4 w-4" />
                      <Tv className="h-4 w-4" />
                      <Monitor className="h-4 w-4" />
                    </div>
                    <Shield className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Download */}
          <div className="flex justify-end">
            <Button
              onClick={handleDownloadBanner}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Download className="h-4 w-4" />
              <span>Baixar Banner Profissional ({formatDimensions[selectedFormat].label})</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfessionalBannerModal;
