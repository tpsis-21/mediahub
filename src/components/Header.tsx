
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Globe, LogOut, Search, Settings, UserCog, Menu } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Separator } from './ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';

const AuthModal = lazy(() => import('./AuthModal'));
const UserAreaModal = lazy(() => import('./UserAreaModal'));

const Header: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { user, logout, isPremiumExpired } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserAreaModal, setShowUserAreaModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const openAuthModal = () => setShowAuthModal(true);
    const openAdminModal = () => navigate('/admin');
    const openUserAreaModal = () => setShowUserAreaModal(true);

    window.addEventListener('mediahub:openAuthModal', openAuthModal);
    window.addEventListener('mediahub:openAdminModal', openAdminModal);
    window.addEventListener('mediahub:openUserAreaModal', openUserAreaModal);

    return () => {
      window.removeEventListener('mediahub:openAuthModal', openAuthModal);
      window.removeEventListener('mediahub:openAdminModal', openAdminModal);
      window.removeEventListener('mediahub:openUserAreaModal', openUserAreaModal);
    };
  }, [navigate]);

  const menuItems = user
    ? [{ key: 'search', label: t('menu.search'), href: '/app' }]
    : [
      { key: 'home', label: t('menu.home'), href: '#home' },
      { key: 'features', label: t('menu.features'), href: '#features' },
      { key: 'pricing', label: t('menu.pricing'), href: '#pricing' },
      { key: 'faq', label: t('menu.faq'), href: '#faq' },
    ];

  const brandGradient = useMemo(() => {
    if (user?.brandColors) {
      return `linear-gradient(135deg, ${user.brandColors.primary}, ${user.brandColors.secondary})`;
    }
    return 'linear-gradient(135deg, #3b82f6, #8b5cf6)';
  }, [user?.brandColors]);

  const appGradient = 'linear-gradient(135deg, #2563eb, #7c3aed)';

  const userLogoInitials = useMemo(() => {
    const value = String(user?.brandName || user?.name || '').trim();
    if (!value) return 'U';
    const parts = value.split(/\s+/).filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((p) => p.slice(0, 1).toUpperCase())
      .join('');
    return letters || 'U';
  }, [user?.brandName, user?.name]);

  const userDisplayName = useMemo(() => {
    const brandName = typeof user?.brandName === 'string' ? user.brandName.trim() : '';
    const name = typeof user?.name === 'string' ? user.name.trim() : '';
    return brandName || name;
  }, [user?.brandName, user?.name]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <a href={user ? "/app" : "/"} className="flex items-center gap-3 min-w-0">
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarImage
                src={theme === 'dark' ? "/anexos/logo-of-mediahub-dark.png" : "/anexos/logo-of-mediahub.png"}
                alt={`${t('app.title')} - Logo da aplicação`}
                className="object-contain drop-shadow-sm"
              />
              <AvatarFallback style={{ background: appGradient }}>
                <Search className="h-4 w-4 text-white" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <span
                className="truncate text-base font-semibold bg-clip-text text-transparent"
                style={{ backgroundImage: appGradient }}
              >
                {t('app.title')}
              </span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {menuItems.map((item) => (
              <Button key={item.key} variant="ghost" asChild>
                <a href={item.href}>{item.label}</a>
              </Button>
            ))}
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={language === 'pt-BR' ? 'Abrir menu' : 'Open menu'}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[320px]">
                <SheetHeader>
                  <SheetTitle>{user?.brandName || t('app.title')}</SheetTitle>
                </SheetHeader>

                <div className="mt-6 flex flex-col gap-2">
                  {menuItems.map((item) => (
                    <Button
                      key={item.key}
                      variant="ghost"
                      className="justify-start"
                      asChild
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <a href={item.href}>{item.label}</a>
                    </Button>
                  ))}

                  <Separator className="my-2" />

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    {language === 'pt-BR' ? 'Português' : 'English'}
                  </Button>

                  <Button variant="ghost" className="justify-start" onClick={toggleTheme}>
                    {theme === 'light' ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
                    {t('theme.toggle')}
                  </Button>

                  <Separator className="my-2" />

                  {user ? (
                    <>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setShowUserAreaModal(true);
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <UserCog className="h-4 w-4 mr-2" />
                        {t('user.area')}
                      </Button>

                      {user.type === 'admin' && (
                        <Button
                          variant="ghost"
                          className="justify-start"
                          onClick={() => {
                            navigate('/admin');
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Admin
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        className="justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          logout();
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        {t('auth.logout')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => {
                        setShowAuthModal(true);
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      {t('auth.login')}
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Language Toggle */}
            <Button variant="ghost" size="icon" onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')} className="hidden sm:inline-flex">
              <Globe className="h-4 w-4" />
            </Button>

            {/* Theme Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t('theme.toggle')}>
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>

            {/* Auth Section */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="hidden sm:inline-flex items-center gap-2 rounded-full px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.brandLogo} alt={userDisplayName ? `Logo da marca ${userDisplayName}` : t('app.title')} />
                      <AvatarFallback style={{ background: brandGradient }} className="text-[11px] font-semibold text-white">
                        {userLogoInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[160px] truncate font-medium">{userDisplayName || t('app.title')}</span>
                    {user.type === 'admin' && <Badge variant="secondary" className="border border-destructive/30 text-destructive bg-destructive/10">Admin</Badge>}
                    {user.type === 'premium' && (
                      isPremiumExpired() ? (
                        <Badge variant="secondary" className="border border-destructive/30 text-destructive bg-destructive/10">Premium expirado</Badge>
                      ) : (
                        <Badge variant="secondary">Premium</Badge>
                      )
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col">
                    <span className="truncate">{userDisplayName || user.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowUserAreaModal(true)}>
                    <UserCog className="h-4 w-4 mr-2" />
                    {t('user.area')}
                  </DropdownMenuItem>
                  {user.type === 'admin' && (
                    <DropdownMenuItem onClick={() => navigate('/admin')}>
                      <Settings className="h-4 w-4 mr-2" />
                      Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button onClick={() => setShowAuthModal(true)} className="hidden sm:inline-flex">
                {t('auth.login')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        {showUserAreaModal && <UserAreaModal onClose={() => setShowUserAreaModal(false)} />}
      </Suspense>
    </header>
  );
};

export default Header;
