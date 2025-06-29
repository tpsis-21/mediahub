
import React, { useState } from 'react';
import { X, User, Palette, Image, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useToast } from '../hooks/use-toast';

interface UserAreaModalProps {
  onClose: () => void;
}

const UserAreaModal: React.FC<UserAreaModalProps> = ({ onClose }) => {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  
  const [brandName, setBrandName] = useState(user?.brandName || '');
  const [primaryColor, setPrimaryColor] = useState(user?.brandColors?.primary || '#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState(user?.brandColors?.secondary || '#8b5cf6');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const canChangeBrandName = () => {
    if (!user?.brandNameChangedAt) return true;
    const lastChange = new Date(user.brandNameChangedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
    return daysDiff >= 15;
  };

  const handleSave = () => {
    if (!user) return;

    const updates: Partial<typeof user> = {
      brandColors: {
        primary: primaryColor,
        secondary: secondaryColor
      }
    };

    if (brandName !== user.brandName && canChangeBrandName()) {
      updates.brandName = brandName;
      updates.brandNameChangedAt = new Date().toISOString();
    }

    if (logoFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        updates.brandLogo = e.target?.result as string;
        updateUser(updates);
        toast({
          title: "Sucesso",
          description: "Configurações salvas com sucesso!",
        });
      };
      reader.readAsDataURL(logoFile);
    } else {
      updateUser(updates);
      toast({
        title: "Sucesso",
        description: "Configurações salvas com sucesso!",
      });
    }

    onClose();
  };

  const daysUntilNextChange = () => {
    if (!user?.brandNameChangedAt) return 0;
    const lastChange = new Date(user.brandNameChangedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - lastChange.getTime()) / (1000 * 3600 * 24);
    return Math.max(0, 15 - Math.floor(daysDiff));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Área do Usuário</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Informações da Marca */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Palette className="h-4 w-4" />
                <span>Configurações da Marca</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nome da Marca */}
              <div>
                <Label htmlFor="brandName">Nome da Marca</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  disabled={!canChangeBrandName()}
                  placeholder="Digite o nome da sua marca"
                />
                {!canChangeBrandName() && (
                  <p className="text-sm text-orange-600 mt-1">
                    Você poderá alterar o nome da marca novamente em {daysUntilNextChange()} dias
                  </p>
                )}
              </div>

              {/* Cores da Marca */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primaryColor">Cor Primária</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#3b82f6"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="secondaryColor">Cor Secundária</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      placeholder="#8b5cf6"
                    />
                  </div>
                </div>
              </div>

              {/* Logo da Marca */}
              <div>
                <Label htmlFor="brandLogo">Logo da Marca</Label>
                <Input
                  id="brandLogo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                />
                {user?.brandLogo && (
                  <div className="mt-2">
                    <img src={user.brandLogo} alt="Logo atual" className="h-16 w-auto" />
                  </div>
                )}
              </div>

              {/* Preview das Cores */}
              <div className="p-4 rounded-lg" style={{ 
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` 
              }}>
                <p className="text-white font-medium">Preview das Cores da Marca</p>
                <p className="text-white/80 text-sm">
                  {brandName || 'Nome da Marca'} - Suas cores personalizadas
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Botão Salvar */}
          <Button onClick={handleSave} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserAreaModal;
