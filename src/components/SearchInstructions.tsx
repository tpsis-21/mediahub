
import React from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Search, Download, Users, Crown } from 'lucide-react';

const SearchInstructions: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Search className="h-5 w-5" />
          <span>{t('search.instructions.title')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Como usar:</h4>
            <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
              <li>{t('search.instructions.step1')}</li>
              <li>{t('search.instructions.step2')}</li>
              <li>{t('search.instructions.step3')}</li>
              <li>{t('search.instructions.step4')}</li>
              <li>{t('search.instructions.step5')}</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              {!user ? (
                <>
                  <Users className="h-4 w-4 text-orange-500" />
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    Visitante
                  </Badge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('search.instructions.guest')}
                  </span>
                </>
              ) : user.type === 'premium' || user.type === 'admin' ? (
                <>
                  <Crown className="h-4 w-4 text-gold-500" />
                  <Badge className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white">
                    Premium
                  </Badge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('search.instructions.premium')}
                  </span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 text-blue-500" />
                  <Badge variant="outline">
                    Usuário Gratuito
                  </Badge>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Buscas ilimitadas, recursos básicos
                  </span>
                </>
              )}
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p><strong>Recursos Premium:</strong></p>
              <ul className="list-disc list-inside ml-2">
                <li>Busca em massa</li>
                <li>Geração de banners profissionais</li>
                <li>Download em lote otimizado</li>
                <li>Suporte prioritário</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SearchInstructions;
