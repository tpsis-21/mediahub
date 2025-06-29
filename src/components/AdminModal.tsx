
import React, { useState } from 'react';
import { X, Settings, Users, Database, Key } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

interface AdminModalProps {
  onClose: () => void;
}

const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tmdbApiKey, setTmdbApiKey] = useState(localStorage.getItem('tmdb_api_key') || '');
  const [users] = useState([
    { id: '1', name: 'Admin', email: 'admin@tmdb.com', type: 'admin', status: 'active' },
    { id: '2', name: 'Usuário Demo', email: 'user@test.com', type: 'user', status: 'active' },
  ]);

  const handleSaveApiKey = () => {
    localStorage.setItem('tmdb_api_key', tmdbApiKey);
    alert('Chave da API salva com sucesso!');
  };

  if (user?.type !== 'admin') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
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
          <Tabs defaultValue="api" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="api" className="flex items-center space-x-2">
                <Key className="h-4 w-4" />
                <span>API TMDB</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Usuários</span>
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>Banco de Dados</span>
              </TabsTrigger>
            </TabsList>

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

            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Gerenciamento de Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{user.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={user.type === 'admin' ? 'default' : 'secondary'}>
                            {user.type}
                          </Badge>
                          <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                            {user.status}
                          </Badge>
                          <Button variant="outline" size="sm">
                            Editar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="database" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Estatísticas do Banco de Dados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <h3 className="font-medium text-blue-900 dark:text-blue-100">Total de Usuários</h3>
                      <p className="text-2xl font-bold text-blue-600">{users.length}</p>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <h3 className="font-medium text-green-900 dark:text-green-100">Buscas Realizadas</h3>
                      <p className="text-2xl font-bold text-green-600">1,234</p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <h3 className="font-medium text-purple-900 dark:text-purple-100">Banners Gerados</h3>
                      <p className="text-2xl font-bold text-purple-600">567</p>
                    </div>
                    <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <h3 className="font-medium text-orange-900 dark:text-orange-100">Capas Baixadas</h3>
                      <p className="text-2xl font-bold text-orange-600">890</p>
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
