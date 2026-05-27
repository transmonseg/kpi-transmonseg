# U4 — Promise.allSettled isolamento por rede (MÉDIO)

## Causa raiz

`src/app/api/kpi/simples/route.ts:449`:
```typescript
results = await Promise.all(redesIds.map(async (redeId) => {
  // gerarKpi() ou gerarKpiPdf() por rede
}))
```

Se 1 rede falhar (bug isolado em `gerarKpi`), `Promise.all` rejeita toda a chain. Catch externo retorna HTTP 500. **Todas as 5 redes que já tinham sido geradas em paralelo são descartadas** — cliente perde tudo.

## Evidência operacional

Operador gera 6 redes simultaneamente. 1 falha por bug pontual (ex: PDF Unitrac mal parseado). Os outros 5 KPIs estavam prontos mas o response retorna erro genérico — operador refaz tudo do zero.

## Solução

Substituir `Promise.all` por `Promise.allSettled`. Para cada rede:
- `status: 'fulfilled'` → adiciona ao output
- `status: 'rejected'` → adiciona como `{ rede_id, erro_mensagem }` no array

Frontend exibe redes OK normalmente e marca as com erro visualmente.

## Arquivos a tocar

- `src/app/api/kpi/simples/route.ts:449` — trocar `Promise.all` por `Promise.allSettled` + adaptar consumo
- Possivelmente `src/types/kpi.ts` — adicionar tipo `{ rede_id, erro_mensagem }` no shape do output
- Frontend (`painel/kpi/simples/page.tsx`) — exibir aviso por rede com erro

## Critério de aceite

- [ ] Quando 1 rede falha, outras 5 continuam no output
- [ ] Output inclui `redes_com_erro: [{ rede_id, erro_mensagem }]`
- [ ] Frontend mostra badge de erro por rede sem perder as OK
- [ ] Suite 305+/305+ (1 teste novo)

## Teste vitest novo

```typescript
describe('U4 — Promise.allSettled isolamento por rede', () => {
  it('uma rede falhar nao derruba as outras', async () => {
    // Mock: gerarKpi sucede pra A/B/C/D/E, falha pra F
    // ... expect(results.length).toBe(5) (5 sucessos)
    // ... expect(redes_com_erro).toHaveLength(1) (F)
  })
})
```

## Rollback

`git revert`. Comportamento volta a derrubar tudo no primeiro erro.
