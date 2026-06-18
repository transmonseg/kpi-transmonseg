# Modo sugestão de troca (indicar placa provável e marcar conferência)

**Data:** 2026-06-18
**Autor:** Joaquim Salles
**Status:** design aprovado, aguardando revisão do spec

## Contexto e problema

A lógica de troca de carro T18 (`matcher.ts`, bloco `semGpsLines`) procura um carro
substituto quando a placa escalada não registrou GPS na loja. Quando encontra um
candidato sólido, aplica a troca: muda `placa_real`, e o status vira "entregue via troca".

Por desenho anti falso positivo, o T18 SEGURA em vários casos legítimos:

- **T18-F (carro tem rota própria):** o substituto da mesma rede esteve na loja, mas
  como as linhas de escala dele já estão 100% casadas, todas as paradas dele são
  bloqueadas (`usedIds.add`). Casos dia 17: Copacabana 26 e Laranjeiras 32.
- **Só geográfico:** não há carro da rede parado na loja; o mais perto é de outra rede
  ou está a alguns quilômetros. O T18 descarta sem deixar rastro. Casos dia 17: Bento
  Ribeiro 15 e Caxias 18.

Hoje esse candidato é jogado fora em silêncio. A linha fica "não foi ao cliente" sem
nenhuma pista de qual placa provavelmente fez aquele caminho. Na auditoria do dia 17,
as 4 placas substitutas foram encontradas manualmente, uma a uma.

## Objetivo

Quando o T18 segura, em vez de descartar o candidato, EMITIR UM AVISO indicando qual
placa provavelmente fez a rota. Um terceiro estado entre "segurar calado" e "aplicar a
troca". Quando o sinal é forte (alta confiança), além do aviso, o status passa a refletir
"mudou de rota, conferir" (amarelo), porque deixar vermelho "não foi ao cliente" enquanto
se avisa que outra placa esteve na loja é contraditório.

## Decisões (aprovadas)

1. **Níveis:** alta e baixa confiança.
   - **Alta:** carro da mesma rede (ou rede fungível) que passaria em todos os guards do
     T18, mas foi bloqueado só por `usedIds` (tem rota própria ou já foi usado). Sinal forte.
   - **Baixa:** apenas geográfico. Nenhum carro da escala registrou GPS na loja; indica a
     placa mais próxima dentro de 5 km como hipótese, marcada como não confirmada.
2. **Tratamento de status por nível (correção principal do design):**
   - **Alta:** o status vira `MUDOU_DE_ROTA` (faixa "conferir", amarelo). A placa exibida
     continua a placa da escala; a observação nomeia a placa provável. Espelha o caminho já
     existente de troca real sem alteração registrada (`viaTroca && !alteracaoInformada`),
     que também usa `MUDOU_DE_ROTA`. No XLSX, a célula da loja mostra "MUDOU DE ROTA - CONFERIR".
   - **Baixa:** o status CONTINUA `NAO_FOI_AO_CLIENTE` (vermelho). Só ganha o aviso de
     hipótese na observação. Conservador: um carro passar perto não rebaixa uma falha real
     para amarelo.
3. **Superfícies:** planilha (coluna observação do PDF, que é o KPI definitivo) e painel
   (dashboard do dia).

## Não objetivos

- Não mudar o comportamento de aplicação do T18 (quando aplica, continua aplicando igual).
- Não alterar `placa_norm` nem `placa_real` de nenhuma linha (a placa exibida continua a da
  escala; o status é o único campo que muda, e só no caso ALTA).
- Não adicionar coluna nova ao XLSX (o modelo oficial da Tia não tem coluna de observação;
  o aviso textual vai na coluna observação que já existe no PDF, e a legenda da célula de
  loja no XLSX reaproveita `legendaSlot`).
- Não deixar nada verde. Sugestão é sempre aviso ou conferência, nunca confirmação de entrega.

## Arquitetura

### 1. Novos campos em `RotaKpi` (`src/lib/types/kpi.ts`)

```ts
/** Placa que PROVAVELMENTE fez a rota, quando o T18 segurou (não aplica troca). */
placa_sugerida?: string | null
/** Confiança da sugestão: 'alta' = carro da rede parado na loja com rota própria;
 *  'baixa' = só geográfico (hipótese, não confirmado). */
sugestao_confianca?: 'alta' | 'baixa' | null
/** HH:MM (BRT mascarado como UTC) em que a placa sugerida esteve no local. */
sugestao_hora?: string | null
```

Todos opcionais. Linhas sem sugestão ficam com os campos `undefined`, nada muda.

### 2. Refatorar o predicado de compatibilidade do T18 (`matcher.ts`)

Hoje o guard (T18-D distância, T18-R rede, T18-X loja, `scorePair ≤ 2`) está embutido no
`.filter()` da busca de candidatas, junto do `if (usedIds.has(p.id)) return false`.

Extrair tudo MENOS o teste de `usedIds` para um closure local `t18Compativel(linha, p,
lojaEscala, lojaEscalaAmbigua, redesFungT18)` que devolve boolean. O closure captura
`lojas`, `paradaRedesT18`, `haversine`, `resolveLojaId`, `matchScore`, `codCasa`,
`scorePair` (todos já em escopo).

A produção passa a ser `todasLojaParadas.filter(p => !usedIds.has(p.id) && t18Compativel(...))`
com comportamento **idêntico** ao atual (mesmo predicado, só fatorado). Esse é o ponto
de não regressão mais importante: o teste do dia 19 e os existentes do T18 têm que
continuar passando byte a byte.

### 3. Passe de sugestão (`matcher.ts`, dentro do loop `for (const linha of semGpsLines)`)

Novo mapa, declarado junto dos outros mapas do T18:

```ts
const placaSugerida = new Map<string, { placa: string; confianca: 'alta' | 'baixa'; chegada: string }>()
```

Substituir `if (!candidatas.length) continue` por: se há candidatas, aplica o T18 como
hoje e `continue`; senão, tenta sugerir:

- **Alta:** `todasLojaParadas.filter(p => usedIds.has(p.id) && p.placa_norm !== linha.placa_norm && t18Compativel(linha, p, lojaEscala, lojaEscalaAmbigua, redesFungT18))`,
  ordenado por `scorePair` e depois chegada. Se houver, grava `{ placa, confianca: 'alta', chegada }`.
- **Baixa:** se não houve alta e `lojaEscala` tem lat/lng, pega as paradas com lat/lng a
  ≤ 5 km da loja (mesmo raio do T18-D), exclui a própria placa, ordena pela menor
  distância e grava `{ placa, confianca: 'baixa', chegada }`.

Nada disso escreve em `matchByEscalaId`, `usedIds`, `plateTrocaLineIds` ou
`placaSubstituta`. Só no mapa novo.

### 4. Preencher a rota (`matcher.ts`, loop de montagem das `rotas`)

Depois de montar cada `rota`, se houver sugestão e a rota NÃO for troca real:

```ts
const sug = placaSugerida.get(linha.id)
if (sug && !rota.placa_real) {
  rota.placa_sugerida = sug.placa
  rota.sugestao_confianca = sug.confianca
  rota.sugestao_hora = hhmm(sug.chegada) // HH:MM via getUTCHours/getUTCMinutes (convenção BRT do arquivo; criar helper local)
}
```

### 5. Composição do texto (`src/lib/kpi/sugestao-troca.ts`, módulo novo compartilhado)

Apresentação num só lugar, usado por observação (PDF) e painel (DRY, sem travessão):

```ts
export function textoSugestaoTroca(placa: string, confianca: 'alta' | 'baixa', hora: string | null): string {
  const h = hora ? ` às ${hora}` : ''
  return confianca === 'alta'
    ? `Possível troca: a placa ${placa} esteve nesta loja${h}, confirmar.`
    : `Verificar: nenhum carro da escala registrou GPS aqui; a placa ${placa} passou perto${h} (não confirmado).`
}
```

### 6. Status do caso ALTA (`src/lib/kpi/status-rota.ts`)

`status-rota.ts` é a fonte de verdade do status que alimenta o PAINEL (via
`dashboard-api-fonte.ts`). Adições:

- Novo campo opcional em `DadosStatusRota`:
  ```ts
  /** Sugestão de troca de alta confiança: placa provável esteve na loja. Reclassifica
   *  status vermelho para MUDOU_DE_ROTA (conferir). */
  sugestaoTrocaAlta?: { placa: string; hora: string | null } | null
  ```
- No wrapper `derivarStatus` (logo após a base), espelhando o padrão de
  `entregouLojaForaEscala`: se `d.sugestaoTrocaAlta` e a base for
  `NAO_FOI_AO_CLIENTE` / `SEM_RASTREADOR` / `NAO_SAIU_DA_BASE`, devolve
  `MUDOU_DE_ROTA` com `revisar: true` e motivo
  `Provável troca: a placa X esteve nesta loja às HH:MM. Confirmar.`
- BAIXA NÃO passa `sugestaoTrocaAlta`, então o status permanece vermelho.

`MUDOU_DE_ROTA` já cai na faixa "conferir" (`TIER_DE_STATUS`), então nenhum mapa de faixa
muda. Reusa vocabulário existente em vez de inventar status novo.

### 7. Legenda da célula no XLSX (`src/lib/kpi/gerador-kpi.ts`)

O XLSX (modelo da Tia) mostra a legenda na célula da loja via `legendaSlot`. Para o caso
ALTA exibir "MUDOU DE ROTA - CONFERIR" coerente com o status:

- `LinhaParaKpi` ganha `sugestao_troca_alta?: boolean`.
- `legendaSlot` ganha um ramo: quando `c.sugestao_troca_alta` e ainda não entregou
  (`chd_loja_1 === null`), devolve `'MUDOU DE ROTA - CONFERIR'` (mesma string que o caminho
  `placa_foi_algum_lugar`), antes dos ramos de "não foi ao cliente".
- `rotaToLinha` seta `sugestao_troca_alta: rota.sugestao_confianca === 'alta'`.

BAIXA não seta o flag, então a célula do XLSX continua "NÃO FOI AO CLIENTE".

### 8. Surface planilha (PDF) — observação via `rotaToLinha` (`gerar-kpi-local.ts:91`)

O PDF (`gerador-pdf.ts`) renderiza a coluna OBS direto de `l.observacao` (não usa
`legendaSlot`; células de loja só mostram horários ou `—`). `rotaToLinha` é a regra ÚNICA
compartilhada pela rota offline e pela produção (`route.ts:859`), então estender o ternário
da observação cobre os dois caminhos de uma vez:

```ts
observacao: rota.placa_real
  ? `Troca de carro: entregue pela placa ${rota.placa_real} (escala: ${rota.placa_norm ?? '—'}).`
  : rota.placa_sugerida
    ? textoSugestaoTroca(rota.placa_sugerida, rota.sugestao_confianca ?? 'baixa', rota.sugestao_hora ?? null)
    : null,
```

Nenhuma mudança no gerador de PDF nem no gerador de XLSX (só em `legendaSlot`, item 7).

### 9. Surface painel — `dashboard-api-fonte.ts` + `parse-kpi-manual.ts` + `dashboard-client.tsx`

- `EntradaManual` ganha `obs_sugestao?: string | null` (opcional; o parser do KPI manual
  deixa `undefined`).
- `gerarDiaApi` passa `sugestaoTrocaAlta` para `derivarStatus` quando
  `rota.sugestao_confianca === 'alta'` (com `placa` e `hora`), para a linha já vir amarela.
- `rotaParaEntrada` amplia o `Pick<RotaKpi, ...>` para incluir os 3 campos de sugestão e
  preenche `obs_sugestao` via `textoSugestaoTroca` quando `placa_sugerida` existe (alta ou
  baixa).
- `dashboard-client.tsx` mostra um marcador amarelo discreto (badge com tooltip) na linha
  quando `obs_sugestao` está preenchido, com o texto da sugestão. Nunca verde. Antes de
  dar por pronto: invocar a skill de taste de UI e VER a tela rodando
  (`scripts/dev/print-painel.mjs`).

## Fluxo de dados

```
escala + paradas
  → cruzaEscalaUnitrac (matcher)
      T18 aplica troca  → placa_real, status entregue (igual hoje)
      T18 segura
        alta            → placa_sugerida + confianca='alta' + hora (NOVO)
        baixa           → placa_sugerida + confianca='baixa' + hora (NOVO)
  → RotaKpi
      → rotaToLinha
          observacao (PDF, offline + produção) → gerarKpiPdf
          sugestao_troca_alta → legendaSlot (XLSX) → "MUDOU DE ROTA - CONFERIR" (só alta)
      → gerarDiaApi
          alta → derivarStatus(sugestaoTrocaAlta) → MUDOU_DE_ROTA (amarelo)
          baixa → status vermelho mantido
        → rotaParaEntrada → obs_sugestao (painel) → dashboard-client (badge amarelo)
```

## Casos de teste (fixtures do dia 17)

| Loja | Placa escala | Esperado |
|------|-------------|----------|
| Copacabana 26 | UBO-5E05 | sugestão ALTA (carro da rede com rota própria) |
| Laranjeiras 32 | UEH-9I93 | sugestão ALTA |
| Bento Ribeiro 15 | LGT-1200 | sugestão BAIXA ou vazia (hipótese geográfica) |
| Caxias 18 | GVH-1397 | sugestão BAIXA ou vazia |

Invariantes que todo teste verifica:

- **ALTA:** `placa_norm` e `placa_real` não mudam (`placa_real` continua `null`);
  `placa_sugerida` é a placa do carro da rede; a observação começa com "Possível troca";
  `derivarStatus` com `sugestaoTrocaAlta` devolve `MUDOU_DE_ROTA` (faixa "conferir") com
  `revisar: true`; `legendaSlot` com `sugestao_troca_alta` devolve "MUDOU DE ROTA - CONFERIR".
- **BAIXA:** `placa_real` continua `null`; status continua `NAO_FOI_AO_CLIENTE` (faixa
  "nao_entregou", vermelho); a observação começa com "Verificar"; `legendaSlot` sem o flag
  continua "NÃO FOI AO CLIENTE".
- Linhas que o T18 aplicou de verdade (troca real) NÃO recebem sugestão.
- Linhas entregues normalmente não recebem sugestão e mantêm status/legenda.

## Garantias de não regressão

- O predicado `t18Compativel` é o guard atual fatorado: a suíte existente do T18
  (`npx vitest run`) tem que passar sem alteração.
- O passe de sugestão só escreve em `placaSugerida`; não toca nos mapas que decidem
  match (`matchByEscalaId`, `usedIds`, `plateTrocaLineIds`, `placaSubstituta`).
- A reclassificação de status só dispara quando `sugestaoTrocaAlta` está presente (caso
  ALTA); linhas sem sugestão e linhas BAIXA não mudam de status.
- O ramo novo de `legendaSlot` só dispara com `sugestao_troca_alta` true; as legendas
  existentes (testes `gerador-kpi-legenda.test.ts`) continuam idênticas.
- Gerador de PDF e gerador de XLSX não mudam de assinatura nem de colunas.

## Arquivos tocados

- `src/lib/types/kpi.ts` (3 campos novos em `RotaKpi`)
- `src/lib/kpi/matcher.ts` (refator `t18Compativel`, passe de sugestão, preenchimento)
- `src/lib/kpi/sugestao-troca.ts` (novo, composição de texto + teste)
- `src/lib/kpi/status-rota.ts` (`sugestaoTrocaAlta` + reclassificação ALTA → MUDOU_DE_ROTA)
- `src/lib/kpi/gerador-kpi.ts` (`legendaSlot` ramo ALTA + `sugestao_troca_alta` em `LinhaParaKpi`)
- `src/lib/kpi/gerar-kpi-local.ts` (`rotaToLinha`: observação + flag `sugestao_troca_alta`)
- `src/lib/kpi/parse-kpi-manual.ts` (`obs_sugestao` opcional em `EntradaManual`)
- `src/lib/kpi/dashboard-api-fonte.ts` (`gerarDiaApi` passa `sugestaoTrocaAlta`; `rotaParaEntrada` preenche `obs_sugestao`)
- `src/app/painel/dashboard/dashboard-client.tsx` (badge amarelo de aviso)
- testes: `sugestao-troca.test.ts`, fixture do dia 17 no matcher, casos novos em `status-rota` e `gerador-kpi-legenda`
