# Auditoria externa 27/05/2026 — Claude.ai

Repositório foi auditado por Claude.ai (chat interno do usuário). Resultado em `docs/auditoria/AUDITORIA_DEFINITIVA_extracted.txt` (538 linhas, 32 tabelas, 22 bugs).

## Documentos desta pasta

- [00-veredito.md](./00-veredito.md) — Minha análise crítica. Concordo com a auditoria. 4 bugs URGENTES confirmados.
- *(em construção)* 01-execucao-U1.md — Bug U1 parser v2
- *(em construção)* 02-execucao-U2.md — Bug U2 VEICULOS_INATIVOS
- *(em construção)* 03-execucao-U3.md — Bug U3 lookupSlot
- *(em construção)* 04-execucao-U4.md — Bug U4 Promise.allSettled

## Resumo da auditoria

- **6 redes auditadas dia 25/05** (Princesa, Carrefour, Prezunic, Assaí, Atacadão, Super Prix)
- **214 células incorretas em 1.900** (11,3% de erro)
- **Super Prix tem 8,6% de acurácia** (91% de erro)
- **22 bugs identificados** (4 URGENTES + 4 IMPORTANTES + 14 BAIXOS/estruturais)
- **Causa raiz:** parser v1 de alterações (`alteracao-text.ts`) + lookupSlot priorizando placa

## Comparação com FASE 4 (sessão anterior)

Os 7 bugs corrigidos na FASE 4 atacaram **efeitos secundários** no matcher e agrupador. A causa raiz no parser de alterações **NÃO foi tocada**.

Por isso o ganho na FASE 4 foi modesto (-28 erros em 3 dias). A auditoria projeta ganho dramático apenas com U1:
- Super Prix: 8,6% → ~95%
- Atacadão: 69% → ~95%

## Próxima ação

Bug URGENTE U1 — Conectar parser v2 em produção.
