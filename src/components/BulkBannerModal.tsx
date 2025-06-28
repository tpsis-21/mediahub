
import React, { useState } from 'react';
import { X, Download, Archive } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import JSZip from 'jszip';

interface BulkBannerModalProps {
  movies: MovieData[];
  onClose: () => void;
}

const BulkBannerModal: React.FC<BulkBannerModalProps> = ({ movies, onClose }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<'square' | 'story'>('square');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const generateBanner = async (movie: MovieData, template: any, format: any): Promise<Blob> => {
    return new Promise(async (resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = format.width;
      canvas.height = format.height;

      const title = movie.title || movie.name || 'Título';
      const year = movie.release_date || movie.first_air_date 
        ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
        : '';
      const imageUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : '';

      // Aplicar fundo gradiente
      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        // Tentar carregar a imagem
        let img = null;
        if (imageUrl) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise((imgResolve, imgReject) => {
            img!.onload = () => imgResolve(img);
            img!.onerror = () => imgResolve(null); // Continuar sem imagem
            img!.src = imageUrl;
          });
        }

        if (selectedFormat === 'square') {
          // Layout quadrado
          const leftColumnWidth = canvas.width * 0.35;
          const rightColumnWidth = canvas.width * 0.65;
          const rightColumnStart = leftColumnWidth;
          
          // Desenhar capa ou placeholder
          const coverMargin = 30;
          const coverWidth = leftColumnWidth - (coverMargin * 2);
          const coverHeight = canvas.height - 200;
          const coverY = 30;
          
          if (img) {
            ctx.drawImage(img, coverMargin, coverY, coverWidth, coverHeight);
          } else {
            // Placeholder para capa
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(coverMargin, coverY, coverWidth, coverHeight);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CAPA', leftColumnWidth / 2, coverY + coverHeight / 2);
          }
          
          // Título
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
          
          // Retângulo da categoria
          const rectY = titleY + 60;
          const rectGradient = ctx.createLinearGradient(rightColumnStart + 40, rectY, rightColumnStart + 280, rectY + 60);
          rectGradient.addColorStop(0, template.primaryColor);
          rectGradient.addColorStop(1, template.secondaryColor);
          ctx.fillStyle = rectGradient;
          ctx.beginPath();
          ctx.roundRect(rightColumnStart + 40, rectY, 280, 60, 30);
          ctx.fill();
          
          // Texto da categoria
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
          ctx.fillText(`${categoryText} ${year}`, rightColumnStart + 180, rectY + 40);
          
          // Rótulo SINOPSE
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
          const synopsis = (movie.overview || 'Sinopse não disponível').substring(0, 300);
          wrapText(ctx, synopsis, rightColumnStart + 80, rectY + 140, rightColumnWidth - 120, 26, 10);
          
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
          drawFooterSquare(ctx, canvas.width, canvas.height, template);
        } else {
          // Layout stories
          const headerHeight = 300;
          
          // Capa centralizada
          const coverSize = 200;
          const coverX = (canvas.width - coverSize) / 2;
          const coverY = 50;
          
          if (img) {
            ctx.drawImage(img, coverX, coverY, coverSize, coverSize * 1.5);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(coverX, coverY, coverSize, coverSize * 1.5);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CAPA', canvas.width / 2, coverY + 150);
          }
          
          // Título
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
          
          // Categoria
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
          
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
          ctx.fillText(`${categoryText} ${year}`, canvas.width / 2, rectY + 40);
          
          // Sinopse
          ctx.fillStyle = 'white';
          ctx.font = '22px Arial';
          ctx.textAlign = 'left';
          const synopsis = (movie.overview || 'Sinopse não disponível').substring(0, 200);
          wrapText(ctx, synopsis, 60, rectY + 120, canvas.width - 120, 30, 12);
          
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
          drawFooterStory(ctx, canvas.width, canvas.height, template);
        }
      } catch (error) {
        console.error('Erro ao processar imagem:', error);
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      });
    });
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) => {
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

  const drawFooterSquare = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, template: any) => {
    const footerY = canvasHeight - 150;
    
    // Fundo do rodapé
    const footerGradient = ctx.createLinearGradient(0, footerY, canvasWidth, footerY + 150);
    footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
    footerGradient.addColorStop(1, template.gradientFrom);
    ctx.fillStyle = footerGradient;
    ctx.fillRect(0, footerY, canvasWidth, 150);
    
    let currentX = 40;
    
    // Badge
    ctx.fillStyle = template.primaryColor;
    ctx.beginPath();
    ctx.roundRect(currentX, footerY + 30, 300, 50, 25);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', currentX + 150, footerY + 60);
    
    currentX += 350;
    
    // Ícones
    ctx.fillStyle = 'white';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    
    ctx.fillText('📱', currentX, footerY + 70);
    ctx.font = '14px Arial';
    ctx.fillText('Celular', currentX, footerY + 95);
    currentX += 80;
    
    ctx.font = '32px Arial';
    ctx.fillText('📺', currentX, footerY + 70);
    ctx.font = '14px Arial';
    ctx.fillText('Smart TV', currentX, footerY + 95);
    currentX += 100;
    
    ctx.font = '32px Arial';
    ctx.fillText('💻', currentX, footerY + 70);
    ctx.font = '14px Arial';
    ctx.fillText('Computador', currentX, footerY + 95);
    currentX += 120;
    
    // Selo
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(currentX, footerY + 40, 150, 40, 20);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ Qualidade Garantida', currentX + 75, footerY + 65);
  };

  const drawFooterStory = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, template: any) => {
    const footerY = canvasHeight - 200;
    
    // Fundo do rodapé
    const footerGradient = ctx.createLinearGradient(0, footerY, canvasWidth, footerY + 200);
    footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
    footerGradient.addColorStop(1, template.gradientFrom);
    ctx.fillStyle = footerGradient;
    ctx.fillRect(0, footerY, canvasWidth, 200);
    
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
    
    // Ícones
    const iconsY = footerY + 100;
    const iconSpacing = 150;
    const startX = (canvasWidth - (iconSpacing * 2)) / 2;
    
    ctx.fillStyle = 'white';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    
    ctx.fillText('📱', startX, iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Celular', startX, iconsY + 25);
    
    ctx.font = '32px Arial';
    ctx.fillText('📺', startX + iconSpacing, iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Smart TV', startX + iconSpacing, iconsY + 25);
    
    ctx.font = '32px Arial';
    ctx.fillText('💻', startX + (iconSpacing * 2), iconsY);
    ctx.font = '14px Arial';
    ctx.fillText('Computador', startX + (iconSpacing * 2), iconsY + 25);
    
    // Selo
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

  const handleGenerateBulkBanners = async () => {
    setIsGenerating(true);
    setProgress(0);
    
    const zip = new JSZip();
    const template = templates.find(t => t.id === selectedTemplate)!;
    const format = formatDimensions[selectedFormat];
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      const blob = await generateBanner(movie, template, format);
      
      const filename = `banner_${(movie.title || movie.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
      zip.file(filename, blob);
      
      setProgress(((i + 1) / movies.length) * 100);
    }
    
    // Gerar e baixar o ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `banners_${template.name.toLowerCase().replace(/\s+/g, '_')}_${selectedFormat}_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    setIsGenerating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center space-x-2">
            <Archive className="h-5 w-5" />
            <span>Geração em Lote - {movies.length} banners</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Seleção de Formato */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Formato dos Banners</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as 'square' | 'story')}
              className="flex flex-row space-x-6"
              disabled={isGenerating}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="square" id="bulk-square" />
                <Label htmlFor="bulk-square" className="cursor-pointer">
                  {formatDimensions.square.label}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="story" id="bulk-story" />
                <Label htmlFor="bulk-story" className="cursor-pointer">
                  {formatDimensions.story.label}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seleção de Template */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Template Único para Todos</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`cursor-pointer border-2 rounded-lg p-3 transition-all ${
                    selectedTemplate === template.id
                      ? 'border-purple-500 shadow-lg scale-105'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isGenerating && setSelectedTemplate(template.id)}
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

          {/* Lista de Filmes */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Filmes Selecionados</Label>
            <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {movies.map((movie) => (
                  <div key={movie.id} className="flex items-center space-x-2 text-sm">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span className="truncate">
                      {movie.title || movie.name} 
                      {(movie.release_date || movie.first_air_date) && (
                        <span className="text-gray-500">
                          ({new Date(movie.release_date || movie.first_air_date!).getFullYear()})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Gerando banners...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Botão de Geração */}
          <div className="flex justify-end">
            <Button
              onClick={handleGenerateBulkBanners}
              disabled={isGenerating}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Gerar {movies.length} Banners ({formatDimensions[selectedFormat].label})</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkBannerModal;
