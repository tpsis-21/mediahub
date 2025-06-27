
import React, { useState } from 'react';
import { Download, Copy, Image, Check, CheckSquare, Square } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useI18n } from '../contexts/I18nContext';
import { exportService } from '../services/exportService';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import BannerModal from './BannerModal';

interface MovieCardProps {
  movie: MovieData;
  isSelected: boolean;
  onToggleSelect: (movieId: number) => void;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, isSelected, onToggleSelect }) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [showBannerModal, setShowBannerModal] = useState(false);

  const title = movie.title || movie.name || 'Título não disponível';
  const releaseDate = movie.release_date || movie.first_air_date || '';
  const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
  const imageUrl = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
    : '/placeholder.svg';

  const handleDownloadCover = async () => {
    try {
      await exportService.downloadCover(movie);
      toast({
        title: "Sucesso",
        description: "Capa baixada com sucesso!",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao baixar a capa",
        variant: "destructive",
      });
    }
  };

  const handleCopySynopsis = async () => {
    try {
      await exportService.copyToClipboard(movie.overview || '');
      toast({
        title: "Sucesso",
        description: t('success.copied'),
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao copiar sinopse",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card className="group hover:shadow-lg transition-shadow duration-200">
        <CardContent className="p-4">
          {/* Header com checkbox */}
          <div className="flex items-start justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleSelect(movie.id)}
              className="p-1 h-auto"
            >
              {isSelected ? (
                <CheckSquare className="h-5 w-5 text-blue-600" />
              ) : (
                <Square className="h-5 w-5 text-gray-400" />
              )}
            </Button>
            <div className="flex items-center space-x-1">
              <Badge variant="secondary" className="text-xs">
                {movie.media_type === 'movie' ? 'Filme' : 'Série'}
              </Badge>
              {movie.vote_average > 0 && (
                <Badge variant="outline" className="text-xs">
                  ⭐ {movie.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>

          {/* Imagem */}
          <div className="relative mb-3 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-64 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
          </div>

          {/* Informações */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white line-clamp-2">
              {title} {year && `(${year})`}
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
              {movie.overview || 'Sinopse não disponível'}
            </p>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCover}
              className="flex items-center space-x-1 text-xs"
            >
              <Download className="h-3 w-3" />
              <span>{t('download.cover')}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySynopsis}
              className="flex items-center space-x-1 text-xs"
            >
              <Copy className="h-3 w-3" />
              <span>{t('copy.synopsis')}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBannerModal(true)}
              className="flex items-center space-x-1 text-xs"
            >
              <Image className="h-3 w-3" />
              <span>{t('generate.banner')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Banner */}
      {showBannerModal && (
        <BannerModal
          movie={movie}
          onClose={() => setShowBannerModal(false)}
        />
      )}
    </>
  );
};

export default MovieCard;
