---
from: genilson
to: francisgleydisson
wave: 1
status: ready
depends_on: []
---

# Task — Análise frontend / UX técnica / estrutura (MediaHub)

## Escopo permitido
- `src/**`
- `index.html`, `vite.config.ts`, `tailwind.config.ts`, `components.json`
- `contexto-app.md` (como referência de produto)

## Escopo proibido
- Alterar código
- `server/**` (exceto consumo via services)
- Segredos

## Entrega
Relatório estruturado em PT-BR cobrindo:

1. Arquitetura FE (rotas, contexts, services, hooks)
2. Features e fluxos principais do usuário
3. Componentes críticos / monólitos (linhas, acoplamento)
4. Estado, cache (TanStack Query / localStorage), i18n, tema
5. Acessibilidade / responsividade (achados reais no código)
6. Dívida técnica FE e inconsistências vs `contexto-app.md`
7. Recomendações priorizadas (P0/P1/P2)

## Critérios de pronto
- Paths concretos
- Sem inventar
- Sem modificar arquivos
