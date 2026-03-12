
import React, { Suspense, lazy, useState } from 'react';
import { CheckSquare, Send, Square } from 'lucide-react';
import { MovieData } from '../services/searchService';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { getApiBaseUrl } from '../services/apiClient';

const MovieActionsModal = lazy(() => import('./MovieActionsModal'));

interface MovieCardProps {
  movie: MovieData;
  isSelected: boolean;
  onToggleSelect: () => void;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, isSelected, onToggleSelect }) => {
  const { user } = useAuth();
  const [showActionsModal, setShowActionsModal] = useState(false);

  const title = movie.title || movie.name || 'Título não disponível';
  const releaseDate = movie.release_date || movie.first_air_date || '';
  const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
  const imageUrl = (() => {
    if (!movie.poster_path) return '/placeholder.svg';
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    params.set('size', 'w500');
    params.set('path', movie.poster_path);
    return `${baseUrl}/api/search/image?${params.toString()}`;
  })();

  return (
    <>
      <Card className="group glass-effect card-hover shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleSelect}
              className="p-1 h-auto hover:bg-blue-50 dark:hover:bg-blue-900"
            >
              {isSelected ? <CheckSquare className="h-5 w-5 text-blue-600" /> : <Square className="h-5 w-5 text-gray-400 hover:text-blue-600" />}
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

          <div className="space-y-2">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {title}{' '}
              {year && <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({year})</span>}
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
              {movie.overview || 'Sinopse não disponível'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowActionsModal(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs"
              aria-label={`Abrir ações de ${title}`}
            >
              <Send className="h-3 w-3" />
              <span>Ações</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        {showActionsModal && user && (
          <MovieActionsModal movie={movie} imageUrl={imageUrl} onClose={() => setShowActionsModal(false)} />
        )}
        {showActionsModal && !user && <MovieActionsModal movie={movie} imageUrl={imageUrl} onClose={() => setShowActionsModal(false)} />}
      </Suspense>
    </>
  );
};

export default MovieCard;
