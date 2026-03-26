
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Eye, EyeOff, Key, Pencil, Plus, Settings, Trash2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { useToast } from '../hooks/use-toast';
import { apiRequest } from '../services/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

interface AdminModalProps {
  onClose?: () => void;
  mode?: 'modal' | 'page';
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  type: 'admin' | 'premium' | 'free';
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  brandName?: string;
  subscriptionEnd?: string | Date;
}

interface DashboardData {
  users: {
    total: number;
    active: number;
    byType: { admin: number; premium: number; free: number };
    premiumExpiringSoon: number;
    premiumExpired: number;
  };
  searches: {
    total: number;
    last24h: number;
    topQueries7d: Array<{ query: string; count: number }>;
  };
  system: {
    allowRegistrations: boolean;
    searchConfigured: boolean;
  };
}

interface SearchProviderStatus {
  primaryConfigured: boolean;
  secondaryConfigured: boolean;
}
interface AdminTelegramStatus {
  configured: boolean;
}
interface AdminSystemSettings {
  allowRegistrations: boolean;
  ticketsEnabled: boolean;
}

interface FootballSource {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface FootballSettings {
  readTime: string;
  readWindowStart?: string;
  readWindowEnd?: string;
  timeZone: string;
  lastRunDate: string | null;
  excludedChannels?: string[];
  excludedCompetitions?: string[];
}

interface FootballAdminPayload {
  settings: FootballSettings;
  sources: FootballSource[];
}

const AdminModal: React.FC<AdminModalProps> = ({ onClose, mode }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersQuery, setUsersQuery] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [searchProviderStatus, setSearchProviderStatus] = useState<SearchProviderStatus | null>(null);
  const [isSearchProviderLoading, setIsSearchProviderLoading] = useState(false);
  const [isSavingSearchProvider, setIsSavingSearchProvider] = useState(false);
  const [searchProviderPrimaryKey, setSearchProviderPrimaryKey] = useState('');
  const [searchProviderSecondaryKey, setSearchProviderSecondaryKey] = useState('');
  const [showSearchProviderPrimaryKey, setShowSearchProviderPrimaryKey] = useState(false);
  const [showSearchProviderSecondaryKey, setShowSearchProviderSecondaryKey] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<AdminTelegramStatus | null>(null);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [showTelegramBotToken, setShowTelegramBotToken] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isResettingPasswordFor, setIsResettingPasswordFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [ticketsEnabled, setTicketsEnabled] = useState(true);
  const [isSavingTicketsSettings, setIsSavingTicketsSettings] = useState(false);
  const [footballSettings, setFootballSettings] = useState<FootballSettings | null>(null);
  const [footballSources, setFootballSources] = useState<FootballSource[]>([]);
  const [isFootballLoading, setIsFootballLoading] = useState(false);
  const [isSavingFootballSettings, setIsSavingFootballSettings] = useState(false);
  const [footballReadWindowStart, setFootballReadWindowStart] = useState('19:30');
  const [footballReadWindowEnd, setFootballReadWindowEnd] = useState('20:00');
  const [footballExcludedChannels, setFootballExcludedChannels] = useState('PPV ONEFOOTBALL');
  const [footballExcludedCompetitions, setFootballExcludedCompetitions] = useState('Inglês 5ª Divisão');
  const [footballSourceDraft, setFootballSourceDraft] = useState({ name: '', url: '' });
  const [isCreatingFootballSource, setIsCreatingFootballSource] = useState(false);
  const [editingFootballSourceId, setEditingFootballSourceId] = useState<string | null>(null);
  const [footballSourceEdit, setFootballSourceEdit] = useState({ name: '', url: '' });
  const [isUpdatingFootballSource, setIsUpdatingFootballSource] = useState(false);
  const [isRefreshingFootball, setIsRefreshingFootball] = useState(false);
  const [footballRefreshDate, setFootballRefreshDate] = useState('');
  const [editUser, setEditUser] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    website: '',
    brandName: '',
    type: 'free' as AdminUser['type'],
    subscriptionEnd: '',
    isActive: true,
    password: '',
  });

  useEffect(() => {
    setIsDashboardLoading(true);
    apiRequest<DashboardData>({ path: '/api/admin/dashboard', auth: true })
      .then((payload) => {
        setDashboard(payload);
        setAllowNewRegistrations(payload.system.allowRegistrations);
      })
      .catch(() => {
        setDashboard(null);
      })
      .finally(() => setIsDashboardLoading(false));

    setIsUsersLoading(true);
    apiRequest<{ items: AdminUser[] }>({ path: '/api/admin/users', auth: true })
      .then((payload) => setUsers(payload.items))
      .catch(() => setUsers([]))
      .finally(() => setIsUsersLoading(false));

    setIsSearchProviderLoading(true);
    apiRequest<SearchProviderStatus>({ path: '/api/admin/search-provider', auth: true })
      .then((payload) => setSearchProviderStatus(payload))
      .catch(() => setSearchProviderStatus(null))
      .finally(() => setIsSearchProviderLoading(false));

    setIsTelegramLoading(true);
    apiRequest<AdminTelegramStatus>({ path: '/api/admin/telegram', auth: true })
      .then((payload) => setTelegramStatus(payload))
      .catch(() => setTelegramStatus(null))
      .finally(() => setIsTelegramLoading(false));

    apiRequest<AdminSystemSettings>({ path: '/api/admin/settings', auth: true })
      .then((payload) => {
        setAllowNewRegistrations(Boolean(payload.allowRegistrations));
        setTicketsEnabled(typeof payload.ticketsEnabled === 'boolean' ? payload.ticketsEnabled : true);
      })
      .catch(() => {});

    setIsFootballLoading(true);
    apiRequest<FootballAdminPayload>({ path: '/api/admin/football/settings', auth: true })
      .then((payload) => {
        setFootballSettings(payload.settings);
        setFootballSources(payload.sources);
        setFootballReadWindowStart(payload.settings.readWindowStart || '19:30');
        setFootballReadWindowEnd(payload.settings.readWindowEnd || '20:00');
        setFootballExcludedChannels(
          Array.isArray(payload.settings.excludedChannels) && payload.settings.excludedChannels.length
            ? payload.settings.excludedChannels.join('\n')
            : 'PPV ONEFOOTBALL'
        );
        setFootballExcludedCompetitions(
          Array.isArray(payload.settings.excludedCompetitions) && payload.settings.excludedCompetitions.length
            ? payload.settings.excludedCompetitions.join('\n')
            : 'Inglês 5ª Divisão'
        );
      })
      .catch(() => {
        setFootballSettings(null);
        setFootballSources([]);
      })
      .finally(() => setIsFootballLoading(false));
  }, []);
  
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    brandName: '',
    type: 'free' as 'admin' | 'premium' | 'free',
    subscriptionEnd: '',
  });

  const filteredUsers = useMemo(() => {
    const q = usersQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name} ${u.email} ${u.brandName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, usersQuery]);

  const searchPrimaryBadge = useMemo(() => {
    if (isSearchProviderLoading && !searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB principal verificando...' };
    if (!searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB principal status indisponível' };
    return searchProviderStatus.primaryConfigured
      ? { variant: 'outline' as const, text: 'TMDB principal configurada' }
      : { variant: 'secondary' as const, text: 'TMDB principal não configurada' };
  }, [isSearchProviderLoading, searchProviderStatus]);

  const searchSecondaryBadge = useMemo(() => {
    if (isSearchProviderLoading && !searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB secundária verificando...' };
    if (!searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB secundária status indisponível' };
    return searchProviderStatus.secondaryConfigured
      ? { variant: 'outline' as const, text: 'TMDB secundária configurada' }
      : { variant: 'secondary' as const, text: 'TMDB secundária não configurada' };
  }, [isSearchProviderLoading, searchProviderStatus]);

  const searchAdminBadge = useMemo(() => {
    if (isSearchProviderLoading && !searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB no Admin verificando...' };
    if (!searchProviderStatus) return { variant: 'secondary' as const, text: 'TMDB no Admin status indisponível' };
    const configured = searchProviderStatus.primaryConfigured || searchProviderStatus.secondaryConfigured;
    return configured
      ? { variant: 'outline' as const, text: 'TMDB no Admin configurado' }
      : { variant: 'destructive' as const, text: 'TMDB no Admin não configurado' };
  }, [isSearchProviderLoading, searchProviderStatus]);

  const telegramBadge = useMemo(() => {
    if (isTelegramLoading && !telegramStatus) return { variant: 'secondary' as const, text: 'Bot Telegram oficial verificando...' };
    if (!telegramStatus) return { variant: 'secondary' as const, text: 'Bot Telegram oficial status indisponível' };
    return telegramStatus.configured
      ? { variant: 'outline' as const, text: 'Bot Telegram oficial configurado' }
      : { variant: 'secondary' as const, text: 'Bot Telegram oficial não configurado' };
  }, [isTelegramLoading, telegramStatus]);

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
      return;
    }
    navigate('/app');
  };

  const refreshDashboard = () => {
    setIsDashboardLoading(true);
    return apiRequest<DashboardData>({ path: '/api/admin/dashboard', auth: true })
      .then((payload) => {
        setDashboard(payload);
        setAllowNewRegistrations(payload.system.allowRegistrations);
      })
      .catch(() => setDashboard(null))
      .finally(() => setIsDashboardLoading(false));
  };

  const refreshUsers = () => {
    setIsUsersLoading(true);
    return apiRequest<{ items: AdminUser[] }>({ path: '/api/admin/users', auth: true })
      .then((payload) => setUsers(payload.items))
      .catch(() => setUsers([]))
      .finally(() => setIsUsersLoading(false));
  };

  const refreshSearchProviderStatus = () => {
    setIsSearchProviderLoading(true);
    return apiRequest<SearchProviderStatus>({ path: '/api/admin/search-provider', auth: true })
      .then((payload) => setSearchProviderStatus(payload))
      .catch(() => setSearchProviderStatus(null))
      .finally(() => setIsSearchProviderLoading(false));
  };

  const refreshTelegramStatus = () => {
    setIsTelegramLoading(true);
    return apiRequest<AdminTelegramStatus>({ path: '/api/admin/telegram', auth: true })
      .then((payload) => setTelegramStatus(payload))
      .catch(() => setTelegramStatus(null))
      .finally(() => setIsTelegramLoading(false));
  };

  const handleSaveSearchProviderKeys = async () => {
    if (isSavingSearchProvider) return;
    const primary = searchProviderPrimaryKey.trim();
    const secondary = searchProviderSecondaryKey.trim();

    const body: Record<string, string> = {};
    if (primary) body.primary = primary;
    if (secondary) body.secondary = secondary;

    if (Object.keys(body).length === 0) {
      toast({
        title: 'Atenção',
        description: 'Informe pelo menos um campo para salvar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingSearchProvider(true);
    try {
      await apiRequest<void>({
        path: '/api/admin/search-provider',
        method: 'PUT',
        auth: true,
        body,
      });
      setSearchProviderPrimaryKey('');
      setSearchProviderSecondaryKey('');
      await refreshSearchProviderStatus();
      await refreshDashboard();
      toast({
        title: 'Configuração salva',
        description: 'As configurações foram atualizadas com sucesso.',
      });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível salvar agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSearchProvider(false);
    }
  };

  const handleSaveTelegramBotToken = async () => {
    if (isSavingTelegram) return;
    const token = telegramBotToken.trim();
    if (!token) {
      toast({
        title: 'Atenção',
        description: 'Informe o token do bot oficial para salvar.',
        variant: 'destructive',
      });
      return;
    }
    setIsSavingTelegram(true);
    try {
      await apiRequest<void>({
        path: '/api/admin/telegram',
        method: 'PUT',
        auth: true,
        body: { token },
      });
      setTelegramBotToken('');
      await refreshTelegramStatus();
      toast({
        title: 'Configuração salva',
        description: 'Token do bot oficial atualizado com sucesso.',
      });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível salvar o token agora.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleToggleRegistrations = (enabled: boolean) => {
    const previous = allowNewRegistrations;
    setAllowNewRegistrations(enabled);
    localStorage.setItem('allow_registrations', enabled.toString());

    apiRequest<void>({
      path: '/api/admin/settings',
      method: 'PUT',
      auth: true,
      body: { allowRegistrations: enabled, ticketsEnabled },
    })
      .then(() => {
        refreshDashboard();
        toast({
          title: "Configuração atualizada",
          description: `Cadastros ${enabled ? 'habilitados' : 'desabilitados'}`,
        });
      })
      .catch(() => {
        setAllowNewRegistrations(previous);
        localStorage.setItem('allow_registrations', previous.toString());
        toast({
          title: "Erro",
          description: "Não foi possível atualizar agora. Tente novamente.",
          variant: "destructive",
        });
      });
  };

  const handleToggleTicketsEnabled = (enabled: boolean) => {
    if (isSavingTicketsSettings) return;
    const previous = ticketsEnabled;
    setTicketsEnabled(enabled);
    setIsSavingTicketsSettings(true);
    apiRequest<void>({
      path: '/api/admin/settings',
      method: 'PUT',
      auth: true,
      body: { allowRegistrations: allowNewRegistrations, ticketsEnabled: enabled },
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent('mediahub:ticketsSettingsChanged', { detail: { enabled } }));
        toast({
          title: 'Configuração atualizada',
          description: `Tickets ${enabled ? 'habilitados' : 'desabilitados'}.`,
        });
      })
      .catch(() => {
        setTicketsEnabled(previous);
        toast({
          title: 'Erro',
          description: 'Não foi possível atualizar o status dos tickets agora.',
          variant: 'destructive',
        });
      })
      .finally(() => setIsSavingTicketsSettings(false));
  };

  const refreshFootballAdmin = () => {
    setIsFootballLoading(true);
    return apiRequest<FootballAdminPayload>({ path: '/api/admin/football/settings', auth: true })
      .then((payload) => {
        setFootballSettings(payload.settings);
        setFootballSources(payload.sources);
        setFootballReadWindowStart(payload.settings.readWindowStart || '19:30');
        setFootballReadWindowEnd(payload.settings.readWindowEnd || '20:00');
        setFootballExcludedChannels(
          Array.isArray(payload.settings.excludedChannels) && payload.settings.excludedChannels.length
            ? payload.settings.excludedChannels.join('\n')
            : 'PPV ONEFOOTBALL'
        );
        setFootballExcludedCompetitions(
          Array.isArray(payload.settings.excludedCompetitions) && payload.settings.excludedCompetitions.length
            ? payload.settings.excludedCompetitions.join('\n')
            : 'Inglês 5ª Divisão'
        );
      })
      .catch(() => {
        setFootballSettings(null);
        setFootballSources([]);
      })
      .finally(() => setIsFootballLoading(false));
  };

  const handleSaveFootballSettings = async () => {
    if (isSavingFootballSettings) return;
    const readWindowStart = footballReadWindowStart.trim();
    const readWindowEnd = footballReadWindowEnd.trim();
    if (!/^\d{2}:\d{2}$/.test(readWindowStart) || !/^\d{2}:\d{2}$/.test(readWindowEnd)) {
      toast({
        title: 'Atenção',
        description: 'Informe janela válida (HH:MM até HH:MM).',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingFootballSettings(true);
    try {
      await apiRequest<void>({
        path: '/api/admin/football/settings',
        method: 'PUT',
        auth: true,
        body: {
          readWindowStart,
          readWindowEnd,
          excludedChannels: footballExcludedChannels
            .split(/\r?\n|[,;]+/g)
            .map((item) => item.trim())
            .filter(Boolean),
          excludedCompetitions: footballExcludedCompetitions
            .split(/\r?\n|[,;]+/g)
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      await refreshFootballAdmin();
      toast({
        title: 'Configuração salva',
        description: 'Configurações de leitura e exclusões atualizadas.',
      });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível salvar agora. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingFootballSettings(false);
    }
  };

  const handleCreateFootballSource = async () => {
    if (isCreatingFootballSource) return;
    const name = footballSourceDraft.name.trim();
    const url = footballSourceDraft.url.trim();
    if (!name || !url) {
      toast({ title: 'Erro', description: 'Preencha nome e URL.', variant: 'destructive' });
      return;
    }
    setIsCreatingFootballSource(true);
    try {
      await apiRequest<{ source: FootballSource }>({
        path: '/api/admin/football/sources',
        method: 'POST',
        auth: true,
        body: { name, url },
      });
      setFootballSourceDraft({ name: '', url: '' });
      await refreshFootballAdmin();
      toast({ title: 'Fonte adicionada', description: 'A fonte foi cadastrada com sucesso.' });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({ title: 'Erro', description: message || 'Não foi possível salvar agora. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsCreatingFootballSource(false);
    }
  };

  const handleStartEditFootballSource = (source: FootballSource) => {
    setEditingFootballSourceId(source.id);
    setFootballSourceEdit({ name: source.name, url: source.url });
  };

  const handleCancelEditFootballSource = () => {
    setEditingFootballSourceId(null);
    setFootballSourceEdit({ name: '', url: '' });
  };

  const handleSaveFootballSourceEdit = async () => {
    if (!editingFootballSourceId || isUpdatingFootballSource) return;
    const name = footballSourceEdit.name.trim();
    const url = footballSourceEdit.url.trim();
    if (!name || !url) {
      toast({ title: 'Erro', description: 'Preencha nome e URL.', variant: 'destructive' });
      return;
    }
    setIsUpdatingFootballSource(true);
    try {
      await apiRequest<{ source: FootballSource }>({
        path: `/api/admin/football/sources/${editingFootballSourceId}`,
        method: 'PUT',
        auth: true,
        body: { name, url },
      });
      setEditingFootballSourceId(null);
      setFootballSourceEdit({ name: '', url: '' });
      await refreshFootballAdmin();
      toast({ title: 'Fonte atualizada', description: 'As alterações foram salvas.' });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({ title: 'Erro', description: message || 'Não foi possível salvar agora. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUpdatingFootballSource(false);
    }
  };

  const handleToggleFootballSource = async (source: FootballSource, enabled: boolean) => {
    const previous = footballSources;
    setFootballSources((current) => current.map((s) => (s.id === source.id ? { ...s, isActive: enabled } : s)));
    try {
      await apiRequest<{ source: FootballSource }>({
        path: `/api/admin/football/sources/${source.id}`,
        method: 'PATCH',
        auth: true,
        body: { isActive: enabled },
      });
      await refreshFootballAdmin();
    } catch (e) {
      setFootballSources(previous);
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({ title: 'Erro', description: message || 'Não foi possível atualizar agora. Tente novamente.', variant: 'destructive' });
    }
  };

  const handleRefreshFootballSchedule = async () => {
    if (isRefreshingFootball) return;
    const date = footballRefreshDate.trim();
    const body = date ? { date } : {};
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast({ title: 'Erro', description: 'Informe a data no formato AAAA-MM-DD.', variant: 'destructive' });
      return;
    }
    setIsRefreshingFootball(true);
    try {
      await apiRequest<{ started?: boolean; date?: string }>({
        path: '/api/admin/football/refresh',
        method: 'POST',
        auth: true,
        body,
        timeoutMs: 120_000,
      });
      toast({ title: 'Atualização iniciada', description: 'A coleta foi colocada em fila e terminará em instantes.' });
      await refreshFootballAdmin();
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({ title: 'Erro', description: message || 'Não foi possível atualizar agora. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsRefreshingFootball(false);
    }
  };

  const handleCreateUser = () => {
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.brandName) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingUser(true);
    apiRequest<{ user: AdminUser }>({
      path: '/api/admin/users',
      method: 'POST',
      auth: true,
      body: {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        brandName: newUser.brandName,
        type: newUser.type,
        subscriptionEnd: newUser.type === 'premium' ? newUser.subscriptionEnd : '',
      },
    })
      .then((payload) => {
        setUsers((current) => [payload.user, ...current]);
        setNewUser({ name: '', email: '', password: '', brandName: '', type: 'free', subscriptionEnd: '' });
        refreshDashboard();
        toast({ title: "Sucesso", description: "Usuário criado com sucesso!" });
      })
      .catch((e) => {
        const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
        toast({
          title: "Erro",
          description: message || "Não foi possível criar o usuário. Tente novamente.",
          variant: "destructive",
        });
      })
      .finally(() => setIsCreatingUser(false));
  };

  const handleToggleUserStatus = (userId: string, isActive: boolean) => {
    setUsers((current) => current.map((u) => (u.id === userId ? { ...u, isActive } : u)));

    apiRequest<{ user: AdminUser }>({
      path: `/api/admin/users/${userId}`,
      method: 'PATCH',
      auth: true,
      body: { isActive },
    })
      .then((payload) => {
        setUsers((current) => current.map((u) => (u.id === payload.user.id ? payload.user : u)));
        refreshDashboard();
      })
      .catch((e) => {
        const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
        refreshUsers();
        toast({
          title: "Erro",
          description: message || "Não foi possível atualizar o status agora.",
          variant: "destructive",
        });
      });
  };

  const handleQuickPlanAction = async (u: AdminUser, action: 'renew30' | 'cancelPremium' | 'setFree') => {
    const today = new Date();
    const currentEnd = u.subscriptionEnd ? new Date(u.subscriptionEnd) : null;
    const base = currentEnd && currentEnd.getTime() > today.getTime() ? currentEnd : today;
    const next = new Date(base);
    if (action === 'renew30') next.setDate(next.getDate() + 30);
    const body =
      action === 'renew30'
        ? { type: 'premium', subscriptionEnd: next.toISOString().slice(0, 10), isActive: true }
        : action === 'cancelPremium'
          ? { type: 'free', subscriptionEnd: '', isActive: u.isActive }
          : { type: 'free', subscriptionEnd: '', isActive: true };
    try {
      const payload = await apiRequest<{ user: AdminUser }>({
        path: `/api/admin/users/${u.id}`,
        method: 'PATCH',
        auth: true,
        body,
      });
      setUsers((current) => current.map((item) => (item.id === payload.user.id ? payload.user : item)));
      await refreshDashboard();
      toast({ title: 'Plano atualizado', description: 'A ação de plano foi concluída com sucesso.' });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({ title: 'Erro', description: message || 'Não foi possível atualizar o plano.', variant: 'destructive' });
    }
  };

  const handleStartEditUser = (u: AdminUser) => {
    const subscriptionEnd = u.subscriptionEnd ? new Date(u.subscriptionEnd).toISOString().slice(0, 10) : '';
    setEditingUserId(u.id);
    setShowEditUserPassword(false);
    setEditUser({
      id: u.id,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      website: u.website || '',
      brandName: u.brandName || '',
      type: u.type,
      subscriptionEnd,
      isActive: u.isActive,
      password: '',
    });
  };

  const handleCancelEditUser = () => {
    setEditingUserId(null);
    setShowEditUserPassword(false);
    setEditUser({
      id: '',
      name: '',
      email: '',
      phone: '',
      website: '',
      brandName: '',
      type: 'free',
      subscriptionEnd: '',
      isActive: true,
      password: '',
    });
  };

  const handleSaveUser = async () => {
    if (!editUser.id) return;
    const name = editUser.name.trim();
    const email = editUser.email.trim();
    const brandName = editUser.brandName.trim();
    const phone = editUser.phone.trim();
    const website = editUser.website.trim();
    const subscriptionEnd = editUser.type === 'premium' ? editUser.subscriptionEnd : '';
    const password = editUser.password.trim();

    if (!name || !email || !brandName) {
      toast({
        title: 'Erro',
        description: 'Nome, email e marca são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingUser(true);
    try {
      const payload = await apiRequest<{ user: AdminUser }>({
        path: `/api/admin/users/${editUser.id}`,
        method: 'PATCH',
        auth: true,
        body: {
          name,
          email,
          brandName,
          phone,
          website,
          type: editUser.type,
          isActive: editUser.isActive,
          subscriptionEnd,
          password: password ? password : undefined,
        },
      });

      setUsers((current) => current.map((u) => (u.id === payload.user.id ? payload.user : u)));
      refreshDashboard();
      toast({ title: 'Sucesso', description: 'Usuário atualizado.' });
      handleCancelEditUser();
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível atualizar o usuário agora.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleResetPassword = async (u: AdminUser) => {
    if (!u?.id) return;
    if (isResettingPasswordFor) return;
    setIsResettingPasswordFor(u.id);
    try {
      const payload = await apiRequest<{ password: string }>({
        path: `/api/admin/users/${u.id}/reset-password`,
        method: 'POST',
        auth: true,
      });
      const nextPassword = String(payload?.password || '').trim();
      if (!nextPassword) {
        toast({ title: 'Erro', description: 'Não foi possível gerar a senha.', variant: 'destructive' });
        return;
      }
      const { exportService } = await import('../services/exportService');
      await exportService.copyToClipboard(nextPassword);
      toast({ title: 'Senha resetada', description: 'Senha gerada e copiada.' });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível resetar a senha agora.',
        variant: 'destructive',
      });
    } finally {
      setIsResettingPasswordFor(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingUser(true);
    try {
      await apiRequest<void>({
        path: `/api/admin/users/${deleteTarget.id}`,
        method: 'DELETE',
        auth: true,
      });
      setUsers((current) => current.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      refreshDashboard();
      toast({ title: 'Usuário excluído', description: 'A conta foi removida com sucesso.' });
    } catch (e) {
      const message = typeof (e as { message?: unknown })?.message === 'string' ? (e as { message: string }).message : null;
      toast({
        title: 'Erro',
        description: message || 'Não foi possível excluir o usuário agora.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingUser(false);
    }
  };

  if (user?.type !== 'admin') {
    return null;
  }

  const renderAsModal = mode !== 'page';

  const header = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Painel Administrativo</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{user?.email}</Badge>
        <Badge>Admin</Badge>
        {dashboard?.system.searchConfigured !== undefined && (
          <Badge variant={dashboard.system.searchConfigured ? 'outline' : 'destructive'}>
            Busca {dashboard.system.searchConfigured ? 'OK' : 'indisponível'}
          </Badge>
        )}
        <Badge variant={allowNewRegistrations ? 'outline' : 'destructive'}>
          Cadastros {allowNewRegistrations ? 'abertos' : 'fechados'}
        </Badge>
      </div>
    </div>
  );

  const tabs = (
    <>
      <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="football" className="flex items-center space-x-2">
              <CalendarDays className="h-4 w-4" />
              <span>Futebol</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Configurações</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Usuários</p>
                  <p className="text-3xl font-semibold">{dashboard?.users.total ?? (isDashboardLoading ? '—' : 0)}</p>
                  {dashboard && (
                    <p className="text-sm text-muted-foreground">
                      Admin {dashboard.users.byType.admin} • Premium {dashboard.users.byType.premium} • Free {dashboard.users.byType.free}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Ativos</p>
                  <p className="text-3xl font-semibold">{dashboard?.users.active ?? (isDashboardLoading ? '—' : 0)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Premium expiram (7 dias)</p>
                  <p className="text-3xl font-semibold">{dashboard?.users.premiumExpiringSoon ?? (isDashboardLoading ? '—' : 0)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Premium expirados</p>
                  <p className="text-3xl font-semibold">{dashboard?.users.premiumExpired ?? (isDashboardLoading ? '—' : 0)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Buscas (total)</p>
                  <p className="text-3xl font-semibold">{dashboard?.searches.total ?? (isDashboardLoading ? '—' : 0)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-1">
                  <p className="text-sm text-muted-foreground">Buscas (24h)</p>
                  <p className="text-3xl font-semibold">{dashboard?.searches.last24h ?? (isDashboardLoading ? '—' : 0)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top buscas (7 dias)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard?.searches.topQueries7d?.length ? (
                  <div className="space-y-2">
                    {dashboard.searches.topQueries7d.map((item) => (
                      <div key={item.query} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm truncate">{item.query}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{isDashboardLoading ? 'Carregando…' : 'Sem dados no período.'}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Criar usuário</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="newUserName">Nome</Label>
                    <Input
                      id="newUserName"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="newUserEmail">Email</Label>
                    <Input
                      id="newUserEmail"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="email@exemplo.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="newUserPassword">Senha</Label>
                    <div className="flex gap-2">
                      <Input
                        id="newUserPassword"
                        type={showNewUserPassword ? 'text' : 'password'}
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="Senha"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNewUserPassword((v) => !v)}
                        aria-label={showNewUserPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showNewUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="newUserBrand">Nome da marca</Label>
                    <Input
                      id="newUserBrand"
                      value={newUser.brandName}
                      onChange={(e) => setNewUser({ ...newUser, brandName: e.target.value })}
                      placeholder="Marca do cliente"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={newUser.type === 'free' ? 'default' : 'outline'}
                      onClick={() => setNewUser({ ...newUser, type: 'free' })}
                    >
                      Free
                    </Button>
                    <Button
                      type="button"
                      variant={newUser.type === 'premium' ? 'default' : 'outline'}
                      onClick={() => setNewUser({ ...newUser, type: 'premium' })}
                    >
                      Premium
                    </Button>
                    <Button
                      type="button"
                      variant={newUser.type === 'admin' ? 'default' : 'outline'}
                      onClick={() => setNewUser({ ...newUser, type: 'admin' })}
                    >
                      Admin
                    </Button>
                  </div>
                </div>

                {newUser.type === 'premium' && (
                  <div className="grid gap-2">
                    <Label htmlFor="newUserSubscriptionEnd">Assinatura até</Label>
                    <Input
                      id="newUserSubscriptionEnd"
                      type="date"
                      value={newUser.subscriptionEnd}
                      onChange={(e) => setNewUser({ ...newUser, subscriptionEnd: e.target.value })}
                    />
                  </div>
                )}

                <Button onClick={handleCreateUser} disabled={isCreatingUser} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {isCreatingUser ? 'Criando…' : 'Criar usuário'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Usuários</CardTitle>
                <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                  <div className="flex-1">
                    <Input value={usersQuery} onChange={(e) => setUsersQuery(e.target.value)} placeholder="Buscar por nome, email ou marca" />
                  </div>
                  <Button type="button" variant="outline" onClick={refreshUsers} disabled={isUsersLoading}>
                    {isUsersLoading ? 'Carregando…' : 'Recarregar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isUsersLoading ? 'Carregando…' : 'Nenhum usuário encontrado.'}</p>
                ) : (
                  <div className="space-y-3">
                    {filteredUsers.map((u) => (
                      <div key={u.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{u.name}</p>
                              <Badge variant={u.type === 'admin' ? 'default' : 'secondary'}>
                                {u.type === 'admin' ? 'admin' : u.type === 'premium' ? 'premium' : 'free'}
                              </Badge>
                              <Badge variant={u.isActive ? 'outline' : 'destructive'}>{u.isActive ? 'ativo' : 'inativo'}</Badge>
                              {u.subscriptionEnd && <Badge variant="secondary">até {new Date(u.subscriptionEnd).toLocaleDateString('pt-BR')}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground break-all">{u.email}</p>
                            {u.brandName && <p className="text-sm text-muted-foreground">Marca: {u.brandName}</p>}
                            {(u.phone || u.website) && (
                              <p className="text-sm text-muted-foreground">
                                {[u.phone ? `Tel: ${u.phone}` : '', u.website ? `Site: ${u.website}` : ''].filter(Boolean).join(' • ')}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Criado: {new Date(u.createdAt).toLocaleDateString('pt-BR')} • Atualizado: {new Date(u.updatedAt).toLocaleDateString('pt-BR')}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleQuickPlanAction(u, 'renew30')}>
                                Renovar +30 dias
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleQuickPlanAction(u, 'cancelPremium')}>
                                Cancelar Premium
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void handleQuickPlanAction(u, 'setFree')}>
                                Alterar para Free
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-3">
                            <Button type="button" variant="outline" size="sm" onClick={() => handleStartEditUser(u)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleResetPassword(u)} disabled={isResettingPasswordFor === u.id}>
                              <Key className="h-4 w-4 mr-2" />
                              {isResettingPasswordFor === u.id ? 'Resetando…' : 'Resetar senha'}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(u)}
                              disabled={u.id === user.id || isDeletingUser}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </Button>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm">Ativo</Label>
                              <Switch checked={u.isActive} onCheckedChange={(checked) => handleToggleUserStatus(u.id, checked)} />
                            </div>
                          </div>
                        </div>

                        {editingUserId === u.id && (
                          <div className="mt-4 border-t pt-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="editUserName">Nome</Label>
                                <Input
                                  id="editUserName"
                                  value={editUser.name}
                                  onChange={(e) => setEditUser((current) => ({ ...current, name: e.target.value }))}
                                  placeholder="Nome completo"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="editUserEmail">Email</Label>
                                <Input
                                  id="editUserEmail"
                                  type="email"
                                  value={editUser.email}
                                  onChange={(e) => setEditUser((current) => ({ ...current, email: e.target.value }))}
                                  placeholder="email@exemplo.com"
                                  autoComplete="off"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="editUserBrand">Marca</Label>
                                <Input
                                  id="editUserBrand"
                                  value={editUser.brandName}
                                  onChange={(e) => setEditUser((current) => ({ ...current, brandName: e.target.value }))}
                                  placeholder="Nome da marca"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="editUserPhone">Telefone</Label>
                                <Input
                                  id="editUserPhone"
                                  value={editUser.phone}
                                  onChange={(e) => setEditUser((current) => ({ ...current, phone: e.target.value }))}
                                  placeholder="Opcional"
                                  autoComplete="off"
                                />
                              </div>
                              <div className="grid gap-2 md:col-span-2">
                                <Label htmlFor="editUserWebsite">Site</Label>
                                <Input
                                  id="editUserWebsite"
                                  value={editUser.website}
                                  onChange={(e) => setEditUser((current) => ({ ...current, website: e.target.value }))}
                                  placeholder="https://..."
                                  autoComplete="off"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Tipo</Label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant={editUser.type === 'free' ? 'default' : 'outline'}
                                  onClick={() => setEditUser((current) => ({ ...current, type: 'free', subscriptionEnd: '' }))}
                                >
                                  Free
                                </Button>
                                <Button
                                  type="button"
                                  variant={editUser.type === 'premium' ? 'default' : 'outline'}
                                  onClick={() => setEditUser((current) => ({ ...current, type: 'premium' }))}
                                >
                                  Premium
                                </Button>
                                <Button
                                  type="button"
                                  variant={editUser.type === 'admin' ? 'default' : 'outline'}
                                  onClick={() => setEditUser((current) => ({ ...current, type: 'admin', subscriptionEnd: '' }))}
                                >
                                  Admin
                                </Button>
                              </div>
                            </div>

                            {editUser.type === 'premium' && (
                              <div className="grid gap-2">
                                <Label htmlFor="editUserSubscriptionEnd">Assinatura até</Label>
                                <Input
                                  id="editUserSubscriptionEnd"
                                  type="date"
                                  value={editUser.subscriptionEnd}
                                  onChange={(e) => setEditUser((current) => ({ ...current, subscriptionEnd: e.target.value }))}
                                />
                              </div>
                            )}

                            <div className="grid gap-2">
                              <Label htmlFor="editUserPassword">Nova senha (opcional)</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="editUserPassword"
                                  type={showEditUserPassword ? 'text' : 'password'}
                                  value={editUser.password}
                                  onChange={(e) => setEditUser((current) => ({ ...current, password: e.target.value }))}
                                  placeholder="Preencha para trocar"
                                  autoComplete="new-password"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setShowEditUserPassword((v) => !v)}
                                  aria-label={showEditUserPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                >
                                  {showEditUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>

                            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                              <Button type="button" variant="outline" onClick={handleCancelEditUser} disabled={isUpdatingUser}>
                                Cancelar
                              </Button>
                              <Button type="button" onClick={handleSaveUser} disabled={isUpdatingUser}>
                                {isUpdatingUser ? 'Salvando…' : 'Salvar alterações'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="football" className="space-y-4">
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Atualização diária</CardTitle>
                <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                  <div className="min-w-0 text-sm text-muted-foreground">
                    {footballSettings ? `Fuso: ${footballSettings.timeZone}` : 'Carregando…'}
                  </div>
                  <Button type="button" variant="outline" onClick={refreshFootballAdmin} disabled={isFootballLoading}>
                    {isFootballLoading ? 'Carregando…' : 'Recarregar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="footballReadWindowStart">Janela início</Label>
                    <Input
                      id="footballReadWindowStart"
                      type="time"
                      value={footballReadWindowStart}
                      onChange={(e) => setFootballReadWindowStart(e.target.value)}
                      step={60}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="footballReadWindowEnd">Janela fim</Label>
                    <Input
                      id="footballReadWindowEnd"
                      type="time"
                      value={footballReadWindowEnd}
                      onChange={(e) => setFootballReadWindowEnd(e.target.value)}
                      step={60}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Última execução</Label>
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                      {footballSettings?.lastRunDate ? footballSettings.lastRunDate : '—'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="footballExcludedChannels">Excluir jogos por canal exclusivo</Label>
                    <Textarea
                      id="footballExcludedChannels"
                      value={footballExcludedChannels}
                      onChange={(e) => setFootballExcludedChannels(e.target.value)}
                      rows={3}
                      placeholder="PPV ONEFOOTBALL"
                    />
                    <p className="text-xs text-muted-foreground">Um canal por linha ou separado por vírgula.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="footballExcludedCompetitions">Excluir competições</Label>
                    <Textarea
                      id="footballExcludedCompetitions"
                      value={footballExcludedCompetitions}
                      onChange={(e) => setFootballExcludedCompetitions(e.target.value)}
                      rows={3}
                      placeholder="Inglês 5ª Divisão"
                    />
                    <p className="text-xs text-muted-foreground">Um termo por linha ou separado por vírgula.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="footballRefreshDate">Atualizar agora (data opcional)</Label>
                    <Input
                      id="footballRefreshDate"
                      value={footballRefreshDate}
                      onChange={(e) => setFootballRefreshDate(e.target.value)}
                      placeholder="Ex: 2026-03-13"
                      spellCheck={false}
                      inputMode="text"
                    />
                  </div>
                  <Button type="button" onClick={() => void handleRefreshFootballSchedule()} disabled={isRefreshingFootball}>
                    {isRefreshingFootball ? 'Atualizando…' : 'Atualizar dados'}
                  </Button>
                </div>
                <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                  <Button type="button" onClick={() => void handleSaveFootballSettings()} disabled={isSavingFootballSettings}>
                    {isSavingFootballSettings ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fontes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="footballSourceName">Nome</Label>
                    <Input
                      id="footballSourceName"
                      value={footballSourceDraft.name}
                      onChange={(e) => setFootballSourceDraft((current) => ({ ...current, name: e.target.value }))}
                      placeholder="Ex: Guia de jogos"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="footballSourceUrl">URL</Label>
                    <Input
                      id="footballSourceUrl"
                      value={footballSourceDraft.url}
                      onChange={(e) => setFootballSourceDraft((current) => ({ ...current, url: e.target.value }))}
                      placeholder="https://..."
                      spellCheck={false}
                      inputMode="url"
                    />
                  </div>
                </div>
                <Button type="button" onClick={() => void handleCreateFootballSource()} disabled={isCreatingFootballSource} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {isCreatingFootballSource ? 'Adicionando…' : 'Adicionar fonte'}
                </Button>

                {footballSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isFootballLoading ? 'Carregando…' : 'Nenhuma fonte cadastrada.'}</p>
                ) : (
                  <div className="space-y-3">
                    {footballSources.map((source) => (
                      <div key={source.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{source.name}</p>
                              <Badge variant={source.isActive ? 'outline' : 'secondary'}>{source.isActive ? 'ativa' : 'inativa'}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground break-all">{source.url}</p>
                          </div>
                          <div className="flex items-center gap-2 justify-between md:justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => handleStartEditFootballSource(source)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </Button>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm">Ativa</Label>
                              <Switch checked={source.isActive} onCheckedChange={(checked) => void handleToggleFootballSource(source, checked)} />
                            </div>
                          </div>
                        </div>

                        {editingFootballSourceId === source.id && (
                          <div className="border-t pt-3 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="footballEditName">Nome</Label>
                                <Input
                                  id="footballEditName"
                                  value={footballSourceEdit.name}
                                  onChange={(e) => setFootballSourceEdit((current) => ({ ...current, name: e.target.value }))}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="footballEditUrl">URL</Label>
                                <Input
                                  id="footballEditUrl"
                                  value={footballSourceEdit.url}
                                  onChange={(e) => setFootballSourceEdit((current) => ({ ...current, url: e.target.value }))}
                                  spellCheck={false}
                                  inputMode="url"
                                />
                              </div>
                            </div>
                            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                              <Button type="button" variant="outline" onClick={handleCancelEditFootballSource} disabled={isUpdatingFootballSource}>
                                Cancelar
                              </Button>
                              <Button type="button" onClick={() => void handleSaveFootballSourceEdit()} disabled={isUpdatingFootballSource}>
                                {isUpdatingFootballSource ? 'Salvando…' : 'Salvar'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Integrações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={searchPrimaryBadge.variant}>{searchPrimaryBadge.text}</Badge>
                    <Badge variant={searchSecondaryBadge.variant}>{searchSecondaryBadge.text}</Badge>
                    <Badge variant={searchAdminBadge.variant}>{searchAdminBadge.text}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void refreshSearchProviderStatus();
                      }}
                      disabled={isSearchProviderLoading}
                    >
                      {isSearchProviderLoading ? 'Carregando…' : 'Recarregar'}
                    </Button>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Por segurança, as chaves não são exibidas depois de salvas. Para alterar, informe novamente e salve.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="searchProviderPrimaryKey">Chave principal</Label>
                        <Badge variant={searchProviderStatus?.primaryConfigured ? 'outline' : 'secondary'}>
                          {searchProviderStatus?.primaryConfigured ? 'Configurada' : 'Não configurada'}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="searchProviderPrimaryKey"
                          type={showSearchProviderPrimaryKey ? 'text' : 'password'}
                          value={searchProviderPrimaryKey}
                          onChange={(e) => setSearchProviderPrimaryKey(e.target.value)}
                          placeholder="Cole a chave aqui"
                          autoComplete="off"
                          spellCheck={false}
                          inputMode="text"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowSearchProviderPrimaryKey((v) => !v)}
                          aria-label={showSearchProviderPrimaryKey ? 'Ocultar chave principal' : 'Mostrar chave principal'}
                        >
                          {showSearchProviderPrimaryKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div
                        className={`rounded-md border px-3 py-2 text-xs ${
                          searchProviderStatus?.primaryConfigured
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
                        }`}
                      >
                        {searchProviderStatus?.primaryConfigured
                          ? 'Ja existe uma chave principal configurada no sistema.'
                          : 'Nenhuma chave principal configurada no sistema.'}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {searchProviderStatus?.primaryConfigured
                          ? 'Ja existe uma chave principal salva. Informe nova chave apenas se quiser substituir.'
                          : 'Nenhuma chave principal cadastrada ate o momento.'}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="searchProviderSecondaryKey">Chave secundária (opcional)</Label>
                        <Badge variant={searchProviderStatus?.secondaryConfigured ? 'outline' : 'secondary'}>
                          {searchProviderStatus?.secondaryConfigured ? 'Configurada' : 'Não configurada'}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="searchProviderSecondaryKey"
                          type={showSearchProviderSecondaryKey ? 'text' : 'password'}
                          value={searchProviderSecondaryKey}
                          onChange={(e) => setSearchProviderSecondaryKey(e.target.value)}
                          placeholder="Opcional"
                          autoComplete="off"
                          spellCheck={false}
                          inputMode="text"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowSearchProviderSecondaryKey((v) => !v)}
                          aria-label={showSearchProviderSecondaryKey ? 'Ocultar chave secundária' : 'Mostrar chave secundária'}
                        >
                          {showSearchProviderSecondaryKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div
                        className={`rounded-md border px-3 py-2 text-xs ${
                          searchProviderStatus?.secondaryConfigured
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
                        }`}
                      >
                        {searchProviderStatus?.secondaryConfigured
                          ? 'Ja existe uma chave secundaria configurada no sistema.'
                          : 'Nenhuma chave secundaria configurada no sistema.'}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {searchProviderStatus?.secondaryConfigured
                          ? 'Ja existe uma chave secundaria salva. Informe nova chave apenas se quiser substituir.'
                          : 'Nenhuma chave secundaria cadastrada ate o momento.'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    A chave é configurada aqui. Após salvar, a busca passa a funcionar no sistema.
                  </div>

                  <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSearchProviderPrimaryKey('');
                        setSearchProviderSecondaryKey('');
                      }}
                      disabled={isSavingSearchProvider}
                    >
                      Limpar
                    </Button>
                    <Button type="button" onClick={() => void handleSaveSearchProviderKeys()} disabled={isSavingSearchProvider}>
                      {isSavingSearchProvider ? 'Salvando…' : 'Salvar'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={telegramBadge.variant}>{telegramBadge.text}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void refreshTelegramStatus();
                      }}
                      disabled={isTelegramLoading}
                    >
                      {isTelegramLoading ? 'Carregando…' : 'Recarregar'}
                    </Button>
                  </div>

                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      telegramStatus?.configured
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    {telegramStatus?.configured
                      ? 'Ja existe um token de bot oficial configurado no sistema.'
                      : 'Nenhum token de bot oficial configurado no sistema.'}
                  </div>

                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    O token do bot oficial é protegido: após salvar, ele não é exibido. Para alterar, informe novamente e salve.
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="telegramBotToken">Token do bot oficial</Label>
                      <Badge variant={telegramStatus?.configured ? 'outline' : 'secondary'}>
                        {telegramStatus?.configured ? 'Configurado' : 'Não configurado'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="telegramBotToken"
                        type={showTelegramBotToken ? 'text' : 'password'}
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        placeholder="Ex.: 123456:ABCDEF..."
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="text"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowTelegramBotToken((v) => !v)}
                        aria-label={showTelegramBotToken ? 'Ocultar token do bot' : 'Mostrar token do bot'}
                      >
                        {showTelegramBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {telegramStatus?.configured
                        ? 'Ja existe um token salvo no sistema. Informe novo token apenas se quiser substituir.'
                        : 'Nenhum token de bot oficial cadastrado ate o momento.'}
                    </p>
                  </div>

                  <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTelegramBotToken('')}
                      disabled={isSavingTelegram}
                    >
                      Limpar
                    </Button>
                    <Button type="button" onClick={() => void handleSaveTelegramBotToken()} disabled={isSavingTelegram}>
                      {isSavingTelegram ? 'Salvando…' : 'Salvar token do bot'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configurações do sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Label className="text-base font-medium">Permitir novos cadastros</Label>
                    <p className="text-sm text-muted-foreground">
                      Controla se novos usuários podem se cadastrar na aplicação.
                    </p>
                  </div>
                  <Switch checked={allowNewRegistrations} onCheckedChange={handleToggleRegistrations} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Label className="text-base font-medium">Ativar sistema de tickets</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando desativado, usuários não verão “Suporte & Tickets”.
                    </p>
                  </div>
                  <Switch checked={ticketsEnabled} onCheckedChange={handleToggleTicketsEnabled} disabled={isSavingTicketsSettings} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove a conta e dados relacionados. Isso não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{deleteTarget.name}</div>
              <div className="text-muted-foreground break-all">{deleteTarget.email}</div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingUser}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()} disabled={isDeletingUser}>
              {isDeletingUser ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (renderAsModal) {
    return (
      <Dialog open onOpenChange={(open) => !open && handleClose()}>
        <DialogContent variant="complex" className="sm:max-w-6xl max-h-[90vh]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="sr-only">Painel Administrativo</DialogTitle>
            {header}
          </DialogHeader>
          {tabs}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {header}
        {tabs}
      </div>
    </main>
  );
};

export default AdminModal;
