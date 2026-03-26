
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  clearAuthToken,
  clearCachedAuthUser,
  getCachedAuthUserRaw,
  getAuthToken,
  setAuthToken,
  setCachedAuthUserRaw,
} from '../services/apiClient';
import { historyService } from '../services/historyService';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  website?: string;
  type: 'admin' | 'premium' | 'free';
  brandName?: string;
  brandColors?: {
    primary: string;
    secondary: string;
  };
  brandLogo?: string;
  telegramChatId?: string;
  brandNameChangedAt?: string;
  logoChangedAt?: string;
  brandChangeCount?: number;
  logoChangeCount?: number;
  subscriptionEnd?: string;
  isActive: boolean;
  dailySearches?: number;
  lastSearchDate?: string;
}

interface AuthContextType {
  user: User | null;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  updateUserDetailed: (
    updates: Partial<User> & { searchIntegrationKey?: string | null }
  ) => Promise<{ ok: boolean; message?: string }>;
  updateUser: (updates: Partial<User> & { searchIntegrationKey?: string | null }) => Promise<boolean>;
  isLoading: boolean;
  canSearch: () => boolean;
  incrementSearch: () => void;
  getDaysUntilExpiry: () => number;
  isNearExpiry: () => boolean;
  isPremiumActive: () => boolean;
  isPremiumExpired: () => boolean;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone: string;
  brandName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sanitizeUser = (input: User): User => {
  const record = input as unknown as Record<string, unknown>;
  if (!record || typeof record !== 'object') return input;
  const blockedKeys = Object.keys(record).filter((key) => /api_?key/i.test(key));
  if (blockedKeys.length === 0) return input;
  const next = { ...record };
  for (const key of blockedKeys) delete next[key];
  return next as unknown as User;
};

const parseCachedUser = (): User | null => {
  const raw = getCachedAuthUserRaw();
  if (!raw) return null;
  try {
  const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
  if (!(typeof record.id === 'string' || typeof record.id === 'number')) return null;
    if (typeof record.email !== 'string') return null;
    if (typeof record.name !== 'string') return null;
    const type = record.type;
    if (type !== 'admin' && type !== 'premium' && type !== 'free') return null;
    if (typeof record.isActive !== 'boolean') return null;
    return sanitizeUser(parsed as User);
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const cached = parseCachedUser();
    if (cached) setUser(cached);

    const token = getAuthToken();
    if (!token) {
      // Evita estado inconsistente: usuário em cache sem token válido.
      clearCachedAuthUser();
      setUser(null);
      setIsLoading(false);
      return;
    }

    apiRequest<{ user: User }>({ path: '/api/me', auth: true })
      .then(async (payload) => {
        const safeUser = sanitizeUser(payload.user);
        setUser(safeUser);
        setCachedAuthUserRaw(JSON.stringify(safeUser));
        await historyService.syncFromServer();
      })
      .catch((e) => {
        const status = typeof (e as ApiError)?.status === 'number' ? (e as ApiError).status : 0;
        const message = typeof (e as ApiError)?.message === 'string' ? (e as ApiError).message : 'Erro de sessão.';
        if (status === 401) {
          // Não fazer logout automático para evitar falsos positivos
          // Se o token for realmente inválido, o usuário será barrado nas ações
          console.warn('AuthContext: /api/me retornou 401. Mantendo sessão local se existir.', e);
          if (!parseCachedUser()) {
             // Se não tem cache e deu 401, aí sim limpamos
             clearAuthToken();
             clearCachedAuthUser();
             setUser(null);
          }
        } else {
          setAuthError(message);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const payload = await apiRequest<{ token: string; user: User }>({
        path: '/api/auth/login',
        method: 'POST',
        body: { email, password },
      });

      setAuthToken(payload.token);
      const safeUser = sanitizeUser(payload.user);
      setCachedAuthUserRaw(JSON.stringify(safeUser));
      setUser(safeUser);
      await historyService.syncFromServer();
      setIsLoading(false);
      return true;
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      setAuthError(message || 'Não foi possível concluir. Tente novamente.');
      setIsLoading(false);
      return false;
    }
  };

  const register = async (userData: RegisterData): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const payload = await apiRequest<{ token: string; user: User }>({
        path: '/api/auth/register',
        method: 'POST',
        body: userData,
      });

      setAuthToken(payload.token);
      const safeUser = sanitizeUser(payload.user);
      setCachedAuthUserRaw(JSON.stringify(safeUser));
      setUser(safeUser);
      await historyService.syncFromServer();
      setIsLoading(false);
      return true;
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      setAuthError(message || 'Não foi possível concluir. Tente novamente.');
      setIsLoading(false);
      return false;
    }
  };

  const updateUserDetailed = async (
    updates: Partial<User> & { searchIntegrationKey?: string | null }
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!user) return { ok: false, message: 'Não autenticado.' };
    setAuthError(null);
    setIsLoading(true);

    try {
      const payload = await apiRequest<{ user: User }>({ path: '/api/me', method: 'PUT', auth: true, body: updates });
      const safeUser = sanitizeUser(payload.user);
      setUser(safeUser);
      setCachedAuthUserRaw(JSON.stringify(safeUser));
      setIsLoading(false);
      return { ok: true };
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      const resolved = message || 'Não foi possível concluir. Tente novamente.';
      setAuthError(resolved);
      setIsLoading(false);
      return { ok: false, message: resolved };
    }
  };

  const updateUser = async (updates: Partial<User> & { searchIntegrationKey?: string | null }): Promise<boolean> => {
    const result = await updateUserDetailed(updates);
    return result.ok;
  };

  const logout = () => {
    setUser(null);
    setAuthError(null);
    clearAuthToken();
    clearCachedAuthUser();
  };

  const updateCachedUser = (updates: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...updates };
      setCachedAuthUserRaw(JSON.stringify(updated));
      return updated;
    });
  };

  const canSearch = (): boolean => {
    if (!user) {
      // Guest user - check daily limit
      const guestSearches = parseInt(localStorage.getItem('guestSearches') || '0');
      const lastSearchDate = localStorage.getItem('lastGuestSearchDate');
      const today = new Date().toDateString();
      
      if (lastSearchDate !== today) {
        localStorage.setItem('guestSearches', '0');
        localStorage.setItem('lastGuestSearchDate', today);
        return true;
      }
      
      return guestSearches < 3;
    }

    // Logged in users
    if (user.type === 'admin' || (user.type === 'premium' && user.isActive)) {
      return true;
    }

    // Free users have no daily limit, but no bulk features
    return true;
  };

  const incrementSearch = () => {
    if (!user) {
      // Guest user
      const guestSearches = parseInt(localStorage.getItem('guestSearches') || '0');
      localStorage.setItem('guestSearches', (guestSearches + 1).toString());
    } else {
      // Logged in user (cache local)
      const today = new Date().toDateString();
      if (user.lastSearchDate !== today) {
        updateCachedUser({ dailySearches: 1, lastSearchDate: today });
      } else {
        updateCachedUser({ dailySearches: (user.dailySearches || 0) + 1 });
      }
    }
  };

  const getDaysUntilExpiry = (): number => {
    if (!user?.subscriptionEnd) return Number.POSITIVE_INFINITY;
    const today = new Date();
    const expiryDate = new Date(user.subscriptionEnd);
    if (Number.isNaN(expiryDate.getTime())) return Number.POSITIVE_INFINITY;
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isNearExpiry = (): boolean => {
    const daysUntilExpiry = getDaysUntilExpiry();
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
  };

  const isPremiumExpired = (): boolean => {
    if (!user || user.type !== 'premium' || !user.isActive) return false;
    const daysUntilExpiry = getDaysUntilExpiry();
    return Number.isFinite(daysUntilExpiry) && daysUntilExpiry < 0;
  };

  const isPremiumActive = (): boolean => {
    if (!user) return false;
    if (user.type === 'admin') return true;
    if (user.type !== 'premium' || !user.isActive) return false;
    const daysUntilExpiry = getDaysUntilExpiry();
    return Number.isFinite(daysUntilExpiry) && daysUntilExpiry >= 0;
  };

  return (
    <AuthContext.Provider value={{
      user,
      authError,
      login,
      register,
      logout,
      updateUserDetailed,
      updateUser,
      isLoading,
      canSearch,
      incrementSearch,
      getDaysUntilExpiry,
      isNearExpiry,
      isPremiumActive,
      isPremiumExpired
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
