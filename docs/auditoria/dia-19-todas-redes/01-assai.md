# Auditoria ASSAI dia 19/05/2026

**Gerado:** `KPI-ASSAI-2026-05-19 (3).xlsx` (45 linhas, aba `19.05`)
**Manual:** `KPI-ASSAI-MANUAL.xlsx` aba `19` (49 linhas)

## Bugs encontrados

### 🔴 BUG A1 — Alteração propagou pra lojas erradas (AMW-3424 em 4 lugares)

Alteração dia 19: `Assaí Sao Goncalo Camil Loja 211 → Messias / 141 / AMW-3424`.

**Mas o KPI gerado aplicou AMW-3424 em 4 lojas:**

| Loja | Manual placa/motorista | Gerado placa/motorista | Esperado |
|------|------------------------|------------------------|----------|
| Alcântara II (Loja 293) | FQN6J72 / LUIZ CARLOS | **AMW-3424** / Messias SEM | FQN6J72 |
| Bangu II (Loja 332) | LMF-2049 / LUIZ CESAR NÃO FOI | **AMW-3424** / Messias 09:33/09:37 | LMF-2049 NÃO FOI |
| Méier (Loja 160) | AKZ-2745 / LUIZ JR. 05:35/06:40 | **AMW-3424** / Messias SEM | AKZ-2745 |
| São Gonçalo Camil (Loja 211) | AMW3424 / MESSIAS SEM | AMW-3424 / TOCO MESSIAS SEM ✓ | OK |

Padrão: `Assaí - <qualquer>` casou contra `Assaí - São Gonçalo Camil`. O bug é que o parser de alteração usou só `ASSAI` (token de rede) ao identificar, e o aplicar match casou loja_raw genericamente.

> **Provavelmente já corrigido** pelo fix recente em `aplicar-alteracoes.ts` (commit `a810930` — match por tokens fortes filtra nomes de rede). Aguardando re-geração.

### 🔴 BUG A2 — Falso positivo Barra I (Loja 133)

Manual: UBO-5E01 / FELIPE DIEGO / **NÃO FOI**
Gerado: UBO-5E01 / TOCO C/RAMPA REFRI FELIPE / **06:08 / 06:36**

Sys diz que entregou. GPS pode confirmar passagem mas operação não aconteceu (manual = autoridade).

### 🔴 BUG A3 — Parada errada (tarde em vez de manhã)

Padrão de sys pegar parada tardia (manhã LOJA + tarde retorno):

| Loja | Manual CHD/SL | Gerado CHD/SL | Δ |
|------|---------------|---------------|---|
| Barra II (245) | 05:50 / 09:55 | **09:51 / 09:56** | CHD Δ241min |
| Caxias II Fluminense (217) | 05:05 / 08:45 | **11:56 / 13:32** | CHD Δ411min |
| Santa Cruz 2 (338) | 06:00 / 07:15 | **12:33 / 15:19** | CHD Δ393min, SL Δ484min |
| Mendanha (61) | 05:25 / 11:20 | **07:48 / 11:21** | CHD Δ143min |
| Macaé (232) | 04:10 / 10:30 | 04:07 / **06:21** | SL Δ249min muito curto |

Sys está pulando a primeira parada LOJA da manhã e pegando parada de outra hora.

### 🟡 BUG A4 — Convenção SL = fim de rota (Tia Érica)

Maioria dos ❌ "SL muito tarde" são na verdade Tia Érica escrevendo o **horário fim da rota** como SL (várias lojas têm SL=11:20, 11:25, 10:30 etc., todos batendo). Sys retorna saída GPS real por loja.

**Lojas afetadas (não-bug, é convenção):**
- Boulevard, Carioca Shop, Caxias I, Galeão, Ilha do Governador, Mendanha (SL), Nova Iguaçu 2, Pilares, São Gonçalo Centro, São João do Meriti, Taquara, Tijuca II

Manual: SL=11:20 ou 11:25 (todos iguais nas lojas).
Sys: SL=12:42, 14:22, 12:31, 11:37, 12:24, etc. (variando, GPS real).

> **Não é bug do código** — é convenção da operadora. Possível fix: aplicar regra SL=fim-rota só pra ASSAI quando detectar padrão (mesmo SL em N lojas consecutivas).

### 🔴 BUG A5 — Loja Ceasa (42) e Maracanã (286) faltando no gerado

| Loja | Manual | Gerado |
|------|--------|--------|
| Ceasa (42) | EZU-9325 / 05:55 / 07:30 | sem dado |
| Maracanã (286) | GAR-0802 / 06:00 / 11:20 | sem dado |

### 🟢 OK (⚠️ Δ≤2-3min, manual arredondado)

Alcântara I, Araruama, Bangu I, Campinho, Campos dos Goytacazes, Cesário de Melo, Cordovil, Freguesia, Mesquita, Nilópolis, Niterói, Niterói Ponte, Nova Iguaçu, Petrópolis, Sabão Rio, Santa Cruz, São Gonçalo Camil, Tribobó.

## Resumo

| Categoria | Quantidade |
|-----------|------------|
| ✅ OK | ~18 |
| 🔴 Bug código (placa propagada, parada errada, falso positivo, faltando) | 8 |
| 🟡 Convenção Tia Érica (SL=fim-rota) | ~12 |

## Conferir contra escala

A4 (convenção): não precisa.
A1, A3, A5: precisam conferir contra GPS Unitrac quando houver tempo.

## Status: ✅ Auditado
