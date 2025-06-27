
import React from 'react';
import { History, Trash2, RotateCcw } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { historyService, SearchHistoryItem } from '../services/historyService';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface SearchHistoryProps {
  history: SearchHistoryItem[];
  onRerun: (item: SearchHistoryItem) => void;
  onRefresh: () => void;
}

const SearchHistory: React.FC<SearchHistoryProps> = ({ history, onRerun, onRefresh }) => {
  const { t } = useI18n();

  const handleClearHistory = () => {
    historyService.clearHistory();
    onRefresh();
  };

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400">
          <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum histórico de busca encontrado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center space-x-2">
          <History className="h-5 w-5" />
          <span>{t('history.title')}</span>
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="flex items-center space-x-1"
        >
          <Trash2 className="h-4 w-4" />
          <span>Limpar</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant={item.type === 'individual' ? 'default' : 'secondary'}>
                  {item.type === 'individual' ? 'Individual' : 'Em Massa'}
                </Badge>
                <span className="text-xs text-gray-500">
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {item.query}
              </p>
              <p className="text-xs text-gray-500">
                {item.results.length} resultado(s) encontrado(s)
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRerun(item)}
              className="flex items-center space-x-1 ml-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reexecutar</span>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default SearchHistory;
