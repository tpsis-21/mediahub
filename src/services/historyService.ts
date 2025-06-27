
import { MovieData } from './tmdbService';

export interface SearchHistoryItem {
  id: string;
  query: string;
  results: MovieData[];
  timestamp: number;
  type: 'individual' | 'bulk';
}

class HistoryService {
  private readonly storageKey = 'search_history';

  getHistory(): SearchHistoryItem[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  addToHistory(item: Omit<SearchHistoryItem, 'id' | 'timestamp'>): void {
    const history = this.getHistory();
    const newItem: SearchHistoryItem = {
      ...item,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    // Manter apenas os últimos 50 itens
    const updatedHistory = [newItem, ...history].slice(0, 50);
    localStorage.setItem(this.storageKey, JSON.stringify(updatedHistory));
  }

  clearHistory(): void {
    localStorage.removeItem(this.storageKey);
  }
}

export const historyService = new HistoryService();
