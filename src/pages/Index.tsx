import React, { useState, useEffect } from 'react';
import { Download, CheckSquare, Square, Image } from 'lucide-react';
import { MovieData, tmdbService, MediaType } from '../services/tmdbService';
import { historyService, SearchHistoryItem } from '../services/historyService';
import { exportService } from '../services/exportService';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../hooks/use-toast';
import Header from '../components/Header';
import SearchForm from '../components/SearchForm';
import MovieCard from '../components/MovieCard';
import SearchHistory from '../components/SearchHistory';
import BulkBannerModal from '../components/BulkBannerModal';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const Index = () => {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [selectedMovies, setSelectedMovies] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showBulkBannerModal, setShowBulkBannerModal] = useState(false);

  useEffect(() => {
    if (user) {
      setSearchHistory(historyService.getHistory());
    }
  }, [user]);

  const cleanSearchQuery = (query: string): string => {
    // Remove emojis e variações de "LEG"
    return query
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/\s*\(?LEG\)?\s*/gi, '') // Remove LEG, leg, (LEG)
      .replace(/\s+/g, ' ') // Remove espaços extras
      .trim();
  };

  const handleSearch = async (queries: string[], type: 'individual' | 'bulk', mediaType: MediaType) => {
    setIsLoading(true);
    setMovies([]);
    setSelectedMovies(new Set());

    try {
      const allResults: MovieData[] = [];
      
      for (const query of queries) {
        const cleanedQuery = cleanSearchQuery(query);
        const { title, year } = tmdbService.parseSearchQuery(cleanedQuery);
        console.log(`Buscando: "${title}" (${year || 'sem ano'}) - Tipo: ${mediaType}`);
        
        const searchResult = await tmdbService.searchByType(title, mediaType, year, language);
        
        let results = searchResult.results;
        if (year && results.length > 0) {
          results = results.filter(movie => {
            const movieYear = movie.release_date || movie.first_air_date;
            return movieYear && new Date(movieYear).getFullYear().toString() === year;
          });
        }
        
        console.log(`Encontrados ${results.length} resultados para "${query}"`);
        allResults.push(...results);
      }

      const uniqueResults = allResults.filter((movie, index, self) => 
        index === self.findIndex(m => m.id === movie.id)
      );

      setMovies(uniqueResults);

      if (user && uniqueResults.length > 0) {
        historyService.addToHistory({
          query: queries.join(', '),
          results: uniqueResults,
          type
        });
        setSearchHistory(historyService.getHistory());
      }

      if (uniqueResults.length === 0) {
        toast({
          title: "Nenhum resultado",
          description: t('no.results'),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Busca concluída",
          description: `${uniqueResults.length} resultado(s) encontrado(s)`,
        });
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      toast({
        title: "Erro",
        description: t('error.generic'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSelect = (movieId: number) => {
    const newSelected = new Set(selectedMovies);
    if (newSelected.has(movieId)) {
      newSelected.delete(movieId);
    } else {
      newSelected.add(movieId);
    }
    setSelectedMovies(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedMovies.size === movies.length) {
      setSelectedMovies(new Set());
    } else {
      setSelectedMovies(new Set(movies.map(m => m.id)));
    }
  };

  const handleDownloadSelectedCovers = async () => {
    const selected = movies.filter(m => selectedMovies.has(m.id));
    if (selected.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um item para baixar as capas",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Processando...",
        description: `Iniciando download de ${selected.length} capa(s)...`,
      });
      
      await exportService.downloadSelectedCovers(selected);
      toast({
        title: "Sucesso",
        description: `${selected.length} capa(s) baixada(s) com sucesso!`,
      });
    } catch (error) {
      console.error('Erro ao baixar capas:', error);
      toast({
        title: "Erro",
        description: "Erro ao baixar capas. Verifique a conexão e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateBulkBanners = () => {
    const selected = movies.filter(m => selectedMovies.has(m.id));
    if (selected.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um item para gerar banners",
        variant: "destructive",
      });
      return;
    }
    setShowBulkBannerModal(true);
  };

  const handleRerunSearch = (item: SearchHistoryItem) => {
    setMovies(item.results);
    setSelectedMovies(new Set());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-950 dark:via-blue-950 dark:to-purple-950">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />

          {movies.length > 0 && (
            <div className="glass-effect rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="flex items-center space-x-2 border-blue-300 hover:bg-blue-50 dark:border-blue-700 dark:hover:bg-blue-900"
                  >
                    {selectedMovies.size === movies.length ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    <span>
                      {selectedMovies.size === movies.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </span>
                  </Button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {selectedMovies.size} de {movies.length} selecionado(s)
                  </span>
                </div>
              </div>
              
              {selectedMovies.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    onClick={handleDownloadSelectedCovers}
                    className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  >
                    <Download className="h-4 w-4" />
                    <span>Baixar Capas Selecionadas</span>
                  </Button>
                  
                  <Button
                    onClick={handleGenerateBulkBanners}
                    className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    <Image className="h-4 w-4" />
                    <span>Gerar Banners Selecionados</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {user ? (
            <Tabs defaultValue="results" className="space-y-6">
              <TabsList className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <TabsTrigger value="results" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white">
                  Resultados
                </TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white">
                  Histórico
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="results" className="space-y-6">
                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r from-blue-600 to-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {movies.map((movie) => (
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                        isSelected={selectedMovies.has(movie.id)}
                        onToggleSelect={handleToggleSelect}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="history">
                <SearchHistory
                  history={searchHistory}
                  onRerun={handleRerunSearch}
                  onRefresh={() => setSearchHistory(historyService.getHistory())}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-6">
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {movies.map((movie) => (
                    <MovieCard
                      key={movie.id}
                      movie={movie}
                      isSelected={selectedMovies.has(movie.id)}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showBulkBannerModal && (
        <BulkBannerModal
          movies={movies.filter(m => selectedMovies.has(m.id))}
          onClose={() => setShowBulkBannerModal(false)}
        />
      )}
    </div>
  );
};

export default Index;
