
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Crown } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

const ExpiryNotice: React.FC = () => {
  const { user, getDaysUntilExpiry, isNearExpiry } = useAuth();

  if (!user || user.type !== 'premium' || !isNearExpiry()) {
    return null;
  }

  const daysLeft = getDaysUntilExpiry();
  const isExpired = daysLeft < 0;

  return (
    <Alert className={`mb-6 ${isExpired ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'}`}>
      <div className="flex items-start space-x-3">
        {isExpired ? (
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
        ) : (
          <Crown className="h-5 w-5 text-yellow-500 mt-0.5" />
        )}
        <div className="flex-1">
          <AlertDescription className="space-y-2">
            {isExpired ? (
              <div>
                <p className="font-semibold text-red-700 dark:text-red-400">
                  Sua assinatura Premium expirou!
                </p>
                <p className="text-sm text-red-600 dark:text-red-300">
                  Renove agora para continuar aproveitando todos os recursos exclusivos.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                  Sua assinatura Premium expira em {daysLeft} dia{daysLeft !== 1 ? 's' : ''}!
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-300">
                  Não perca o acesso aos recursos exclusivos. Renove sua assinatura.
                </p>
              </div>
            )}
            <Button 
              size="sm" 
              className="mt-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white"
            >
              {isExpired ? 'Renovar Agora' : 'Renovar Premium'}
            </Button>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
};

export default ExpiryNotice;
