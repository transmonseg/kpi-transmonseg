# Nav Simplificação + Preview KPI — Design Spec

**Data:** 2026-05-17  
**Status:** aprovado (usuário autorizou execução autônoma)

---

## Parte 1 — Simplificação da Nav

### Contexto
A nav atual tem 7 itens em 3 seções. O usuário quer manter apenas 3: Home, Cozinha e KPI Simples.

### O que muda
- **Remover:** Dia (`/painel/kpi/dia`), Histórico (`/painel/historico`), Revisar Anomalias (`/painel/revisao`), Alteração de Escala (`/painel/alteracoes/nova`)
- **Manter:** Home, Cozinha, Simples
- **Reorganização:** uma única seção "Principal" com os 3 itens (elimina overhead de seções)
- **Imports removidos:** CalendarBlank, ClockCounterClockwise, FilePlus, MagnifyingGlass

### Arquivo
`src/app/painel/nav.tsx` — modificação cirúrgica, nenhum outro arquivo é tocado.

---

## Parte 2 — Preview KPI antes de Baixar

### Contexto
Atualmente o fluxo KPI Simples: upload → processar → ver card com % GPS → baixar Excel.  
Problema: o usuário não vê QUAIS rotas estão com problema antes de baixar.

### Proposta
Após o processamento, ao invés de mostrar cards minimalistas, mostrar uma tabela completa por rede com cada rota e seu status GPS. Linhas sem GPS aparecem em vermelho.

### Fluxo pós-processamento
Para cada rede:
- Header com nome da rede + botões de download
- Barra de cobertura GPS
- Tabela com colunas: `#`, `Loja`, `Placa`, `Motorista`, `GPS`, `Saída CD`, `Ch. Loja`, `Tempo`
- Linha vermelha (`danger-soft`) quando `tem_gps === false`
- Linha normal quando há dados GPS

### O que muda no backend (`/api/kpi/simples/route.ts`)
Adicionar campo `preview: PreviewLinha[]` no retorno de cada rede.

```typescript
type PreviewLinha = {
  ordem: number
  loja_nome: string
  placa: string | null
  motorista: string | null
  turno: string
  tem_gps: boolean
  saida_cd_fmt: string | null    // "HH:MM" em BRT
  chegada_loja_fmt: string | null // "HH:MM" em BRT
  tempo_loja_min: number | null
}
```

Formatação de hora em BRT:
```typescript
function fmtHoraBRT(d: Date | null | undefined): string | null {
  if (!d) return null
  const h = (d.getUTCHours() - 3 + 24) % 24
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
```

### O que muda no frontend (`page.tsx`)
- Adicionar `PreviewLinha` type e `preview` em `RedeResult`
- Substituir grid de `RedeResultCard` por seções de tabela (`RedePreviewSection`)
- Manter `downloadBase64` inalterado — apenas os pontos de chamada mudam
- Remover `RedeResultCard` e `DownloadChip` (substituídos por `RedePreviewSection`)

### Critério de `tem_gps`
```typescript
tem_gps = !!(rota.saida_cd || rota.paradas.length > 0)
```

### Invariantes
- Download ainda funciona via base64 — nenhuma nova API necessária
- Preview não bloqueia download: botões aparecem mesmo quando há linhas vermelhas
- Sem GPS não significa erro do sistema — é informação operacional (rastreador apagado, etc.)
