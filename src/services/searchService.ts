import { apiRequest } from './apiClient';

interface CacheItem {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheItem>();
const CACHE_DURATION = 5 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 250;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const hasResultsArray = (value: unknown): value is UnknownRecord & { results: unknown[] } =>
  isRecord(value) && Array.isArray(value.results);

export interface MovieData {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  name?: string;
  original_name?: string;
  first_air_date?: string;
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

export type SearchVideo = {
  key: string;
  name: string;
  type?: string;
  site?: string;
};

export type SearchVideosResponse = {
  results?: SearchVideo[];
};

export type MediaType = 'movie' | 'tv' | 'multi';

class SearchService {
  private async makeRequest<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    const cacheUrl = new URL('http://local');
    cacheUrl.pathname = path;
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v.trim().length > 0) cacheUrl.searchParams.set(k, v);
      if (typeof v === 'number' && Number.isFinite(v)) cacheUrl.searchParams.set(k, String(v));
    }

    const cacheKey = cacheUrl.toString();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data as T;
    }

    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v.trim().length > 0) query.set(k, v);
      if (typeof v === 'number' && Number.isFinite(v)) query.set(k, String(v));
    }

    let data: unknown = await apiRequest<T>({
      path: `${path}?${query.toString()}`,
      auth: true,
    });

    if (hasResultsArray(data)) {
      const normalizedResults = data.results.map((item) => {
        if (!isRecord(item)) return item;

        const mediaType = typeof item.media_type === 'string' ? item.media_type : undefined;
        if (mediaType) return item;

        const hasMovieFields = typeof item.title === 'string' || typeof item.release_date === 'string';
        const hasTvFields = typeof item.name === 'string' || typeof item.first_air_date === 'string';

        if (hasMovieFields) return { ...item, media_type: 'movie' };
        if (hasTvFields) return { ...item, media_type: 'tv' };
        return item;
      });

      data = { ...data, results: normalizedResults };
    }

    cache.set(cacheKey, { data, timestamp: Date.now() });

    return data as T;
  }

  async searchByType(query: string, mediaType: MediaType, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    if (mediaType === 'multi') {
      return this.searchMulti(query, language);
    }
    if (mediaType === 'movie') {
      return this.searchMovie(query, year, language);
    }
    return this.searchTV(query, year, language);
  }

  async searchMulti(query: string, language: string = 'pt-BR'): Promise<SearchResult> {
    type MultiSearchResult = Omit<SearchResult, 'results'> & { results: Array<MovieData | { media_type?: unknown }> };

    const result = await this.makeRequest<MultiSearchResult>('/api/search/query', {
      type: 'multi',
      query,
      language,
    });
    const filteredResults = result.results.filter((item): item is MovieData => item.media_type === 'movie' || item.media_type === 'tv');

    return { ...result, results: filteredResults };
  }

  async searchMovie(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    const result = await this.makeRequest<SearchResult>('/api/search/query', {
      type: 'movie',
      query,
      language,
      year,
    });

    return {
      ...result,
      results: result.results.map((item) => ({
        ...item,
        media_type: 'movie',
      })),
    };
  }

  async searchTV(query: string, year?: string, language: string = 'pt-BR'): Promise<SearchResult> {
    const result = await this.makeRequest<SearchResult>('/api/search/query', {
      type: 'tv',
      query,
      language,
      year,
    });

    return {
      ...result,
      results: result.results.map((item) => ({
        ...item,
        media_type: 'tv',
      })),
    };
  }

  async getVideos(mediaType: MovieData['media_type'], id: number, language: string = 'pt-BR'): Promise<SearchVideosResponse> {
    return this.makeRequest<SearchVideosResponse>('/api/search/videos', {
      mediaType,
      id,
      language,
    });
  }

  parseSearchQuery(query: string): { title: string; year?: string } {
    const patterns = [/^(.+?)\s*\((\d{4})\)$/, /^(.+?)\s*-\s*(\d{4})$/, /^(.+?)\s+(\d{4})$/];

    for (const pattern of patterns) {
      const match = query.trim().match(pattern);
      if (match) {
        return { title: match[1].trim(), year: match[2] };
      }
    }

    return { title: query.trim() };
  }
}

export const searchService = new SearchService();
