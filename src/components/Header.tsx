
import React, { useState } from 'react';
import { Moon, Sun, Globe, User, LogOut, Search, Settings, UserCog, Menu, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import AuthModal from './AuthModal';
import AdminModal from './AdminModal';
import UserAreaModal from './UserAreaModal';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showUserAreaModal, setShowUserAreaModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { key: 'home', label: t('menu.home'), href: '#home' },
    { key: 'search', label: t('menu.search'), href: '#search' },
    { key: 'terms', label: t('menu.terms'), href: '#terms' },
    { key: 'privacy', label: t('menu.privacy'), href: '#privacy' }
  ];

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div 
              className="p-2 rounded-lg"
              style={{
                background: user?.brandColors 
                  ? `linear-gradient(135deg, ${user.brandColors.primary}, ${user.brandColors.secondary})`
                  : 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
              }}
            >
              {user?.brandLogo ? (
                <img src={user.brandLogo} alt="Logo" className="h-6 w-6 object-contain" />
              ) : (
                <Search className="h-6 w-6 text-white" />
              )}
            </div>
            <h1 
              className="text-xl font-bold bg-clip-text text-transparent"
              style={{
                backgroundImage: user?.brandColors 
                  ? `linear-gradient(135deg, ${user.brandColors.primary}, ${user.brandColors.secondary})`
                  : 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
              }}
            >
              {user?.brandName || t('app.title')}
            </h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {menuItems.map(item => (
              <a
                key={item.key}
                href={item.href}
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Controls */}
          <div className="flex items-center space-x-4">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>

            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
              className="hidden sm:flex items-center space-x-1 hover:bg-blue-50 dark:hover:bg-blue-900"
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
              className="hover:bg-blue-50 dark:hover:bg-blue-900"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>

            {/* Auth Section */}
            {user ? (
              <div className="hidden sm:flex items-center space-x-2">
                <div className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-300">
                  <User className="h-4 w-4" />
                  <span>{user.name}</span>
                  {user.type === 'admin' && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                      Admin
                    </span>
                  )}
                  {user.type === 'premium' && (
                    <span className="text-xs bg-gold-100 text-gold-800 px-2 py-1 rounded-full">
                      Premium
                    </span>
                  )}
                </div>
                
                {user.type === 'admin' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdminModal(true)}
                    className="flex items-center space-x-1 hover:bg-blue-50 dark:hover:bg-blue-900"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Admin</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUserAreaModal(true)}
                  className="flex items-center space-x-1 hover:bg-blue-50 dark:hover:bg-blue-900"
                >
                  <UserCog className="h-4 w-4" />
                  <span>{t('user.area')}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="flex items-center space-x-1 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-600"
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
                className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900"
              >
                {t('auth.login')}
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 py-4">
            <nav className="flex flex-col space-y-2">
              {menuItems.map(item => (
                <a
                  key={item.key}
                  href={item.href}
                  className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              
              {user && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                  <div className="flex items-center space-x-2 py-2">
                    <User className="h-4 w-4" />
                    <span className="text-sm">{user.name}</span>
                    {user.type === 'premium' && (
                      <span className="text-xs bg-gold-100 text-gold-800 px-2 py-1 rounded-full">
                        Premium
                      </span>
                    )}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowUserAreaModal(true);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full justify-start"
                  >
                    <UserCog className="h-4 w-4 mr-2" />
                    {t('user.area')}
                  </Button>
                  
                  {user.type === 'admin' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAdminModal(true);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Admin
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="w-full justify-start text-red-600 hover:text-red-700"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('auth.logout')}
                  </Button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
      
      {showAdminModal && (
        <AdminModal onClose={() => setShowAdminModal(false)} />
      )}
      
      {showUserAreaModal && (
        <UserAreaModal onClose={() => setShowUserAreaModal(false)} />
      )}
    </header>
  );
};

export default Header;
