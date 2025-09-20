import React, { useState } from 'react';
import { X, Play, Download, Search } from 'lucide-react';
import { MovieData } from '../services/tmdbService';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { useToast } from '../hooks/use-toast';

interface VideoGenerationModalProps {
  movie: MovieData;
  onClose: () => void;
}

const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({ movie, onClose }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [trailerData, setTrailerData] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [customText, setCustomText] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [website, setWebsite] = useState(user?.website || '');

  const title = movie.title || movie.name || 'Título';
  const year = movie.release_date || movie.first_air_date 
    ? new Date(movie.release_date || movie.first_air_date!).getFullYear()
    : '';

  const searchTrailer = async () => {
    setIsSearching(true);
    
    try {
      // Buscar trailers no YouTube usando a API do TMDB
      const trailerResponse = await fetch(
        `https://api.themoviedb.org/3/${movie.media_type}/${movie.id}/videos?api_key=8fdb6c84b9f1a01c04bc11c92be23e61&language=pt-BR`
      );
      
      if (!trailerResponse.ok) {
        throw new Error('Failed to fetch trailer');
      }
      
      const trailerData = await trailerResponse.json();
      const trailers = trailerData.results?.filter((video: any) => 
        video.type === 'Trailer' && video.site === 'YouTube'
      ) || [];
      
      if (trailers.length > 0) {
        setTrailerData(trailers[0]);
        toast({
          title: "Trailer encontrado!",
          description: `Trailer oficial de "${title}" encontrado no YouTube.`,
        });
      } else {
        toast({
          title: "Trailer não encontrado",
          description: "Não foi possível encontrar um trailer oficial para este conteúdo.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Erro ao buscar trailer:', error);
      toast({
        title: "Erro",
        description: "Erro ao buscar trailer. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const generateVideoPromo = () => {
    if (!trailerData) {
      toast({
        title: "Erro",
        description: "Busque um trailer primeiro!",
        variant: "destructive",
      });
      return;
    }

    // Gerar link do YouTube com informações customizadas
    const youtubeUrl = `https://www.youtube.com/watch?v=${trailerData.key}`;
    const promoData = {
      title,
      year,
      trailerUrl: youtubeUrl,
      customText,
      phone,
      website,
      brandName: user?.brandName,
      brandColors: user?.brandColors
    };

    // Para esta versão BETA, apenas mostrar informações do trailer
    toast({
      title: "FUNCIONALIDADE BETA",
      description: `Trailer encontrado: ${trailerData.name}. Link: ${youtubeUrl}`,
    });

    // Abrir trailer em nova aba
    window.open(youtubeUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-red-600 to-purple-600 text-white rounded-t-lg">
          <CardTitle className="text-white flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>Geração de Vídeo - {title}</span>
            <Badge variant="secondary" className="bg-white/20 text-white">BETA</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-6 p-6">
          {/* Informações do Filme/Série */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-lg">{title}</h3>
            {year && <p className="text-gray-600 dark:text-gray-400">{year}</p>}
            {movie.overview && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-3">
                {movie.overview}
              </p>
            )}
          </div>

          {/* Buscar Trailer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">1. Buscar Trailer Oficial</Label>
              <Button 
                onClick={searchTrailer} 
                disabled={isSearching}
                className="flex items-center space-x-2"
              >
                <Search className="h-4 w-4" />
                <span>{isSearching ? 'Buscando...' : 'Buscar Trailer'}</span>
              </Button>
            </div>
            
            {trailerData && (
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2">
                  <Play className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Trailer encontrado: {trailerData.name}
                  </span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Duração: YouTube • Qualidade: HD
                </p>
              </div>
            )}
          </div>

          {/* Personalização */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold">2. Personalizar Informações</Label>
            
            <div>
              <Label htmlFor="customText">Texto Personalizado (opcional)</Label>
              <Input
                id="customText"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Ex: Disponível agora na sua plataforma favorita!"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Telefone de Contato</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://seusite.com"
                />
              </div>
            </div>
          </div>

          {/* Preview das Cores */}
          {user?.brandColors && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cores da Marca</Label>
              <div 
                className="h-16 rounded-lg flex items-center justify-center"
                style={{ 
                  background: `linear-gradient(135deg, ${user.brandColors.primary}, ${user.brandColors.secondary})` 
                }}
              >
                <span className="text-white font-medium">{user.brandName || 'Sua Marca'}</span>
              </div>
            </div>
          )}

          {/* Gerar */}
          <div className="flex space-x-4">
            <Button 
              onClick={generateVideoPromo}
              disabled={!trailerData}
              className="flex-1 bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Visualizar Trailer (BETA)
            </Button>
          </div>

          {/* Aviso BETA */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>FUNCIONALIDADE BETA:</strong> A geração de vídeos está em desenvolvimento. 
              Por enquanto, você pode visualizar o trailer oficial do conteúdo selecionado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VideoGenerationModal;