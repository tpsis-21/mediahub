
import React, { useEffect, useRef, useState } from 'react';
import { Image, Key, Palette, Save, User, Wand2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useToast } from '../hooks/use-toast';
import { extractColorsFromImage } from '../utils/colorExtractor';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { apiRequest } from '../services/apiClient';

interface UserAreaModalProps {
  onClose: () => void;
}

const UserAreaModal: React.FC<UserAreaModalProps> = ({ onClose }) => {
  const { user, updateUserDetailed, updateUser, isPremiumExpired } = useAuth();
  const { toast } = useToast();
  
  const [name, setName] = useState(user?.name || '');
  const [brandName, setBrandName] = useState(user?.brandName || '');
  const [primaryColor, setPrimaryColor] = useState(user?.brandColors?.primary || '#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState(user?.brandColors?.secondary || '#8b5cf6');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoIsTransparent, setPendingLogoIsTransparent] = useState<boolean | null>(null);
  const [processedLogoFile, setProcessedLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [processedLogoPreviewUrl, setProcessedLogoPreviewUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [showLogoTransparencyPrompt, setShowLogoTransparencyPrompt] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phone, setPhone] = useState(user?.phone || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [telegramChatId, setTelegramChatId] = useState(user?.telegramChatId || '');
  const [searchIntegrationKey, setSearchIntegrationKey] = useState('');
  const [clearSearchIntegrationKey, setClearSearchIntegrationKey] = useState(false);
  const [searchConfigured, setSearchConfigured] = useState<boolean | null>(null);
  const [searchScope, setSearchScope] = useState<'user' | 'system' | 'none' | null>(null);
  const [isSearchStatusLoading, setIsSearchStatusLoading] = useState(false);
  const [searchStatusError, setSearchStatusError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const colorsDirtyRef = useRef(false);
  const searchKeyDirtyRef = useRef(false);
  const lastAutoColorLogoSigRef = useRef<string | null>(null);

  const refreshSearchStatus = () => {
    setIsSearchStatusLoading(true);
    setSearchStatusError(false);
    return apiRequest<{ configured: boolean; scope: 'user' | 'system' | 'none' }>({ path: '/api/search/status', auth: true })
      .then((payload) => {
        setSearchConfigured(payload.configured);
        setSearchScope(payload.scope);
      })
      .catch(() => {
        setSearchConfigured(null);
        setSearchScope(null);
        setSearchStatusError(true);
      })
      .finally(() => setIsSearchStatusLoading(false));
  };

  useEffect(() => {
    let alive = true;
    setIsSearchStatusLoading(true);
    setSearchStatusError(false);
    apiRequest<{ configured: boolean; scope: 'user' | 'system' | 'none' }>({ path: '/api/search/status', auth: true })
      .then((payload) => {
        if (!alive) return;
        setSearchConfigured(payload.configured);
        setSearchScope(payload.scope);
      })
      .catch(() => {
        if (!alive) return;
        setSearchConfigured(null);
        setSearchScope(null);
        setSearchStatusError(true);
      })
      .finally(() => {
        if (!alive) return;
        setIsSearchStatusLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setTelegramChatId(user?.telegramChatId || '');
  }, [user?.telegramChatId]);

  const handlePrimaryColorChange = (value: string) => {
    colorsDirtyRef.current = true;
    setPrimaryColor(value);
  };

  const handleSecondaryColorChange = (value: string) => {
    colorsDirtyRef.current = true;
    setSecondaryColor(value);
  };

  const canChangeBrandName = () => {
    if (!user?.brandNameChangedAt) return true;
    const lastChange = new Date(user.brandNameChangedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
    return daysDiff >= 15;
  };

  const daysUntilNextBrandNameChange = () => {
    if (!user?.brandNameChangedAt) return 0;
    const lastChange = new Date(user.brandNameChangedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
    return Math.max(0, 15 - Math.floor(daysDiff));
  };

  const parseHexColor = (value: string): { r: number; g: number; b: number } | null => {
    const hex = value.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const n = Number.parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const getReadableTextColor = (fromHexA: string, fromHexB: string) => {
    const a = parseHexColor(fromHexA);
    const b = parseHexColor(fromHexB);
    if (!a || !b) return '#ffffff';
    const r = (a.r + b.r) / 2;
    const g = (a.g + b.g) / 2;
    const bl = (a.b + b.b) / 2;
    const srgb = [r, g, bl].map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    return luminance > 0.6 ? '#111827' : '#ffffff';
  };

  const previewTextColor = getReadableTextColor(primaryColor, secondaryColor);

  const pendingLogoPreviewUrlRef = useRef<string | null>(null);
  const processedLogoPreviewUrlRef = useRef<string | null>(null);
  const logoPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingLogoPreviewUrlRef.current) URL.revokeObjectURL(pendingLogoPreviewUrlRef.current);
    if (!pendingLogoFile) {
      pendingLogoPreviewUrlRef.current = null;
      setPendingLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogoFile);
    pendingLogoPreviewUrlRef.current = url;
    setPendingLogoPreviewUrl(url);
    return () => {
      if (pendingLogoPreviewUrlRef.current === url) {
        URL.revokeObjectURL(url);
        pendingLogoPreviewUrlRef.current = null;
      }
    };
  }, [pendingLogoFile]);

  useEffect(() => {
    if (processedLogoPreviewUrlRef.current) URL.revokeObjectURL(processedLogoPreviewUrlRef.current);
    if (!processedLogoFile) {
      processedLogoPreviewUrlRef.current = null;
      setProcessedLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(processedLogoFile);
    processedLogoPreviewUrlRef.current = url;
    setProcessedLogoPreviewUrl(url);
    return () => {
      if (processedLogoPreviewUrlRef.current === url) {
        URL.revokeObjectURL(url);
        processedLogoPreviewUrlRef.current = null;
      }
    };
  }, [processedLogoFile]);

  useEffect(() => {
    if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
    if (!logoFile) {
      logoPreviewUrlRef.current = null;
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    logoPreviewUrlRef.current = url;
    setLogoPreviewUrl(url);
    return () => {
      if (logoPreviewUrlRef.current === url) {
        URL.revokeObjectURL(url);
        logoPreviewUrlRef.current = null;
      }
    };
  }, [logoFile]);

  const decodeImageFromFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new window.Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const hasTransparentPixels = async (file: File) => {
    const img = await decodeImageFromFile(file);
    const canvas = document.createElement('canvas');
    const maxSide = 600;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  };

  const removeFlatBackground = async (file: File) => {
    const img = await decodeImageFromFile(file);
    const canvas = document.createElement('canvas');
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const sampleCorner = (sx: number, sy: number) => {
      const size = Math.max(6, Math.round(Math.min(canvas.width, canvas.height) * 0.03));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = sy; y < Math.min(canvas.height, sy + size); y++) {
        for (let x = sx; x < Math.min(canvas.width, sx + size); x++) {
          const idx = (y * canvas.width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }
      if (count === 0) return { r: 255, g: 255, b: 255 };
      return { r: r / count, g: g / count, b: b / count };
    };

    const tl = sampleCorner(0, 0);
    const tr = sampleCorner(Math.max(0, canvas.width - 8), 0);
    const bl = sampleCorner(0, Math.max(0, canvas.height - 8));
    const br = sampleCorner(Math.max(0, canvas.width - 8), Math.max(0, canvas.height - 8));

    const bg = {
      r: (tl.r + tr.r + bl.r + br.r) / 4,
      g: (tl.g + tr.g + bl.g + br.g) / 4,
      b: (tl.b + tr.b + bl.b + br.b) / 4,
    };

    const low = 18;
    const high = 55;

    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - bg.r;
      const dg = data[i + 1] - bg.g;
      const db = data[i + 2] - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= low) {
        data[i + 3] = 0;
        continue;
      }
      if (dist >= high) {
        data[i + 3] = 255;
        continue;
      }
      const t = (dist - low) / (high - low);
      data[i + 3] = Math.max(0, Math.min(255, Math.round(255 * t)));
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem'))), 'image/png');
    });

    return new File([blob], 'logo_transparente.png', { type: 'image/png' });
  };

  const handleSelectLogoFile = async (file: File | null) => {
    colorsDirtyRef.current = false;
    lastAutoColorLogoSigRef.current = null;
    setRemoveLogo(false);
    setLogoFile(null);
    setPendingLogoFile(null);
    setPendingLogoIsTransparent(null);
    setProcessedLogoFile(null);
    setShowLogoTransparencyPrompt(false);

    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'Escolha uma imagem menor (até 4MB).',
        variant: 'destructive',
      });
      return;
    }

    try {
      const transparent = await hasTransparentPixels(file);
      setPendingLogoIsTransparent(transparent);
      setPendingLogoFile(file);
      setShowLogoTransparencyPrompt(true);
    } catch {
      setPendingLogoIsTransparent(null);
      setPendingLogoFile(file);
      setShowLogoTransparencyPrompt(true);
    }
  };

  const handleRemoveLogoBackground = async () => {
    if (!pendingLogoFile) return;
    if (isRemovingBg) return;
    setIsRemovingBg(true);
    try {
      const processed = await removeFlatBackground(pendingLogoFile);
      setProcessedLogoFile(processed);
      toast({ title: 'Preview pronto', description: 'Confira o resultado e escolha se deseja usar.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível remover o fundo. Tente outra imagem.', variant: 'destructive' });
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    const updates: Partial<typeof user> & { searchIntegrationKey?: string | null } = {
      name: name.trim() ? name.trim() : user.name,
      brandColors: {
        primary: primaryColor,
        secondary: secondaryColor
      },
      phone: phone || undefined,
      website: website || undefined,
      telegramChatId: telegramChatId.trim() ? telegramChatId.trim() : null
    };

    if (searchKeyDirtyRef.current) {
      const nextKey = searchIntegrationKey.trim();
      if (clearSearchIntegrationKey) {
        updates.searchIntegrationKey = null;
      } else if (nextKey) {
        updates.searchIntegrationKey = nextKey;
      }
    }

    const nextBrandName = brandName.trim();
    if (nextBrandName !== (user.brandName || '') && canChangeBrandName()) {
      updates.brandName = nextBrandName;
    }

    if (logoFile) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        updates.brandLogo = e.target?.result as string;
        const result = await updateUserDetailed(updates);
        if (result.ok) {
          toast({ title: "Sucesso", description: "Configurações salvas com sucesso!" });
          setLogoFile(null);
          setRemoveLogo(false);
          if (searchKeyDirtyRef.current) {
            searchKeyDirtyRef.current = false;
            setSearchIntegrationKey('');
            setClearSearchIntegrationKey(false);
            await refreshSearchStatus();
          }
        } else {
          toast({
            title: 'Erro',
            description: result.message || 'Não foi possível salvar agora. Tente novamente.',
            variant: 'destructive',
          });
        }
        setIsSaving(false);
      };
      reader.readAsDataURL(logoFile);
      return;
    } else {
      if (removeLogo) {
        updates.brandLogo = null;
      }
      const result = await updateUserDetailed(updates);
      if (result.ok) {
        toast({ title: "Sucesso", description: "Configurações salvas com sucesso!" });
        setLogoFile(null);
        setRemoveLogo(false);
        if (searchKeyDirtyRef.current) {
          searchKeyDirtyRef.current = false;
          setSearchIntegrationKey('');
          setClearSearchIntegrationKey(false);
          await refreshSearchStatus();
        }
      } else {
        toast({
          title: 'Erro',
          description: result.message || 'Não foi possível salvar agora. Tente novamente.',
          variant: 'destructive',
        });
      }
      setIsSaving(false);
    }
  };

  const handleExtractColors = async () => {
    if (!logoFile) {
      toast({
        title: "Erro",
        description: "Selecione uma logo primeiro!",
        variant: "destructive",
      });
      return;
    }

    setIsExtractingColors(true);
    try {
      const colors = await extractColorsFromImage(logoFile);
      colorsDirtyRef.current = true;
      setPrimaryColor(colors.primary);
      setSecondaryColor(colors.secondary);
      
      toast({
        title: "Sucesso",
        description: "Cores extraídas da logo com sucesso!",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao extrair cores da logo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingColors(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha senha atual, nova senha e confirmação.',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: 'Senha fraca',
        description: 'A nova senha deve ter pelo menos 8 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Confirmação inválida',
        description: 'A confirmação da senha não confere.',
        variant: 'destructive',
      });
      return;
    }
    if (currentPassword === newPassword) {
      toast({
        title: 'Senha repetida',
        description: 'A nova senha precisa ser diferente da senha atual.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsChangingPassword(true);
      await apiRequest<{ ok: true }>({
        path: '/api/me/password',
        method: 'POST',
        auth: true,
        body: { currentPassword, newPassword, confirmPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({
        title: 'Senha atualizada',
        description: 'Sua senha foi alterada com sucesso.',
      });
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : 'Não foi possível atualizar a senha agora.';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  useEffect(() => {
    if (!logoFile) return;
    if (colorsDirtyRef.current) return;

    const sig = `${logoFile.name}:${logoFile.size}:${logoFile.lastModified}`;
    if (lastAutoColorLogoSigRef.current === sig) return;
    lastAutoColorLogoSigRef.current = sig;

    void (async () => {
      try {
        const colors = await extractColorsFromImage(logoFile);
        setPrimaryColor(colors.primary);
        setSecondaryColor(colors.secondary);
        toast({ title: 'Cores sugeridas', description: 'Carregamos cores automaticamente a partir da sua logo.' });
      } catch {
        lastAutoColorLogoSigRef.current = null;
      }
    })();
  }, [logoFile, toast]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="complex" className="sm:max-w-3xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <span>Minha Área</span>
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{user?.email}</Badge>
            <Badge variant={user?.type === 'admin' ? 'default' : 'secondary'}>
              {user?.type === 'admin' ? 'Admin' : user?.type === 'premium' ? 'Premium' : 'Free'}
            </Badge>
            {user?.subscriptionEnd && (
              <Badge variant={isPremiumExpired() ? 'destructive' : 'outline'}>
                {isPremiumExpired() ? 'Assinatura expirada em ' : 'Assinatura até '}
                {new Date(user.subscriptionEnd).toLocaleDateString('pt-BR')}
              </Badge>
            )}
            {user?.isActive === false && <Badge variant="destructive">Inativo</Badge>}
          </div>
        </DialogHeader>

        <Tabs defaultValue="account" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="account">Conta</TabsTrigger>
            <TabsTrigger value="brand">Marca</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
            <TabsTrigger value="search">Busca</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Dados do perfil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email</Label>
                    <Input value={user?.email || ''} disabled />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      inputMode="tel"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://seusite.com"
                      inputMode="url"
                    />
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="text-sm font-semibold">Alterar senha</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="currentPassword">Senha atual</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="newPassword">Nova senha</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={() => void handleChangePassword()} disabled={isChangingPassword}>
                      {isChangingPassword ? 'Atualizando senha...' : 'Atualizar senha'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="brand" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  <span>Marca</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="brandName">Nome da marca</Label>
                  <Input
                    id="brandName"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    disabled={!canChangeBrandName()}
                    placeholder="Digite o nome da sua marca"
                  />
                  {!canChangeBrandName() && (
                    <p className="text-sm text-muted-foreground">
                      Você poderá alterar novamente em {daysUntilNextBrandNameChange()} dias.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Cor primária</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => handlePrimaryColorChange(e.target.value)}
                        className="w-16 h-10 p-1"
                        aria-label="Selecionar cor primária"
                      />
                      <Input value={primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} placeholder="#3b82f6" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">Cor secundária</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="secondaryColor"
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => handleSecondaryColorChange(e.target.value)}
                        className="w-16 h-10 p-1"
                        aria-label="Selecionar cor secundária"
                      />
                      <Input value={secondaryColor} onChange={(e) => handleSecondaryColorChange(e.target.value)} placeholder="#8b5cf6" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="brandLogo">Logo</Label>
                  <p className="text-sm text-muted-foreground">
                    Recomendado: PNG com fundo transparente, formato quadrado (512×512 ou 1024×1024), sem bordas encostando e com boa área de respiro para não cortar na renderização. Evite JPG e imagens muito pequenas/esticadas.
                  </p>
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <Input
                      id="brandLogo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        void handleSelectLogoFile(e.target.files?.[0] || null);
                      }}
                      className="flex-1"
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleExtractColors}
                        disabled={!logoFile || isExtractingColors}
                      >
                        <Wand2 className="h-4 w-4 mr-2" />
                        {isExtractingColors ? 'Extraindo...' : 'Extrair cores'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setLogoFile(null);
                          setRemoveLogo(true);
                        }}
                        disabled={!user?.brandLogo}
                      >
                        Remover logo
                      </Button>
                    </div>
                  </div>
                  {showLogoTransparencyPrompt && pendingLogoFile && (
                    <div className="rounded-lg border p-3 space-y-3">
                      <div className="text-sm font-medium">Sua logo tem fundo transparente?</div>
                      <div className="text-sm text-muted-foreground">
                        {pendingLogoIsTransparent === true
                          ? 'Parece que o arquivo já tem transparência. Você pode usar assim ou tentar remover o fundo mesmo assim.'
                          : 'Se não tiver, a aplicação remove o fundo e mostra um preview para você decidir.'}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setLogoFile(pendingLogoFile);
                            setPendingLogoFile(null);
                            setPendingLogoIsTransparent(null);
                            setShowLogoTransparencyPrompt(false);
                          }}
                        >
                          {pendingLogoIsTransparent === true ? 'Usar assim' : 'Sim'}
                        </Button>
                        <Button type="button" onClick={() => void handleRemoveLogoBackground()} disabled={isRemovingBg}>
                          {isRemovingBg ? 'Processando…' : 'Não, remover fundo'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setPendingLogoFile(null);
                            setPendingLogoIsTransparent(null);
                            setShowLogoTransparencyPrompt(false);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {processedLogoFile && processedLogoPreviewUrl && (
                    <div className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Preview (fundo removido)</p>
                          <p className="text-sm text-muted-foreground">Se estiver ok, selecione para salvar.</p>
                        </div>
                      </div>
                      <img
                        src={processedLogoPreviewUrl}
                        alt="Preview da logo com fundo removido"
                        className="h-20 w-auto object-contain bg-gray-100 rounded p-2"
                      />
                      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                        <Button
                          type="button"
                          onClick={() => {
                            setLogoFile(processedLogoFile);
                            setProcessedLogoFile(null);
                            setPendingLogoFile(null);
                          }}
                        >
                          Usar esta logo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setProcessedLogoFile(null);
                            setPendingLogoFile(null);
                          }}
                        >
                          Não usar
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {user?.brandLogo && !removeLogo && (
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium mb-2">Logo atual</p>
                        <img
                          src={user.brandLogo}
                          alt="Logo atual"
                          className="h-16 w-auto object-contain bg-gray-100 rounded p-2"
                        />
                      </div>
                    )}
                    {logoFile && logoPreviewUrl && (
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium mb-2">Nova logo</p>
                        <img
                          src={logoPreviewUrl}
                          alt="Nova logo"
                          className="h-16 w-auto object-contain bg-gray-100 rounded p-2"
                        />
                      </div>
                    )}
                    {pendingLogoFile && pendingLogoPreviewUrl && !logoFile && !processedLogoFile && (
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium mb-2">Arquivo enviado</p>
                        <img
                          src={pendingLogoPreviewUrl}
                          alt="Logo enviada"
                          className="h-16 w-auto object-contain bg-gray-100 rounded p-2"
                        />
                      </div>
                    )}
                    {removeLogo && (
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium">Logo</p>
                        <p className="text-sm text-muted-foreground">A logo será removida ao salvar.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="p-4 rounded-lg border"
                  style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`, color: previewTextColor }}
                >
                  <p className="font-semibold">Preview</p>
                  <p className="text-sm opacity-90">{brandName.trim() || 'Nome da marca'}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="telegram" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  <span>Telegram</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={user?.telegramChatId?.trim() ? 'outline' : 'secondary'}>
                    Destino Telegram: {user?.telegramChatId?.trim() ? 'configurado' : 'não configurado'}
                  </Badge>
                  {telegramChatId.trim() !== (user?.telegramChatId || '').trim() && (
                    <Badge variant="secondary">Alteração pendente de salvar</Badge>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="telegramChatId">ID do Telegram (chat_id)</Label>
                  <Input
                    id="telegramChatId"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Ex: 123456789 ou -1001234567890"
                    inputMode="text"
                    autoComplete="off"
                  />
                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      user?.telegramChatId?.trim()
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    {user?.telegramChatId?.trim()
                      ? 'Ja existe um chat_id configurado para envio via Telegram.'
                      : 'Nenhum chat_id configurado no momento.'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Para descobrir seu ID: no Telegram, abra o bot @userinfobot, toque em Start e copie o ID exibido.
                    Para grupos/canais, adicione o bot no chat e repita (IDs podem começar com -100).
                    Depois de salvar aqui, abra o bot que vai enviar as mensagens e toque em Iniciar (/start). Sem isso o Telegram pode bloquear o recebimento.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  <span>Configuração de busca</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      isSearchStatusLoading
                        ? 'secondary'
                        : searchStatusError
                          ? 'destructive'
                        : searchConfigured
                          ? 'outline'
                          : 'destructive'
                    }
                  >
                    {isSearchStatusLoading
                      ? 'Status: verificando...'
                      : searchStatusError
                        ? 'Status: indisponível'
                        : searchConfigured
                          ? 'Status: configurado'
                          : 'Status: não configurado'}
                  </Badge>
                  {searchScope && searchScope !== 'none' && (
                    <Badge variant="secondary">{searchScope === 'user' ? 'Escopo: sua conta' : 'Escopo: sistema'}</Badge>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void refreshSearchStatus();
                    }}
                    disabled={isSearchStatusLoading}
                  >
                    {isSearchStatusLoading ? 'Verificando...' : 'Recarregar status'}
                  </Button>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="searchIntegrationKey">Chave de acesso da busca (opcional)</Label>
                  <Input
                    id="searchIntegrationKey"
                    type="password"
                    value={searchIntegrationKey}
                    onChange={(e) => {
                      searchKeyDirtyRef.current = true;
                      setClearSearchIntegrationKey(false);
                      setSearchIntegrationKey(e.target.value);
                    }}
                    placeholder="Cole aqui a sua chave"
                    autoComplete="off"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        searchKeyDirtyRef.current = true;
                        setSearchIntegrationKey('');
                        setClearSearchIntegrationKey(true);
                      }}
                      disabled={isSaving}
                    >
                      Limpar chave
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Por segurança, a chave não é exibida depois de salva. Você pode substituir ou limpar quando quiser.
                  </p>
                </div>

                <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Se a busca estiver com falhas recorrentes, fale com o suporte para receber orientações.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Fechar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserAreaModal;
