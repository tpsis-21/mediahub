
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, EyeOff, Key, Pencil, Plus, Settings, Trash2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isResettingPasswordFor, setIsResettingPasswordFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
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

  const handleToggleRegistrations = (enabled: boolean) => {
    const previous = allowNewRegistrations;
    setAllowNewRegistrations(enabled);
    localStorage.setItem('allow_registrations', enabled.toString());

    apiRequest<void>({
      path: '/api/admin/settings',
      method: 'PUT',
      auth: true,
      body: { allowRegistrations: enabled },
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Usuários</span>
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

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Integrações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={searchProviderStatus?.primaryConfigured ? 'outline' : 'secondary'}>
                      Chave principal {searchProviderStatus?.primaryConfigured ? 'configurada' : 'não configurada'}
                    </Badge>
                    <Badge variant={searchProviderStatus?.secondaryConfigured ? 'outline' : 'secondary'}>
                      Chave secundária {searchProviderStatus?.secondaryConfigured ? 'configurada' : 'não configurada'}
                    </Badge>
                    <Button type="button" variant="outline" size="sm" onClick={refreshSearchProviderStatus} disabled={isSearchProviderLoading}>
                      {isSearchProviderLoading ? 'Carregando…' : 'Recarregar'}
                    </Button>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Por segurança, as chaves não são exibidas depois de salvas. Para alterar, informe novamente e salve.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="searchProviderPrimaryKey">Chave principal</Label>
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
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="searchProviderSecondaryKey">Chave secundária (opcional)</Label>
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
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
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
