
import React, { createContext, useContext, useState } from 'react';

type Language = 'pt-BR' | 'en-US';

interface Translations {
  'pt-BR': Record<string, string>;
  'en-US': Record<string, string>;
}

const translations: Translations = {
  'pt-BR': {
    'app.title': 'Busca de Filmes e Séries',
    'search.individual': 'Busca Individual',
    'search.bulk': 'Busca em Massa',
    'search.placeholder': 'Digite o nome do filme/série (ex: Vingadores 2012)',
    'search.bulk.placeholder': 'Digite uma lista de filmes/séries (um por linha)',
    'search.button': 'Buscar',
    'auth.login': 'Entrar',
    'auth.register': 'Cadastrar',
    'auth.logout': 'Sair',
    'auth.email': 'Email',
    'auth.password': 'Senha',
    'auth.name': 'Nome',
    'theme.toggle': 'Alternar Tema',
    'download.cover': 'Baixar Capa',
    'copy.synopsis': 'Copiar Sinopse',
    'generate.banner': 'Gerar Banner',
    'export.selected': 'Exportar Selecionados',
    'history.title': 'Histórico de Buscas',
    'loading': 'Carregando...',
    'error.generic': 'Erro ao processar solicitação',
    'success.copied': 'Sinopse copiada!',
    'no.results': 'Nenhum resultado encontrado'
  },
  'en-US': {
    'app.title': 'Movie & TV Show Search',
    'search.individual': 'Individual Search',
    'search.bulk': 'Bulk Search',
    'search.placeholder': 'Enter movie/TV show name (e.g., Avengers 2012)',
    'search.bulk.placeholder': 'Enter a list of movies/TV shows (one per line)',
    'search.button': 'Search',
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.logout': 'Logout',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.name': 'Name',
    'theme.toggle': 'Toggle Theme',
    'download.cover': 'Download Cover',
    'copy.synopsis': 'Copy Synopsis',
    'generate.banner': 'Generate Banner',
    'export.selected': 'Export Selected',
    'history.title': 'Search History',
    'loading': 'Loading...',
    'error.generic': 'Error processing request',
    'success.copied': 'Synopsis copied!',
    'no.results': 'No results found'
  }
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'pt-BR';
  });

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
