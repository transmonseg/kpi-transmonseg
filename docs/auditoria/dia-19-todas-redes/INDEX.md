# Auditoria completa dia 19/05/2026 — 9 redes

> **Referência cruzada obrigatória:**
> - Escala: `OneDrive/.../ESCALA DIA 19/ESCALA GERAL DE MAIO 1 (6).xlsx` + outras (ZS, PAX, ARMAZEM)
> - Relatório Unitrac: `OneDrive/.../ESCALA DIA 19/relatorio_9391.xlsx` + `relatorio_9572.pdf`
> - Alterações: `OneDrive/.../ESCALA DIA 19/ALTERACOES/alteracoes_19.05.txt` + 3 PDFs

## Status — Auditoria completa ✅

| # | Rede | OK (✅+⚠️) | 🔴 Bugs | MD |
|---|------|----------|---------|-----|
| 0 | ZONA_SUL | 41 | 12 | [zs-dia19](../2026-05-26-zs-dia19-manual.md) |
| 1 | ASSAI | 30 | 8 | [01-assai](./01-assai.md) |
| 2 | ATACADAO | 1 | 1 | [02-atacadao](./02-atacadao.md) |
| 3 | CARREFOUR | 8 | 4 | [03-carrefour](./03-carrefour.md) |
| 4 | GUANABARA | 21 | 7 | [04-guanabara](./04-guanabara.md) |
| 5 | PREZUNIC | 50 | 7 | [05-prezunic](./05-prezunic.md) |
| 6 | PRINCESA | 22 | 3 | [06-princesa](./06-princesa.md) |
| 7 | SUPERPRIX | 9 | 0 🎉 | [07-superprix](./07-superprix.md) |
| 8 | ARMAZEM_GRAO | 8 | 6 | [08-armazem_grao](./08-armazem_grao.md) |
| | **TOTAL** | **190** | **48** | |

**% aceitável geral:** 190/242 = **78.5%**

## Bugs consolidados (varredura código)

➡️ [00-bugs-consolidados.md](./00-bugs-consolidados.md) — 8 padrões agrupados:
1. Multi-trip parada errada (17 lojas) — **mais crítico**
2. SL muito curta FORA_BASE (10 lojas)
3. Alteração propagou (resolvido em `a810930`)
4. Carro 2º faltando (5 lojas)
5. Falso positivo (8 lojas)
6. Loja faltando (13 lojas)
7. Convenção Tia Érica SL=fim-rota (~12 lojas — não-bug)
8. Placa trocada / plate-swap real

## Bugs consolidados

Após análise individual, todos os bugs vão pra: [00-bugs-consolidados](./00-bugs-consolidados.md)

## Dumps (lado a lado)

Cada rede tem 2 dumps em `dumps/`:
- `<rede>-gerado.md` — KPI baixado de `C:\Users\media\Downloads\`
- `<rede>-manual.md` — KPI manual aba `19`
