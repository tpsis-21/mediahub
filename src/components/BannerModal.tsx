
import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface BannerModalProps {
  movie: MovieData;
  onClose: () => void;
}

const BannerModal: React.FC<BannerModalProps> = ({ movie, onClose }) => {
  const { t } = useI18n();
  const [selectedTemplate, setSelectedTemplate] = useState(1);

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

  const handleDownloadBanner = () => {
    // Em produção, gerar banner real usando canvas ou biblioteca de imagem
    console.log('Gerando banner para:', title, 'com template:', selectedTemplate);
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
          {/* Seleção de Template */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Escolha um Template</h3>
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
            <h3 className="text-lg font-semibold mb-3">Preview</h3>
            <div className="relative">
              <div className={`${templates.find(t => t.id === selectedTemplate)?.bgColor} rounded-lg p-8 flex items-center space-x-6`}>
                <img
                  src={imageUrl}
                  alt={title}
                  className="w-32 h-48 object-cover rounded-lg shadow-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
                <div className="flex-1 space-y-4">
                  <h2 className="text-3xl font-bold text-white">
                    {title}
                  </h2>
                  {year && (
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {year}
                    </Badge>
                  )}
                  <p className="text-white/90 text-lg line-clamp-3">
                    {movie.overview || 'Sinopse não disponível'}
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-white border-white">
                      {movie.media_type === 'movie' ? 'Filme' : 'Série'}
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
          </div>

          {/* Botão de Download */}
          <div className="flex justify-end">
            <Button
              onClick={handleDownloadBanner}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Baixar Banner</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BannerModal;
