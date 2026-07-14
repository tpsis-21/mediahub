# MediaHub — Bot Telegram

Pasta dedicada ao bot conversacional. A API Express apenas registra o webhook; a lógica mora aqui.

## Conteúdo

| Arquivo / pasta | Função |
|-----------------|--------|
| `SPEC.md` | Especificação completa (fases, comandos, gaps) |
| `index.mjs` | `registerTelegramBot(app, deps)` — webhook + link-code |
| `lib/` | Bot API, sessão, pairing, format, dispatch |
| `handlers/` | Comandos (`/start`, busca, futebol, suporte…) |
| `scripts/` | `set-webhook.mjs`, `poll.mjs` (dev sem HTTPS) |

## Ativar

1. `TELEGRAM_BOT_TOKEN` (ou token no admin web)
2. `TELEGRAM_BOT_ENABLED=true`
3. `TELEGRAM_WEBHOOK_SECRET` (obrigatório em produção)
4. `APP_URL=https://seu-dominio` (URL pública da API)

```bash
# produção / staging com HTTPS
npm run telegram:set-webhook

# desenvolvimento local (long polling; não use junto com webhook)
npm run telegram:poll
```

## Conta (sem precisar da web)

No `/start`, o usuário pode **Entrar** ou **Criar conta** direto no Telegram (`/entrar`, `/cadastrar`).  
O código da Minha Área continua opcional. Após login, `telegram_chat_id` e a sessão do bot são gravados automaticamente.

## Funcionalidades

- `/menu`, `/ajuda`, `/conta`, `/senha`, `/sair`
- `/buscar` → capa · trailer · banner (Premium)
- `/historico`
- `/futebol` (lista completa paginada) · atualizar · gerar banner
- `/top10`
- `/suporte` + `/tickets`

Layouts de banner são versões Node simplificadas (não clonam 100% os kits web).
