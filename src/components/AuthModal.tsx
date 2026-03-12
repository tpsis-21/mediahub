
import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface AuthModalProps {
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { login, register, isLoading, authError } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
  const [showReset, setShowReset] = useState(false);
  const [resetStage, setResetStage] = useState<'request' | 'confirm'>('request');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
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
      if (mode === 'login') {
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
        setError(authError || 'Credenciais inválidas');
      }
    } catch (err) {
      setError('Não foi possível concluir. Tente novamente.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? t('auth.login') : t('auth.register')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value === 'register' ? 'register' : 'login');
              setError('');
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
              <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'login' && showReset && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{resetStage === 'request' ? 'Recuperação de senha' : 'Digite o código recebido'}</AlertTitle>
              <AlertDescription>
                {resetStage === 'request'
                  ? <p>Informe seu e‑mail e enviaremos o link de redefinição.</p>
                  : <p>Insira o código do email e defina sua nova senha.</p>}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível concluir</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">{t('auth.name')} *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">{t('auth.phone')} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="brandName">{t('auth.brandName')} *</Label>
                  <Input
                    id="brandName"
                    type="text"
                    value={formData.brandName}
                    onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                    placeholder="Digite o nome da sua marca"
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="email">{t('auth.email')} *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={mode === 'login' ? 'Digite seu email' : 'seu@email.com'}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">{t('auth.password')} *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
              {mode === 'login' && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setShowReset((v) => !v)}
                  >
                    Esqueci minha senha
                  </button>
                  {showReset && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={async () => {
                        try {
                          const email = formData.email.trim();
                          if (!email) {
                            setError('Informe seu e‑mail para solicitar recuperação.');
                            return;
                          }
                          const { apiRequest } = await import('../services/apiClient');
                          await apiRequest<{ ok: boolean }>({
                            path: '/api/auth/password-reset/start',
                            method: 'POST',
                            body: { email },
                          });
                          setResetStage('confirm');
                          setShowReset(true);
                          setError('');
                        } catch (e) {
                          setError('Não foi possível solicitar recuperação agora.');
                        }
                      }}
                    >
                      Solicitar recuperação
                    </button>
                  )}
                </div>
              )}
            </div>

            {mode === 'login' && showReset && resetStage === 'confirm' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="resetToken">Código</Label>
                  <Input
                    id="resetToken"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Cole o código do email"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Defina sua nova senha"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        setError('');
                        const token = resetToken.trim();
                        const pass = newPassword.trim();
                        const pass2 = confirmNewPassword.trim();
                        if (!token || !pass || !pass2) {
                          setError('Preencha código e senhas.');
                          return;
                        }
                        if (pass !== pass2) {
                          setError('As senhas não coincidem.');
                          return;
                        }
                        const { apiRequest } = await import('../services/apiClient');
                        await apiRequest<{ ok: boolean }>({
                          path: '/api/auth/password-reset/confirm',
                          method: 'POST',
                          body: { token, password: pass },
                        });
                        setShowReset(false);
                        setResetStage('request');
                        setResetToken('');
                        setNewPassword('');
                        setConfirmNewPassword('');
                      } catch (e) {
                        setError('Não foi possível redefinir a senha. Verifique o código e tente novamente.');
                      }
                    }}
                  >
                    Redefinir senha
                  </Button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">{t('auth.confirmPassword')} *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, acceptTerms: checked === true })
                    }
                  />
                  <Label htmlFor="acceptTerms" className="text-sm font-normal leading-5">
                    {t('auth.terms')} *
                  </Label>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Carregando...' : mode === 'login' ? t('auth.login') : t('auth.register')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
