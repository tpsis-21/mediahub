
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import SearchForm from "../components/SearchForm";
import MovieCard from "../components/MovieCard";
import SearchHistory from "../components/SearchHistory";
import SearchInstructions from "../components/SearchInstructions";
import ExpiryNotice from "../components/ExpiryNotice";
import TermsModal from "../components/TermsModal";
import { useToast } from "../hooks/use-toast";
import { MovieData } from "../services/tmdbService";

const Index = () => {
  const { user, canSearch, incrementSearch } = useAuth();
  const { toast } = useToast();
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const handleSearch = async (query: string, searchType: string) => {
    if (!canSearch()) {
      toast({
        title: "Limite atingido",
        description: user ? "Sua conta não está ativa" : "Visitantes podem fazer apenas 3 buscas por dia. Faça login para mais recursos.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/${searchType}?api_key=${localStorage.getItem('tmdb_api_key') || '4e44d9029b1270a757cddc766a1bcb63'}&language=pt-BR&query=${encodeURIComponent(query)}`
      );
      
      if (!response.ok) {
        throw new Error('Erro na busca');
      }
      
      const data = await response.json();
      setMovies(data.results || []);
      incrementSearch();
      
      if (data.results?.length === 0) {
        toast({
          title: "Nenhum resultado",
          description: "Tente com outros termos de busca.",
        });
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      toast({
        title: "Erro na busca",
        description: "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemSelect = (id: number, selected: boolean) => {
    const newSelected = new Set(selectedItems);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedItems(newSelected);
  };

  const getSelectedMovies = () => {
    return movies.filter(movie => selectedItems.has(movie.id));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div id="home" className="mb-8">
          <ExpiryNotice />
          <SearchInstructions />
        </div>
        
        <div id="search" className="mb-8">
          <SearchForm 
            onSearch={handleSearch} 
            selectedItems={getSelectedMovies()}
            canUseBulkFeatures={user?.type === 'premium' || user?.type === 'admin'}
          />
        </div>

        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {movies.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Resultados da Busca</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {movies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onSelect={handleItemSelect}
                  isSelected={selectedItems.has(movie.id)}
                  canUsePremiumFeatures={user?.type === 'premium' || user?.type === 'admin'}
                />
              ))}
            </div>
          </div>
        )}

        <SearchHistory />

        {/* Terms and Privacy sections */}
        <div id="terms" className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <button
              onClick={() => setShowTermsModal(true)}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              Ver Termos de Uso e Política de Privacidade
            </button>
          </div>
        </div>
      </main>

      {showTermsModal && (
        <TermsModal onClose={() => setShowTermsModal(false)} />
      )}
    </div>
  );
};

export default Index;
