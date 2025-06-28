
import React, { useState } from 'react';
import { Settings, Key } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

const ApiKeyModal: React.FC = () => {
  const [apiKey, setApiKey] = useState(localStorage.getItem('tmdb_api_key') || '');
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('tmdb_api_key', apiKey.trim());
      window.location.reload(); // Recarregar para aplicar a nova chave
    }
  };

  const handleClear = () => {
    localStorage.removeItem('tmdb_api_key');
    setApiKey('');
    window.location.reload();
  };

  const currentKey = localStorage.getItem('tmdb_api_key');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center space-x-2">
          <Settings className="h-4 w-4" />
          <span>API Config</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Configurar API TMDB</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apikey">Chave da API TMDB</Label>
            <Input
              id="apikey"
              type="password"
              placeholder="Cole sua chave da API aqui..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          
          {currentKey && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-green-600">
                  ✓ API Key configurada
                </p>
              </CardContent>
            </Card>
          )}
          
          <div className="text-xs text-gray-600 space-y-1">
            <p>Para obter sua chave da API:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Acesse <a href="https://www.themoviedb.org/" target="_blank" className="text-blue-600 underline">themoviedb.org</a></li>
              <li>Crie uma conta gratuita</li>
              <li>Vá para Settings → API</li>
              <li>Solicite uma API Key</li>
              <li>Use a "API Key (v3 auth)"</li>
            </ol>
          </div>
          
          <div className="flex space-x-2">
            <Button onClick={handleSave} disabled={!apiKey.trim()} className="flex-1">
              Salvar
            </Button>
            {currentKey && (
              <Button variant="outline" onClick={handleClear}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ApiKeyModal;
