# MediaHub — Bot Telegram (especificação)

**Status:** Bot-first — a maioria das operações deve funcionar só no Telegram; a web é complementar (admin avançado / branding fino).  
**Data:** 2026-07-14  
**Objetivo:** MediaHub completo via conversa no Telegram (conta, mídia, banners, suporte e ops admin frequentes).

---

## 1. Situação atual

O MediaHub tem **dois canais Telegram**:

| Peça | Papel |
|------|------|
| Bot conversacional (`telegram-bot/`) | Webhook `POST /api/telegram/webhook`, conta, busca, banners, suporte, admin |
| Outbound legado (`telegram-routes`) | Envios da web (`/api/telegram/send*`) |

**Produto:** bot-first completo — login, marca, OTP, lote, tickets web↔bot e painel admin no chat.

---

## 2. Princípios

1. **API first** — o bot é uma UI conversacional sobre as mesmas rotas `/api/*` (auth, search, football, history, tickets, telegram send).
2. **Um bot, muitos usuários** — token único (admin); cada `chat_id` liga a um `app_users`.
3. **Mesmos gates** — `free` / `premium` / `admin` e quotas iguais à web.
4. **PT-BR** — textos do bot em português; evitar termos sensíveis nas mensagens ao cliente (ex.: “aplicativo”, “acesso”, “mídia”).
5. **Segredo no servidor** — webhook secret, JWT de sessão bot, tokens nunca no chat.

---

## 3. Mapa feature → comando Telegram

### 3.1 Conta e vínculo

| Feature web | Comando / fluxo bot | Backend |
|-------------|---------------------|---------|
| Login | `/entrar` (e-mail + senha no chat) | Mesma verificação de `POST /api/auth/login` |
| Registro | `/cadastrar` (nome → e-mail → marca → senha) | Mesma criação de `POST /api/auth/register` |
| Vínculo opcional via web | `/start link_CODE` | Deep link Minha Área |
| Minha Área (chat_id) | Automático no login/cadastro/vínculo | `telegram_chat_id` + sessão |
| Trocar senha | `/senha` | Mesma lógica de `POST /api/me/password` |
| Ver plano / vencimento | `/conta` | `GET /api/me` |
| Logout bot | `/sair` | Invalida sessão bot |

### 3.2 Busca e mídia (VOD)

| Feature web | Comando / fluxo bot | Backend |
|-------------|---------------------|---------|
| Buscar filme/série | `/buscar <termo>` ou texto livre | `GET /api/search/query` |
| Detalhes | callback `det:<id>` | `GET /api/search/details` |
| Enviar capa + texto | botão “Enviar capa” | `POST /api/telegram/send` (já usa chat do usuário) |
| Trailer | “Trailer” → envia vídeo | `POST /api/telegram/send-trailer-video` ou branding |
| Histórico | `/historico` | `GET /api/history` + `POST` ao buscar |

### 3.3 Banners Premium

| Feature web | Comando / fluxo bot | Backend / nota |
|-------------|---------------------|----------------|
| Banner profissional | `/banner` → escolhe título → gera | **Precisa render server-side** (§7) |
| Top 10 / bulk | `/top10` | idem + `send-media-group` / `send-document` (ZIP) |
| Banner futebol | `/futebol` → data → modelo → gera | `GET /api/football/schedule` + render server-side |
| Atualizar jogos | `/futebol atualizar` | `GET /api/football/schedule/refresh` |

### 3.4 Suporte

| Feature web | Comando / fluxo bot | Backend |
|-------------|---------------------|---------|
| Abrir ticket | `/suporte` | `POST /api/tickets` |
| Responder ticket | replies no bot | `POST /api/tickets/:id/messages` |
| Status tickets | `/tickets` | `GET /api/tickets` |

### 3.5 Admin (só `type=admin`)

| Feature web | Comando / fluxo bot | Backend |
|-------------|---------------------|---------|
| Dashboard resumido | `/admin` | `GET /api/admin/dashboard` |
| Buscar usuário | `/admin user <email>` | `GET /api/admin/users` |
| Refresh futebol forçado | `/admin futebol refresh` | `POST /api/admin/football/refresh` |
| Status bot token | `/admin telegram` | `GET /api/admin/telegram` |

> Admin completo (CRUD, settings) permanece na web `/admin`. O bot cobre operações frequentes e status.

### 3.6 Ajuda

| Comando | Resposta |
|---------|----------|
| `/ajuda` ou `/help` | Menu por plano (free vs premium vs admin) |
| `/menu` | Teclado inline com atalhos |

---

## 4. Arquitetura proposta

```
Telegram ──webhook──► Express  POST /api/telegram/webhook
                              │
                              ▼
                     telegram-bot/ (novo)
                       ├── router (comandos / callbacks)
                       ├── session (chat_id → user + state)
                       ├── auth (pairing / sessão)
                       └── handlers/*
                              │
                              ▼
                     serviços já existentes
                       search · football · history · tickets · telegram send · me
                              │
                              ▼
                     (fase 2) banner-render service (Node canvas / filas)
                              │
                              ▼
                     Bot API: sendMessage / sendPhoto / sendDocument / …
```

### 4.1 Arquivos (implementação)

```
telegram-bot/
  README.md
  SPEC.md
  index.mjs                 # registerTelegramBot — webhook + link-code
  lib/                      # bot-api, session, pairing, format, dispatch, services, config
  handlers/index.mjs
  scripts/set-webhook.mjs
  scripts/poll.mjs          # long polling → API local
migrations: server/db/migrations/002_telegram_bot.sql
```

Reutilizar: `getTelegramBotToken`, rate limit Telegram, `requireAuth` interno via sessão bot (não JWT do browser).

### 4.2 Webhook

- URL: `https://<APP_URL>/api/telegram/webhook`
- Header secret: `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`
- Registrar com `setWebhook` (script `npm run telegram:set-webhook` ou botão admin)
- Em dev: ngrok / Cloudflare Tunnel **ou** worker de long polling `getUpdates` (só local)

### 4.3 Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `TELEGRAM_BOT_TOKEN` | Já existe |
| `TELEGRAM_WEBHOOK_SECRET` | Validar webhook |
| `TELEGRAM_BOT_ENABLED` | Feature flag (`true`/`false`) |
| `APP_URL` | Base do webhook e deep links |

---

## 5. Autenticação no bot (pairing)

Fluxo recomendado (seguro e simples):

1. Usuário loga na web → Minha Área → **“Vincular Telegram”** → gera código `ABC123` (TTL 10 min) + deep link  
   `https://t.me/<bot_username>?start=link_ABC123`
2. Usuário abre o link → bot recebe `/start link_ABC123`
3. Servidor: valida código → grava `telegram_chat_id` no usuário → cria `telegram_bot_sessions`
4. Alternativa: no bot, `/login` pede e-mail + senha **uma vez** (menos ideal; rate limit forte + aviso de segurança)

Estados da sessão bot:

| Estado | Significado |
|--------|-------------|
| `anonymous` | Só `/start` e ajuda de vínculo |
| `linked` | Conta ligada; comandos pelo plano |
| `awaiting_*` | FSM (ex.: aguardando termo de busca, data futebol, texto do ticket) |

---

## 6. Persistência nova

```sql
-- migrations/00X_telegram_bot.sql (rascunho)

create table if not exists telegram_link_codes (
  code text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists telegram_bot_sessions (
  chat_id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  state text not null default 'linked',
  context jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists telegram_bot_sessions_user_id_idx
  on telegram_bot_sessions (user_id);
```

---

## 7. Gap crítico: geração de banners

Na web, banners (profissional, futebol, Top 10) são gerados no **browser (canvas)**. O bot **não tem canvas do usuário**.

### Opções

| Opção | Prós | Contras | Recomendação |
|-------|------|---------|--------------|
| **A.** Serviço server-side (`@napi-rs/canvas` / `node-canvas`) reusando `src/lib/banner/*` | Mesmo visual; bot autônomo | Portar loaders/DOM → Node; teste visual | **Fase 2 — caminho principal** |
| **B.** Fila + worker headless (Playwright) abrindo rota interna autenticada | Reusa FE quase intacto | Pesado, lento, ops complexo | Só se A ficar inviável |
| **C.** Bot só dispara “pedido”; usuário gera na web e recebe no Telegram | Rápido de shipar | Não é “tudo no bot” | **Fase 1 MVP** |

**Fase 1 (MVP bot):** busca, capa+texto, trailer, conta, histórico, suporte, agenda futebol **em texto**, refresh agenda.  
**Fase 2:** render server-side → `/banner`, `/top10`, `/futebol` com PNG/ZIP no chat.  
**Fase 3:** admin resumido + polish (menus, i18n se precisar).

---

## 8. UX do bot (exemplos)

### Menu (`/menu`) — Premium

```
MediaHub
Escolha uma opção:

🔍 Buscar título
⚽ Jogos do dia
🖼️ Banner / Top 10
📜 Histórico
🎫 Suporte
👤 Conta
```

### Busca

```
Usuário: /buscar Matrix
Bot: Encontrei 5 resultados:
1. The Matrix (1999)
2. …
[1] [2] [3] …  ← inline keyboard
```

Ao tocar em um item: detalhes + botões `📷 Capa` · `🎬 Trailer` · `🖼️ Banner` (premium).

### Futebol (texto na fase 1)

```
/futebol
Data: 14/07/2026 · 16 jogos
05:00  Dordrecht x Dortmund II
…
[Atualizar] [Gerar banner]  ← Gerar só na fase 2
```

---

## 9. Segurança e limites

- Validar `secret_token` do webhook; rejeitar updates inválidos com 401.
- Rate limit por `chat_id` (espelhar limites web: auth, search, telegram 30/min).
- Não logar token, senha, nem conteúdo completo de mídia.
- Comandos admin só se `user.type === 'admin'`.
- Premium: mesmas rotas `requirePremiumOrAdmin`; free vê upsell curto (`/conta` / link da web).
- Idempotência leve em callbacks (evitar double-tap regenerando vídeo).

---

## 10. Checklist de entrega

### Fase 0 — Preparação

- [x] `TELEGRAM_BOT_ENABLED`, `TELEGRAM_WEBHOOK_SECRET`, `APP_URL` (`.env.example`)
- [x] Migration `telegram_link_codes` + `telegram_bot_sessions`
- [x] UI web: botão “Vincular Telegram” (código + deep link)
- [x] Script `telegram:set-webhook`

### Fase 1 — MVP conversacional

- [x] `POST /api/telegram/webhook`
- [x] `/start`, `/ajuda`, `/menu`, `/conta`, `/sair`
- [x] `/buscar` + callbacks + envio capa (Bot API `sendPhoto`)
- [ ] Trailer via rota existente (próximo incremento)
- [x] `/historico`
- [x] `/futebol` (lista texto) + atualizar
- [x] `/suporte` + `/tickets`
- [x] Testes: dispatch/format

### Fase 2 — Banners no bot

- [x] Render Node (`telegram-bot/lib/banner-render.mjs` + `@napi-rs/canvas`)
- [x] `/futebol gerar` + botão 🖼️ Gerar banner
- [x] Banner de título após busca (`🖼️ Banner`) — Premium
- [x] `/top10` — Premium
- [x] Envio via `sendPhoto` (multipart Buffer)
- [ ] Paridade visual 1:1 com templates web (melhoria contínua)

### Fase 3 — Admin + ops

- [ ] Comandos admin resumidos
- [ ] Métricas: mensagens/dia, erros Bot API
- [ ] Documentar no `README` + `contexto-app.md`

---

## 11. Critérios de pronto (“todas as funcionalidades”)

| Área | MVP bot | Completo |
|------|---------|----------|
| Conta / vínculo | Sim | Sim |
| Busca + capa + trailer | Sim | Sim |
| Histórico | Sim | Sim |
| Futebol (lista) | Sim | Sim |
| Futebol (banner PNG) | — | Sim |
| Banner profissional / Top 10 | — | Sim |
| Tickets | Sim | Sim |
| Admin completo | Web | Parcial no bot + web |

**Definição de pronto produto:** Fase 2 concluída + mesmos gates de plano da web + vínculo sem colar `chat_id` manualmente.

---

## 12. Próximos passos objetivos

1. Validar escopo: **implementar Fase 1 agora** ou esperar Fase 2 (banners) junto.
2. Criar migration + webhook stub + `/start` + pairing web.
3. Ligar handlers de busca/futebol/suporte nas rotas já existentes.
4. Planejar extração do canvas de `src/lib/banner/*` para Node.

---

## Referências no repo

- Entrega atual Telegram: `server/routes/telegram-routes.mjs`
- Token: `server/lib/telegram-config.mjs`
- Banners FE: `src/lib/banner/`, `FootballBannerModal.tsx`, `ProfessionalBannerModal.tsx`, `BulkBannerModal.tsx`
- Auth/perfil: `server/routes/me-routes.mjs`, `server/lib/auth-middleware.mjs`
- Contrato HTTP: `openapi.yaml`
- Visão app: `contexto-app.md`, `RELATORIO-ANALISE-APLICACAO.md`
