
import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'pt-BR' | 'en-US';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  'pt-BR': {
    'app.title': 'Capture Capas',
    'app.description': 'Busque e baixe capas de filmes e séries',
    'search.placeholder': 'Digite o nome do filme ou série...',
    'search.button': 'Buscar',
    'search.individual': 'Busca Individual',
    'search.bulk': 'Busca em Massa',
    'search.bulk.placeholder': 'Digite cada filme/série em uma linha separada...',
    'search.instructions.title': 'Como usar o Capture Capas',
    'search.instructions.step1': '1. Digite o nome do filme ou série no campo de busca',
    'search.instructions.step2': '2. Clique em "Buscar" ou pressione Enter',
    'search.instructions.step3': '3. Selecione os conteúdos desejados na lista',
    'search.instructions.step4': '4. Use "Baixar Selecionados" para download múltiplo ou clique em cada capa individualmente',
    'search.instructions.step5': '5. Usuários pagos têm acesso à busca em massa e geração de banners profissionais',
    'search.instructions.guest': 'Visitantes: máximo 3 buscas por dia',
    'search.instructions.premium': 'Usuários premium: buscas ilimitadas + recursos exclusivos',
    'download.cover': 'Baixar Capa',
    'copy.synopsis': 'Copiar Sinopse',
    'success.copied': 'Copiado para a área de transferência',
    'history.title': 'Histórico de Buscas',
    'auth.login': 'Entrar',
    'auth.register': 'Cadastrar',
    'auth.logout': 'Sair',
    'auth.name': 'Nome completo',
    'auth.email': 'E-mail',
    'auth.password': 'Senha',
    'auth.confirmPassword': 'Confirmar senha',
    'auth.phone': 'WhatsApp',
    'auth.brandName': 'Nome da marca',
    'auth.terms': 'Li e aceito os termos de uso',
    'theme.toggle': 'Alternar tema',
    'user.area': 'Minha Área',
    'user.subscription': 'Plano Premium',
    'menu.home': 'Início',
    'menu.search': 'Buscar',
    'menu.terms': 'Termos de Uso',
    'menu.privacy': 'Política de Privacidade'
  },
  'en-US': {
    'app.title': 'Capture Covers',
    'app.description': 'Search and download movie and TV show covers',
    'search.placeholder': 'Type movie or TV show name...',
    'search.button': 'Search',
    'search.individual': 'Individual Search',
    'search.bulk': 'Bulk Search',
    'search.bulk.placeholder': 'Type each movie/series in a separate line...',
    'search.instructions.title': 'How to use Capture Covers',
    'search.instructions.step1': '1. Type the movie or TV show name in the search field',
    'search.instructions.step2': '2. Click "Search" or press Enter',
    'search.instructions.step3': '3. Select desired content from the list',
    'search.instructions.step4': '4. Use "Download Selected" for multiple downloads or click each cover individually',
    'search.instructions.step5': '5. Premium users have access to bulk search and professional banner generation',
    'search.instructions.guest': 'Visitors: maximum 3 searches per day',
    'search.instructions.premium': 'Premium users: unlimited searches + exclusive features',
    'download.cover': 'Download Cover',
    'copy.synopsis': 'Copy Synopsis',
    'success.copied': 'Copied to clipboard',
    'history.title': 'Search History',
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.logout': 'Logout',
    'auth.name': 'Full name',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm password',
    'auth.phone': 'WhatsApp',
    'auth.brandName': 'Brand name',
    'auth.terms': 'I have read and accept the terms of use',
    'theme.toggle': 'Toggle theme',
    'user.area': 'My Area',
    'user.subscription': 'Premium Plan',
    'menu.home': 'Home',
    'menu.search': 'Search',
    'menu.terms': 'Terms of Use',
    'menu.privacy': 'Privacy Policy'
  }
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('pt-BR');

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations[typeof language]] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
