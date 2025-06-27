
import React, { useState } from 'react';
import { Moon, Sun, Globe, User, LogOut, Search } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import AuthModal from './AuthModal';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <Search className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('app.title')}
            </h1>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-4">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
              className="flex items-center space-x-1"
            >
              <Globe className="h-4 w-4" />
              <span className="text-sm">{language === 'pt-BR' ? 'PT' : 'EN'}</span>
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={t('theme.toggle')}
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>

            {/* Auth Section */}
            {user ? (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
                  <User className="h-4 w-4" />
                  <span>{user.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="flex items-center space-x-1"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t('auth.logout')}</span>
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAuthModal(true)}
              >
                {t('auth.login')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </header>
  );
};

export default Header;
