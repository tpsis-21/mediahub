# MediaHub

SPA + API para busca de títulos (filmes/séries), geração de capas/banners (incluindo futebol e Top 10), branding do usuário e envio via Telegram.

Documentação interna: [contexto-app.md](./contexto-app.md) · Análise: [RELATORIO-ANALISE-APLICACAO.md](./RELATORIO-ANALISE-APLICACAO.md) · API: [openapi.yaml](./openapi.yaml)

## Stack

- **Frontend:** React 18, TypeScript, Vite (dev `:5173`), Tailwind, shadcn/Radix
- **Backend:** Node 20+, Express (`server/server.mjs` + `server/routes/`)
- **DB:** Postgres (`pg`) — schema em `server/db/schema.sql`
- **Auth:** JWT (Bearer + cookie `auth_token`), senha PBKDF2
- **Banner FE:** helpers em `src/lib/banner/`

## Requisitos

- Node.js **≥ 20** (`.nvmrc`)
- Postgres acessível via `DATABASE_URL` (ex.: pooler Supabase)
- Variáveis em `.env` (não versionar) — modelo: [`.env.example`](./.env.example)

### Variáveis principais (nomes)

`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGIN`, `SMTP_*`, `APP_URL`, `TELEGRAM_BOT_TOKEN`, `FREE_DAILY_SEARCH_LIMIT` (opcional, padrão `50`), `VITE_API_BASE_URL` (dev/prod), `HTTP_SLOW_MS` (opcional)

## Idioma

Produto **PT-BR primeiro**. Há toggle parcial `pt-BR`/`en-US` no Header (menus/auth); a maior parte da UI permanece em português.

## Scripts

```sh
npm i
npm run dev:all    # Vite + API
npm run dev        # só frontend
npm run dev:api    # só API
npm run build
npm test           # vitest
npm run check:local  # test + tsc + tsc-lib-strict + lint + build + e2e SPA (sem .env/API)
npm run db:migrate   # aplica server/db/migrations (também no boot da API)
npm run typecheck:lib  # TypeScript strict em src/lib/
npm run build && npm run test:e2e
# E2E autenticado / UI smoke (opcional):
#   E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e:auth
# Smoke HTTP staging/local:
#   SMOKE_API_BASE_URL=https://api… SMOKE_EMAIL=… SMOKE_PASSWORD=… npm run smoke:staging
npm start          # serve API + dist/
npm run lint
```

### Secrets do GitHub Actions (opcional)

Jobs extras em `.github/workflows/ci.yml` só rodam se os secrets existirem:

| Job | Secrets |
|-----|---------|
| `e2e-auth` | `DATABASE_URL`, `JWT_SECRET`, `E2E_EMAIL`, `E2E_PASSWORD` |
| `smoke-staging` | `SMOKE_API_BASE_URL` (+ opcional `SMOKE_APP_BASE_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`) |

Sem esses secrets, o CI continua só com lint/test/build + Playwright smoke anônimo.

## Rotas da SPA

| Rota | Descrição |
|------|-----------|
| `/` | Landing |
| `/app` | App autenticado (busca, banners, etc.) |
| `/admin` | Painel admin |
| `/reset` | Redefinição de senha |

## Planos

| Tipo | Acesso |
|------|--------|
| free | Busca individual (quota diária no servidor) |
| premium | Bulk, ZIP, banners, futebol, vídeo |
| admin | Tudo + `/admin` |

Premium expirado é **rebaixado para free** (conta permanece ativa).

## Deploy

- Docker / Nixpacks / EasyPanel — ver `Dockerfile`, `nixpacks.toml`, `Procfile`
- CI: `.github/workflows/ci.yml` (lint, `tsc`, tests, guardrails, build, Playwright smoke; jobs opcionais `e2e-auth` / `smoke-staging` via secrets)

## Segurança (resumo)

- Busca e proxy de imagem do provedor exigem autenticação
- Crest e refresh de futebol: auth + premium/admin + rate limit
- Rate limit in-memory em auth, search, football, telegram e vídeo
