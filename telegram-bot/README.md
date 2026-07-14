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

## Fase 1 (implementada)

- Vincular conta (`/start link_CODE` + botão na Minha Área)
- `/menu`, `/ajuda`, `/conta`, `/sair`
- `/buscar` + capa via `sendPhoto`
- `/historico`
- `/futebol` (lista texto) + atualizar (premium/admin)
- `/suporte` + `/tickets`

## Fase 2 (implementada)

- `/futebol gerar` + botão **Gerar banner** → PNG dos jogos
- Após busca: botão **Banner** → PNG do título (Premium)
- `/top10 [filme|serie|all]` → PNG ranking (Premium)

Layouts são versões Node simplificadas (não clonam 100% os 3 kits web).
