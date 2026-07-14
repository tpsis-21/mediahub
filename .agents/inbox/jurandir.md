---
from: genilson
to: jurandir
wave: 1
status: ready
depends_on: []
---

# Task — Análise backend / dados / segurança (MediaHub)

## Escopo permitido
- `server/**`
- `openapi.yaml`
- `server/db/schema.sql`
- Variáveis de ambiente (nomes apenas)
- Fluxos auth, search proxy, football, telegram, tickets, history

## Escopo proibido
- Alterar código
- Frontend (exceto se necessário para entender contrato de API)
- Segredos / valores de `.env`

## Entrega
Relatório estruturado em PT-BR (markdown no retorno do subagente), cobrindo:

1. Arquitetura da API (monólito, grupos de rotas, middlewares)
2. Modelo de dados (tabelas, inconsistências schema.sql vs initDb)
3. Auth/JWT/quotas/planos — riscos e gaps
4. Segurança: endpoints públicos, SSRF, rate limit, exposição de chaves
5. Integrações externas (search provider, Telegram, SMTP, scrapers, yt-dlp)
6. Observabilidade / errors / health
7. Recomendações priorizadas (P0/P1/P2) com impacto em manutenção

## Critérios de pronto
- Achados concretos com paths/rotas
- Sem inventar APIs ou métricas
- Sem modificar arquivos
