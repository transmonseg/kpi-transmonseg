# Bug 5 — Carro 2º faltando no gerado

## Causa raiz hipotética

Manual tem 2º carro preenchido (motorista + placa) em algumas lojas. Gerado pula essa segunda coluna. Hipótese: matcher emite só uma rota por linha escala, mesmo quando a linha tem `carro_ordem=2` adicional.

## Evidência (dia 19)

| Rede | Loja | Manual 2º carro | Gerado 2º |
|------|------|------------------|-----------|
| ZS | Loja 31 1ª | DBB-8D19 / Paulo Henrique / 14:00 | sumiu |
| ZS | MEGA BOX 2 noite | LNU-7733 / Felipe / 19:30 | sumiu |
| GUANABARA | Vila Isabel F.36 | KUM-9J05 / Thiago | sumiu |
| GUANABARA | Tijuca F.25 | FTV / José Davison | sumiu |
| CARREFOUR | Campo Grande 2º | RENAN / KRW-8E86 | foi substituído por Simão (mesmo do 1º carro!) |

## Solução proposta

Investigar emissão de rota pro 2º carro:
- Escala pode ter `carro_ordem=2` mas matcher ignora
- OU output xlsx (gerar KPI) está sobrescrevendo 2ª coluna com 1ª

**Provavelmente em `mcp/server.ts` ou na função de gerar KPI xlsx (não matcher diretamente).**

## Arquivos a tocar

- `src/lib/kpi/gerar-kpi-xlsx.ts` (ou similar — função que escreve o xlsx final)
- `mcp/server.ts` se for lá

## Critério de aceite (estrito)

- [ ] 5 lojas listadas com 2º carro preenchido no gerado
- [ ] CARREFOUR Campo Grande 2º com RENAN/KRW-8E86 (não Simão duplicado)

## Teste vitest

Pode ser teste de integração — carregar escala com 2 carros pra mesma loja e verificar saída do gerar_kpi tem ambos.

## Rollback

`git revert`. Risco baixo.

## Status

🔍 Aguardando investigação
