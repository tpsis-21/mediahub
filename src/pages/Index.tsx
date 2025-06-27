import React, { useState, useEffect } from 'react';
import { Download, CheckSquare, Square } from 'lucide-react';
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

  useEffect(() => {
    if (user) {
      setSearchHistory(historyService.getHistory());
    }
  }, [user]);

  const handleSearch = async (queries: string[], type: 'individual' | 'bulk', mediaType: MediaType) => {
    setIsLoading(true);
    setMovies([]);
    setSelectedMovies(new Set());

    try {
      const allResults: MovieData[] = [];
      
      for (const query of queries) {
        const { title, year } = tmdbService.parseSearchQuery(query);
        console.log(`Buscando: "${title}" (${year || 'sem ano'}) - Tipo: ${mediaType}`);
        
        const searchResult = await tmdbService.searchByType(title, mediaType, year, language);
        
        // Filtrar por ano se especificado
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

      // Remover duplicatas
      const uniqueResults = allResults.filter((movie, index, self) => 
        index === self.findIndex(m => m.id === movie.id)
      );

      setMovies(uniqueResults);

      // Adicionar ao histórico se usuário estiver logado
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

  const handleExportSelected = async () => {
    const selected = movies.filter(m => selectedMovies.has(m.id));
    if (selected.length === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um item para exportar",
        variant: "destructive",
      });
      return;
    }

    try {
      await exportService.exportSelectedItems(selected, user?.email);
      toast({
        title: "Sucesso",
        description: `${selected.length} item(s) exportado(s) com sucesso!`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao exportar itens",
        variant: "destructive",
      });
    }
  };

  const handleRerunSearch = (item: SearchHistoryItem) => {
    setMovies(item.results);
    setSelectedMovies(new Set());
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Formulário de Busca */}
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />

          {/* Conteúdo Principal */}
          {user ? (
            <Tabs defaultValue="results" className="space-y-6">
              <TabsList>
                <TabsTrigger value="results">Resultados</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>
              
              <TabsContent value="results" className="space-y-6">
                {/* Controles de Seleção */}
                {movies.length > 0 && (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center space-x-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        className="flex items-center space-x-2"
                      >
                        {selectedMovies.size === movies.length ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        <span>
                          {selectedMovies.size === movies.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                        </span>
                      </Button>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedMovies.size} de {movies.length} selecionado(s)
                      </span>
                    </div>
                    
                    <Button
                      onClick={handleExportSelected}
                      disabled={selectedMovies.size === 0}
                      className="flex items-center space-x-2"
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('export.selected')}</span>
                    </Button>
                  </div>
                )}

                {/* Grid de Resultados */}
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
            /* Conteúdo para usuários não logados */
            <div className="space-y-6">
              {/* Grid de Resultados */}
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
    </div>
  );
};

export default Index;
