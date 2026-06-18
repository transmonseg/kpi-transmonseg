# Permanência cortada + Mercosul + falsos "não foi" — Design

**Data:** 2026-06-18
**Origem:** feedback do cliente em dois momentos:
1. **17/06** — auditoria de 4 arquivos com 58 linhas sinalizadas como erro no KPI.
2. **18/06** — dois erros "absurdos" de permanência (Assaí Barra, Caxias Sul Fluminense)
   + reclamação de que "a placa Mercosul não identifica automaticamente sendo que já
   cadastrei".

Aprovação prévia do fundador: abordagem **C** (correção de código + lista de ações de
cadastro). Ordem de execução delegada e definida: **Frente 1 → Frente 2 → Frente 3**.

---

## Frente 1 — Permanência cortada (a mais grave)

### Sintoma (verbatim do cliente)
- **Assaí Barra:** KPI mostrou **16 min** de permanência. No mapa, o caminhão chegou
  **05:46** e ficou até **12:21** (cliente demorado).
- **Caxias Sul Fluminense:** no mapa a chegada é **10:25** com permanência de **2:45h**;
  o KPI cortou.

### Causa-raiz (REPRODUZIDA ponta a ponta)
Quando o GPS oscila para dentro/fora do raio cadastrado da loja, **a mesma visita se
parte em paradas adjacentes**: um trecho `LOJA` (dentro do raio, casado por código de
loja no texto) + um ou mais trechos `FORA_BASE`/`FAKE_EXIT` (poucos metros fora do raio).
O KPI reporta a permanência **só do trecho `LOJA` isolado**, não do bloco inteiro da
visita.

Dump bruto do `relatorio_10458.pdf` (dia 18), confirmado por `repro-perm-18.mts`:

| Placa | Trechos da visita | KPI atual | Permanência real |
|-------|-------------------|----------:|-----------------:|
| **SFG2F72** (Assaí Barra II 245) | `[01] 05:29→05:45 (0h16) LOJA cod=560042` então `[02] 05:46→12:18 (6h33) FORA_BASE` (~195 m) | **0h16** | **≈ 6h49** (05:29→12:18) |
| **UBF5G32** (Caxias II 219) | `[06] 10:25→12:29 (2h03) FORA_BASE` então `[07] 12:31→13:07 (0h36) LOJA cod=560057` (~45 m) | **0h36** | **≈ 2h42** (10:25→13:07) |

Os dois casos cobrem as **duas direções**: no Assaí o `FORA_BASE` vem **depois** do
`LOJA`; em Caxias vem **antes**. Os gaps entre trechos são mínimos (1 min e 2 min) e a
distância é pequena (≤ 195 m) — assinatura clássica de oscilação de GPS na mesma visita.

### Por que o código atual não cobre
Duas funções já consolidam paradas, mas nenhuma resolve estes casos:

- **`consolidarParadasMesmoCliente`** (matcher.ts:305): só funde `LOJA`+`LOJA` (gap < 30 min,
  guarda geo 500 m). Não funde `LOJA`+`FORA_BASE`.
- **`estendeSaidaPorForaBase`** (matcher.ts:440): estende **só para a frente** e tem a
  guarda `if (cls === 'LOJA' && matchedDurSeg > 15*60) return null`. Por isso:
  - **Assaí** (LOJA 16 min) é bloqueado pela guarda de 15 min.
  - **Caxias** (FORA_BASE **antes** do LOJA) não é alcançado — não existe extensão para trás.

A guarda de 15 min e o limite de 300 m foram adicionados para evitar regressões reais
citadas em comentário: **PREZUNIC FONSECA, MANILHA, BENTO RIBEIRO, CARREFOUR SULACAP**
(e REGINA/ARMAZEM na fusão LOJA+LOJA). O objetivo da guarda: não inflar a saída de uma
entrega já longa absorvendo uma parada `FORA_BASE` posterior **não relacionada**.

### Decisão de design
O discriminador correto entre "oscilação de GPS na mesma visita" e "andou para outro
lugar" **não é a duração do trecho LOJA** (guarda atual, cega), e sim a **contiguidade
temporal**: trechos da mesma visita são contíguos (gap de segundos a 1-2 min), enquanto
um deslocamento real para outro ponto tem gap de viagem.

Generalizar a consolidação para **envolver a visita em torno do trecho LOJA casado,
estendendo nas DUAS direções** através de paradas `FORA_BASE`/`FAKE_EXIT` vizinhas que
satisfaçam:
- **Contiguidade:** gap ≤ `GAP_MESMA_VISITA` entre trechos adjacentes.
- **Proximidade:** ≤ `RAIO_MESMA_VISITA` (existente **300 m**) do trecho casado.

Remove-se a guarda absoluta de duração do LOJA (15 min); a contiguidade passa a ser o
único gate, aplicado igual nas duas direções. A chegada da visita passa a ser a do
primeiro trecho do bloco e a saída a do último (regra "saída é sempre a última").

**Calibração de `GAP_MESMA_VISITA` (ponto sensível):** hoje a extensão para frente usa
limiares acoplados à duração (gap ≤ 10 min se LOJA ≥ 15 min; gap ≤ 20 min se ≥ 30 min). O
novo gate único **substitui** esses limiares acoplados, então precisa ser calibrado pelos
testes nos **dois sentidos**: grande o bastante para preservar as absorções forward
legítimas que os limiares antigos cobriam, e pequeno o bastante para rejeitar as
regressões citadas. Os casos novos têm gap de 1-2 min, então passam com folga em qualquer
valor razoável; o limiar é fixado pelo conjunto de fixtures, não chutado. Ponto de partida
**5 min**, ajustável.

### Componente
Refatorar `estendeSaidaPorForaBase` para uma função bidirecional clara
(`envolveVisita(matchedStop, todasParadas)`) que devolve `{ chegada, saida }` do bloco
inteiro da visita:
1. Caminha para **trás** pelos trechos `FORA_BASE`/`FAKE_EXIT` imediatamente anteriores
   ao LOJA casado, enquanto contíguos (gap ≤ 5 min) e próximos (≤ 300 m) — move a chegada
   para mais cedo.
2. Caminha para **frente** (lógica atual), sem a guarda de 15 min — move a saída para
   mais tarde.
3. Mantém o nome antigo como alias se houver call sites, para minimizar churn.

### Contrato testável (TDD obrigatório, preservando fixtures)
- **Novos (devem passar):**
  - `SFG2F72` → permanência ≈ 6h49 (chegada 05:29, saída 12:18).
  - `UBF5G32` → permanência ≈ 2h42 (chegada 10:25, saída 13:07).
- **Preservados (não podem regredir):** todas as fixtures de `matcher.test.ts` —
  PREZUNIC FONSECA, MANILHA, BENTO RIBEIRO, CARREFOUR SULACAP, REGINA, ARMAZEM.

Se remover a guarda de 15 min quebrar uma fixture de regressão, afina-se
`GAP_MESMA_VISITA` (para baixo, se a regressão tinha gap maior que os 1-2 min dos casos
novos; ou revisa-se a proximidade) até **separar os dois conjuntos**. Se nenhum valor
único separar tudo, o caso vira discussão de arquitetura (não se empilha fix em cima de
fix). A escolha do limiar é guiada pelos testes, não chutada.

### Risco
Alto: funções maduras com muitos casos reais testados. Mitigação: TDD escrevendo
primeiro os testes das fixtures existentes + dos dois casos novos; só então mexer no
código; rodar `vitest` + `tsc` + ver o KPI dos dois dias rodando antes de dar por pronto.

---

## Frente 2 — Mercosul "não identifica" (investigada: NÃO é bug de código reproduzível)

### Investigação (varredura `diag-mercosul-18.mts`)
A conversão Mercosul↔antiga **já está implementada, completa e correta**:
- `variantesMercosul` (matcher.ts:793): conversão oficial no índice 4,
  `0123456789↔ABCDEFGHIJ`, **bidirecional** (EAC-4365 ↔ EAC-4D65, etc.).
- `variantesPlaca = variantesOcr ∪ variantesMercosul` é aplicada em **todos** os helpers
  de placa da rota de produção (`placaRastreada`, `placaFoiAlgumLugar`, `placaSaiuDaBase`,
  `semComunicacaoDe`, confirmação por geo/alvo, horário-gabarito).

No dia 18: 81 placas Mercosul na escala, **9 não casaram**. Classificadas:
- **7** não têm **nenhum** veículo de mesmo prefixo no feed GPS → veículo genuinamente
  **ausente** do dia (não rodou / não rastreado). Não é bug de código.
- **2-3** têm prefixo parecido mas são **caminhões diferentes**: `KWV7E49`(escala) vs
  `KWV7E89`(PDF) diferem no índice 5 (posição puramente numérica, que nem OCR nem
  Mercosul cruzam); `KPH8C41` vs `KPH5G69` são totalmente distintos.

### Única lacuna real plausível
`variantesPlaca` **não compõe** OCR + Mercosul (limite explícito de ≤1 substituição, para
não inflar e casar placas não relacionadas). Uma placa que tenha **simultaneamente**
conversão Mercosul **e** um erro de OCR em outra posição não casaria. **Não há evidência**
de que isso esteja atingindo o cliente nos dados do dia 18.

### Decisão de design
**Não** fazer mudança especulativa no matching (alto risco de regressão, sem reprodução —
viola a Lei de Ferro do systematic-debugging). Em vez disso, construir um **diagnóstico**
que transforma a reclamação vaga em dado acionável (dobra na Frente 3, Camada 2): para um
dia dado, listar cada placa da escala que **não casou**, classificada por motivo:
- `ausente_feed` — sem veículo de mesmo prefixo no GPS → ação de cadastro/operação.
- `colisao_prefixo` — existe prefixo parecido mas difere em posição não-cruzada → provável
  caminhão diferente OU caso de 2 substituições para revisão manual.
- `duas_subs_mercosul_ocr` — difere de uma placa do feed por exatamente 1 conversão
  Mercosul + 1 OCR → **a lacuna real**; se aparecer, aí sim implementamos composição
  limitada (follow-up gated em evidência).

Só implementamos a composição OCR+Mercosul **se e quando** o diagnóstico mostrar casos
reais `duas_subs_mercosul_ocr`. Até lá, a Frente 2 entrega o diagnóstico, não uma mudança
de risco no matcher.

---

## Frente 3 — Falsos "não foi ao cliente" (auditoria 17/06)

### Causa-raiz (triagem das 58 linhas sinalizadas)
Maioria é **dado/cadastro/operação**, não bug de código: loja sem código Unitrac, lojas
gêmeas, placa que rodou outra rota, GPS zerado no dia. O problema de KPI é reportar essas
linhas como "não foi ao cliente" (tier `nao_entregou`, vermelho forte) quando o sistema
**não tem certeza** — deveria cair em "conferir".

### Camada 1 (código) — rebaixar incertos para "conferir"
`tierEfetivo` já rebaixa `RELATORIO_PARCIAL` e `ENTREGUE_GEO/NAO_FOI_AO_CLIENTE && revisar`
para `conferir`. Falta cobrir o caso "ponto não confirma a entrega":
- Nova `CategoriaRevisao = 'ALVO_NAO_CONFIRMADO'` para linhas onde a loja/ponto esperado
  não pôde ser confirmado (loja sem código/geo e sem parada casada) — seguindo o mesmo
  padrão de `RELATORIO_PARCIAL` em `derivarStatus` (mantém status base, `revisar=true`,
  motivo, categoria, natureza).
- Incluir essa categoria (e `NAO_SAIU_DA_BASE && revisar`, hoje não rebaixado) no
  `tierEfetivo` → tier `conferir`.

Efeito: linhas que o sistema não consegue provar deixam de ser falso "não foi" vermelho
e viram "conferir" (amarelo), que é a verdade honesta.

### Camada 2 (cadastro) — lista de ações
`src/lib/kpi/diagnostico-cadastro.ts`: função pura que, dados rotas + lojas + escala +
paradas de um dia, produz uma **lista de ações de cadastro** (exportada em XLSX seguindo o
modelo oficial — `gerador-kpi.ts`/modelo da Tia, nunca remontado do zero):
- lojas sem `codigo_unitrac`/geo que aparecem na escala;
- lojas-gêmeas ambíguas (≤120 m, mesma rede);
- placas não casadas com motivo (dobra o diagnóstico da Frente 2);
- (cruzar nova loja só após bater com a ESCALA real — regra de cadastro).

Assim a operação corrige o dado **uma vez** e os falsos positivos param de recorrer.

---

## Ordem, isolamento e verificação
1. **Frente 1** primeiro (bug real reproduzido, mais grave). TDD rigoroso.
2. **Frente 2** (diagnóstico; mudança de matcher só se o diagnóstico provar a lacuna).
3. **Frente 3** Camada 1 (mudança pequena e localizada) + Camada 2 (diagnóstico/XLSX).

Cada frente: `vitest` verde (fixtures antigas + novas) + `tsc` + `npm run build`; para
Frentes 1 e 3, **ver o KPI dos dias 17/18 rodando** antes de dar por pronto (revisão de
código não pega erro de permanência/visual). Sem ferramentas MCP — só scripts `tsx`.

## Fora de escopo (YAGNI)
- Composição OCR+Mercosul no matcher (só com evidência do diagnóstico).
- Reescrever as funções de consolidação do zero (estende-se o que existe).
- Mudanças de cadastro automáticas (a Camada 2 só **lista** ações; a aplicação é manual,
  após cruzar com a escala real).

## Assinatura
Joaquim Salles.
