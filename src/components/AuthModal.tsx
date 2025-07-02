
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Checkbox } from './ui/checkbox';

interface AuthModalProps {
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { login, register, isLoading } = useAuth();
  const { t } = useI18n();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    brandName: '',
    acceptTerms: false
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      if (formData.password !== formData.confirmPassword) {
        setError('As senhas não coincidem');
        return;
      }
      
      if (!formData.acceptTerms) {
        setError('Você deve aceitar os termos de uso');
        return;
      }

      if (!formData.name || !formData.phone || !formData.brandName) {
        setError('Todos os campos são obrigatórios');
        return;
      }
    }

    try {
      let success = false;
      if (isLogin) {
        success = await login(formData.email, formData.password);
      } else {
        success = await register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          brandName: formData.brandName
        });
      }

      if (success) {
        onClose();
      } else {
        setError('Credenciais inválidas');
      }
    } catch (err) {
      setError('Erro no sistema');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{isLogin ? t('auth.login') : t('auth.register')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="name">{t('auth.name')} *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                  />
                </div>
                
                <div>
                  <Label htmlFor="phone">{t('auth.phone')} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    required={!isLogin}
                  />
                </div>
                
                <div>
                  <Label htmlFor="brandName">{t('auth.brandName')} *</Label>
                  <Input
                    id="brandName"
                    type="text"
                    value={formData.brandName}
                    onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                    placeholder="Digite o nome da sua marca"
                    required={!isLogin}
                  />
                </div>
              </>
            )}
            
            <div>
              <Label htmlFor="email">{t('auth.email')} *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={isLogin ? "admin@capturecapas.com para admin" : "seu@email.com"}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="password">{t('auth.password')} *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="confirmPassword">{t('auth.confirmPassword')} *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, acceptTerms: checked as boolean })
                    }
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-gray-600 dark:text-gray-400">
                    {t('auth.terms')} *
                  </label>
                </div>
              </>
            )}

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Carregando...' : (isLogin ? t('auth.login') : t('auth.register'))}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm"
            >
              {isLogin ? 'Criar conta' : 'Já tenho conta'}
            </Button>
          </div>

          {isLogin && (
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p><strong>Conta Admin:</strong> admin@capturecapas.com</p>
              <p><strong>Usuário comum:</strong> qualquer outro email</p>
              <p><strong>Premium:</strong> inclua "premium" no email</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthModal;
