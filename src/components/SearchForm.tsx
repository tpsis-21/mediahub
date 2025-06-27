
import React, { useState } from 'react';
import { Search, List, User } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent } from './ui/card';

interface SearchFormProps {
  onSearch: (queries: string[], type: 'individual' | 'bulk') => void;
  isLoading: boolean;
}

const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading }) => {
  const { t } = useI18n();
  const [individualQuery, setIndividualQuery] = useState('');
  const [bulkQuery, setBulkQuery] = useState('');

  const handleIndividualSearch = () => {
    if (individualQuery.trim()) {
      onSearch([individualQuery.trim()], 'individual');
    }
  };

  const handleBulkSearch = () => {
    if (bulkQuery.trim()) {
      const queries = bulkQuery
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      if (queries.length > 0) {
        onSearch(queries, 'bulk');
      }
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <Tabs defaultValue="individual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual" className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span>{t('search.individual')}</span>
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center space-x-2">
              <List className="h-4 w-4" />
              <span>{t('search.bulk')}</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="individual" className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder={t('search.placeholder')}
                value={individualQuery}
                onChange={(e) => setIndividualQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleIndividualSearch()}
                className="flex-1"
              />
              <Button
                onClick={handleIndividualSearch}
                disabled={isLoading || !individualQuery.trim()}
                className="flex items-center space-x-2"
              >
                <Search className="h-4 w-4" />
                <span>{t('search.button')}</span>
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="bulk" className="space-y-4">
            <Textarea
              placeholder={t('search.bulk.placeholder')}
              value={bulkQuery}
              onChange={(e) => setBulkQuery(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <Button
              onClick={handleBulkSearch}
              disabled={isLoading || !bulkQuery.trim()}
              className="flex items-center space-x-2"
            >
              <Search className="h-4 w-4" />
              <span>{t('search.button')}</span>
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SearchForm;
