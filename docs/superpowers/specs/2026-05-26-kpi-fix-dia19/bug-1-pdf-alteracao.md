# Bug 1 — Alteração PDF propagada pra lojas erradas

## Causa raiz hipotética

Parser `parseAlteracaoPdfTabular` (`src/lib/parsers/alteracao-pdf-tabular.ts`) reconstrói tabela do PDF via coordenadas. Quando o PDF tem layout multi-página ou coluna `REDES/FILIAIS` espalhada, o parser produz `loja_nome_raw` GENÉRICO (ex: só "Assaí" sem o nome da loja específica). Aí no `aplicarAlteracoes`, qualquer linha com `rede_id=ASSAI` casa via fallback de tokens, espalhando a alteração em N lojas.

**Confirmar com:** skill `pdf` (anthropics) — extrair `ALTERACAO DE ESCALA GERAL 19.05 (3).pdf` com pdfplumber e ver as células reais que o parser tabular deveria pegar.

## Evidência (dia 19)

Alteração no PDF: `Assaí - São Gonçalo Camil - Loja 211 → MESSIAS / 141 / AMW-3424`.

**Sys aplicou AMW-3424 em 4 lojas:**

| Loja | Manual placa | Gerado placa |
|------|--------------|---------------|
| Alcântara II (293) | FQN6J72 | **AMW-3424** ❌ |
| Bangu II (332) | LMF-2049 | **AMW-3424** ❌ |
| Méier (160) | AKZ-2745 | **AMW-3424** ❌ |
| São Gonçalo Camil (211) | AMW-3424 | AMW-3424 ✅ |

## Solução proposta

**Hipótese A (parser PDF retorna `loja_nome_raw` genérico):**
- Corrigir `parseAlteracaoPdfTabular` pra exigir `loja_nome_raw` com pelo menos 1 token forte (nome da loja específica, não só rede).
- Se PDF retorna só "Assaí", marcar `confianca: 'baixa'` e exigir review manual.

**Hipótese B (parser certo, `aplicarAlteracoes` espalha):**
- Já aplicamos fix em `a810930` (tokens fortes). Pode não ter sido suficiente — investigar com `diagnose`.

**Decisão pós-investigação:** Hipótese A se PDF parser estiver bugado, Hipótese B caso contrário.

## Arquivos a tocar

- `src/lib/parsers/alteracao-pdf-tabular.ts` (linha 244+, `tipo: 'INCLUSAO'` build)
- `src/lib/kpi/aplicar-alteracoes.ts` (linhas 56-83, match fallback)

## Critério de aceite (estrito — bug estrutural)

- [ ] Dia 19 ASSAI: AMW-3424 aparece SÓ em "São Gonçalo Camil - Loja 211"
- [ ] Alcântara II volta a ter FQN6J72 (LUIZ CARLOS)
- [ ] Bangu II volta a ter LMF-2049 NÃO_FOI
- [ ] Méier volta a ter AKZ-2745 (LUIZ JR.)

## Teste vitest

`src/lib/parsers/alteracao-pdf-tabular.test.ts` — adicionar caso:
```ts
it('PDF dia 19 — alteração Loja 211 não espalha pra outras Assai', async () => {
  const pdf = readFileSync('tests/fixtures/ALTERACAO DE ESCALA GERAL 19.05 (3).pdf')
  const alts = await parseAlteracaoPdfTabular(pdf)
  const messias = alts.find(a => a.entra?.placa_norm === 'AMW3424')
  expect(messias).toBeDefined()
  expect(messias!.loja_nome_raw).toMatch(/S.o Gon.alo Camil/i)
  expect(messias!.loja_nome_raw).toMatch(/211/)
})
```

## Rollback

`git revert` do commit do fix. Comportamento volta pra propagação.

## Status

🔍 Aguardando investigação (etapa C.1.4-5)
