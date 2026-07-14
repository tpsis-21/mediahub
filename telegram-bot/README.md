# MediaHub — Bot Telegram (entrega)

A **operação fica na interface web**. O bot serve para:

1. **Vincular** o chat à conta (código na Minha Área)
2. **Receber** capas, banners e arquivos quando o usuário clicar em enviar no site

O envio usa as rotas `/api/telegram/send*` com o **mesmo token** do bot (`TELEGRAM_BOT_TOKEN` / admin).

## Modos

| Modo | Env | Comportamento |
|------|-----|----------------|
| **delivery** (padrão) | — | Só vínculo + dicas; menu/busca no chat desligados |
| **conversational** | `TELEGRAM_BOT_CONVERSATIONAL=true` | Menu completo no Telegram (legado) |

## Ativar

1. `TELEGRAM_BOT_TOKEN`
2. `TELEGRAM_BOT_ENABLED=true`
3. `TELEGRAM_WEBHOOK_SECRET` (produção)
4. `APP_URL=https://…` (público HTTPS da API)

```bash
npm run telegram:set-webhook
```

## Fluxo do usuário

1. Web → Minha Área → Telegram → **Gerar código de vínculo**
2. Abrir o deep link / `/start link_XXXX` no bot
3. No site: buscar / gerar arte → **Enviar no Telegram**
4. Conteúdo chega neste chat

`/sair` no bot desvincula o chat (para de receber envios).

## Estrutura

| Peça | Função |
|------|--------|
| `handlers/delivery.mjs` | Webhook fino (vínculo) |
| `handlers/index.mjs` | Conversacional (só se flag ligada) |
| `server/routes/telegram-routes.mjs` | Envio autenticado da web |
| `SPEC.md` | Detalhes históricos / arquitetura |
