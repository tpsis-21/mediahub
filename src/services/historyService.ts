
import { MovieData } from './searchService';
import { apiRequest, getAuthToken, getCachedAuthUserRaw } from './apiClient';

export interface SearchHistoryItem {
  id: string;
  query: string;
  results: MovieData[];
  timestamp: number;
  type: 'individual' | 'bulk';
}

class HistoryService {
  private readonly storageKeyPrefix = 'search_history';
  private readonly maxItems = 10;

  private notifyUpdated(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('mediahub:historyUpdated'));
  }

  private getCurrentUserId(): string | null {
    const raw = getCachedAuthUserRaw();
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const record = parsed as Record<string, unknown>;
      const id = record.id as unknown;
      if (typeof id === 'string' && id.trim()) return id.trim();
      if (typeof id === 'number' && Number.isFinite(id) && id > 0) return String(id);
      return null;
    } catch {
      return null;
    }
  }

  private getScopedStorageKey(): string {
    const userId = this.getCurrentUserId();
    return userId ? `${this.storageKeyPrefix}:${userId}` : `${this.storageKeyPrefix}:guest`;
  }

  getHistory(): SearchHistoryItem[] {
    try {
      const stored = localStorage.getItem(this.getScopedStorageKey());
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      const items = Array.isArray(parsed) ? parsed : [];
      const normalized: SearchHistoryItem[] = items
        .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === 'object')
        .map((it): SearchHistoryItem | null => {
          const query = typeof it.query === 'string' ? it.query.trim() : '';
          const timestampRaw = typeof it.timestamp === 'number' ? it.timestamp : Number(it.timestamp);
          if (!query || !Number.isFinite(timestampRaw)) return null;

          const type = it.type === 'bulk' ? 'bulk' : 'individual';
          const results = Array.isArray(it.results) ? (it.results as MovieData[]) : [];
          const id = typeof it.id === 'string' && it.id.trim() ? it.id : String(Date.now());

          return { id, query, timestamp: Number(timestampRaw), type, results };
        })
        .filter((it): it is SearchHistoryItem => Boolean(it))
        .sort((a, b) => b.timestamp - a.timestamp);

      const trimmed = normalized.slice(0, this.maxItems);
      if (normalized.length !== trimmed.length) {
        localStorage.setItem(this.getScopedStorageKey(), JSON.stringify(trimmed));
        this.notifyUpdated();
      }

      return trimmed;
    } catch {
      return [];
    }
  }

  addToHistory(item: Omit<SearchHistoryItem, 'id' | 'timestamp'>): void {
    const history = this.getHistory();
    const queryKey = item.query.trim().toLowerCase();
    const nextHistory = history.filter((it) => {
      if (it.type !== item.type) return true;
      return it.query.trim().toLowerCase() !== queryKey;
    });
    const newItem: SearchHistoryItem = {
      ...item,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    const updatedHistory = [newItem, ...nextHistory].slice(0, this.maxItems);
    localStorage.setItem(this.getScopedStorageKey(), JSON.stringify(updatedHistory));
    this.notifyUpdated();

    if (getAuthToken()) {
      void apiRequest<void>({
        path: '/api/history',
        method: 'POST',
        auth: true,
        body: {
          query: newItem.query,
          results: newItem.results,
          type: newItem.type,
          timestamp: newItem.timestamp,
        },
      }).catch(() => undefined);
    }
  }

  clearHistory(): void {
    localStorage.removeItem(this.getScopedStorageKey());
    this.notifyUpdated();
  }

  async syncFromServer(): Promise<void> {
    if (!getAuthToken()) return;

    try {
      const payload = await apiRequest<{ items: Array<Omit<SearchHistoryItem, 'results'> & { results: unknown }> }>({
        path: '/api/history',
        auth: true,
      });

      const serverItems: SearchHistoryItem[] = payload.items
        .map((it): SearchHistoryItem => ({
          id: String(it.id),
          query: String(it.query),
          timestamp: Number(it.timestamp),
          type: it.type === 'bulk' ? 'bulk' : 'individual',
          results: Array.isArray(it.results) ? (it.results as MovieData[]) : [],
        }))
        .filter((it) => Number.isFinite(it.timestamp) && it.query.trim().length > 0);

      const local = this.getHistory();
      const merged = [...serverItems, ...local];
      const unique: SearchHistoryItem[] = [];
      const seen = new Set<string>();
      for (const it of merged.sort((a, b) => b.timestamp - a.timestamp)) {
        const key = `${it.type}:${it.query}:${it.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(it);
        if (unique.length >= this.maxItems) break;
      }

      localStorage.setItem(this.getScopedStorageKey(), JSON.stringify(unique));
      this.notifyUpdated();
    } catch {
      return;
    }
  }
}

export const historyService = new HistoryService();
