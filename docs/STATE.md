# KPI Perfeição — Estado Atual

> **⚠️ FLUXO ATIVO:** se está retomando sessão, leia primeiro:
> `docs/auditoria/dia-19-reanalise/FLUXO-ATIVO.md`
> Depois volte aqui pra contexto histórico.

**Última atualização:** 2026-05-27 madrugada (FASE 5c — 14 bugs mergeados nesta sessão)

## Sessão 27/05 madrugada — FASE 5c (sweep completo bugs)

### Bugs atacados nesta sessão (14 fixes mergeados)

| Bug | Categoria | Hash merge | Descrição |
|-----|-----------|------------|-----------|
| **U1** | Auditoria URGENTE | 35397ce | Parser v2 em /analisar-alt |
| **U2** | Auditoria URGENTE | be5fa04 | VEICULOS_INATIVOS normalizado |
| **U3** | Auditoria URGENTE | ac7d536 | lookupSlot preferNome |
| **U4** | Auditoria URGENTE | 8532352 | Promise.allSettled isolamento |
| **U5** | Descoberta | 117b53c | inferirSaiDaEscala fallback 14d |
| **B** | Dia 25 | 81f196a | lookupSlot redeId filter (cross-rede) |
| **C** | Dia 25 | 47e40e6 | Parser PDF tabular não gruda tipo_carro |
| **D** | Dia 25 | bab554f | aplicarAlteracoes prioriza Loja N |
| **E** | Dia 25 | 0918a31 | Catálogo +11 SPID Prezunic |
| **A** | Dia 25 | 8452b70 | Persistir escala_linhas no /simples |
| **I3** | Auditoria IMPORTANTE | f96883c | /analisar-alt usa service client (RLS) |
| **I4** | Auditoria IMPORTANTE | 1c6dec8 | 3ª linha agrupador vai pra descartadas |
| **I1** | Auditoria IMPORTANTE | 96e21c0 | unitrac.ts computeSaidaCd retorna null |
| **N10** | Auditoria BAIXO | bd48065 | Remove código morto alteracao.ts |

### Bugs auditoria pendentes (não atacados)

- **I2** — Warning alteracoes vazias (UX, requer contexto frontend)
- **N1** — parsedToConfirmada loja_nome_raw→loja_raw (cosmético)
- **N3** — ZS data_entrega D+1 + cross-day alteracoes (complexo)
- **N5** — unitrac-pdf REPAIR regex (plausível mas não reproduzido)
- **N7** — variantesOcr só posição 4 (trade-off conhecido)
- **N8** — lineEdits indexado por ordem (plausível)
- **N9** — PARADA_REGEX endereço não-greedy (plausível)
- **N11** — lineEdits sorted por loja_nome_raw (plausível)

### Análise dia 19/05 (sessão paralela)

Comparação contra PDF Unitrac (`relatorio_9572.pdf`, 207 veículos, 2135 paradas)
para 17 redes:

| Métrica | Valor |
|---------|------:|
| Lojas totais | 279 |
| Acerto motorista+placa+timestamp (tol 10min) | 196 |
| SEM-RASTRE válido (placa sem GPS) | 30 |
| Sem timestamp gerado | 40 |
| **Taxa de acerto** | **70%** |
| Saída inflada (após consolidação) | 2 |
| Loja errada (cross-rede) | 4 |
| "Inventado" (GPS em FORA_BASE → LOJA) | 37 |

A categoria "inventado" pode ser geofence do projeto resolvendo corretamente
(FORA_BASE no Unitrac mas a loja é reconhecida via cadastro local). Requer
investigação caso-a-caso.

### Métricas técnicas

- **Vitest:** 301 → **344** testes passando (+43)
- **Typecheck:** zero erros
- **Total commits:** 27 (incluindo merges no-ff)
- **Branch main hash:** `bd48065`
- **Sincronizado com origin/main:** ✅

### Arquivos da sessão

```
docs/conversas-tia-erica/
├── dia-19/
│   ├── RELATORIO-FINAL.md        ← consolidado
│   ├── resumo-geral.md
│   ├── unitrac-pdf.md/.json      ← 207 veículos, 2135 paradas
│   ├── analise-{REDE}.md × 17    ← detalhe por rede
│   └── kpis-sistema/             ← 17 XLSX gerados
└── dia-25/
    ├── escalas/                  ← XLSX + PDF da escala
    ├── alteracoes/               ← PDF + whatsapp-25.md
    ├── unitrac/                  ← relatorio_9652.pdf
    ├── kpis-gerados/             ← 18 XLSX sistema
    ├── kpis-manuais/             ← 6 XLSX manuais Tia Érica
    └── comparacao-manual-vs-sistema.txt
```

---

## Sessão 27/05 noite (anterior) — FASE 5 (U1-U4) completa

[conteúdo histórico mantido em commits anteriores]
