
import React, { useState } from 'react';
import { X, Settings, Users, Database, Key, Plus, BarChart3, UserCheck, UserX, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { useToast } from '../hooks/use-toast';

interface AdminModalProps {
  onClose: () => void;
}

interface User {
  id: string;
  name: string;
  email: string;
  type: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
  lastLogin?: string;
  brandName?: string;
}

const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [tmdbApiKey, setTmdbApiKey] = useState(localStorage.getItem('tmdb_api_key') || '');
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(
    localStorage.getItem('allow_registrations') !== 'false'
  );
  
  // Mock data - em produção viria de uma API/database
  const [users, setUsers] = useState<User[]>([
    { 
      id: 'admin', 
      name: 'Admin', 
      email: 'admin@tmdb.com', 
      type: 'admin', 
      status: 'active',
      createdAt: '2024-01-01',
      lastLogin: '2024-01-15'
    },
    { 
      id: '2', 
      name: 'João Silva', 
      email: 'joao@test.com', 
      type: 'user', 
      status: 'active',
      createdAt: '2024-01-05',
      lastLogin: '2024-01-14',
      brandName: 'Silva Movies'
    },
    { 
      id: '3', 
      name: 'Maria Santos', 
      email: 'maria@test.com', 
      type: 'user', 
      status: 'inactive',
      createdAt: '2024-01-10',
      brandName: 'Santos Cinema'
    },
  ]);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    brandName: '',
    type: 'user' as 'admin' | 'user'
  });

  // Estatísticas
  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    totalSearches: 1247,
    bannersGenerated: 567,
    coversDownloaded: 890,
    apiCalls: 3450
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('tmdb_api_key', tmdbApiKey);
    toast({
      title: "Sucesso",
      description: "Chave da API salva com sucesso!",
    });
  };

  const handleToggleRegistrations = (enabled: boolean) => {
    setAllowNewRegistrations(enabled);
    localStorage.setItem('allow_registrations', enabled.toString());
    toast({
      title: "Configuração atualizada",
      description: `Cadastros ${enabled ? 'habilitados' : 'desabilitados'}`,
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

    const user: User = {
      id: Date.now().toString(),
      name: newUser.name,
      email: newUser.email,
      type: newUser.type,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      brandName: newUser.brandName
    };

    setUsers([...users, user]);
    setNewUser({ name: '', email: '', password: '', brandName: '', type: 'user' });
    
    toast({
      title: "Sucesso",
      description: "Usuário criado com sucesso!",
    });
  };

  const handleToggleUserStatus = (userId: string) => {
    setUsers(users.map(u => 
      u.id === userId 
        ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' }
        : u
    ));
    
    toast({
      title: "Status atualizado",
      description: "Status do usuário foi alterado",
    });
  };

  if (user?.type !== 'admin') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Painel Administrativo</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard" className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4" />
                <span>Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Usuários</span>
              </TabsTrigger>
              <TabsTrigger value="api" className="flex items-center space-x-2">
                <Key className="h-4 w-4" />
                <span>API TMDB</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Relatórios</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total de Usuários</p>
                        <p className="text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Usuários Ativos</p>
                        <p className="text-3xl font-bold text-green-600">{stats.activeUsers}</p>
                      </div>
                      <UserCheck className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Buscas Realizadas</p>
                        <p className="text-3xl font-bold text-purple-600">{stats.totalSearches}</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-purple-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Banners Gerados</p>
                        <p className="text-3xl font-bold text-orange-600">{stats.bannersGenerated}</p>
                      </div>
                      <Eye className="h-8 w-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Capas Baixadas</p>
                        <p className="text-3xl font-bold text-red-600">{stats.coversDownloaded}</p>
                      </div>
                      <Database className="h-8 w-8 text-red-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Chamadas API</p>
                        <p className="text-3xl font-bold text-indigo-600">{stats.apiCalls}</p>
                      </div>
                      <Key className="h-8 w-8 text-indigo-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Criar Novo Usuário</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="newUserName">Nome</Label>
                      <Input
                        id="newUserName"
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newUserEmail">Email</Label>
                      <Input
                        id="newUserEmail"
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newUserPassword">Senha</Label>
                      <Input
                        id="newUserPassword"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="Senha"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newUserBrand">Nome da Marca</Label>
                      <Input
                        id="newUserBrand"
                        value={newUser.brandName}
                        onChange={(e) => setNewUser({ ...newUser, brandName: e.target.value })}
                        placeholder="Nome da marca"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Label>Tipo de usuário:</Label>
                    <div className="flex space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={newUser.type === 'user'}
                          onChange={() => setNewUser({ ...newUser, type: 'user' })}
                        />
                        <span>Usuário</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={newUser.type === 'admin'}
                          onChange={() => setNewUser({ ...newUser, type: 'admin' })}
                        />
                        <span>Admin</span>
                      </label>
                    </div>
                  </div>
                  <Button onClick={handleCreateUser} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Usuário
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gerenciamento de Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium">{user.name}</h3>
                            <Badge variant={user.type === 'admin' ? 'default' : 'secondary'}>
                              {user.type}
                            </Badge>
                            <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                              {user.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                          {user.brandName && (
                            <p className="text-sm text-blue-600">Marca: {user.brandName}</p>
                          )}
                          <div className="text-xs text-gray-500 mt-1">
                            Criado em: {user.createdAt}
                            {user.lastLogin && ` • Último login: ${user.lastLogin}`}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleUserStatus(user.id)}
                            className={user.status === 'active' ? 'hover:bg-red-50' : 'hover:bg-green-50'}
                          >
                            {user.status === 'active' ? (
                              <>
                                <UserX className="h-4 w-4 mr-1" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 mr-1" />
                                Ativar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="api" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração da API do TMDB</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="apiKey">Chave da API</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={tmdbApiKey}
                      onChange={(e) => setTmdbApiKey(e.target.value)}
                      placeholder="Insira sua chave da API do TMDB"
                    />
                  </div>
                  <Button onClick={handleSaveApiKey} className="w-full">
                    Salvar Configuração
                  </Button>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p>Status: {tmdbApiKey ? '✅ Configurado' : '❌ Não configurado'}</p>
                    <p className="mt-2">Para obter sua chave da API, visite: <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">TMDB API Settings</a></p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Configurações do Sistema</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Permitir novos cadastros</Label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Controla se novos usuários podem se cadastrar na aplicação
                      </p>
                    </div>
                    <Switch
                      checked={allowNewRegistrations}
                      onCheckedChange={handleToggleRegistrations}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="database" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Relatórios do Sistema</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="font-semibold">Atividade dos Usuários</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Usuários ativos hoje:</span>
                          <span className="font-semibold">12</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Buscas hoje:</span>
                          <span className="font-semibold">45</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Banners gerados hoje:</span>
                          <span className="font-semibold">23</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="font-semibold">Performance da API</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Chamadas hoje:</span>
                          <span className="font-semibold">234</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Taxa de sucesso:</span>
                          <span className="font-semibold text-green-600">98.5%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tempo médio:</span>
                          <span className="font-semibold">0.8s</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminModal;
