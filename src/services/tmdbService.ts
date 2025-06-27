
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
      console.warn('TMDB API Key não encontrada. Usando dados simulados.');
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
      return cached.data;
    }

    try {
      if (!this.apiKey) {
        // Retornar dados simulados baseados na query
        return this.getMockData(url);
      }

      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limit exceeded, aguardar e tentar novamente
        await delay(1000);
        return this.makeRequest(url);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Armazenar no cache
      cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('Erro na requisição TMDB:', error);
      throw error;
    }
  }

  private getMockData(url: string): SearchResult {
    // Extrair query da URL para simular resultados diferentes
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const query = urlParams.get('query') || '';
    const searchType = url.includes('/search/movie') ? 'movie' : 
                      url.includes('/search/tv') ? 'tv' : 'multi';

    const movieResults = [
      {
        id: Math.floor(Math.random() * 10000) + 1,
        title: `Filme: ${query}`,
        original_title: `Original: ${query}`,
        release_date: '2023-05-15',
        overview: `Sinopse simulada para o filme "${query}". Esta é uma descrição fictícia gerada para demonstração da funcionalidade de busca.`,
        poster_path: '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
        backdrop_path: '/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
        vote_average: Math.random() * 10,
        genre_ids: [12, 878, 28],
        media_type: 'movie' as const
      },
      {
        id: Math.floor(Math.random() * 10000) + 2,
        title: 'The Batman',
        original_title: 'The Batman',
        release_date: '2022-03-04',
        overview: 'Quando um assassino tem como alvo a elite de Gotham City com uma série de maquinações sádicas, uma trilha de pistas enigmáticas envia o maior detetive do mundo em uma investigação no submundo.',
        poster_path: '/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg',
        backdrop_path: '/qqHQsStV6exghCM7zbObuYBiYxw.jpg',
        vote_average: 7.8,
        genre_ids: [28, 80, 18],
        media_type: 'movie' as const
      }
    ];

    const tvResults = [
      {
        id: Math.floor(Math.random() * 10000) + 3,
        name: `Série: ${query}`,
        original_name: `Original Series: ${query}`,
        first_air_date: '2023-01-10',
        overview: `Sinopse simulada para a série "${query}". Esta é uma descrição fictícia gerada para demonstração da funcionalidade de busca.`,
        poster_path: '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
        backdrop_path: '/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
        vote_average: Math.random() * 10,
        genre_ids: [18, 10765, 9648],
        media_type: 'tv' as const
      },
      {
        id: Math.floor(Math.random() * 10000) + 4,
        name: 'Stranger Things',
        original_name: 'Stranger Things',
        first_air_date: '2016-07-15',
        overview: 'Quando um garoto desaparece, uma pequena cidade descobre um mistério envolvendo experimentos secretos, forças sobrenaturais aterrorizantes e uma garota muito estranha.',
        poster_path: '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
        backdrop_path: '/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
        vote_average: 8.7,
        genre_ids: [18, 10765, 9648],
        media_type: 'tv' as const
      }
    ];

    let results: MovieData[] = [];
    if (searchType === 'movie') {
      results = movieResults;
    } else if (searchType === 'tv') {
      results = tvResults;
    } else {
      results = [...movieResults, ...tvResults];
    }

    return {
      page: 1,
      total_pages: 1,
      total_results: results.length,
      results
    };
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
    return this.makeRequest(url);
  }

  async searchMovie(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    let url = `${this.baseURL}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${language}`;
    if (year) {
      url += `&year=${year}`;
    }
    return this.makeRequest(url);
  }

  async searchTV(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    let url = `${this.baseURL}/search/tv?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${language}`;
    if (year) {
      url += `&first_air_date_year=${year}`;
    }
    return this.makeRequest(url);
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
