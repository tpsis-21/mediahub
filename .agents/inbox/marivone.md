---
from: genilson
to: marivone
wave: 2
status: ready
depends_on: ["jurandir", "francisgleydisson"]
---

# Task — QA / riscos / matriz de testes (MediaHub)

## Escopo
Análise de qualidade (somente leitura). NÃO modificar código.

## Entrega
Markdown PT-BR:

1. Matriz de riscos (P0/P1/P2) consolidando achados BE+FE já conhecidos
2. Lacunas de teste (o que cobrir primeiro)
3. Smoke checklist manual (rotas críticas)
4. Critérios de regressão antes de deploy

Achados prévios a considerar (validar/refinar, não inventar):
- Sem testes automatizados
- Endpoints football refresh/crest sem auth; search pública queima keys
- Monólitos FE/BE; schema tickets fora do schema.sql; initDb comentado
- React Query não usado; contexto-app desatualizado
