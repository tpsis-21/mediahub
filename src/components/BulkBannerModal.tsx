
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
    }
  ];

  const formatDimensions = {
    square: { width: 1080, height: 1080, label: '1080x1080 (Quadrado)' },
    story: { width: 1080, height: 1920, label: '1080x1920 (Stories)' }
  };

  const generateBanner = (movie: MovieData, template: any, format: any): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = format.width;
      canvas.height = format.height;

      // Aplicar o mesmo estilo do banner profissional
      const mainGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      mainGradient.addColorStop(0, template.gradientFrom);
      mainGradient.addColorStop(1, template.gradientTo);
      ctx.fillStyle = mainGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const title = movie.title || movie.name || 'Título';
      const year = movie.release_date || movie.first_air_date 
        ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
        : '';

      if (selectedFormat === 'square') {
        const leftColumnWidth = canvas.width * 0.4;
        const rightColumnWidth = canvas.width * 0.6;
        const rightColumnStart = leftColumnWidth;
        
        // Área da capa simulada
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(20, 20, leftColumnWidth - 40, canvas.height - 200);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('CAPA', leftColumnWidth / 2, canvas.height / 2);
        
        // Título
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'left';
        
        const titleWords = title.split(' ');
        let titleLine = '';
        let titleY = 80;
        const titleLineHeight = 60;
        const titleMaxWidth = rightColumnWidth - 60;
        
        for (let i = 0; i < titleWords.length; i++) {
          const testLine = titleLine + titleWords[i] + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > titleMaxWidth && i > 0) {
            ctx.fillText(titleLine, rightColumnStart + 30, titleY);
            titleLine = titleWords[i] + ' ';
            titleY += titleLineHeight;
          } else {
            titleLine = testLine;
          }
        }
        ctx.fillText(titleLine, rightColumnStart + 30, titleY);
        
        // Retângulo com gradiente
        const rectY = titleY + 40;
        const rectGradient = ctx.createLinearGradient(rightColumnStart + 30, rectY, rightColumnStart + 250, rectY + 50);
        rectGradient.addColorStop(0, template.primaryColor);
        rectGradient.addColorStop(1, template.secondaryColor);
        ctx.fillStyle = rectGradient;
        ctx.beginPath();
        ctx.roundRect(rightColumnStart + 30, rectY, 220, 50, 25);
        ctx.fill();
        
        // Texto no retângulo
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        const categoryText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
        ctx.fillText(`${categoryText} ${year}`, rightColumnStart + 140, rectY + 32);
        
        // Sinopse (simplificada)
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        const synopsis = (movie.overview || 'Sinopse não disponível').substring(0, 200) + '...';
        const lines = synopsis.match(/.{1,40}/g) || [synopsis];
        lines.slice(0, 8).forEach((line, index) => {
          ctx.fillText(line, rightColumnStart + 70, rectY + 120 + (index * 20));
        });
        
        // Rodapé
        const footerY = canvas.height - 120;
        const footerGradient = ctx.createLinearGradient(0, footerY, canvas.width, footerY + 120);
        footerGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        footerGradient.addColorStop(1, template.gradientFrom);
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, footerY, canvas.width, 120);
        
        // Elementos do rodapé simplificados
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('✓ EXPERIMENTE O TESTE GRÁTIS', 40, footerY + 40);
        ctx.fillText('📱 📺 💻 Disponível em todos os dispositivos', 40, footerY + 70);
        ctx.fillText('🛡️ Qualidade Garantida', 40, footerY + 100);
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      });
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
