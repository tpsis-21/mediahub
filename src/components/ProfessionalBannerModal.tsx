
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
    : '';

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
      // Fundo principal
      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (selectedFormat === 'square') {
        // Layout quadrado (1080x1080) - DUAS COLUNAS
        const leftColumnWidth = canvas.width * 0.4; // 40% para capa
        const rightColumnWidth = canvas.width * 0.6; // 60% para conteúdo
        const rightColumnStart = leftColumnWidth;
        
        // COLUNA ESQUERDA - CAPA
        if (imageUrl) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          try {
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => resolve(); // Continue sem imagem
              img.src = imageUrl;
            });
            
            // Desenhar a capa ocupando toda a coluna esquerda com margem
            const coverMargin = 30;
            const coverWidth = leftColumnWidth - (coverMargin * 2);
            const coverHeight = canvas.height - 200; // Deixar espaço para rodapé
            const coverY = coverMargin;
            
            ctx.drawImage(img, coverMargin, coverY, coverWidth, coverHeight);
          } catch (error) {
            console.error('Erro ao carregar imagem:', error);
          }
        }
        
        // COLUNA DIREITA - CONTEÚDO
        const contentStartX = rightColumnStart + 40;
        let currentY = 80;
        
        // 1. TÍTULO no topo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 54px Arial, sans-serif';
        ctx.textAlign = 'left';
        
        // Quebrar título em múltiplas linhas se necessário
        const titleWords = title.split(' ');
        let titleLine = '';
        const titleMaxWidth = rightColumnWidth - 80;
        const titleLineHeight = 64;
        
        for (let i = 0; i < titleWords.length; i++) {
          const testLine = titleLine + titleWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > titleMaxWidth && i > 0) {
            ctx.fillText(titleLine.trim(), contentStartX, currentY);
            titleLine = titleWords[i] + ' ';
            currentY += titleLineHeight;
          } else {
            titleLine = testLine;
          }
        }
        ctx.fillText(titleLine.trim(), contentStartX, currentY);
        currentY += 80;
        
        // 2. RETÂNGULO com categoria
        const rectWidth = 280;
        const rectHeight = 60;
        const rectGradient = ctx.createLinearGradient(contentStartX, currentY, contentStartX + rectWidth, currentY + rectHeight);
        rectGradient.addColorStop(0, template.primaryColor);
        rectGradient.addColorStop(1, template.secondaryColor);
        ctx.fillStyle = rectGradient;
        ctx.beginPath();
        ctx.roundRect(contentStartX, currentY, rectWidth, rectHeight, 30);
        ctx.fill();
        
        // Texto no retângulo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
        ctx.fillText(`${categoryText} ${year}`, contentStartX + rectWidth/2, currentY + 40);
        
        currentY += 100;
        
        // 3. SINOPSE com rótulo vertical
        // Rótulo "SINOPSE" vertical
        ctx.save();
        ctx.translate(contentStartX, currentY + 60);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SINOPSE', 0, 0);
        ctx.restore();
        
        // Texto da sinopse
        ctx.fillStyle = 'white';
        ctx.font = '18px Arial';
        ctx.textAlign = 'left';
        const synopsis = movie.overview || 'Sinopse não disponível';
        wrapText(ctx, synopsis, contentStartX + 40, currentY, rightColumnWidth - 120, 24, 12);
        
        // 5. AVALIAÇÃO no canto superior direito
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
        
        // RODAPÉ ocupando as duas colunas
        const footerHeight = 120;
        const footerY = canvas.height - footerHeight;
        
        // Fundo do rodapé
        const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, canvas.height);
        footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        footerGradient.addColorStop(1, template.gradientFrom);
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, footerY, canvas.width, footerHeight);
        
        // Elementos do rodapé
        let footerX = 40;
        const footerCenterY = footerY + footerHeight/2;
        
        // Badge "EXPERIMENTE O TESTE GRÁTIS"
        const badgeWidth = 280;
        const badgeHeight = 40;
        ctx.fillStyle = template.primaryColor;
        ctx.beginPath();
        ctx.roundRect(footerX, footerCenterY - badgeHeight/2, badgeWidth, badgeHeight, 20);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', footerX + badgeWidth/2, footerCenterY + 6);
        
        footerX += badgeWidth + 60;
        
        // Ícones de dispositivos
        ctx.fillStyle = 'white';
        ctx.font = '28px Arial';
        ctx.textAlign = 'center';
        
        // Celular
        ctx.fillText('📱', footerX, footerCenterY - 10);
        ctx.font = '12px Arial';
        ctx.fillText('Celular', footerX, footerCenterY + 15);
        footerX += 80;
        
        // Smart TV
        ctx.font = '28px Arial';
        ctx.fillText('📺', footerX, footerCenterY - 10);
        ctx.font = '12px Arial';
        ctx.fillText('Smart TV', footerX, footerCenterY + 15);
        footerX += 80;
        
        // Computador
        ctx.font = '28px Arial';
        ctx.fillText('💻', footerX, footerCenterY - 10);
        ctx.font = '12px Arial';
        ctx.fillText('Computador', footerX, footerCenterY + 15);
        footerX += 100;
        
        // Selo "Qualidade Garantida"
        const sealWidth = 160;
        const sealHeight = 35;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.roundRect(footerX, footerCenterY - sealHeight/2, sealWidth, sealHeight, 17);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🛡️ Qualidade Garantida', footerX + sealWidth/2, footerCenterY + 4);
        
      } else {
        // Layout vertical (Stories) - 1080x1920
        let currentY = 60;
        
        // Capa no topo centralizada
        if (imageUrl) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          try {
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = imageUrl;
            });
            
            const coverWidth = 300;
            const coverHeight = 450;
            const coverX = (canvas.width - coverWidth) / 2;
            
            ctx.drawImage(img, coverX, currentY, coverWidth, coverHeight);
            currentY += coverHeight + 40;
          } catch (error) {
            console.error('Erro ao carregar imagem:', error);
            currentY += 300;
          }
        }
        
        // Título centralizado
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const titleWords = title.split(' ');
        let titleLine = '';
        const titleMaxWidth = canvas.width - 80;
        const titleLineHeight = 56;
        
        for (let i = 0; i < titleWords.length; i++) {
          const testLine = titleLine + titleWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > titleMaxWidth && i > 0) {
            ctx.fillText(titleLine.trim(), canvas.width/2, currentY);
            titleLine = titleWords[i] + ' ';
            currentY += titleLineHeight;
          } else {
            titleLine = testLine;
          }
        }
        ctx.fillText(titleLine.trim(), canvas.width/2, currentY);
        currentY += 60;
        
        // Retângulo da categoria
        const rectWidth = 300;
        const rectHeight = 60;
        const rectX = (canvas.width - rectWidth) / 2;
        const rectGradient = ctx.createLinearGradient(rectX, currentY, rectX + rectWidth, currentY + rectHeight);
        rectGradient.addColorStop(0, template.primaryColor);
        rectGradient.addColorStop(1, template.secondaryColor);
        ctx.fillStyle = rectGradient;
        ctx.beginPath();
        ctx.roundRect(rectX, currentY, rectWidth, rectHeight, 30);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
        ctx.fillText(`${categoryText} ${year}`, canvas.width/2, currentY + 40);
        
        currentY += 100;
        
        // Sinopse centralizada
        ctx.fillStyle = 'white';
        ctx.font = '22px Arial';
        ctx.textAlign = 'left';
        const synopsis = movie.overview || 'Sinopse não disponível';
        wrapText(ctx, synopsis, 60, currentY, canvas.width - 120, 28, 15);
        
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
        
        // Rodapé para stories
        const footerHeight = 180;
        const footerY = canvas.height - footerHeight;
        
        const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, canvas.height);
        footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        footerGradient.addColorStop(1, template.gradientFrom);
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, footerY, canvas.width, footerHeight);
        
        // Badge centralizado
        const badgeWidth = 350;
        const badgeHeight = 40;
        const badgeX = (canvas.width - badgeWidth) / 2;
        
        ctx.fillStyle = template.primaryColor;
        ctx.beginPath();
        ctx.roundRect(badgeX, footerY + 20, badgeWidth, badgeHeight, 20);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', canvas.width/2, footerY + 45);
        
        // Ícones centralizados
        const iconsY = footerY + 90;
        const iconSpacing = 120;
        const startX = (canvas.width - (iconSpacing * 2)) / 2;
        
        ctx.fillStyle = 'white';
        ctx.font = '28px Arial';
        
        ctx.fillText('📱', startX, iconsY);
        ctx.font = '12px Arial';
        ctx.fillText('Celular', startX, iconsY + 20);
        
        ctx.font = '28px Arial';
        ctx.fillText('📺', startX + iconSpacing, iconsY);
        ctx.font = '12px Arial';
        ctx.fillText('Smart TV', startX + iconSpacing, iconsY + 20);
        
        ctx.font = '28px Arial';
        ctx.fillText('💻', startX + (iconSpacing * 2), iconsY);
        ctx.font = '12px Arial';
        ctx.fillText('Computador', startX + (iconSpacing * 2), iconsY + 20);
        
        // Selo centralizado
        const sealWidth = 200;
        const sealHeight = 35;
        const sealX = (canvas.width - sealWidth) / 2;
        
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.roundRect(sealX, footerY + 130, sealWidth, sealHeight, 17);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🛡️ Qualidade Garantida', canvas.width/2, footerY + 152);
      }

      // Download do banner
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
        }
      });

      onClose();
    } catch (error) {
      console.error('Erro ao gerar banner:', error);
    }
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

          {/* Preview */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Preview do Layout</Label>
            <div className="flex justify-center">
              <div 
                className="rounded-lg overflow-hidden shadow-2xl"
                style={{
                  width: selectedFormat === 'square' ? '300px' : '200px',
                  height: selectedFormat === 'square' ? '300px' : '350px',
                  background: `linear-gradient(135deg, ${templates.find(t => t.id === selectedTemplate)?.gradientFrom}, ${templates.find(t => t.id === selectedTemplate)?.gradientTo})`
                }}
              >
                <div className="h-full flex text-white p-4">
                  {selectedFormat === 'square' ? (
                    <div className="flex w-full">
                      {/* Coluna Esquerda - Capa */}
                      <div className="w-2/5 bg-white/10 rounded mr-2 flex items-center justify-center">
                        <span className="text-xs">CAPA</span>
                      </div>
                      {/* Coluna Direita - Conteúdo */}
                      <div className="w-3/5 flex flex-col justify-between">
                        <div>
                          <h3 className="text-xs font-bold mb-1">{title}</h3>
                          <div 
                            className="text-[8px] px-2 py-1 rounded mb-2 text-center"
                            style={{ backgroundColor: templates.find(t => t.id === selectedTemplate)?.primaryColor }}
                          >
                            {movie.media_type === 'movie' ? 'FILME' : 'SÉRIE'} {year}
                          </div>
                          <div className="text-[6px] opacity-80">
                            <span className="font-bold">SINOPSE</span>
                            <p className="mt-1">{(movie.overview || 'Sinopse...').substring(0, 80)}...</p>
                          </div>
                        </div>
                        <div className="bg-black/20 p-2 rounded text-[6px] flex justify-between items-center">
                          <span>✓ TESTE GRÁTIS</span>
                          <div className="flex space-x-1">
                            <span>📱</span>
                            <span>📺</span>
                            <span>💻</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-between w-full">
                      <div className="text-center">
                        <div className="w-16 h-24 bg-white/10 rounded mx-auto mb-2"></div>
                        <h3 className="text-xs font-bold mb-1">{title}</h3>
                        <div 
                          className="text-[8px] px-2 py-1 rounded mb-2 inline-block"
                          style={{ backgroundColor: templates.find(t => t.id === selectedTemplate)?.primaryColor }}
                        >
                          {movie.media_type === 'movie' ? 'FILME' : 'SÉRIE'} {year}
                        </div>
                        <p className="text-[6px] opacity-80">{(movie.overview || 'Sinopse...').substring(0, 60)}...</p>
                      </div>
                      <div className="bg-black/20 p-2 rounded text-[6px] text-center">
                        <div>✓ TESTE GRÁTIS</div>
                        <div className="flex justify-center space-x-2 mt-1">
                          <span>📱</span>
                          <span>📺</span>
                          <span>💻</span>
                        </div>
                      </div>
                    </div>
                  )}
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
              <span>Baixar Banner ({formatDimensions[selectedFormat].label})</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfessionalBannerModal;
