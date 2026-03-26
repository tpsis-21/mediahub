
import React, { useEffect, useState } from 'react';
import { Search, List, User, Film, Tv, Globe } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { MediaType } from '../services/searchService';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

interface SearchFormProps {
  onSearch: (queries: string[], type: 'individual' | 'bulk', mediaType: MediaType) => void;
  isLoading: boolean;
  bulkPreset?: { text: string; token: number } | null;
  bulkEnabled?: boolean;
  onBlockedBulk?: () => void;
}

const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading, bulkPreset, bulkEnabled = false, onBlockedBulk }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'individual' | 'bulk'>('individual');
  const [individualQuery, setIndividualQuery] = useState('');
  const [bulkQuery, setBulkQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('multi');

  useEffect(() => {
    if (!bulkPreset) return;
    if (!bulkEnabled) {
      onBlockedBulk?.();
      setTab('individual');
      return;
    }
    setBulkQuery(bulkPreset.text);
    setTab('bulk');
  }, [bulkEnabled, bulkPreset, onBlockedBulk]);

  const handleIndividualSearch = () => {
    if (individualQuery.trim()) {
      onSearch([individualQuery.trim()], 'individual', mediaType);
    }
  };

  const handleBulkSearch = () => {
    if (!bulkEnabled) {
      onBlockedBulk?.();
      return;
    }
    if (bulkQuery.trim()) {
      const queries = bulkQuery
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      if (queries.length > 0) {
        onSearch(queries, 'bulk', mediaType);
      }
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        {/* Filtro de Tipo de Mídia */}
        <div className="mb-6">
          <Label className="text-base font-semibold mb-3 block">Tipo de Mídia</Label>
          <RadioGroup
            value={mediaType}
            onValueChange={(value) => setMediaType(value as MediaType)}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="multi" id="multi" />
              <Label htmlFor="multi" className="flex items-center space-x-2 cursor-pointer">
                <Globe className="h-4 w-4" />
                <span>Todos</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="movie" id="movie" />
              <Label htmlFor="movie" className="flex items-center space-x-2 cursor-pointer">
                <Film className="h-4 w-4" />
                <span>Filmes</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="tv" id="tv" />
              <Label htmlFor="tv" className="flex items-center space-x-2 cursor-pointer">
                <Tv className="h-4 w-4" />
                <span>Séries</span>
              </Label>
            </div>
          </RadioGroup>
          <p className="mt-3 text-sm text-muted-foreground">
            Escolha “Todos” para encontrar filmes e séries no mesmo termo. Você também pode usar “Nome (Ano)”.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = value === 'bulk' ? 'bulk' : 'individual';
            if (next === 'bulk' && !bulkEnabled) {
              onBlockedBulk?.();
              setTab('individual');
              return;
            }
            setTab(next);
          }}
          className="w-full"
        >
          <TabsList className={`grid w-full ${bulkEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="individual" className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span>{t('search.individual')}</span>
            </TabsTrigger>
            {bulkEnabled && (
              <TabsTrigger value="bulk" className="flex items-center space-x-2">
                <List className="h-4 w-4" />
                <span>{t('search.bulk')}</span>
              </TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="individual" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Busca individual: digite 1 conteúdo por vez. Exemplo: A Armadilha do Coelho (2025).
            </p>
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
            <p className="text-sm text-muted-foreground">
              Busca em massa: cada linha é 1 conteúdo. Emojis e numeração de ranking são ignorados automaticamente.
            </p>
            <Textarea
              placeholder={t('search.bulk.placeholder')}
              value={bulkQuery}
              onChange={(e) => setBulkQuery(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              Exemplo:
              <br />
              🥇 Zootopia 2 (2025)
              <br />
              🥈 Máquina de Guerra (2026)
            </p>
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
