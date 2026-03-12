
import React from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Search, Download, Users, Crown } from 'lucide-react';

const SearchInstructions: React.FC = () => {
  const { t } = useI18n();
  const { user, isPremiumActive } = useAuth();

  return (
    <Card className="mb-6 glass-effect">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Search className="h-5 w-5" />
          <span>{t('search.instructions.title')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Como funciona</h4>
            <ul className="text-sm space-y-2 text-muted-foreground list-disc pl-5">
              <li>Busque por nome (opcionalmente com ano).</li>
              <li>Selecione os itens desejados.</li>
              <li>Baixe imagens individuais ou em lote.</li>
              <li>Gere banners prontos para publicar.</li>
              <li>Copie sinopses com um clique.</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {!user ? (
                <>
                  <Users className="h-4 w-4 text-amber-600" />
                  <Badge variant="outline">
                    Login necessário
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {t('search.instructions.guest')}
                  </span>
                </>
              ) : isPremiumActive() ? (
                <>
                  <Crown className="h-4 w-4 text-amber-500" />
                  <Badge className="gradient-primary text-white border-0">
                    Premium
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {t('search.instructions.premium')}
                  </span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 text-primary" />
                  <Badge variant="outline">
                    Usuário Gratuito
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Buscas ilimitadas, recursos básicos
                  </span>
                </>
              )}
            </div>
            
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Recursos Premium</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Busca em massa</li>
                <li>Geração de banners</li>
                <li>Download em lote</li>
                <li>Personalização de marca</li>
                <li>Sem limite de buscas diárias</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SearchInstructions;
