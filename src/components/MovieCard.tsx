
import React, { useState } from 'react';
import { Download, Copy, Image, CheckSquare, Square } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useI18n } from '../contexts/I18nContext';
import { exportService } from '../services/exportService';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';
import ProfessionalBannerModal from './ProfessionalBannerModal';

interface MovieCardProps {
  movie: MovieData;
  isSelected: boolean;
  onToggleSelect: () => void;
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
      <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg hover:scale-[1.02]">
        <CardContent className="p-4">
          {/* Header com checkbox */}
          <div className="flex items-start justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSelect}
              className="p-1 h-auto hover:bg-blue-50 dark:hover:bg-blue-900"
            >
              {isSelected ? (
                <CheckSquare className="h-5 w-5 text-blue-600" />
              ) : (
                <Square className="h-5 w-5 text-gray-400 hover:text-blue-600" />
              )}
            </Button>
            <div className="flex items-center space-x-1">
              <Badge 
                variant="secondary" 
                className="text-xs bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 dark:from-blue-900 dark:to-purple-900 dark:text-blue-200"
              >
                {movie.media_type === 'movie' ? 'Filme' : 'Série'}
              </Badge>
              {movie.vote_average > 0 && (
                <Badge 
                  variant="outline" 
                  className="text-xs border-orange-300 text-orange-600 bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:bg-orange-950"
                >
                  ⭐ {movie.vote_average.toFixed(1)}
                </Badge>
              )}
            </div>
          </div>

          {/* Imagem com overlay gradiente */}
          <div className="relative mb-3 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 group">
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Informações */}
          <div className="space-y-2">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {title} {year && (
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({year})
                </span>
              )}
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
              {movie.overview || 'Sinopse não disponível'}
            </p>
          </div>

          {/* Botões de ação com cores melhoradas */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCover}
              className="flex items-center space-x-1 text-xs border-green-300 text-green-600 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
            >
              <Download className="h-3 w-3" />
              <span>{t('download.cover')}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySynopsis}
              className="flex items-center space-x-1 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
            >
              <Copy className="h-3 w-3" />
              <span>{t('copy.synopsis')}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBannerModal(true)}
              className="flex items-center space-x-1 text-xs border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950"
            >
              <Image className="h-3 w-3" />
              <span>Gerar Banner</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Banner Profissional */}
      {showBannerModal && (
        <ProfessionalBannerModal
          movie={movie}
          onClose={() => setShowBannerModal(false)}
        />
      )}
    </>
  );
};

export default MovieCard;
