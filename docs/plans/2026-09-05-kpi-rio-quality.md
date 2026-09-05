# KPI Rio Quality — plano de implementação (lado KPI)

**Goal:** gerar o KPI diário da Rio Quality a partir das duas planilhas que ela exporta
(`Relatório de Custos` = placa + rota; `Relatório de Entregas` = placa + nome da rua),
geocodificando pelo nosso próprio motor e confirmando presença pelo GPS da Unitrac —
sem depender dos alvos/geofences que a Unitrac já tem cadastrados.

**Architecture:** reaproveita o pipeline da Nutry Max (`/api/kpi/nutrimax/gerar`) trocando
só a entrada (xlsx em vez de PDF) e a geocodificação (ponte
`POST /api/romaneio/geocode-coerencia` do monitoramento, que resolve rua-sem-cidade por
coerência de grupo — ver `monitoramento/src/lib/romaneio-geocode-coerencia.ts`). Sem escala,
sem alvos: status só `confirmado_gps`/`pendente`. Confiança da geocodificação vai pro
`observacao` do detalhe em vez de inventar coordenada.

**Medição que justifica:** gabarito de 974 paradas confirmadas por GPS (04/09): 80% ≤500m,
90% ≤1km, 97% ≤3km, mediana 153m. 100 placas em ~40s.

---

## Task 1 — Parser das planilhas (`src/lib/kpi-rioquality/parse-planilhas.ts`)
- `parseCustos(buf) → Map<placaNorm, rota>`; `parseEntregas(buf) → {placaNorm, rua}[]`
  (ordem preservada, mas NÃO é ordem de rota).
- `rotaParaZona(rota)`: `SUL/NORTE/OESTE/SUDOESTE/CENTRO → CAPITAL`, `BAIXADA`, `NIT/SG → LESTE`,
  `LAGOS`, `R. SERR* → SERRANA`, `SUL FLU → SUL_FLUMINENSE`, `NORTE FLU → NORTE_FLUMINENSE`,
  `C. VERDE → COSTA_VERDE`; desconhecida → null (sem prior).
- `montarLinhasRomaneio(custos, entregas) → LinhaRomaneio[]`: `carga = rota` (ou `SEM ROTA`),
  `destino = rota`, `nf = "<placa>-<seq>"` (não tem NF), `clienteNome = rua`, `endereco = rua`.
- Cabeçalho pode não estar na 1ª linha (linha de título antes): localizar pela célula
  `Placa`/`Endereço` ou `Veículo`/`Rota`.

## Task 2 — Cliente da ponte (`src/lib/kpi-rioquality/geocode-coerencia.ts`)
- `geocodificarPorCoerencia(grupos: {id, zona, ruas[]}[]) → Map<id, ResultadoParada[]>`
  mesmo padrão de `kpi-romaneio/geocode.ts` (MONITORAMENTO_URL, x-motor-key, timeout,
  falha graciosa = todos `sem_candidato`).

## Task 3 — Frota (placa → cv) sem cod_user
- Migration `kpi_rioquality_frota(placa_norm pk, cv, nome)` + seed dos 59 CVs coletados
  (ver cofre). `buscarFrotaRioQuality()` lê da tabela. Placa sem CV → `temRastreador=false`.

## Task 4 — Rota `POST /api/kpi/rioquality/gerar`
- FormData: `custos`, `entregas`, `data`. Auth/perfil igual à Nutry Max (`empresa='rioquality'`).
- Pipeline: parse → grupos por placa (zona da rota) → ponte coerência → `LinhaGeocodificada`
  (+ `confianca`) → `buscarParadasDoDia(cv, placa, data, 48)` com bases `[]` → `montarVisitas`
  → `agregarPorCarga(escala=null, alvos=[])` → `montarDetalheEntregas` → observação por
  confiança (`baixa` → `LOCALIZAÇÃO INCERTA (RUA SEM CIDADE)`, `sem_candidato` →
  `ENDEREÇO NÃO LOCALIZADO`) → `gerarKpiRomaneioXlsx` → `salvarGeracao(cliente='rioquality')`
  + upload das planilhas pro bucket (regeneração).
- Sem `detectarDescasamentos` (não há escala).

## Task 5 — UI
- `EMPRESAS += 'rioquality'` (label "Rio Quality"); grupo no `nav.tsx`; `painel/rioquality/{layout,gerar,historico}`
  clonados da Nutry Max (dropzones `.xlsx`, textos).

## Task 6 — Verificação real
- Gerar com as planilhas de 04/09; conferir no xlsx: % confirmado_gps, distribuição de observações,
  placas sem CV. Deploy: push + `deploy.sh` no Contabo (KPI não sobe por git push).

## Fora de escopo (agora)
- Base/CD da Rio Quality (saída/chegada do CD ficam null até termos a coordenada da base).
- cod_user da Unitrac (frota completa automática) — pedir à Erica.
