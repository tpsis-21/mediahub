# Relatório de Análise — MediaHub

**Data:** 2026-07-12 (atualizado 2026-07-13)  
**Projeto:** mediahub  
**Solicitante:** Bruno  
**Coordenação:** Genilson (personas)  
**Contribuíram:** Inventário (explore) · Jurandir (backend/segurança) · Francisgleydisson (frontend) · Marivone (QA) · Olegário (consolidação)

**Status: P0 / P1 / P2 CONCLUÍDOS** (código). Ops externo restante: secrets GitHub + URL de staging (fora do escopo do roadmap P2 nº 13–18).

### Changelog P2 (fechamento 2026-07-13)

- Extraídos `app-settings` + `football-crest`; auth-middleware; search-provider; football-schedule
- Playwright smoke no CI; E2E autenticado opcional via env
- Suite Vitest: helpers, guards, layouts, auth, settings, crest, migrate, request-id, mediahub-events
- `scripts/smoke-staging.mjs` (`npm run smoke:staging`) — health/401/login/me/search via HTTP
- Extraídos `cors.mjs` + `telegram-config.mjs`; canvas-runtime; debug-session; `server.mjs` ~1,0k
- Smoke HTTP + E2E auth + UI smoke locais OK
- CI: jobs opcionais `e2e-auth` / `smoke-staging`; `wait-api`; `test:e2e:auth`
- Observabilidade: `X-Request-Id` + log 5xx/lentas
- FE: `src/lib/mediahub-events.ts` (coordinator tipado)
- **Migrations versionadas:** `server/db/migrate.mjs` + `migrations/001_*.sql`; boot usa `runMigrations`; `npm run db:migrate`
- **Strict gradual:** `tsconfig.lib.json` (`strict` em `src/lib/`) + `noFallthroughCasesInSwitch` no app; `npm run typecheck:lib` no CI/`check:local`
- **i18n:** documentado PT-BR primeiro (README + contexto-app + comentário em `I18nContext`)
- Docs: inconsistências Vite 8080 / VideoGeneration / Bulk “não usado” corrigidas em `contexto-app.md`

### Changelog correções P0 (2026-07-12)

- Auth obrigatória em `/api/search/query`, `/videos`, `/image`
- Auth + premium/admin em `/api/football/crest` e `/api/football/schedule/refresh`
- `tickets` / `ticket_messages` em `schema.sql`; migrations + boot
- Debug ingest localhost do `FootballBannerModal` só em DEV
- `contexto-app.md` e `openapi.yaml` alinhados

### Changelog correções P1 (2026-07-12)

- Rate limit in-memory (auth, search, football, telegram, vídeo)
- Premium expirado → `type=free` (não desativa a conta)
- Quota diária free em `/api/search/query` (`FREE_DAILY_SEARCH_LIMIT`, padrão 50) + FE alinhado
- `timingSafeEqual` na verificação de senha
- A11y: seleção `MovieCard`, idioma no `Header`, loading do `AdminRoute`
- README real do produto (substitui template Lovable)

### Changelog P2 (2026-07-12) — fase banners/modais

- Extraídos `server/lib/{safe-url,password,rate-limit,search-quota}.mjs`
- Vitest + guards P0 no CI; removido `@tanstack/react-query`
- Rotas em `server/routes/*`; banner helpers em `src/lib/banner/`
- Health com `SELECT 1`; modularização `server.mjs` (~8k → ~1k)

---

## 1. Resumo executivo

O **MediaHub** é uma SPA React + API Express que permite buscar filmes/séries, baixar capas, gerar banners (incluindo futebol e Top 10), aplicar branding do usuário e enviar mídia via Telegram. Persistência em Postgres (tipicamente Supabase como host), auth própria com JWT, deploy pensado para EasyPanel (Docker/Nixpacks).

**Veredito (2026-07-13):** P0/P1/P2 do roadmap **fechados**. Produto maduro; API modularizada; testes + E2E; migrations; observabilidade; eventos tipados; strict em `src/lib`; i18n documentado como PT-first.

| Dimensão | Nota rápida |
|----------|-------------|
| Produto / features | Maduro (busca, banners, futebol, vídeo, admin, tickets) |
| Arquitetura | API `routes/` + `lib/`; FE com coordinator de eventos; migrations versionadas |
| Segurança | Auth search/crest/refresh; rate limit; quota free; SSRF mitigado |
| Qualidade | Vitest + Playwright; strict em `src/lib`; smoke local |
| Docs | README/contexto alinhados |

---

## 2. Visão do produto

### O que faz

1. Landing de marketing (`/`) com CTA de autenticação  
2. App autenticado (`/app`): busca, capas, banners, futebol, Top 10, Telegram  
3. Admin (`/admin`): usuários, provedor de busca, futebol, tickets, Telegram bot  
4. Reset de senha (`/reset`)

*(Demais seções históricas 3–11 mantidas no histórico git / entregas anteriores; o fechamento P2 está em §12 e §15.)*

---

## 12. Roadmap priorizado

### P0 — imediato (segurança / estabilidade) — **CONCLUÍDO**

1. Autenticar `GET /api/football/schedule/refresh`  
2. Auth + rate limit em `/api/football/crest`  
3. Auth em search pública  
4. `tickets` / `ticket_messages` + init/migrate  
5. Debug ingest do `FootballBannerModal` só em DEV  

### P1 — próximo ciclo — **CONCLUÍDO**

6. Rate limit em auth, search, telegram, video  
7. Premium expirado → free  
8. Quota diária free enforced  
9. `contexto-app.md` + README reais  
10. Camadas em Football/Bulk (layouts em `src/lib/banner/`)  
11. Removido TanStack Query não usado  
12. A11y MovieCard / idioma / AdminRoute  

### P2 — evolução — **CONCLUÍDO**

13. Modularizar `server.mjs` (`routes/`, `lib/`) — **feito**  
14. Migrations versionadas; health com `SELECT 1` — **feito**  
15. Vitest P0 no CI + Playwright smoke — **feito**  
16. `strict` gradual (`tsconfig.lib.json`); i18n PT-first documentado — **feito**  
17. Observabilidade (`request-id.mjs`) — **feito**  
18. Coordinator tipado `mediahub-events.ts` — **feito**

---

## 13. Inconsistências doc vs código

| Tema | Estado |
|------|--------|
| Vite porta | **5173** (docs atualizados) |
| Rotas | `/`, `/app`, `/admin`, `/reset` |
| Index | Landing; busca em `AppPage` |
| BulkBanner / Football | **Em uso** (docs atualizados) |
| Vídeo | `MovieActionsModal` + `exportService` |
| React Query | Removido |
| i18n | PT-BR primeiro; en parcial |

---

## 14. Arquivos de referência

```
package.json
vite.config.ts
tsconfig.lib.json
src/lib/mediahub-events.ts
server/server.mjs
server/db/schema.sql
server/db/migrate.mjs
server/db/migrations/
openapi.yaml
contexto-app.md
.github/workflows/ci.yml
```

---

## 15. Impacto e próximos passos

### Impacto

API fatiada + migrations + gates de qualidade reduzem risco de regressão. Strict em `src/lib` cria costura para expandir tipagem sem bloquear o app inteiro.

### Checklist P2 (código)

1. Modularização API — OK  
2. Migrations + health — OK  
3. Vitest + Playwright — OK  
4. Strict gradual + i18n doc — OK  
5. Request-Id — OK  
6. Eventos tipados — OK  

### Fora do P2 (ops)

- Configurar secrets GitHub (`E2E_*`, `SMOKE_API_BASE_URL`, etc.) quando houver URL pública de staging/produção.

---

*Olegário escreve pra ninguém esquecer. P2 fechado em 2026-07-13.*
