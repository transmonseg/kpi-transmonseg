# Motor de confirmação: posição bruta como fonte primária de parada

Data: 2026-09-14
Sucede a Fase 2 (item 3a/3b, ver `2026-09-12-confiabilidade-kpi-nutrimax-design.md`).
Pesquisa de apoio: geofencing/dwell-time e detecção de "salto implausível" em
telemetria de frota (ver seção "Pesquisa" ao fim).

## Problema

O motor de confirmação confia, por padrão, na parada **já processada pela
Unitrac** (`buscarStopsCru` → `consolidaParadasApi`) sempre que a data está
dentro da janela de 48h da API deles. Só recorre à nossa própria posição bruta
(`posicoes_historico` + `derivarParadas`) quando a data sai dessa janela.

Isso inverte a ordem de confiança errada. Medido em 14/09/2026: a própria API
da Unitrac, num dia dentro da janela, devolveu parada a ≤500m de 10 endereços
para 3 placas — enquanto `posicoes_historico`, ingestão independente do mesmo
veículo, mostra essas placas a 3,6–18,3 km de distância o dia inteiro. O item
3a (já em produção) cobre esse caso corrigindo pontualmente cada parada da
Unitrac contra o nosso rastro antes de aceitá-la — mas continua tratando a
Unitrac como fonte primária e o nosso dado como corretivo. Depois de 3a, ainda
é a Unitrac quem decide "existe uma parada aqui"; nós só vetamos.

A pesquisa de mercado (ver seção final) confirma que a prática recomendada é o
oposto: tratar a posição contínua como o sinal primário e aplicar
detecção de descontinuidade (posição "teleportando" ou parada sem
correspondência de velocidade) para descartar o que não bate — que é
exatamente o papel de `derivarParadas`, já construído e já rodando em produção
como fallback.

## Objetivo

Inverter a prioridade: para qualquer placa e dia, a parada derivada da nossa
própria posição contínua (`derivarParadas`) é a fonte primária. A parada já
processada pela Unitrac (`consolidaParadasApi`) vira sinal secundário, usado
só quando não há cobertura própria — e mesmo aí, continua sujeita ao filtro de
velocidade do item 3a antes de confirmar qualquer coisa.

## Não-objetivos

- Não muda `buscarAlvosDoDia`, `buscarFrota`, nem qualquer caminho de
  geocodificação.
- Não descarta a API da Unitrac — ela continua como sinal secundário e como
  origem de `paradasPorOutraPlaca` para a lógica de carga transferida (fora de
  escopo revisar essa lógica agora).
- Não muda a classificação BASE/FORA_BASE nem os raios/velocidades já
  calibrados em `derivarParadas` (`VELOCIDADE_MAX_PARADO_KMH=5`,
  `RAIO_CLUSTER_PARADA_M=150`, `DUR_MINIMA_PARADA_MS=120_000`).

## Escopo

**Nutry Max e Rio Quality juntas**, decisão do usuário nesta rodada (as fases
anteriores restringiram a Nutry Max; aqui as duas entram porque a mudança é
puramente na fonte de parada, e a Rio Quality já expõe `buscarParadas` como
parâmetro injetável — trocar o padrão dela não exige tocar em geocodificação,
casamento inclusivo nem nenhuma outra parte específica da Rio Quality).

## Desenho

### 1. A peça que falta é só a prioridade, não o mecanismo

`derivarParadas` (monitoramento, `base-horarios/route.ts`) já produz
`ParadaDerivada[]` velocidade-gated a partir de `posicoes_historico`, exposto
via `GET /api/kpi/base-horarios?incluirParadas=true`. `paradasDaPonte`
(KPI, `unitrac.ts`) já converte isso para `UnitracParadaRow[]`. As duas peças
já existem e já são usadas — hoje só no caminho de fallback histórico
(`resolverParadas`, ativado quando `foraDoAlcanceApi(data, hojeBR())`).

O trabalho desta fase é fazer essa consulta rodar **sempre**, não só fora da
janela, e trocar a regra de decisão.

### 2. Nova regra de prioridade — e a armadilha que já nos custou uma manhã

Para cada placa e dia, consultar a ponte primeiro. Três resultados possíveis:

- **A ponte devolve ≥1 parada FORA_BASE** → usar essas, sempre. Corroboradas
  por construção (vieram de leitura de velocidade real).
- **A ponte devolve paradas, mas todas BASE (nenhuma FORA_BASE)** → o
  caminhão genuinamente não saiu da base. **Não cair para a Unitrac** — isso
  reintroduziria o mesmo bug do "veículo sem movimento" corrigido hoje mais
  cedo, na direção oposta (inventar entrega em cima de silêncio de dado).
- **A ponte não devolve NENHUMA leitura para essa placa nesse dia** (sem
  cobertura — poller fora do ar, veículo sem rastreador nosso, etc.) → cair
  para a Unitrac (`buscarStopsCru`/`consolidaParadasApi`), como acontece hoje
  no caminho "dentro da janela". A parada da Unitrac usada aqui continua
  sujeita ao filtro de velocidade do item 3a antes de confirmar qualquer NF —
  nunca é aceita sem checagem, mesmo como último recurso.

A distinção entre os dois últimos casos é a mesma dor de cabeça de hoje cedo
("sem dado" ≠ "dado confirma silêncio") — só que espelhada. A resposta é a
mesma: nunca inferir de ausência de linha o que só uma linha explícita prova.

### 3. Failover se a própria chamada da ponte falhar

Diferente de "sem cobertura" (a ponte respondeu, dizendo que não tem dado),
aqui a chamada em si falha (rede, timeout, erro 5xx). Fail-open cai para a
Unitrac, do mesmo jeito que o caso de "sem cobertura" — mas precisa ser
**audível** (`console.error` nomeando a falha), seguindo a lição do item 2 da
Fase 2: fail-open sem log é cegueira, não segurança.

### 4. Rio Quality entra pela porta que já existe

`gerarKpiRioQuality` recebe `buscarParadas` como parâmetro opcional, hoje
com o default:
```ts
buscarParadas ?? (async (cv, placaNorm, d) =>
  consolidaParadasApi(await buscarStopsCru(cv, 48), {}, d, placaNorm, BASES_COORD_RIOQUALITY))
```
O novo default aplica a mesma regra de prioridade da seção 2, usando
`BASES_COORD_RIOQUALITY` (não `BASES_COORD_NUTRIMAX`) para a classificação
BASE/FORA_BASE da ponte. A assinatura do parâmetro não muda — só o corpo do
default. Testes que já injetam `buscarParadas` para isolar o pipeline nos
testes existentes continuam funcionando sem alteração.

### 5. Desempenho

A ponte passa a ser chamada em **toda geração**, não só nas raras
reprocessagens históricas. Uma chamada por placa (já é o padrão hoje no
fallback) — para uma geração de ~70 placas, isso é ~70 chamadas HTTP à ponte
por execução. Se isso se mostrar lento na medição real, agrupar em lote (a
ponte já aceita `placas: string[]` em `buscarHorariosBase`) em vez de uma
chamada por placa — decidir com dado, não a priori.

## Riscos

- **A ponte vira caminho primário para geração diária**, não só reprocessamento
  raro. Qualquer bug latente em `derivarParadas` passa a valer para todo dia,
  não só para auditoria — testar com o mesmo rigor de produção que a Fase 1 e
  a Fase 2 usaram (rodada real antes/depois, não só teste unitário).
- **Latência agregada**: N chamadas HTTP por geração onde antes era 0 (dentro
  da janela) — medir e agrupar em lote se necessário (ver seção 5).
- **A distinção "zero FORA_BASE real" vs "zero cobertura"** é sutil e já nos
  custou uma manhã inteira hoje na direção oposta. O plano de implementação
  precisa de teste explícito para as duas situações, não só para o caminho
  feliz.

## Validação

Mesma disciplina das fases anteriores: gerar os dias 11 e 12/09 antes e depois
da mudança (arquivo real, romaneio+escala já disponíveis), comparar:
- contagem de confirmadas (não pode colapsar nem inflar sem explicação)
- os mesmos 10 NFs da contradição Unitrac×GPS (já corrigidos pelo item 3a;
  aqui devem continuar corretos, agora pela via primária, não pelo veto)
- Rio Quality isolada: rodar o dia com dado real dela e confirmar que o
  resultado não piora em relação ao pipeline atual

## Pesquisa

Buscas feitas em 14/09/2026 sobre práticas de mercado para confirmação de
entrega por geofence e cruzamento de fontes de GPS:

- **Dwell time como filtro de falso positivo**: plataformas líderes recomendam
  30-60s de permanência mínima para não disparar em passagem rápida. Nosso
  limiar (5min em `derivarParadas`, 3min no corte do item 3b) já é mais
  conservador que o padrão de mercado — não há indicação de afrouxar.
- **Círculo de raio fixo em endereço irregular é o erro mais comum do setor**
  (fonte: geofence-trigger-event, nextbillion.ai) — corresponde exatamente ao
  nosso "colapso de rodovia" (S/N, KM), onde vários clientes caem no mesmo
  raio. Não é objeto desta fase (é geocodificação, não confirmação), mas
  confirma que o padrão já documentado no projeto é um problema conhecido do
  setor, não peculiaridade nossa.
- **Detecção de "salto implausível"**: fontes de telemática descrevem
  descartar leitura de posição quando o veículo estava comprovadamente em
  movimento contínuo no horário, e sinalizar "teleporte" (coordenada mudando
  quilômetros em poucos segundos) como violação de integridade, não como dado
  válido. É a mesma lógica do item 3a (velocidade contra o rastro próprio) e
  desta fase (preferir a fonte de leitura contínua à fonte pré-processada por
  terceiro).
- **Cruzamento contra polígono de zona operacional** como camada de validação
  de posição — confirma a abordagem já tomada na Fase 1 (guarda territorial).

Nenhuma buscou skill/ferramenta de terceiro aplicável diretamente a este
domínio (rastreamento de frota via API proprietária) — os skills instalados
neste ambiente (Superpowers, GSAP, genjutsu) não cobrem geoespacial/telemetria;
a pesquisa serviu para validar a direção do desenho contra prática de mercado,
não para importar uma ferramenta pronta.
