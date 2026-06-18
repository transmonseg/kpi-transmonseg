# Modo sugestão de troca (indicar placa provável sem aplicar)

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
placa provavelmente fez a rota, sem alterar status nem placa. Um terceiro estado entre
"segurar calado" e "aplicar a troca".

## Não objetivos

- Não mudar o comportamento de aplicação do T18 (quando aplica, continua aplicando igual).
- Não alterar `status`, `placa_norm` nem `placa_real` de nenhuma linha.
- Não adicionar coluna nova ao XLSX (o modelo oficial da Tia não tem observação; o aviso
  vai na coluna observação que já existe no PDF).
- Não deixar nada verde. Sugestão é sempre aviso, nunca confirmação de entrega.

## Decisões (aprovadas)

1. **Níveis:** alta e baixa confiança.
   - **Alta:** carro da mesma rede (ou rede fungível) que passaria em todos os guards do
     T18, mas foi bloqueado só por `usedIds` (tem rota própria ou já foi usado). Sinal forte.
   - **Baixa:** apenas geográfico. Nenhum carro da escala registrou GPS na loja; indica a
     placa mais próxima dentro de 5 km como hipótese, marcada como não confirmada.
2. **Superfícies:** planilha (coluna observação do PDF, que é o KPI definitivo) e painel
   (dashboard do dia).

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

Presentação num só lugar, usado por PDF e painel (DRY, sem travessão):

```ts
export function textoSugestaoTroca(placa: string, confianca: 'alta' | 'baixa', hora: string | null): string {
  const h = hora ? ` às ${hora}` : ''
  return confianca === 'alta'
    ? `Possível troca: a placa ${placa} esteve nesta loja${h}, confirmar.`
    : `Verificar: nenhum carro da escala registrou GPS aqui; a placa ${placa} passou perto${h} (não confirmado).`
}
```

### 6. Surface planilha (PDF) — `gerar-kpi-local.ts:91`

Estender o ternário da observação em `rotaToLinha`:

```ts
observacao: rota.placa_real
  ? `Troca de carro: entregue pela placa ${rota.placa_real} (escala: ${rota.placa_norm ?? '—'}).`
  : rota.placa_sugerida
    ? textoSugestaoTroca(rota.placa_sugerida, rota.sugestao_confianca ?? 'baixa', rota.sugestao_hora ?? null)
    : null,
```

O PDF (`gerador-pdf.ts:89`) já renderiza `l.observacao`. Nenhuma mudança no gerador de PDF
nem no XLSX.

### 7. Surface painel — `dashboard-api-fonte.ts` + `parse-kpi-manual.ts` + `dashboard-client.tsx`

- `EntradaManual` ganha `obs_sugestao?: string | null` (opcional; o parser do KPI manual
  deixa `undefined`).
- `rotaParaEntrada` amplia o `Pick<RotaKpi, ...>` para incluir os 3 campos de sugestão e
  preenche `obs_sugestao` via `textoSugestaoTroca` quando `placa_sugerida` existe.
- `dashboard-client.tsx` mostra um marcador amarelo discreto (badge com tooltip) na linha
  quando `obs_sugestao` está preenchido, com o texto da sugestão. Nunca verde. Antes de
  dar por pronto: invocar a skill de taste de UI e VER a tela rodando
  (`scripts/dev/print-painel.mjs`).

## Fluxo de dados

```
escala + paradas
  → cruzaEscalaUnitrac (matcher)
      T18 aplica troca  → placa_real, status entregue (igual hoje)
      T18 segura        → placa_sugerida + sugestao_confianca + sugestao_hora (NOVO)
  → RotaKpi
      → rotaToLinha → observacao (PDF) → gerarKpiPdf
      → rotaParaEntrada → obs_sugestao (painel) → dashboard-client
```

## Casos de teste (fixtures do dia 17)

| Loja | Placa escala | Esperado |
|------|-------------|----------|
| Copacabana 26 | UBO-5E05 | sugestão ALTA (carro da rede com rota própria) |
| Laranjeiras 32 | UEH-9I93 | sugestão ALTA |
| Bento Ribeiro 15 | LGT-1200 | sugestão BAIXA ou vazia (hipótese geográfica) |
| Caxias 18 | GVH-1397 | sugestão BAIXA ou vazia |

Invariantes que todo teste verifica:

- `status` da linha não muda (continua "não foi ao cliente").
- `placa_norm` e `placa_real` não mudam (`placa_real` continua `null`).
- Quando há sugestão alta, `placa_sugerida` é a placa do carro da rede e a observação
  começa com "Possível troca".
- Linhas que o T18 aplicou de verdade (troca real) NÃO recebem sugestão.

## Garantias de não regressão

- O predicado `t18Compativel` é o guard atual fatorado: a suíte existente do T18
  (`npx vitest run`) tem que passar sem alteração.
- O passe de sugestão só escreve em `placaSugerida`; não toca nos mapas que decidem
  match/status.
- XLSX e gerador de PDF não mudam de assinatura nem de colunas.

## Arquivos tocados

- `src/lib/types/kpi.ts` (3 campos novos em `RotaKpi`)
- `src/lib/kpi/matcher.ts` (refator `t18Compativel`, passe de sugestão, preenchimento)
- `src/lib/kpi/sugestao-troca.ts` (novo, composição de texto + teste)
- `src/lib/kpi/gerar-kpi-local.ts` (observação do PDF)
- `src/lib/kpi/parse-kpi-manual.ts` (`obs_sugestao` opcional em `EntradaManual`)
- `src/lib/kpi/dashboard-api-fonte.ts` (`rotaParaEntrada` preenche `obs_sugestao`)
- `src/app/painel/dashboard/dashboard-client.tsx` (badge amarelo de aviso)
- testes: `sugestao-troca.test.ts`, fixture do dia 17 no matcher
