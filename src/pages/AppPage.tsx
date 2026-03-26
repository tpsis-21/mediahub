import { Suspense, lazy, useEffect, useState, useMemo, Component, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Download, Loader2, Moon, Sun, Settings, LogOut, UserCog, ShieldCheck, Sparkles } from "lucide-react";

import SearchForm from "../components/SearchForm";
import MovieCard from "../components/MovieCard";
import SearchHistory from "../components/SearchHistory";
import ExpiryNotice from "../components/ExpiryNotice";
import TermsModal from "../components/TermsModal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ToastAction } from "../components/ui/toast";
import { useToast } from "../hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useI18n } from "../contexts/I18nContext";
import { getSearchConfigToastCopy, isSearchConfigErrorMessage } from "../lib/utils";
import { historyService, SearchHistoryItem } from "../services/historyService";
import { MovieData, MediaType, searchService } from "../services/searchService";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "../components/ui/sidebar";
import { Separator } from "../components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { AppSidebar } from "../components/AppSidebar";

const BulkBannerModal = lazy(() => import("../components/BulkBannerModal"));
const AuthModal = lazy(() => import("../components/AuthModal"));
const UserAreaModal = lazy(() => import("../components/UserAreaModal"));
const SupportModal = lazy(() => import("../components/SupportModal"));
const FootballBannerModal = lazy(() => import("../components/FootballBannerModal"));

type SearchResultGroup = {
  label: string;
  results: MovieData[];
};

type BulkSearchSummary = {
  submittedLines: number;
  validLines: number;
  withResults: number;
  withoutResults: number;
};

class ModalErrorBoundary extends Component<{ onReset: () => void; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("modal_error_boundary", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Não foi possível abrir este recurso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tente recarregar a página. Se continuar, faça logout e login novamente.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={this.props.onReset}>
                Fechar
              </Button>
              <Button type="button" onClick={() => window.location.reload()}>
                Recarregar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

const AppPage = () => {
  const navigate = useNavigate();
  const { user, canSearch, incrementSearch, isLoading: authLoading, logout, isPremiumActive, isPremiumExpired } = useAuth();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();

  const [movies, setMovies] = useState<MovieData[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showBulkBannerModal, setShowBulkBannerModal] = useState(false);
  const [showTop10BannerModal, setShowTop10BannerModal] = useState(false);
  const [showFootballBannerModal, setShowFootballBannerModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [searchResultGroups, setSearchResultGroups] = useState<SearchResultGroup[]>([]);
  const [lastSearchType, setLastSearchType] = useState<"individual" | "bulk" | null>(null);
  const [bulkSearchSummary, setBulkSearchSummary] = useState<BulkSearchSummary | null>(null);

  // Modals state (moved from Header)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserAreaModal, setShowUserAreaModal] = useState(false);

  const isPremiumUser = isPremiumActive();
  const closeAllModals = () => {
    setShowBulkBannerModal(false);
    setShowTop10BannerModal(false);
    setShowFootballBannerModal(false);
    setShowSupportModal(false);
    setShowAuthModal(false);
    setShowUserAreaModal(false);
  };

  useEffect(() => {
    if (!user && !authLoading) {
      navigate("/", { replace: true });
      return;
    }
    if (!user) return;

    setSearchHistory(historyService.getHistory());
    const handleHistoryUpdated = () => setSearchHistory(historyService.getHistory());
    window.addEventListener("mediahub:historyUpdated", handleHistoryUpdated);
    return () => window.removeEventListener("mediahub:historyUpdated", handleHistoryUpdated);
  }, [user, authLoading, navigate]);

  // Listeners for global modals
  useEffect(() => {
    const openAuthModal = () => setShowAuthModal(true);
    const openAdminModal = () => navigate("/admin");
    const openUserAreaModal = () => setShowUserAreaModal(true);

    window.addEventListener("mediahub:openAuthModal", openAuthModal);
    window.addEventListener("mediahub:openAdminModal", openAdminModal);
    window.addEventListener("mediahub:openUserAreaModal", openUserAreaModal);
    const openTop10BannerModal = () => {
      if (!isPremiumUser) {
        toast({
          title: isPremiumExpired() ? "Assinatura expirada" : "Recurso Premium",
          description: isPremiumExpired()
            ? "Gerar Top 10 está indisponível porque sua assinatura Premium expirou."
            : "Gerar Top 10 está disponível apenas para contas Premium.",
          variant: "destructive",
          action: (
            <ToastAction altText="Ver plano" onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}>
              Ver plano
            </ToastAction>
          ),
        });
        return;
      }
      setShowTop10BannerModal(true);
    };
    window.addEventListener("mediahub:openTop10BannerModal", openTop10BannerModal);
    const openFootballBannerModal = () => {
      if (!isPremiumUser) {
        toast({
          title: isPremiumExpired() ? "Assinatura expirada" : "Recurso Premium",
          description: isPremiumExpired()
            ? "Gerar Banner de Futebol está indisponível porque sua assinatura Premium expirou."
            : "Gerar Banner de Futebol está disponível apenas para contas Premium.",
          variant: "destructive",
          action: (
            <ToastAction altText="Ver plano" onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}>
              Ver plano
            </ToastAction>
          ),
        });
        return;
      }
      setShowFootballBannerModal(true);
    };
    window.addEventListener("mediahub:openFootballBannerModal", openFootballBannerModal);
    const openSupportModal = () => setShowSupportModal(true);
    window.addEventListener("mediahub:openSupportModal", openSupportModal);

    return () => {
      window.removeEventListener("mediahub:openAuthModal", openAuthModal);
      window.removeEventListener("mediahub:openAdminModal", openAdminModal);
      window.removeEventListener("mediahub:openUserAreaModal", openUserAreaModal);
      window.removeEventListener("mediahub:openTop10BannerModal", openTop10BannerModal);
      window.removeEventListener("mediahub:openFootballBannerModal", openFootballBannerModal);
      window.removeEventListener("mediahub:openSupportModal", openSupportModal);
    };
  }, [isPremiumExpired, isPremiumUser, navigate, toast]);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    return "Verifique sua conexão e tente novamente.";
  };

  const openSearchConfig = () => {
    if (!user) {
      window.dispatchEvent(new Event("mediahub:openAuthModal"));
      return;
    }

    if (user.type === "admin") {
      navigate("/admin");
      return;
    }

    window.dispatchEvent(new Event("mediahub:openUserAreaModal"));
  };

  const openAuth = () => {
    window.dispatchEvent(new Event("mediahub:openAuthModal"));
  };

  const openUserArea = () => {
    if (!user) {
      openAuth();
      return;
    }
    if (user.type === "admin") {
      navigate("/admin");
      return;
    }
    window.dispatchEvent(new Event("mediahub:openUserAreaModal"));
  };

  const brandGradient = useMemo(() => {
    if (user?.brandColors) {
      return `linear-gradient(135deg, ${user.brandColors.primary}, ${user.brandColors.secondary})`;
    }
    return "linear-gradient(135deg, #3b82f6, #8b5cf6)";
  }, [user?.brandColors]);

  const userLogoInitials = useMemo(() => {
    const value = String(user?.brandName || user?.name || "").trim();
    if (!value) return "U";
    const parts = value.split(/\s+/).filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((p) => p.slice(0, 1).toUpperCase())
      .join("");
    return letters || "U";
  }, [user?.brandName, user?.name]);

  const userDisplayName = useMemo(() => {
    const brandName = typeof user?.brandName === "string" ? user.brandName.trim() : "";
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    return brandName || name;
  }, [user?.brandName, user?.name]);

  const toastPremiumRequired = (featureLabel: string) => {
    if (!user) {
      toast({
        title: "Login necessário",
        description: `${featureLabel} é um recurso Premium. Faça login para continuar.`,
        variant: "destructive",
        action: (
          <ToastAction altText="Fazer login" onClick={() => window.dispatchEvent(new Event("mediahub:openAuthModal"))}>
            Fazer login
          </ToastAction>
        ),
      });
      return;
    }

    if (isPremiumExpired()) {
      toast({
        title: "Assinatura expirada",
        description: `${featureLabel} está indisponível porque sua assinatura Premium expirou.`,
        variant: "destructive",
        action: (
          <ToastAction altText="Ver plano" onClick={openUserArea}>
            Ver plano
          </ToastAction>
        ),
      });
      return;
    }

    toast({
      title: "Recurso Premium",
      description: `${featureLabel} está disponível apenas para contas Premium.`,
      variant: "destructive",
      action: (
        <ToastAction altText="Ver Premium" onClick={openUserArea}>
          Ver Premium
        </ToastAction>
      ),
    });
  };

  const toastLoginRequired = (activityLabel: string) => {
    toast({
      title: "Login necessário",
      description: `Para ${activityLabel}, crie uma conta ou faça login.`,
      variant: "destructive",
      action: (
        <ToastAction altText="Fazer login" onClick={() => window.dispatchEvent(new Event("mediahub:openAuthModal"))}>
          Fazer login
        </ToastAction>
      ),
    });
  };

  const handleSearch = async (queries: string[], type: "individual" | "bulk", mediaType: MediaType) => {
    if (!user) {
      toastLoginRequired("fazer buscas");
      return;
    }

    if (type === "bulk" && !isPremiumUser) {
      toastPremiumRequired("Busca em massa");
      return;
    }

    if (!canSearch()) {
      toast({
        title: "Limite atingido",
        description: "Sua conta não está ativa",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSelectedItems(new Set());
    setMovies([]);
    setSearchResultGroups([]);
    setLastSearchType(type);
    setBulkSearchSummary(null);
    try {
      let allResults: MovieData[] = [];
      const nextGroups: SearchResultGroup[] = [];
      const normalizedQueries = queries
        .map((query) => searchService.parseSearchQuery(query))
        .filter((item) => item.title.trim().length > 0);

      if (normalizedQueries.length === 0) {
        toast({
          title: "Lista inválida",
          description: "Não encontrei títulos válidos. Removi emojis/numeração, mas nenhum título sobrou para buscar.",
          variant: "destructive",
        });
        return;
      }

      for (const { title, year } of normalizedQueries) {
        const data = await searchService.searchByType(title, mediaType, year, "pt-BR");
        const uniquePerTerm = data.results.filter((movie, index, self) => index === self.findIndex((m) => m.id === movie.id));
        const label = year ? `${title} (${year})` : title;
        nextGroups.push({ label, results: uniquePerTerm });
        allResults = [...allResults, ...uniquePerTerm];
      }

      const uniqueResults = allResults.filter((movie, index, self) => index === self.findIndex((m) => m.id === movie.id));
      const withResults = nextGroups.filter((group) => group.results.length > 0).length;
      const withoutResults = nextGroups.length - withResults;

      setMovies(uniqueResults);
      setSearchResultGroups(nextGroups);
      if (type === "bulk") {
        setBulkSearchSummary({
          submittedLines: queries.length,
          validLines: normalizedQueries.length,
          withResults,
          withoutResults,
        });
      }
      incrementSearch();

      historyService.addToHistory({
        query: queries.join(", "),
        results: uniqueResults,
        type: type,
      });
      setSearchHistory(historyService.getHistory());

      if (uniqueResults.length === 0) {
        toast({
          title: "Nenhum resultado",
          description: "Tente com outros termos de busca.",
        });
      }
    } catch (error) {
      const message = getErrorMessage(error);

      if (message === "Não autenticado.") {
        // Não faz logout automático para evitar perda de sessão por erro temporário
        toastLoginRequired("fazer buscas");
        return;
      }

      if (isSearchConfigErrorMessage(message)) {
        const { title, description, actionLabel } = getSearchConfigToastCopy({
          rawMessage: message,
          isLoggedIn: Boolean(user),
          isAdmin: user?.type === "admin",
        });
        toast({
          title,
          description,
          variant: "destructive",
          action: (
            <ToastAction altText={actionLabel} onClick={openSearchConfig}>
              {actionLabel}
            </ToastAction>
          ),
        });
        return;
      }

      toast({
        title: "Erro na busca",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemToggleSelect = (movieId: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(movieId)) {
      newSelected.delete(movieId);
    } else {
      newSelected.add(movieId);
    }
    setSelectedItems(newSelected);
  };

  const handleHistoryRerun = async (item: SearchHistoryItem) => {
    const queries = item.query.split(", ").filter((q) => q.trim());
    await handleSearch(queries, item.type, "multi");
  };

  const handleHistoryRefresh = () => {
    setSearchHistory(historyService.getHistory());
  };

  const getSelectedMovies = () => movies.filter((movie) => selectedItems.has(movie.id));

  const handleDownloadSelectedCovers = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "Aviso",
        description: "Selecione pelo menos um item para baixar",
        variant: "destructive",
        action: null,
      });
      return;
    }

    if (!user || !isPremiumUser) {
      toast({
        title: "Recurso Premium",
        description: "O download em lote está disponível apenas para usuários premium",
        variant: "destructive",
        action: null,
      });
      return;
    }

    try {
      toast({
        title: "Iniciando download...",
        description: `Preparando ${selectedItems.size} itens. Isso pode levar alguns minutos.`,
        action: null,
      });

      const { exportService } = await import("../services/exportService");
      await exportService.downloadSelectedCovers(getSelectedMovies());

      toast({
        title: "Sucesso!",
        description: `${selectedItems.size} itens baixados com sucesso!`,
        action: null,
      });
    } catch (error) {
      toast({
        title: "Erro no Download",
        description: error instanceof Error ? error.message : "Erro ao baixar itens selecionados. Tente novamente.",
        variant: "destructive",
        action: null,
      });
    }
  };

  const handleOpenTop10Banner = () => {
    if (!isPremiumUser) {
      toastPremiumRequired("Gerar Top 10");
      return;
    }
    setShowTop10BannerModal(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Carregando sessão...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 justify-between">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Plataforma</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Gerar Media VOD</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2 px-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            
            <div className="flex items-center gap-2">
              {user?.type === "free" && <Badge variant="secondary">Conta Free</Badge>}
              {user?.type === "premium" && (
                isPremiumExpired() ? (
                  <Badge variant="destructive">Premium expirado</Badge>
                ) : (
                  <Badge>Premium</Badge>
                )
              )}
              {user?.type === "admin" && <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Admin</Badge>}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.brandLogo} alt={userDisplayName} />
                    <AvatarFallback style={{ background: brandGradient }} className="text-[10px] text-white font-bold">
                      {userLogoInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userDisplayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("mediahub:openUserAreaModal"))}>
                  <UserCog className="mr-2 h-4 w-4" />
                  <span>{t("user.area")}</span>
                </DropdownMenuItem>
                {user?.type === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    <span>Admin</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t("auth.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="px-4 pt-4">
          <ExpiryNotice />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <main className="w-full max-w-7xl mx-auto py-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Olá, {user?.name?.split(' ')[0] || 'Visitante'}</h1>
                <p className="text-muted-foreground mt-2">
                  Utilize o menu lateral para acessar as funcionalidades. Digite o nome do filme ou série abaixo para gerar materiais.
                </p>
              </div>
            </div>

            <section id="search" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  {!isPremiumUser && <Badge variant="secondary">Premium</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Resultados são substituídos a cada busca</p>
              </div>

              <SearchForm
                onSearch={handleSearch}
                isLoading={isLoading}
                bulkEnabled={isPremiumUser}
                onBlockedBulk={() => toastPremiumRequired("Busca em massa")}
              />

              {isLoading && (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Buscando…</span>
                </div>
              )}
            </section>

            {movies.length > 0 && (
              <section aria-labelledby="search-results">
                <Card className="glass-effect">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle id="search-results">Resultados da busca</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {movies.length} {movies.length === 1 ? "item encontrado" : "itens encontrados"}
                      </p>
                    </div>

                    {selectedItems.size > 0 && (
                      <div className="flex items-center gap-2">
                        {!isPremiumUser && <Badge variant="secondary">Premium</Badge>}
                        {isPremiumUser && (
                          <Button type="button" variant="outline" onClick={() => setShowBulkBannerModal(true)}>
                            Gerar banners ({selectedItems.size})
                          </Button>
                        )}
                        <Button onClick={handleDownloadSelectedCovers} disabled={!isPremiumUser} className="gap-2">
                          <Download className="h-4 w-4" />
                          Baixar ({selectedItems.size})
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {lastSearchType === "bulk" && searchResultGroups.length > 0 ? (
                      <div className="space-y-6">
                        <p className="text-sm text-muted-foreground">
                          Cada linha da busca em massa é tratada como 1 conteúdo. Os resultados ficam separados por termo.
                        </p>
                        {bulkSearchSummary && (
                          <p className="text-sm text-muted-foreground">
                            Resumo: {bulkSearchSummary.submittedLines} linhas enviadas, {bulkSearchSummary.validLines} reconhecidas,{" "}
                            {bulkSearchSummary.withResults} com resultado e {bulkSearchSummary.withoutResults} sem resultado.
                          </p>
                        )}
                        {searchResultGroups.map((group, index) => (
                          <div key={`${group.label}-${index}`} className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{`Termo ${index + 1}`}</Badge>
                              <span className="font-medium">{group.label}</span>
                              <span className="text-sm text-muted-foreground">
                                {group.results.length} {group.results.length === 1 ? "resultado" : "resultados"}
                              </span>
                            </div>
                            {group.results.length > 0 ? (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {group.results.map((movie) => (
                                  <MovieCard
                                    key={`${group.label}-${movie.id}`}
                                    movie={movie}
                                    onToggleSelect={() => handleItemToggleSelect(movie.id)}
                                    isSelected={selectedItems.has(movie.id)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Sem resultados para este termo.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {movies.map((movie) => (
                          <MovieCard
                            key={movie.id}
                            movie={movie}
                            onToggleSelect={() => handleItemToggleSelect(movie.id)}
                            isSelected={selectedItems.has(movie.id)}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            )}

            <section id="history">
              <SearchHistory history={searchHistory} onRerun={handleHistoryRerun} onRefresh={handleHistoryRefresh} />
            </section>
          </main>

          <footer className="border-t mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} MediaHub</div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="link" className="h-auto p-0" onClick={() => setShowTermsModal(true)}>
                    Termos de uso e privacidade
                  </Button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </SidebarInset>

      {showTermsModal && <TermsModal onClose={() => setShowTermsModal(false)} />}

      <ModalErrorBoundary onReset={closeAllModals}>
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <Card className="w-full max-w-sm">
                <CardContent className="flex items-center justify-center gap-3 p-6">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Carregando…</span>
                </CardContent>
              </Card>
            </div>
          }
        >
          {showBulkBannerModal && user && isPremiumUser && (
            <BulkBannerModal movies={getSelectedMovies()} onClose={() => setShowBulkBannerModal(false)} />
          )}

          {showTop10BannerModal && user && isPremiumUser && (
            <BulkBannerModal movies={[]} initialMode="ranking" modeLocked onClose={() => setShowTop10BannerModal(false)} />
          )}

          {showFootballBannerModal && (
            <FootballBannerModal isOpen={true} onClose={() => setShowFootballBannerModal(false)} />
          )}

          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
          {showUserAreaModal && <UserAreaModal onClose={() => setShowUserAreaModal(false)} />}
          {showSupportModal && <SupportModal isOpen={true} onClose={() => setShowSupportModal(false)} />}
        </Suspense>
      </ModalErrorBoundary>
    </SidebarProvider>
  );
};

export default AppPage;
