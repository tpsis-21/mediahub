
// Cache simples em memória
const cache = new Map<string, any>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

interface CacheItem {
  data: any;
  timestamp: number;
}

// Rate limiting simples
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 250; // 250ms entre requests

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface MovieData {
  id: number;
  title?: string; // Para filmes
  original_title?: string; // Para filmes
  release_date?: string; // Para filmes
  name?: string; // Para séries
  original_name?: string; // Para séries
  first_air_date?: string; // Para séries
  overview: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  genre_ids: number[];
  media_type: 'movie' | 'tv';
}

export interface SearchResult {
  page: number;
  results: MovieData[];
  total_pages: number;
  total_results: number;
}

export type MediaType = 'movie' | 'tv' | 'multi';

class TMDBService {
  private readonly baseURL = 'https://api.themoviedb.org/3';
  private readonly imageBaseURL = 'https://image.tmdb.org/t/p/w500';
  private readonly apiKey = import.meta.env.VITE_TMDB_API_KEY;

  constructor() {
    if (!this.apiKey) {
      console.warn('TMDB API Key não encontrada. Configure VITE_TMDB_API_KEY no ambiente.');
    }
  }

  private async makeRequest(url: string): Promise<any> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    // Verificar cache
    const cacheKey = url;
    const cached = cache.get(cacheKey) as CacheItem;
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('Usando cache para:', url);
      return cached.data;
    }

    try {
      if (!this.apiKey) {
        throw new Error('TMDB API Key não configurada. Configure VITE_TMDB_API_KEY no ambiente.');
      }

      console.log('Fazendo requisição para:', url);
      const response = await fetch(url);
      
      if (response.status === 429) {
        console.log('Rate limit atingido, aguardando...');
        await delay(1000);
        return this.makeRequest(url);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Normalizar dados para garantir que tenham media_type
      if (data.results) {
        data.results = data.results.map((item: any) => {
          // Se não tem media_type, determinar baseado na presença de campos específicos
          if (!item.media_type) {
            if (item.title || item.release_date) {
              item.media_type = 'movie';
            } else if (item.name || item.first_air_date) {
              item.media_type = 'tv';
            }
          }
          return item;
        });
      }
      
      // Armazenar no cache
      cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('Erro na requisição TMDB:', error);
      throw error;
    }
  }

  async searchByType(query: string, mediaType: MediaType, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    if (mediaType === 'multi') {
      return this.searchMulti(query, language);
    } else if (mediaType === 'movie') {
      return this.searchMovie(query, year, language);
    } else {
      return this.searchTV(query, year, language);
    }
  }

  async searchMulti(query: string, language: string = 'pt-BR'): Promise<SearchResult> {
    const url = `${this.baseURL}/search/multi?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${language}`;
    const result = await this.makeRequest(url);
    
    // Filtrar apenas filmes e séries
    result.results = result.results.filter((item: any) => 
      item.media_type === 'movie' || item.media_type === 'tv'
    );
    
    return result;
  }

  async searchMovie(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    let url = `${this.baseURL}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${language}`;
    if (year) {
      url += `&year=${year}`;
    }
    const result = await this.makeRequest(url);
    
    // Garantir que todos os resultados tenham media_type
    result.results = result.results.map((item: any) => ({
      ...item,
      media_type: 'movie'
    }));
    
    return result;
  }

  async searchTV(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    let url = `${this.baseURL}/search/tv?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${language}`;
    if (year) {
      url += `&first_air_date_year=${year}`;
    }
    const result = await this.makeRequest(url);
    
    // Garantir que todos os resultados tenham media_type
    result.results = result.results.map((item: any) => ({
      ...item,
      media_type: 'tv'
    }));
    
    return result;
  }

  getImageURL(path: string): string {
    if (!path) return '/placeholder.svg';
    return `${this.imageBaseURL}${path}`;
  }

  parseSearchQuery(query: string): { title: string; year?: string } {
    // Formatos suportados: "Nome (Ano)", "Nome - Ano", "Nome Ano", "Nome"
    const patterns = [
      /^(.+?)\s*\((\d{4})\)$/,  // Nome (Ano)
      /^(.+?)\s*-\s*(\d{4})$/,  // Nome - Ano
      /^(.+?)\s+(\d{4})$/,      // Nome Ano
    ];

    for (const pattern of patterns) {
      const match = query.trim().match(pattern);
      if (match) {
        return { title: match[1].trim(), year: match[2] };
      }
    }

    return { title: query.trim() };
  }
}

export const tmdbService = new TMDBService();
