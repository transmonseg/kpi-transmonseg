# KPI de Romaneio — Nutry Max do zero, Design

**Data:** 2026-08-23
**Status:** aprovado pelo usuário em conversa (decisões abaixo revisadas passo a passo), pronto pra virar plano.

## Contexto

Existem hoje **três geradores de KPI diferentes** pra Nutry Max, nenhum deles produzindo o formato que o usuário realmente usa (`KPI-Nutry-Max-{data}.xlsx`, uma linha por carga: `CARGA | PLACA | DESTINO | MOTORISTA | AJUDANTE 1 | AJUDANTE 2 | PESO (KG) | CLIENTES PLANEJADOS | NF PLANEJADO | PARADAS REAIS | KM PERCORRIDO | SAÍDA CD | CHEGADA CD | TEMPO OPERAÇÃO | STATUS`):

- `gerador.ts` — uma linha por NF/cliente.
- `gerador-kpi-loja.ts` — uma linha por loja (estilo Benassi), usando um catálogo estático geocodificado de 577 lojas (`nutrimax_clientes_geo`, de uma planilha snapshot "Relação clientes.xlsx").
- `gerador-romaneio-conferencia.ts` — por carga, mas sem SAÍDA CD/CHEGADA CD/TEMPO OPERAÇÃO/MOTORISTA/AJUDANTE no resumo.

O problema SAÍDA CD/CHEGADA CD pra Nutry Max já é conhecido e nunca foi fechado (ver `docs/superpowers/specs/2026-07-*-nutrimax-*-design.md` e memória `project_nutrimax_duas_bases`): uma tentativa anterior de computar via geofence reduziu drasticamente a cobertura porque toda placa tem uma parada artificial de meia-noite que colide com geofence de cliente vizinho.

**Decisão do usuário:** destruir os três geradores e todo o pipeline específico da Nutry Max que só serve a eles, e reconstruir do zero. Nada dos dados existentes é produção real — "nunca foi usado sério, só teste".

Esta é também a primeira peça de um objetivo maior (KPI universal, alimentado por romaneio, pra clientes além da Nutry Max — cada um com formato de romaneio e eventualmente tecnologia de rastreamento diferentes da Unitrac). **Esta spec cobre só a Nutry Max.** A generalização é deliberadamente adiada: abstrair em cima de uma amostra de um cliente é como se cria a abstração errada. O nome do módulo já é neutro (`kpi-romaneio`, não `kpi-nutrimax`) só pra não forçar um rename quando o segundo cliente chegar — isso não é construir generalização agora, é evitar uma migração de nome depois.

## Descoberta que mudou o desenho duas vezes durante a conversa

1. **Unitrac `/mapa_servicos/alvos` já dá confirmação por NF.** Testado ao vivo em 06/08 contra a conta real da Nutry Max: 2015 alvos, 100% com NF preenchida, 1241 já confirmados (`situacao === 1`) com horário real (`feitoISO`). Isso é o mesmo endpoint que o projeto irmão "monitoramento" usa (`buscarAlvos`/`pontosPorPlacaFallback`).
2. **Mas a coordenada/raio que a Unitrac cadastra pro alvo tem erro** (relato do usuário, e já documentado no projeto irmão: `src/lib/romaneio.ts` do monitoramento tem o mesmo achado — "a coordenada errada da Unitrac afeta a CONFIRMAÇÃO dela própria").

A resolução: **separar status de localização.** O `situação`/`feitoISO`/`documento` (NF) do alvo é confirmação de status — vale, não depende de geofence. A coordenada/raio do alvo **não** vale pra decidir perímetro. Localização é sempre nossa: geocodificamos o endereço do romaneio (reusando o pipeline já maduro e validado em produção do projeto monitoramento) e usamos esse perímetro pra medir chegada/saída/tempo na loja, com dwell de GPS real.

## Escopo

**Dentro:**
- O fluxo "Gerar KPI" da Nutry Max: upload de Escala + Romaneio → xlsx `KPI-Nutry-Max-{data}.xlsx` no formato exato da amostra, por carga.
- Geocodificação diária do romaneio (reuso do pipeline do monitoramento).
- Confirmação de entrega por NF via Unitrac `/alvos` (status/horário, nunca coordenada).
- Perímetro próprio (geocodificado) pra chegada/saída/tempo em cada ponto, com dwell real de GPS.
- Base (Penha/Campos) via GPS clusterizado, pra SAÍDA CD/CHEGADA CD — reaproveita as duas coordenadas já validadas com dado real (`BASE_COORD_NUTRIMAX`, `BASE_COORD_NUTRIMAX_CAMPOS`) e o raio de 500m já em uso (`consolidaParadasApi`).
- Uma tabela de histórico de gerações (auditoria: quando, por quem, arquivo gerado) — mais simples que a anterior, não granular por NF.

**Fora (assumido, não perguntado de novo — o usuário confirmou "fazer do zero" e "nunca foi usado sério"):**
- `painel/nutrimax/dashboard`, `painel/nutrimax/historico`, `painel/nutrimax/inserir`, `painel/nutrimax/romaneio` (conferência) e as rotas de API correspondentes (`kpi/nutrimax/romaneio`, `kpi/nutrimax/historico/reabrir`) — são construídos sobre o pipeline que está sendo destruído. Somem junto. Se o usuário quiser alguma dessas telas de volta, é pedido novo, sobre a base nova.
- Generalização pra outros clientes/romaneios/tecnologias de rastreio — fase futura, spec própria.
- Interface multi-cliente/config — não existe ainda, nem parcialmente.

**Mantido (URLs estáveis pro operador, internamente reconstruído):**
- `/painel/nutrimax/gerar` (página) e `/api/kpi/nutrimax/gerar` (rota) continuam existindo com o mesmo caminho — só o que roda por trás muda inteiramente.

## O que é destruído

**Biblioteca** (`src/lib/kpi-nutrimax/` inteiro, todos os `.ts`/`.test.ts`):
`gerador.ts`, `gerador-kpi-loja.ts`, `gerador-romaneio-conferencia.ts`, `matcher.ts`, `api-paradas.ts`, `confirma-endereco.ts`, `parse-romaneio.ts`, `parse-escala.ts`, `parse-xlsx.ts`, `cobertura.ts`, `historico.ts`, `resumo-viagem.ts`, `km-ors.ts`, `kpi-loja.ts`, `romaneio-conferencia.ts`, `types.ts`, `constants.ts` (as duas coordenadas de base e o texto do marcador migram pro módulo novo, o resto morre).

**Rotas:** `src/app/api/kpi-nutrimax/upload/route.ts`, `src/app/api/kpi/nutrimax/romaneio/route.ts`, `src/app/api/kpi/nutrimax/historico/reabrir/route.ts`. `src/app/api/kpi/nutrimax/gerar/route.ts` é reescrita do zero (mantém o path).

**Painéis:** `src/app/painel/nutrimax/dashboard/`, `historico/`, `inserir/`, `romaneio/` inteiros. `src/app/painel/nutrimax/gerar/page.tsx` é reescrita do zero (mantém o path).

**Script:** `scripts/geocodificar-clientes-nutrimax.ts` (geocodificava o catálogo estático de 577 lojas — não existe mais catálogo estático).

**Tabelas Supabase** (migração de `DROP TABLE`, dados são teste): `kpi_nutrimax_entradas`, `kpi_nutrimax_status_placa_flags`, `kpi_nutrimax_geracoes`, `nutrimax_clientes_geo`.

**Worktree órfão:** `.claude/worktrees/nutrimax-kpi-correcoes` tem trabalho não mergeado ajustando um corte de dwell mínimo só pra Nutry Max, sobre o pipeline que está sendo destruído. Fica obsoleto por construção — removido na limpeza final (não precisa de decisão de merge).

## Arquitetura

```
Escala de Rota (PDF, upload)
  → parseEscala()  →  LinhaEscala[]  (placa, motorista, ajudante1/2, carga, destino, peso, ENT/NF planejado)

Romaneio de Entrega (PDF, upload, formato Nutrymax já conhecido: "CARGA/DESTINO", "PLACA/MOTORISTA", "NF/CLIENTE")
  → parseRomaneio()  →  LinhaRomaneio[]  (carga, placa, nf, clienteCodigo, clienteNome, endereco)

                          │
                          ▼
              geocodificarEnderecosDoDia()
              (reuso do pipeline do monitoramento: extrator + geocode +
               fallback, mesma ideia de romaneio_pontos)
                          │
                          ▼
              LinhaRomaneio[] + { lat, lng } por linha (quando geocodificou)

Unitrac API (COD_USER_NUTRIMAX)
  buscarFrota → cvs
  buscarAlvos(cvs) → AlvoApi[]  (nome, NF/documento, situação, feitoISO — SÓ status, nunca lat/lng/raio)
  buscarStopsCru + consolidaParadasApi(BASES_COORD_NUTRIMAX, raio 500m) → paradas GPS classificadas BASE/FORA_BASE

                          │
                          ▼
              montarVisitas(linhasGeocodificadas, paradasGps)
              — por linha: perímetro PRÓPRIO (raio a definir no plano,
                referência: 300m, mesmo valor já validado em produção pro
                dwell de presença no monitoramento) centrado na coordenada
                geocodificada; visita = intervalo de dwell do GPS dentro
                desse perímetro (entrada/saída consolidadas, não o primeiro
                ping)
                          │
                          ▼
              status da linha = alvo.situação === 1  OU  visita encontrada
              (mesma regra OR do monitoramento: feito = alvo.feito ||
              presencaConfirmada)
                          │
                          ▼
              agregarPorCarga(linhas, visitas, paradasBase)
              — SAÍDA CD = primeiro evento BASE→FORA_BASE do dia pra
                aquela placa; CHEGADA CD = último evento FORA_BASE→BASE;
                TEMPO OPERAÇÃO = CHEGADA CD − SAÍDA CD; PARADAS REAIS =
                nº de visitas confirmadas; KM PERCORRIDO = soma de
                distância real das paradas do dia (mesma fonte já usada:
                Relatório Parada e Serviço / resumo de viagem via API)
                          │
                          ▼
              gerarKpiRomaneioXlsx()  →  KPI-Nutry-Max-{data}.xlsx
                          │
                          ▼
              salvarGeracao()  (tabela de histórico simples + Storage)
```

## Estrutura de arquivos (`src/lib/kpi-romaneio/`)

- `types.ts` — tipos novos, sem herdar nada do módulo destruído.
- `parse-romaneio.ts`, `parse-escala.ts` — parsers do formato Nutry Max (reescritos; a forma do arquivo de origem não muda, só o código que lê).
- `geocode.ts` — ponte pro pipeline de geocodificação do monitoramento. Confirmado: os dois projetos rodam no mesmo VPS (`transmonseg-vps`), como processos PM2 irmãos (`/srv/kpi-transmonseg` ao lado de `/srv/transmonseg/temp`/`definitivo`) — repos e `node_modules` separados, sem import direto possível entre eles. **Decisão de implementação pro plano:** chamada HTTP local (`localhost`) contra uma rota do monitoramento que exponha geocodificação sob demanda (mesmo padrão de rota interna com `x-motor-key` já usado lá), versus duplicar a lógica de extração/geocode aqui. Preferência inicial: HTTP local — evita duas cópias divergindo — mas o plano confirma se o monitoramento já tem (ou vale a pena criar) uma rota de geocodificação isolada, sem side effects em `romaneio_pontos`.
- `visitas.ts` — `montarVisitas()`, a lógica de perímetro+dwell.
- `agregacao.ts` — `agregarPorCarga()`.
- `constants.ts` — `BASE_COORD_NUTRIMAX`, `BASE_COORD_NUTRIMAX_CAMPOS`, `MARCADOR_BASE_NUTRIMAX`, raio de base, raio de perímetro de entrega, `foraDoAlcanceApi` (migrados do módulo antigo, revisados).
- `gerador-xlsx.ts` — gera o arquivo no formato exato da amostra.
- `historico.ts` — tabela de auditoria simples.

## Colunas do XLSX (ordem exata da amostra)

| # | Coluna | Fonte |
|---|---|---|
| 1 | CARGA | Escala/Romaneio |
| 2 | PLACA | Escala/Romaneio |
| 3 | DESTINO | Escala |
| 4 | MOTORISTA | Escala |
| 5 | AJUDANTE 1 | Escala |
| 6 | AJUDANTE 2 | Escala |
| 7 | PESO (KG) | Escala |
| 8 | CLIENTES PLANEJADOS | Escala (ENT planejado) |
| 9 | NF PLANEJADO | Escala |
| 10 | PARADAS REAIS | `agregarPorCarga` — contagem de visitas confirmadas |
| 11 | KM PERCORRIDO | Resumo de viagem via API (real) |
| 12 | SAÍDA CD | GPS clusterizado contra base |
| 13 | CHEGADA CD | GPS clusterizado contra base |
| 14 | TEMPO OPERAÇÃO | CHEGADA CD − SAÍDA CD |
| 15 | STATUS | `OK` (todas as NF planejadas confirmadas — via alvo ou via visita) / `INCOMPLETO` (pelo menos uma pendente) — os dois únicos valores observados na amostra |

## Tratamento de erro / ambiguidade

- **Endereço que não geocodifica:** linha entra sem perímetro próprio — status da linha cai só no critério do alvo (`situação === 1`). Não bloqueia a carga inteira. Mesma filosofia fail-open pró-recall do monitoramento: nunca esconder uma entrega por falha de geocodificação.
- **Placa sem nenhum GPS no dia** (offline, sem rastreador): SAÍDA CD/CHEGADA CD/KM ficam vazios, não zerados — carga aparece com o que dá pra saber, resto em branco.
- **Placa baseada em Campos que nunca aparece na região de Penha:** já coberto por `BASES_COORD_NUTRIMAX` ser uma lista, não um ponto único — nenhuma mudança de comportamento necessária aqui, só migrar a constante.
- **Escala sem carga correspondente no Romaneio, ou vice-versa:** aparece como aviso agregado no topo do relatório (mesmo espírito do `AvisoCoberturaNutrimax` anterior, tipo reconstruído do zero), não bloqueia.

## Testes

- Unitário pra `montarVisitas`: endereço geocodificado com GPS batendo dentro do perímetro (visita confirmada), endereço geocodificado sem nenhum GPS por perto (sem visita, mas `situação===1` ainda confirma via alvo), nem geocodificação nem alvo (pendente/sem confirmação), dois pontos geocodificados próximos um do outro (não deixar GPS de um "roubar" a visita do outro — usar o perímetro mais próximo, não o primeiro que bate).
- Unitário pra `agregarPorCarga`: SAÍDA CD/CHEGADA CD corretos com múltiplos ciclos BASE→FORA_BASE→BASE no mesmo dia (pega o primeiro e o último, não o meio), placa sem nenhum evento BASE (campos vazios).
- Reaproveita os testes de geocodificação do monitoramento sem alteração (só integração nova, não mudança de comportamento lá).
- Padrão da casa: `npm test` (vitest), `npm run lint`.
- Validação obrigatória antes de considerar pronto: rodar com um dia real de Escala+Romaneio da Nutry Max e conferir contra o que o usuário já sabe do dia (mesmo princípio de validação com dado real usado no monitoramento).

## Fora de escopo

- Qualquer mudança no motor/pipeline do Benassi (`src/lib/kpi/*`, `/api/kpi/simples`) — continua intocado.
- Qualquer mudança no projeto monitoramento além de, possivelmente, expor o que for necessário pra reuso da geocodificação (decisão de like/import a fechar no plano).
- Generalizar pra outro cliente ou outra tecnologia de rastreamento além da Unitrac — vem depois, com exemplos reais e spec própria.
- Recriar as telas de dashboard/histórico/inserir/romaneio-conferência — só acontece se pedido de novo.

## Migração — nos 2 repos

Mesma disciplina do par monitoramento/definitivo: `KPI transmonseg` (main, canônico) e `KPI TEMP` (fork, deploy). Toda mudança replicada nos dois, verificada byte-idêntica, commit e push nos dois.
