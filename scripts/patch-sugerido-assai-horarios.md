# Patch Sugerido: Horários Absurdos em ASSAI

## Diagnóstico Confirmado (19/05/2026)

### Problema 1: Noturno sem alternativa diurna

**Casos:** UGA1D55 (Barra I, 00:01→10:44), CUC6J83 (Galeão, 00:00→08:57)

**Causa:** O veículo dormiu perto da loja ASSAI no dia 18/05. O Unitrac registrou uma
única parada contínua das 00:01 até as 10:44 com o código da loja ASSAI.

`deduplicarPorCodigo` detecta corretamente como `isEstacionamentoNoturno = true`
(h < 3 AND dur > 4h), mas como NÃO existe parada diurna alternativa com o mesmo
`codigo_loja`, mantém a noturna. Resultado: KPI mostra 00:01 como chegada.

**Solução proposta em `matcher.ts`:**

Após `deduplicarPorCodigo`, adicionar filtro que marca paradas noturnas sem alternativa
como `classificacao = 'ESTACIONAMENTO_NOTURNO'` (não usa para KPI, apenas SEM GPS).

Alternativamente, em `cruzaEscalaUnitrac`:

```typescript
// ANTES do assignOptimal, filtrar paradas que são estacionamento noturno
// quando a loja já tem parada diurna, OU quando é a ÚNICA parada e é noturna
function filtrarParadasNocturnas(paradas: UnitracParadaRow[]): UnitracParadaRow[] {
  const NOITE_H = 3
  const NOITE_DUR_SEG = 4 * 3600

  function isEstNocturno(p: UnitracParadaRow): boolean {
    const h = new Date(p.chegada).getUTCHours()
    const dur = p.saida === null ? Infinity : (p.duracao_seg ?? 0)
    return h < NOITE_H && dur > NOITE_DUR_SEG
  }

  // Remove paradas noturnas que são a ÚNICA para aquele código
  // (quando há alternativa diurna, deduplicarPorCodigo já resolve)
  const byCode = new Map<string, UnitracParadaRow[]>()
  for (const p of paradas) {
    if (!p.codigo_loja) continue
    const list = byCode.get(p.codigo_loja) ?? []
    list.push(p)
    byCode.set(p.codigo_loja, list)
  }

  const excluir = new Set<string>()
  for (const [cod, list] of byCode) {
    const noturnas = list.filter(isEstNocturno)
    const diurnas = list.filter(p => !isEstNocturno(p))
    // Se só há noturna, excluir → linha fica SEM GPS (mais honesto que 00:01)
    if (noturnas.length > 0 && diurnas.length === 0) {
      for (const n of noturnas) excluir.add(n.id)
    }
  }

  return paradas.filter(p => !excluir.has(p.id))
}
```

Isso faz com que `UGA1D55` (Barra I) e `CUC6J83` (Galeão) fiquem SEM GPS
em vez de mostrar 00:01 — mais honesto e alinhado ao manual.

### Problema 2: Horários de tarde (13:21, 14:22, 12:24)

**Casos:** EZU9325 (Ceasa, 13:21), UBF5G36 (Caxias II, 14:22), UBF5G33 (Niterói, 12:24)

**Causa:** Multi-trip. Esses veículos fizeram entregas ASSAI de manhã (confirmado no manual)
E tiveram uma parada tarde no Unitrac próxima de outra loja ASSAI (ou da mesma loja).

Dois sub-casos possíveis:
a) A parada de manhã existia mas foi descartada por `deduplicarPorCodigo` (duração menor)
b) A parada de manhã não existe no Unitrac (veículo saiu antes do GPS registrar)
   e a de tarde é genuína (2ª entrega) mas errada (outra filial)

**Para investigar sem Supabase:** Precisaria do arquivo Unitrac do dia 19/05 para ver
todas as paradas de EZU9325, UBF5G36 e UBF5G33.

**Solução proposta:**

Adicionar threshold de horário máximo para entrega ASSAI:

```typescript
// ASSAI entrega entre 04:00 e 12:00 (janela operacional)
// Parada depois das 12:00 provavelmente é troca de turno ou erro
// Verificar janelasRede da rede ASSAI no banco
```

Ou: no `deduplicarPorCodigo`, quando houver 2 paradas com mesmo código, uma de manhã
e uma de tarde, preferir a que está dentro da janela operacional da rede.

```typescript
// Adicionar parâmetro opcional: janela operacional por rede
// Se janela_inicio = '04:00' e janela_fim = '12:00':
// parada de manhã recebe priority bonus sobre parada de tarde
```

### Problema 3: Tribobó (01:07, 93 min) e Pilares (02:19, 94 min)

**Causa:** h < 3, mas dur < 4h → NÃO filtrado como noturno.

Essas entregas de madrugada (1h30 a 2h20) com duração curta (< 2h) são:
- Genuinamente de madrugada (ASSAI tem algumas lojas com abertura às 06h)
- Ou registro equivocado do Unitrac

**Evidência:** Manual tem Tribobó SEM GPS e Pilares às 05:25. Confirmado: não são entregas reais de madrugada.

**Solução proposta:**

Reduzir threshold `NOITE_DUR_SEG` de 4h para 2h para capturar esses casos:

```typescript
// ANTES: const NOITE_DUR_SEG = 4 * 3600  (4 horas)
// DEPOIS: const NOITE_DUR_SEG = 2 * 3600  (2 horas)
// Rationale: parada de 93min às 01:07 perto de ASSAI Tribobó
// não é entrega real (manual mostra SEM GPS)
```

**ATENÇÃO:** Reduzir para 2h pode criar falso positivo em rotas que genuinamente
entregam de madrugada (ex: Araruama com saidaCD=03:45 e chegLoja=06:00 — saída
às 03:45 é dentro da janela aceitável). Araruama OK porque chegada é 06:00 (não < 3h).

### Problema 4: Alcântara I (LSN6I72 vs DBB8D19)

**Causa:** A placa LSN6I72 está na escala do dia 19 para Alcântara I, mas o
manual registra DBB8D19. Isso indica que houve uma substituição de motorista/veículo
no dia 19 que a escala gerada não capturou.

**NÃO é bug do matcher** — é inconsistência entre a escala enviada e a realidade do dia.

### Problema 5: Barra I e São Gonçalo Camil vs Niterói Ponte (SWAP)

**Causa:** AMW3424 e LAU1I64 estão trocadas entre São Gonçalo Camil e Niterói Ponte.
O matcher associou AMW3424 à Niterói Ponte e LAU1I64 à São Gonçalo Camil,
mas o manual tem o contrário.

Provavelmente porque ambas as lojas têm nomes similares e as paradas no Unitrac
ficaram empatadas no assignOptimal — o desempate não favoreceu a combinação correta.

**Solução para esse SWAP específico:** aumentar o score de diferenciação entre
São Gonçalo (Camil) e São Gonçalo (Centro) — ambas em São Gonçalo mas lojas distintas.
O token "CAMIL" vs "CENTRO" deveria diferenciar. Verificar tokensCore para esses nomes.

## Resumo do Impacto Esperado

Se as correções fossem aplicadas:

| Caso | Linhas afetadas | Resultado atual | Resultado esperado |
|------|----------------|-----------------|-------------------|
| Noturno sem alternativa | 2 (Barra I, Galeão) | 00:01/00:00 | SEM GPS |
| Multi-trip tarde | 3 (Ceasa, Caxias II, Niterói) | 13:21/14:22/12:24 | SEM GPS ou manhã correta |
| Threshold noturno | 2 (Tribobó, Pilares) | 01:07/02:19 | SEM GPS |
| **Total horários** | **7** | absurdos | OK/SEM GPS |
| SWAP lojas | 2 (SG Camil, NI Ponte) | placa errada | placa correta |
| Alcântara I | 1 | placa errada (escala) | N/A (dados faltam) |

**GUANABARA:** Sem bugs de matcher. Problema é comparação por posição vs nome.
Nenhuma correção de código necessária. O KPI gerado tem as placas corretas.
Falta apenas a Rota 12/Catonho no PDF da escala.
