# Bugs consolidados — dia 19/05/2026

Auditoria completa de 9 redes. ~330 lojas auditadas.

## Padrões de bug recorrentes (agrupados pra varredura código)

### 🔴 Padrão 1 — Multi-trip / Parada errada (sys pega parada manhã quando real é noite, ou vice-versa)

**Mais comum.** Sys atribui parada do horário ERRADO da placa quando placa faz 2+ viagens no dia.

| Rede | Loja | Manual | Gerado | Δ |
|------|------|--------|--------|---|
| ZS | 22 S.Conrado | 19:00/21:10/21:35 | 09:53/**11:09/12:04** | 540min |
| ZS | 25 Jd.Botânico | 19:00/20:15/21:00 | 09:53/**11:09/12:04** | 540min |
| ZS | 47 Catete | 18:30/19:40/20:20 | 10:04/**11:09/12:25** | 510min |
| ZS | 01 Ipanema | 15:25/16:25/17:05 | 15:25/**17:07/17:42** | 42min |
| ZS | 09 Ipanema | 15:25/17:10/17:45 | 15:25/**16:26/17:05** | 44min |
| ZS | 11 Leblon (1ª) | 12:55/14:35/17:05 | (faltando) | — |
| ASSAI | Caxias II | 04:30/05:05/08:45 | 11:25/**11:56/13:32** | 411min |
| ASSAI | Santa Cruz 2 | 05:05/06:00/07:15 | 11:14/**12:33/15:19** | 393min |
| ASSAI | Mendanha | 04:40/05:25/11:20 | 04:33/**07:48/11:21** | 143min |
| ASSAI | Barra II | 05:00/05:50/09:55 | 04:56/**09:51/09:56** | 241min |
| PREZUNIC | SPID Freguesia | 04:10/07:05/07:45 | 11:47/**14:30/15:24** | 445min |
| PREZUNIC | Icaraí | 05:10/06:00/09:10 | 05:10/**08:17**/09:09 | 137min |
| PRINCESA | Buzios 3 (1ª) | 02:50/05:45/06:10 | 02:49/**07:38/10:36** | 113min |
| GUANABARA | Niterói F.8 | 05:40/**06:20**/10:05 | 07:14/**09:20**/10:07 | 180min |
| GUANABARA | Campo Grande F.30 | 06:35/**08:00**/10:15 | 06:34/**08:55**/10:14 | 55min |
| ARMAZEM | REGINA BARRA | 12:40/**15:40/16:25** | (X)/**14:20/14:27** | 80min |
| ARMAZEM | REGINA 1 DE MAIO | 12:40/**14:20/14:30** | (X)/**15:38/16:26** | 78min |

**Total:** ~17 lojas afetadas em 6 redes.

**Causa raiz hipótese:** Multi-trip assignment escolhe parada errada quando há paradas LOJA múltiplas com mesmo codigo_loja ou em horários diferentes. Algoritmo Hungarian-like minimiza score TOTAL mas pode trocar pares.

### 🔴 Padrão 2 — SL muito curta (LOJA → FORA_BASE pattern)

Sys termina SL no fim do geofence LOJA, manual conta até fim do FORA_BASE adjacente.

| Rede | Loja | Manual SL | Gerado SL | Δ |
|------|------|-----------|-----------|---|
| ZS | 43 Barra | 16:55 | 16:20 | 35min |
| ZS | 45 Flamengo | 18:00 | 16:19 | 101min |
| ATACADAO | Manilha | 10:20 | 08:07 | 133min |
| CARREFOUR | Sulacap | 07:15 | 06:32 | 43min |
| PREZUNIC | Caxias Centro | 06:30 | 06:17 | 13min |
| GUANABARA | Bento Ribeiro | 12:50 | 10:36 | 134min |
| GUANABARA | Bonsucesso | 11:55 | 10:50 | 65min |
| ASSAI | Macaé | 10:30 | 06:21 | 249min |
| ASSAI | Galeão | 06:15 | 11:37 | INVERSO (sys longe demais) |
| PRINCESA | Buzios 1 (2ª) | 17:30 | 06:32 | 658min |

**Fix existente:** `estendeSaidaPorForaBase` em `matcher.ts:340` resolve para PREZUNIC Fonseca dia 20 (300m, 15min LOJA). Pode estender critérios.

### 🔴 Padrão 3 — Plate-swap aplicou alteração na loja errada (espalha)

Alteração foi pra UMA loja, mas sys aplicou em VÁRIAS lojas com mesmo nome de rede.

| Caso | Rede | Esperado | Aplicou em |
|------|------|----------|------------|
| AMW-3424 (Messias) | ASSAI | Só São Gonçalo Camil | Camil, Alcântara II, Bangu II, Méier (4 lojas!) |

**Fix já feito:** commit `a810930` (`aplicar-alteracoes.ts` tokens fortes filtra rede). Aguardando re-geração pra confirmar.

### 🔴 Padrão 4 — Carro 2º faltando ou trocado

| Rede | Loja | Manual 2º | Gerado 2º |
|------|------|-----------|-----------|
| ZS | Loja 31 1ª | DBB-8D19 / 14:00/14:10 | sumiu (só LTE-0A64 SEM) |
| ZS | MEGA BOX 2 noite | LNU-7733 / 19:30/20:10 | sumiu |
| GUANABARA | Vila Isabel F.36 | KUM-9J05 (THIAGO) | sumiu |
| GUANABARA | Tijuca F.25 | FTV/DAVISON | sumiu |
| CARREFOUR | Campo Grande 2º | RENAN/KRW-8E86 | sys botou SIMÃO/LSN-6I72 (mesmo do 1º) |

### 🔴 Padrão 5 — Falso positivo (manual NÃO_FOI/SEM, sys diz FOI)

| Rede | Loja | Manual | Gerado |
|------|------|--------|--------|
| ZS | 14 Leblon | NÃO_FOI | 15:53/16:41 |
| ZS | 32 Laranjeiras | SEM | 04:54/05:31 (dia 20) |
| ZS | 1129 Olaria | NÃO_FOI | (resolvido com T18-X) |
| ASSAI | Barra I | NÃO_FOI | 06:08/06:36 |
| ASSAI | Bangu II | NÃO_FOI | 09:33/09:37 |
| PREZUNIC | Botafogo Serra Azul | SEM | 10:42/10:59 |
| PREZUNIC | Jauru | SEM | 14:37/14:45 |
| PREZUNIC | Taquara | SEM | 14:50/14:53 |

### 🔴 Padrão 6 — Loja faltando no gerado (manual tem)

| Rede | Loja | Manual |
|------|------|--------|
| ZS | 07 Leblon (2ª KQR-2J11) | 15:00/16:10 |
| ZS | 11 Leblon (1ª DBB-8D19) | 14:35/17:05 |
| ZS | 19 Copacabana (1ª LCO-0978) | 20:00/21:35 |
| ZS | 21 (2ª NÃO_FOI LQE-5401) | NÃO_FOI |
| ZS | MEGA BOX 2 noite (LNU-7733) | 19:30/20:10 |
| ZS | MEGA BOX 2 (3ª AKZ-2594) | 19:30/19:40 |
| ASSAI | Ceasa (EZU-9325) | 05:55/07:30 |
| ASSAI | Maracanã (GAR-0802) | 06:00/11:20 |
| GUANABARA | Caxias F.18 (GVH-1397) | 10:45/11:55 |
| GUANABARA | Santa Cruz F.28 (KTR-6724) | 09:20/10:05 |
| PREZUNIC | Cidade de Deus (KOP-4978) | 07:00/07:50 |
| PREZUNIC | SPID Barra (LLJ-9C64) | 08:25/08:35 |
| ARMAZEM | BOA VISTA (TML-9I75) | 15:30/15:55 |

### 🟡 Padrão 7 — Convenção Tia Érica SL=fim-rota (NÃO É BUG)

ASSAI principalmente: várias lojas com SL idêntico (11:20, 11:25, 10:30) = fim de rota inteira, não saída individual da loja. ~12 lojas dia 19.

**Decisão:** documentar como convenção, não tentar fixar no código.

### 🟡 Padrão 8 — Placas trocadas (sys ≠ manual) — pode ser plate-swap real

| Rede | Loja | Manual placa | Gerado placa |
|------|------|--------------|--------------|
| ZS | 33 Humaitá | BBH-1C94 | LCO-0978 (sem dado) |
| ZS | 21 Flamengo 1ª | KWK-4593 | LTQ-0783 (sem dado) |
| ZS | 07 Leblon 1ª | LCO-0978 | KWK-4593 (com tempos errados) |
| ZS | 48 Recreio | RJL-7D33 NÃO_FOI | BBH-1C94 / 04:49/05:29 |
| ZS | 31 Jd.Botânico 1ª | DBB-8D19 (14:00) | LTE-0A64 SEM |
| ZS | MEGA BOX 2 R17 | KOP-4978 | AKZ-2594 |
| ASSAI | Alcântara II | FQN6J72 | AMW-3424 (alteração propagada — Padrão 3) |
| ASSAI | Méier | AKZ-2745 | AMW-3424 (alteração propagada — Padrão 3) |
| GUANABARA | Campo Grande F.10 | KNI-8942 | HUR-1841 (bug parser nome) |

## Tally final (bugs por rede)

| Rede | OK (✅+⚠️) | 🔴 Bugs | Total linhas |
|------|----------|---------|--------------|
| ZONA_SUL | 41 | 12 | 53 |
| ASSAI | 30 | 8 | 41 |
| ATACADAO | 1 | 1 | 2 |
| CARREFOUR | 8 | 4 | 12 |
| GUANABARA | 21 | 7 | 28 |
| PREZUNIC | 50 | 7 | 57 |
| PRINCESA | 22 | 3 (+1 convenção) | 26 |
| SUPERPRIX | 9 | 0 | 9 |
| ARMAZEM_GRAO | 8 | 6 | 14 |
| **TOTAL** | **190** | **48** | **242** |

**% aceitável:** 190/242 = **78.5%** (sem contar padrões 7 que são convenção).

## Próximas ações — varredura código

### Prioridade 1 — Multi-trip assignment (17 lojas afetadas)

Investigar matcher quando placa faz 2+ viagens. Algoritmo de assignment escolhe wrong parada.

Arquivo: `src/lib/kpi/matcher.ts` — função de assignment matricial (linha 728+).

### Prioridade 2 — SL muito curta (10 lojas)

Estender `estendeSaidaPorForaBase` pra cobrir mais casos. Critérios atuais (15min LOJA, 30min FORA_BASE, 300m, 10min gap) podem ser ajustados.

### Prioridade 3 — Lojas faltando (13 lojas)

Várias linhas escala sem KPI gerado. Investigar o que o sys está rejeitando.

### Prioridade 4 — Falsos positivos (8 lojas)

Sys gera entrega quando manual diz NÃO_FOI ou SEM. Casos específicos a investigar.

### Prioridade 5 — Carro 2º (5 lojas)

Sys perde o 2º carro em algumas lojas. Verificar como o matcher trata múltiplas linhas pra mesma loja.

## Status: ✅ Consolidação completa. Varredura código próxima.
