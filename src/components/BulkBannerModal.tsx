
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

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        console.log('Imagem carregada com sucesso (bulk):', src);
        resolve(img);
      };
      
      img.onerror = (error) => {
        console.error('Erro ao carregar imagem (bulk):', src, error);
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
      const synopsis = movie.overview || 'Sinopse não disponível para este conteúdo.';
      const rating = movie.vote_average || 0;
      const mediaType = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';

      // Aplicar fundo gradiente
      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Carregar poster primeiro
      let posterImg: HTMLImageElement | null = null;
      if (movie.poster_path) {
        const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
        console.log('Tentando carregar poster (bulk):', posterUrl);
        
        try {
          posterImg = await loadImage(posterUrl);
        } catch (error) {
          console.error('Falha ao carregar poster principal (bulk), tentando w300:', error);
          try {
            const fallbackUrl = `https://image.tmdb.org/t/p/w300${movie.poster_path}`;
            posterImg = await loadImage(fallbackUrl);
          } catch (fallbackError) {
            console.error('Falha ao carregar poster fallback (bulk):', fallbackError);
          }
        }
      }

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

        if (posterImg) {
          console.log('Desenhando poster no canvas (bulk)');
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
        } else {
          console.log('Poster não carregado (bulk), usando placeholder');
          // Placeholder melhorado
          ctx.fillStyle = '#4b5563';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 15);
          ctx.fill();
          
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('SEM CAPA', posterX + posterWidth/2, posterY + posterHeight/2 - 10);
          ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
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
        if (posterImg) {
          console.log('Desenhando poster vertical no canvas (bulk)');
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
        } else {
          console.log('Poster vertical não carregado (bulk), usando placeholder');
          // Placeholder
          ctx.fillStyle = '#4b5563';
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterWidth, posterHeight, 20);
          ctx.fill();
          
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'bold 32px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('SEM CAPA', posterX + posterWidth/2, posterY + posterHeight/2 - 20);
          ctx.fillText('DISPONÍVEL', posterX + posterWidth/2, posterY + posterHeight/2 + 20);
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

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/png', 1.0);
    });
  };

  const handleGenerateBulkBanners = async () => {
    setIsGenerating(true);
    setProgress(0);
    
    const zip = new JSZip();
    const template = templates.find(t => t.id === selectedTemplate)!;
    const format = formatDimensions[selectedFormat];
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`Gerando banner ${i + 1}/${movies.length} para: ${movie.title || movie.name}`);
      
      const blob = await generateBanner(movie, template, format);
      
      const filename = `banner_${(movie.title || movie.name || 'movie').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${selectedFormat}.png`;
      zip.file(filename, blob);
      
      setProgress(((i + 1) / movies.length) * 100);
    }
    
    console.log('Gerando arquivo ZIP...');
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
