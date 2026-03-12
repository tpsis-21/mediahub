# Contexto da Aplicação — MediaHub

Última leitura do código: 2026-03-04

## Visão geral

O **MediaHub** é uma SPA (Single Page Application) em React com uma API própria que permite:

- Buscar títulos (filmes/séries), exibir resultados e detalhes.
- Baixar imagens individualmente ou em lote (ZIP).
- Manter histórico de buscas (com cache local e sincronização quando autenticado).
- Personalizar “marca” do usuário (nome, cores e logo) aplicada na UI.
- Recursos para geração de artes/banners e fluxo de vídeo (para planos elegíveis).

Regra de segurança: segredos e credenciais ficam no servidor e nunca são retornados ao client.

## Stack / Dependências principais

Frontend:

- Build: **Vite** (porta 8080 em dev) — [vite.config.ts](./vite.config.ts)
- Linguagem: **TypeScript** — [tsconfig.json](./tsconfig.json)
- UI: **React 18**, **Tailwind CSS**, **shadcn/ui + Radix UI**, **lucide-react**
- Roteamento: **react-router-dom**
- Data fetching/cache: **@tanstack/react-query** (provider ativo)
- Forms: **react-hook-form**, **zod**
- Export/ZIP: **jszip**

Backend:

- **Node.js + Express** — [server/server.mjs](./server/server.mjs)
- Segurança HTTP: **helmet**
- Auth: **JWT** (Bearer token)
- Persistência: **Postgres** (driver `pg`)

Scripts:

- `npm run dev`
- `npm run dev:api`
- `npm run build`
- `npm run lint`
- `npm run preview`
- `npm run start`

Fonte: [package.json](./package.json)

## Estrutura do projeto (alto nível)

- Entrada:
  - [index.html](./index.html) (meta tags/OG/Twitter)
  - [src/main.tsx](./src/main.tsx)
  - [src/App.tsx](./src/App.tsx)
- Páginas:
  - [src/pages/Index.tsx](./src/pages/Index.tsx) (home + busca + resultados + histórico)
  - [src/pages/NotFound.tsx](./src/pages/NotFound.tsx)
- Contexts (estado global no client):
  - [src/contexts/AuthContext.tsx](./src/contexts/AuthContext.tsx)
  - [src/contexts/ThemeContext.tsx](./src/contexts/ThemeContext.tsx)
  - [src/contexts/I18nContext.tsx](./src/contexts/I18nContext.tsx)
- Services (infra no client):
  - [src/services/apiClient.ts](./src/services/apiClient.ts)
  - [src/services/exportService.ts](./src/services/exportService.ts)
  - [src/services/historyService.ts](./src/services/historyService.ts)
- Componentes de domínio (features):
  - [src/components/Header.tsx](./src/components/Header.tsx)
  - [src/components/SearchForm.tsx](./src/components/SearchForm.tsx)
  - [src/components/MovieCard.tsx](./src/components/MovieCard.tsx)
  - [src/components/SearchHistory.tsx](./src/components/SearchHistory.tsx)
  - [src/components/SearchInstructions.tsx](./src/components/SearchInstructions.tsx)
  - [src/components/ExpiryNotice.tsx](./src/components/ExpiryNotice.tsx)
  - [src/components/TermsModal.tsx](./src/components/TermsModal.tsx)
  - Modais (auth/admin/área do usuário/banners/vídeo): ver seção “Fluxos”
- UI kit (shadcn):
  - [src/components/ui](./src/components/ui)
- API (backend):
  - [server/server.mjs](./server/server.mjs)
- CI:
  - [.github/workflows/ci.yml](./.github/workflows/ci.yml)

## Rotas

Definidas em [src/App.tsx](./src/App.tsx):

- `/` → [Index](./src/pages/Index.tsx)
- `*` → [NotFound](./src/pages/NotFound.tsx)

Observação: a navegação do Header é via âncoras na própria página (`#home`, `#search`, `#terms`, `#privacy`).

## Fluxo principal (Busca e resultados)

1. Usuário acessa `/` → [Index.tsx](./src/pages/Index.tsx)
2. Renderiza Header + instruções + formulário de busca:
   - [Header](./src/components/Header.tsx)
   - [SearchInstructions](./src/components/SearchInstructions.tsx)
   - [SearchForm](./src/components/SearchForm.tsx)
3. [SearchForm](./src/components/SearchForm.tsx) chama `onSearch(queries, type, mediaType)`:
   - `type`: `individual` ou `bulk`
   - `mediaType`: `multi`, `movie`, `tv`
4. [Index.tsx](./src/pages/Index.tsx) executa `handleSearch`:
   - Bloqueia se excedeu limite (visitante: 3/dia) via [AuthContext](./src/contexts/AuthContext.tsx)
   - Faz requisições para a API (que integra com provedores externos)
   - Deduplica resultados por `id`
   - Persiste no histórico via [historyService](./src/services/historyService.ts)
5. Renderiza `MovieCard` para cada item:
   - Seleção (checkbox)
   - Baixar capa individual
   - Copiar sinopse
   - Premium/Admin: abrir modais de banner/vídeo

## Camadas / responsabilidades

### Contexts (estado global)

- Auth:
  - Cache local de sessão: `auth_token` e `auth_user`
  - Login/registro e perfil via API (`/api/auth/*` e `/api/me`)
  - Define limites e “planos” (admin/premium/free)
  - Funções: `canSearch`, `incrementSearch`, `isNearExpiry`, `getDaysUntilExpiry`
  - Fonte: [AuthContext.tsx](./src/contexts/AuthContext.tsx)

- Tema:
  - `theme: light|dark` em localStorage (`key: theme`)
  - Aplica `document.documentElement.classList.toggle('dark', ...)`
  - Fonte: [ThemeContext.tsx](./src/contexts/ThemeContext.tsx)

- I18n:
  - `pt-BR` e `en-US` via dicionário local
  - `t(key)` retorna string
  - Fonte: [I18nContext.tsx](./src/contexts/I18nContext.tsx)

### Services (infra no client)

- `apiClient`:
  - Define `baseUrl` via `VITE_API_BASE_URL` (com fallback em dev)
  - Injeta `Authorization: Bearer <token>` quando necessário
  - Fonte: [apiClient.ts](./src/services/apiClient.ts)

- `exportService`:
  - Baixar capa individual e múltiplas em ZIP
  - Tenta contornar CORS com estratégias (proxy de imagem no backend + canvas)
  - Fonte: [exportService.ts](./src/services/exportService.ts)

- `historyService`:
  - Persiste últimos itens em localStorage (escopado por usuário/visitante)
  - Quando autenticado, também sincroniza com a API (`/api/history`)
  - Fonte: [historyService.ts](./src/services/historyService.ts)

## Perfis de usuário (simulado)

Definidos/derivados no [AuthContext](./src/contexts/AuthContext.tsx) e reforçados pela API:

- Visitante (sem user):
  - Limite: **3 buscas/dia** (localStorage `guestSearches` + `lastGuestSearchDate`)
  - Pode buscar e ver resultados

- Free:
  - Criado via registro
  - “Sem limite de buscas” (no código atual)
  - Sem acesso a download em lote no UI (bloqueio no Index)

- Premium:
  - Simulado no login: email contendo `premium`
  - Assinatura expira em 30 dias (demo), alerta nos 7 dias finais
  - Acesso a:
    - Download em lote (ZIP)
    - Modais de banner/vídeo (BETA)
    - Personalização de marca

- Admin:
  - Email fixo `admin@mediahub.com` (demo)
  - Acesso ao painel Admin (modal) no Header

## Principais componentes / features

- Header + navegação e controles:
  - Alternância tema, idioma
  - Auth (login/register/logout)
  - Modais: Auth/Admin/UserArea
  - Personalização (brandName/cores/logo exibidos como “marca”)
  - Fonte: [Header.tsx](./src/components/Header.tsx)

- AuthModal:
  - Login/registro com validação básica (confirm password, aceitar termos)
  - Fonte: [AuthModal.tsx](./src/components/AuthModal.tsx)

- UserAreaModal:
  - Edita: nome de marca, cores, telefone, website, logo
  - Extração de cores da logo via canvas utilitário
  - Fonte: [UserAreaModal.tsx](./src/components/UserAreaModal.tsx), [colorExtractor.ts](./src/utils/colorExtractor.ts)

- AdminModal:
  - Dashboard e gestão de usuários via API (`/api/admin/*`)
  - Configurações do sistema via API (sem expor segredos)
  - Fonte: [AdminModal.tsx](./src/components/AdminModal.tsx)

- MovieCard:
  - Baixar capa individual (exportService)
  - Copiar sinopse (clipboard)
  - Premium/Admin: abrir Banner e Vídeo (BETA)
  - Fonte: [MovieCard.tsx](./src/components/MovieCard.tsx)

- ProfessionalBannerModal (BETA):
  - Gera arte via canvas (formatos 1:1 e 9:16)
  - Usa cores da marca + imagens recebidas via API/proxy
  - Fonte: [ProfessionalBannerModal.tsx](./src/components/ProfessionalBannerModal.tsx)

- VideoGenerationModal (BETA):
  - Fluxo de vídeo para planos elegíveis (integração via API)
  - Fonte: [VideoGenerationModal.tsx](./src/components/VideoGenerationModal.tsx)

- BannerModal / BulkBannerModal / ApiKeyModal:
  - Existem no repo, mas não há import/uso encontrado no fluxo atual da UI.
  - Fontes:
    - [BannerModal.tsx](./src/components/BannerModal.tsx)
    - [BulkBannerModal.tsx](./src/components/BulkBannerModal.tsx)
    - [ApiKeyModal.tsx](./src/components/ApiKeyModal.tsx)

## Persistência (localStorage)

Chaves observadas no código:

- `auth_token` (JWT do usuário)
- `auth_user` (cache do usuário autenticado)
- `theme` (`light|dark`)
- `guestSearches` / `lastGuestSearchDate` (limite visitante)
- `search_history:guest` e `search_history:<userId>` (histórico escopado)

Observação:

- Credenciais de busca não ficam no localStorage: quando configuradas pelo usuário na Minha Área, são enviadas para a API e persistidas no servidor, sem serem retornadas para o navegador.

## SEO / Metas em index.html

Definido em [index.html](./index.html):

- Title e meta description básicas
- OG/Twitter usando imagem padrão do lovable
- `lang="en"` no `<html>` (apesar de a UI ser pt-BR por padrão)
- `robots.txt` permissivo em [public/robots.txt](./public/robots.txt)

## Plano de ação — Banners de Futebol (jogos do dia)

### Objetivo

Permitir gerar artes “Jogos do dia” com:

- Confronto (Time A vs Time B)
- Horário (Brasília)
- Canais/plataformas de transmissão (um ou mais)
- Classificação opcional: transmissão gratuita vs paga (quando a fonte indicar)

### Premissas e riscos

- A origem de dados proposta é um site público de programação. Esse tipo de integração costuma ser frágil (mudanças de HTML, bloqueios, rate-limit) e pode ter restrições legais/termos de uso.
- Para reduzir acoplamento, a aplicação deve tratar a fonte como um “provedor” substituível (adapter) e operar com um modelo de dados próprio.
- A coleta deve acontecer no servidor (evita CORS, evita expor implementação no client, facilita cache e controle de tráfego).

### Fase 0 — Validação de viabilidade (antes de codar)

- Confirmar se a fonte publica um formato estruturado (ex.: JSON-LD, microdados, endpoints internos) que evite scraping “por HTML”.
- Verificar robots/termos de uso e definir política de cache/intervalo de atualização para não sobrecarregar o site.
- Definir escopo inicial:
  - “Jogos do dia” apenas (data atual), ou permitir escolher data?
  - Filtrar por campeonatos (opcional) e/ou destacar principais jogos?

### Fase 1 — Modelo de dados (contrato interno)

Definir um DTO único para o client (independente da fonte), por exemplo:

- `date` (YYYY-MM-DD)
- `timezone` (sempre `America/Sao_Paulo`)
- `matches[]`:
  - `id` (chave estável gerada a partir de timeA+timeB+hora+canal)
  - `competition` (string opcional)
  - `homeTeam` / `awayTeam` (string)
  - `kickoffTime` (HH:mm)
  - `channels[]` (string)
  - `isPaid` (boolean | null) — quando a fonte indicar (pago/grátis)
  - `source` (metadado interno para auditoria)

### Fase 2 — Abstração do provedor (baixo acoplamento)

Criar uma interface de provedor no backend (camada “borda”):

- `FootballScheduleProvider.getSchedule({ date, timezone }) -> ScheduleDTO`

Implementações:

- `ProviderA` (primeira fonte): busca e converte para o `ScheduleDTO`.
- Futuro: trocar/adicionar fontes sem alterar o resto do sistema.

### Fase 3 — Coleta no backend (scraper controlado)

- Criar endpoint server-side:
  - `GET /api/football/schedule?date=YYYY-MM-DD`
  - Resposta: `ScheduleDTO`
- Implementar cache agressivo:
  - Cache em memória por dia (ex.: TTL 5–15 min) + invalidar automaticamente no “virar do dia”.
  - Rate-limit por IP/usuário no endpoint para evitar abuso.
- Observabilidade:
  - Logs apenas em dev; em prod, registrar apenas erros e métricas agregadas (sem “debug spam”).
- Robustez:
  - Parser tolerante a mudanças pequenas de HTML.
  - Fallback: se falhar, retornar mensagem amigável (“Não foi possível carregar os jogos agora. Tente novamente.”).

### Fase 4 — Normalização de horários e canais

- Padronizar horário para Brasília:
  - Converter quando necessário e validar com `date-fns` (já existe no projeto).
- Canais:
  - Normalizar nomes (ex.: “ESPN 4” vs “ESPN4”) via dicionário simples no servidor.
  - Suportar múltiplos canais por jogo.
- Classificação grátis/pago:
  - Se a fonte usar marcação por cor/legenda, converter para `isPaid`.

### Fase 5 — UI/UX no client (listagem e seleção)

- Adicionar uma nova opção de “tipo de banner”: “Futebol — Jogos do dia”.
- Tela/Modal:
  - Seleção de data (opcional na v1: apenas “hoje”).
  - Lista de jogos (cards) com seleção e ordenação por horário.
  - Preview do layout antes de exportar.
- A11y:
  - Lista semântica, foco visível, contraste AA, labels claros para seleção.

### Fase 6 — Gerador de banner (arte)

Opções de implementação:

- Canvas (já usado nos banners atuais): gerar uma imagem com layout semelhante ao exemplo.
- Templates:
  - “6 a 10 jogos por imagem” com paginação automática.
  - Header com data e título (“Jogos do dia”).
  - Blocos por jogo com horário e canais.

Assets (logos):

- V1: sem escudos (texto + separadores) para evitar dependências de licenças.
- V2: escudos via uma fonte licenciada/permitida ou upload/gerência interna.

Saídas:

- 1:1 e 9:16 (mesmo padrão dos banners atuais).
- Download local e (se aplicável) envio via Telegram seguindo os gates de plano já existentes.

### Fase 7 — Qualidade e segurança

- Testes mínimos:
  - Parser: fixtures de HTML para garantir que o extrator não quebre fácil.
  - Endpoint: validação de query params (`date`) e erros.
- Segurança:
  - Sem expor detalhes do provedor no client.
  - Timeouts e limites de tamanho de resposta na requisição externa.

### Critérios de aceite (v1)

- Buscar jogos do dia no servidor e retornar JSON normalizado com hora + canais.
- Gerar banner 1:1 com pelo menos 6 jogos, mantendo layout “equilibrado”.
- Cache ativo e sem logs de debug em produção.
- UI acessível (foco/contraste/labels) e mensagens de erro amigáveis.

## Pontos de atenção (tech debt / riscos)

- O bundle principal ainda pode ficar grande dependendo do conjunto de dependências; preferir lazy-loading de modais/áreas pesadas.
- Âncoras do Header:
  - `#privacy` está no menu, mas não existe elemento com `id="privacy"` na página atual.
- Download de imagens depende de contornos de CORS; preferir sempre o proxy do backend para estabilidade.

## Como rodar local

```bash
npm i
npm run dev:api
npm run dev
```

Frontend (Vite): `http://localhost:8080/` (ver [vite.config.ts](./vite.config.ts))

Observação: a API usa variáveis de ambiente em `.env` (não versionadas). Em dev, configure `VITE_API_BASE_URL` para apontar para a API, caso ela rode em outra porta/host.
