
import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  type: 'admin' | 'premium' | 'free';
  brandName?: string;
  brandColors?: {
    primary: string;
    secondary: string;
  };
  brandLogo?: string;
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
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isLoading: boolean;
  canSearch: () => boolean;
  incrementSearch: () => void;
  getDaysUntilExpiry: () => number;
  isNearExpiry: () => boolean;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone: string;
  brandName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      // Check if subscription is expired
      if (userData.subscriptionEnd) {
        const isExpired = new Date() > new Date(userData.subscriptionEnd);
        userData.isActive = !isExpired;
        if (isExpired && userData.type === 'premium') {
          userData.type = 'free';
        }
      }
      setUser(userData);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (email && password) {
      let userType: 'admin' | 'premium' | 'free' = 'free';
      let subscriptionEnd;
      
      if (email === 'admin@capturecapas.com') {
        userType = 'admin';
      } else if (email.includes('premium')) {
        userType = 'premium';
        // Set subscription end to 30 days from now for demo
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        subscriptionEnd = endDate.toISOString();
      }

      const user: User = { 
        id: email === 'admin@capturecapas.com' ? 'admin' : Date.now().toString(), 
        email, 
        name: email.split('@')[0],
        type: userType,
        isActive: true,
        subscriptionEnd,
        dailySearches: 0,
        lastSearchDate: new Date().toDateString()
      };
      
      setUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      setIsLoading(false);
      return true;
    }
    setIsLoading(false);
    return false;
  };

  const register = async (userData: RegisterData): Promise<boolean> => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (userData.email && userData.password && userData.name && userData.brandName) {
      const user: User = { 
        id: Date.now().toString(), 
        email: userData.email, 
        name: userData.name,
        phone: userData.phone,
        type: 'free',
        brandName: userData.brandName,
        brandColors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6'
        },
        isActive: true,
        brandChangeCount: 0,
        logoChangeCount: 0,
        dailySearches: 0,
        lastSearchDate: new Date().toDateString()
      };
      setUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      setIsLoading(false);
      return true;
    }
    setIsLoading(false);
    return false;
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
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
      // Logged in user
      const today = new Date().toDateString();
      if (user.lastSearchDate !== today) {
        updateUser({ dailySearches: 1, lastSearchDate: today });
      } else {
        updateUser({ dailySearches: (user.dailySearches || 0) + 1 });
      }
    }
  };

  const getDaysUntilExpiry = (): number => {
    if (!user?.subscriptionEnd) return -1;
    const today = new Date();
    const expiryDate = new Date(user.subscriptionEnd);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isNearExpiry = (): boolean => {
    const daysUntilExpiry = getDaysUntilExpiry();
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      register, 
      logout, 
      updateUser, 
      isLoading,
      canSearch,
      incrementSearch,
      getDaysUntilExpiry,
      isNearExpiry
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
