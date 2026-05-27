# Code Review — Sessão 27/05/2026

Range: `ed243b7..7901915` (17 commits, 53 arquivos)

## Issues a investigar

### 1. M1 — durTotalMin falha com saida=null

`src/lib/kpi/matcher.ts:271-283` (commit 15f1ba9):

```ts
const durLast = last.saida ? (...) / 1000 : 0
const durP = p.saida ? (...) / 1000 : 0
const durTotalMin = (durLast + durP + gapSeg) / 60
if (durTotalMin <= 90) mesmaLoja = true
```

Quando `last.saida === null` (parada ainda em curso), `durLast = 0` e durTotalMin é só `gapSeg/60` (< 30min). Sempre passa 90min e consolida cegamente — exatamente o que o fix tentava evitar.

**Sugestão:** rejeitar consolidação quando `last.saida === null || p.saida === null` se também não há geo.

### 2. M4 — cross-dock multi-loja pode regredir

`src/lib/kpi/matcher.ts:1404` (commit 15f1ba9):

```ts
if (i >= paradasOrd.length) continue
```

Antes herdava última parada. Cenário legítimo: 1 parada GPS servindo N entregas FEIRA_NOVA. Agora linhas extras ficam unmatched.

**Validação proposta:** rodar `scripts/analise/regerar_local.ts 19` e comparar FEIRA_NOVA antes/depois.

## Outras revisões passaram

- I3 service client: ✅ auth check antes do svc, RLS compartilhada justifica
- N7 variantes OCR: ✅ explosão controlada via Set
- N8/N11 lineEdits chave: ✅ fallback retrocompat preservado
- N10 código morto: ✅ grep confirma zero refs
- Geofence cross-rede: ✅ `redesFungiveis` valida exceções (ASSAI×SENDAS)
- I4 descartadas: ✅ tipo opcional, não quebra callers
- I1 saida_cd null: ✅ alinhado matcher.ts:458
