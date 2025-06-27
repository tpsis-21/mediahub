
import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

interface BannerModalProps {
  movie: MovieData;
  onClose: () => void;
}

const BannerModal: React.FC<BannerModalProps> = ({ movie, onClose }) => {
  const { t } = useI18n();
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
      name: 'Template Clássico',
      bgColor: 'bg-gradient-to-r from-blue-900 to-purple-900',
      textColor: 'text-white'
    },
    {
      id: 2,
      name: 'Template Moderno',
      bgColor: 'bg-gradient-to-r from-gray-900 to-gray-700',
      textColor: 'text-white'
    },
    {
      id: 3,
      name: 'Template Vibrante',
      bgColor: 'bg-gradient-to-r from-red-500 to-pink-500',
      textColor: 'text-white'
    }
  ];

  const formatDimensions = {
    square: { width: '1080px', height: '1080px', label: '1080x1080 (Quadrado)' },
    story: { width: '1080px', height: '1920px', label: '1080x1920 (Stories)' }
  };

  const handleDownloadBanner = () => {
    // Criar canvas para gerar banner real
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const format = formatDimensions[selectedFormat];
    canvas.width = parseInt(format.width);
    canvas.height = parseInt(format.height);

    // Configurar template selecionado
    const template = templates.find(t => t.id === selectedTemplate)!;
    
    // Criar gradiente baseado no template
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    if (template.id === 1) {
      gradient.addColorStop(0, '#1e3a8a'); // blue-900
      gradient.addColorStop(1, '#7c3aed'); // purple-700
    } else if (template.id === 2) {
      gradient.addColorStop(0, '#111827'); // gray-900
      gradient.addColorStop(1, '#374151'); // gray-700
    } else {
      gradient.addColorStop(0, '#ef4444'); // red-500
      gradient.addColorStop(1, '#ec4899'); // pink-500
    }

    // Preencher fundo
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Configurar texto
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    
    // Título
    const titleFontSize = selectedFormat === 'square' ? 60 : 80;
    ctx.font = `bold ${titleFontSize}px Arial`;
    const titleY = selectedFormat === 'square' ? canvas.height * 0.3 : canvas.height * 0.2;
    
    // Quebrar título em múltiplas linhas se necessário
    const maxWidth = canvas.width * 0.8;
    const words = title.split(' ');
    let line = '';
    let lineHeight = titleFontSize * 1.2;
    let currentY = titleY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, canvas.width / 2, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, canvas.width / 2, currentY);

    // Ano
    if (year) {
      ctx.font = `${selectedFormat === 'square' ? 40 : 50}px Arial`;
      ctx.fillText(year.toString(), canvas.width / 2, currentY + lineHeight + 20);
    }

    // Tipo de mídia
    const mediaTypeText = movie.media_type === 'movie' ? 'FILME' : 'SÉRIE';
    ctx.font = `${selectedFormat === 'square' ? 30 : 40}px Arial`;
    ctx.fillText(mediaTypeText, canvas.width / 2, canvas.height * 0.8);

    // Avaliação
    if (movie.vote_average > 0) {
      const rating = `⭐ ${movie.vote_average.toFixed(1)}`;
      ctx.fillText(rating, canvas.width / 2, canvas.height * 0.85);
    }

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
      }
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('generate.banner')}</CardTitle>
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
                  <div className={`${template.bgColor} rounded-lg p-4 text-center`}>
                    <div className={`${template.textColor} text-sm font-bold`}>
                      {template.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview do Banner */}
          <div>
            <Label className="text-lg font-semibold mb-3 block">Preview</Label>
            <div className="flex justify-center">
              <div 
                className={`${templates.find(t => t.id === selectedTemplate)?.bgColor} rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4`}
                style={{
                  width: selectedFormat === 'square' ? '300px' : '200px',
                  height: selectedFormat === 'square' ? '300px' : '350px',
                  aspectRatio: selectedFormat === 'square' ? '1/1' : '9/16'
                }}
              >
                <h2 className="text-2xl font-bold text-white">
                  {title}
                </h2>
                {year && (
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {year}
                  </Badge>
                )}
                <div className="flex flex-col items-center space-y-2">
                  <Badge variant="outline" className="text-white border-white">
                    {movie.media_type === 'movie' ? 'FILME' : 'SÉRIE'}
                  </Badge>
                  {movie.vote_average > 0 && (
                    <Badge variant="outline" className="text-white border-white">
                      ⭐ {movie.vote_average.toFixed(1)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Download */}
          <div className="flex justify-end">
            <Button
              onClick={handleDownloadBanner}
              className="flex items-center space-x-2"
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

export default BannerModal;
