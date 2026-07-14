# MediaHub — Bot Telegram

Bot **completo / bot-first**: a maioria dos usuários opera só pelo Telegram; a web é complementar.

## Ativar

1. `TELEGRAM_BOT_TOKEN` (ou token no admin web)
2. `TELEGRAM_BOT_ENABLED=true`
3. `TELEGRAM_WEBHOOK_SECRET` (obrigatório em produção)
4. `APP_URL=https://seu-dominio`

```bash
npm run telegram:set-webhook   # webhook + menu de comandos
npm run telegram:poll          # dev local (sem webhook)
```

No boot da API, o bot também tenta `setMyCommands` automaticamente.

## Conta (sem web)

| Fluxo | Como |
|-------|------|
| Entrar / criar | `/entrar` · `/cadastrar` |
| Recuperar senha | `/recuperar` (OTP neste chat) |
| Trocar senha | `/senha` (logado) |
| Marca | `/marca` — nome, cores hex, foto da logo |
| Sair | `/sair` |

Código da Minha Área continua opcional.

## Operação

- `/buscar` — um termo **ou lote** (até 10 linhas, um título por linha)
- `/historico` — rebusca por botão
- `/futebol` · atualizar · gerar banner (modelos)
- `/top10` (modelos lista/cartaz)
- Capa, trailer e banner de título (Premium)

## Suporte e admin

- Cliente abre chamado no bot → **admins com `/entrar`** recebem aviso
- Chamados criados/respondidos **pela web** também notificam no Telegram
- Admin: `/admin` (painel), fila, liberar Premium, buscar usuário, atualizar jogos

## Estrutura

| Pasta | Função |
|-------|--------|
| `index.mjs` | Webhook + link-code + bridge de tickets |
| `handlers/` | Comandos e callbacks |
| `lib/` | API Telegram, sessão, banners, notify |
| `SPEC.md` | Especificação detalhada |
