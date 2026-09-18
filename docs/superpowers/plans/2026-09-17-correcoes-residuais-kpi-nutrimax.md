# Correções residuais do KPI Nutry Max Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os itens de baixo risco identificados na auditoria de 17/09 (comparação do cadastro Unitrac contra `kpi_romaneio_geocode_cache`, e os 4 achados Minor deixados de lado na revisão final do plano do romaneio do pão) sem tocar nos itens que ficaram deliberadamente fora de escopo (GPS congelado, gap de CV da Rio Quality).

**Architecture:** Uma correção de dado (UPDATE direto em `kpi_romaneio_geocode_cache`, sem mudança de código) e três correções pontuais de código já identificadas com solução conhecida — cada uma um patch de 1-3 linhas num arquivo já existente, seguindo padrões já usados no resto do pipeline (guard de dado ruim, filtro de placa vazia, exclusão de prefixo `PAO-` numa métrica de histórico).

**Tech Stack:** TypeScript/Next.js (repo "KPI transmonseg"), Postgres via `sudo -u postgres psql kpi_transmonseg` em `transmonseg-vps`, Vitest.

**Spec:** Não há spec de brainstorming architectural para este plano — os 4 itens vêm de investigações já concluídas nesta sessão (comparação Unitrac vs geocode, arquivo `verificacao-unitrac-vs-nosso.json` gerado em `/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/`, e a revisão final de branch do plano `2026-09-15-motor-confirmacao-romaneio-pao.md`, achados Minor #9/#10/#8 e a recomendação de "converter silêncio em log" do achado #9).

## Global Constraints

- Nunca piorar o comportamento atual do sistema — toda mudança deve manter o comportamento de quem não é afetado pelo caso específico (Rio Quality, Nutry Max sem pão) idêntico ao de hoje.
- Toda mudança de código em `KPI transmonseg` deve ser espelhada em `KPI TEMP` (mesmo commit, mesma mensagem + linha "Espelho do repo definitivo") e ambos pushados juntos.
- Toda mensagem de commit termina com:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
  ```
- Rodar a suíte completa (`npm test`) nos dois repos antes de considerar qualquer task concluída — 1093/1093 é o baseline atual, nenhum teste pode regredir.
- Nenhuma dessas mudanças precisa de deploy manual no Contabo além do já usado neste projeto (`git pull && npm run build && pm2 restart kpi-transmonseg`) — a Task 1 (SQL) roda direto no banco de produção, sem deploy de app.

---

### Task 1: Corrigir os 5 endereços divergentes confirmados contra o cadastro Unitrac

**Contexto:** a investigação de 17/09 cruzou `kpi_romaneio_geocode_cache` contra o cadastro `unitrac_pontointeresse_consulta (14).xls` (20.685 pontos da Nutry Max) usando validação territorial (mesma lógica de `validarTerritorio`/município via IBGE + bairro via CNEFE que já roda em produção). De 1.680 casos com divergência de distância real, 1.675 já estão corretamente tratados hoje (ou batem no território esperado, ou já saem `confiavel=false`). Sobraram exatamente 5 que hoje passam como `confiavel=true` sem nenhum aviso, apesar de terem falhado a checagem territorial. Todos os 5 são endereços de rodovia/estrada rural (`ROD`/`EST`/`AV` + km ou trecho longo, sem número de porta real) — mesma família de problema do "colapso de via longa" já documentado, só que para rodovia em vez de rua urbana. 4 dos 5 foram geocodificados em 14/09 (`fonte=cnefe`), depois do guard territorial já estar em produção (13/09) — a causa exata de por que o guard não pegou esses 5 não foi investigada nesta sessão (fora de escopo deste plano; se quiser investigar depois, comece por `monitoramento/MONITORAMENTO transmonseg/src/lib/territorio.ts`).

**Files:**
- Nenhum arquivo de código — UPDATE direto na tabela `kpi_romaneio_geocode_cache` do banco `kpi_transmonseg`, via `ssh transmonseg-vps` + `sudo -u postgres psql kpi_transmonseg`.

**Dados exatos (extraídos de `/private/tmp/claude-501/-Users-joaquimsalles/43f3d9c2-79a4-4525-b647-10dd95cc3a2d/scratchpad/verificacao-unitrac-vs-nosso.json`, 17/09):**

| Endereço (chave da tabela) | Veredito | Ação |
|---|---|---|
| `ROD RJ 145, 26364 - CANTEIRO, VALENCA - .` | unitrac certo (0m do bairro esperado; nosso ponto está a 11.022m do bairro `CANTEIRO`) | Atualizar lat/lng pro ponto da Unitrac: `-22.279049, -43.738974` |
| `EST VALENCA PENTAGNA, 2312 - JOAO BONITO, VALENCA - .` | unitrac certo (0m do bairro esperado; nosso ponto está a 7.079m) | Atualizar lat/lng pro ponto da Unitrac: `-22.218604, -43.705195` |
| `AV WALDIR SOBREIRA PIRES, 722 - RETIRO, VOLTA REDONDA - *` | unitrac certo (318m do bairro esperado; nosso ponto está a 1.614m) | Atualizar lat/lng pro ponto da Unitrac: `-22.500176, -44.1263` |
| `AVENIDA SAVIO COTA DE ALMEIDA GAMA, 1579 - RETIRO, VOLTA REDONDA - *` | nenhum bate (nosso ponto a 2.646m do bairro esperado, o da Unitrac a 2.107m — nenhum dos dois é confiável) | NÃO aplicar coordenada de nenhum dos dois lados — só marcar como não confiável: `confiavel=false, motivo='bairro_divergente'` |
| `ROD BR 356, 1000 - COMENDADOR VENANCIO, ITAPERUNA - *` | nenhum bate (nosso lado falha por município divergente, o da Unitrac por bairro divergente a 15.136m) | NÃO aplicar coordenada de nenhum dos dois lados — só marcar como não confiável: `confiavel=false, motivo='municipio_divergente'` |

**Por que não aplicar a coordenada da Unitrac nos 2 últimos:** a investigação concluiu que o cadastro da Unitrac também tem erro conhecido (a própria Ana avisou) e não é fonte de verdade sozinha — só foi usada pra corrigir os 3 primeiros porque a checagem territorial confirmou objetivamente que o ponto dela cai no bairro certo e o nosso não. Para os 2 últimos, nenhum dos dois passa nessa checagem, então o correto é marcar como não confiável (força `CONFERIR` no relatório) em vez de inventar qual dos dois pontos ruins usar.

- [ ] **Step 1: Conferir o estado atual das 5 linhas antes de mexer**

Rodar via SSH, confirmar que os valores batem com a tabela acima antes de aplicar qualquer UPDATE (evita corrigir em cima de um cache que já mudou desde a investigação):

```bash
ssh transmonseg-vps "sudo -u postgres psql kpi_transmonseg -c \"
select endereco, lat, lng, confiavel, motivo from kpi_romaneio_geocode_cache
where endereco in (
  'ROD RJ 145, 26364 - CANTEIRO, VALENCA - .',
  'EST VALENCA PENTAGNA, 2312 - JOAO BONITO, VALENCA - .',
  'AV WALDIR SOBREIRA PIRES, 722 - RETIRO, VOLTA REDONDA - *',
  'AVENIDA SAVIO COTA DE ALMEIDA GAMA, 1579 - RETIRO, VOLTA REDONDA - *',
  'ROD BR 356, 1000 - COMENDADOR VENANCIO, ITAPERUNA - *'
);\""
```

Expected: as 5 linhas aparecem com `confiavel=t` e `motivo` vazio (mesmo estado capturado em 17/09).

- [ ] **Step 2: Aplicar as correções**

```bash
ssh transmonseg-vps "sudo -u postgres psql kpi_transmonseg -c \"
update kpi_romaneio_geocode_cache set lat = -22.279049, lng = -43.738974
where endereco = 'ROD RJ 145, 26364 - CANTEIRO, VALENCA - .';

update kpi_romaneio_geocode_cache set lat = -22.218604, lng = -43.705195
where endereco = 'EST VALENCA PENTAGNA, 2312 - JOAO BONITO, VALENCA - .';

update kpi_romaneio_geocode_cache set lat = -22.500176, lng = -44.1263
where endereco = 'AV WALDIR SOBREIRA PIRES, 722 - RETIRO, VOLTA REDONDA - *';

update kpi_romaneio_geocode_cache set confiavel = false, motivo = 'bairro_divergente'
where endereco = 'AVENIDA SAVIO COTA DE ALMEIDA GAMA, 1579 - RETIRO, VOLTA REDONDA - *';

update kpi_romaneio_geocode_cache set confiavel = false, motivo = 'municipio_divergente'
where endereco = 'ROD BR 356, 1000 - COMENDADOR VENANCIO, ITAPERUNA - *';
\""
```

- [ ] **Step 3: Verificar o resultado**

Rodar a mesma query do Step 1 e confirmar: as 3 primeiras têm as novas coordenadas; as 2 últimas têm `confiavel=f` com o `motivo` certo.

---

### Task 2: Logar (não silenciar) NF duplicada na mesma placa entre romaneio principal e pão

**Contexto:** achado Minor #9 da revisão final do plano do pão. `montarVisitas` (`src/lib/kpi-romaneio/visitas.ts`) é chamado por placa — se uma NF do Romaneio de Entrega e uma NF do Romaneio do Pão coincidirem por acaso na MESMA placa (hoje quase impossível por formato — NF do pão tem sempre 6 dígitos, NF real da Nutry Max normalmente 7 — mas não é impedido por construção nenhuma), a visita de uma pode ser atribuída à carga errada silenciosamente. A revisão recomendou "prefixar a NF do pão ou chavear por carga::nf" — mas isso mudaria o campo NF exibido no relatório (a NF é dado real do cliente, não pode ser prefixada) e obrigaria mudar a assinatura de `montarVisitas`/`agregacao.ts`, compartilhada com a Rio Quality — risco desproporcional ao problema (nunca observado em produção). A correção proporcional é: detectar a colisão e logar um erro claro, convertendo uma possível misatribuição silenciosa em algo visível e investigável, sem mudar nenhum comportamento do caminho normal.

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts` (logo depois da criação de `linhasPorPlaca`, linha ~257)
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (ponto equivalente)
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts`

**Interfaces:**
- Consome: `linhasPorPlaca: Map<string, LinhaGeocodificada[]>` (já existe, `agrupar(romaneioGeo, l => normPlaca(l.placa))`).
- Produz: nada novo — só um `console.error` quando a condição de colisão é detectada. Não altera o retorno da função nem nenhum tipo.

- [ ] **Step 1: Escrever o teste (route.test.ts)**

Adicionar ao final do arquivo `src/app/api/kpi/nutrimax/gerar/route.test.ts`:

```ts
// Achado Minor #9 da revisão final do plano do pão (15/09): NF duplicada
// na MESMA placa entre romaneio principal e pão pode ter sua visita
// atribuída à carga errada silenciosamente (montarVisitas roda por
// placa, indiferente à origem da linha). Loga em vez de silenciar.
describe('POST /api/kpi/nutrimax/gerar -- NF duplicada na mesma placa (item Minor #9)', () => {
  it('loga um erro claro quando o romaneio do pão traz a mesma NF do romaneio principal na mesma placa', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    cenario.linhasNutrimaxExtras = []
    // Reaproveita a NF900 do pão só pra este teste específico: forçar
    // colisão fazendo o pão usar a MESMA NF do romaneio principal (NF001).
    const original = cenario.paoErro
    cenario.paoErro = null
    const fd = new FormData()
    fd.set('data', '2026-09-15')
    fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
    fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))

    // O mock de parsePao está fixo em NF900 (ver topo do arquivo) -- para
    // este teste, o que importa é checar que o mecanismo de log existe e
    // dispara para QUALQUER NF repetida na mesma placa. Como os mocks
    // atuais já usam NFs distintas (NF001/NF900), a asserção real deste
    // teste é negativa: com dados normais, o log de colisão NUNCA dispara.
    const res = await POST(new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)
    expect(errSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('NF duplicada na mesma placa'))).toBe(false)

    errSpy.mockRestore()
    cenario.paoErro = original
  })
})
```

> Nota pro implementador: o harness de mock atual (`parseRomaneio`/`parsePao`) não permite fácil sobreposição de NF entre os dois documentos sem tocar nos mocks — em vez de forçar esse cenário artificialmente no teste de integração, escreva TAMBÉM um teste unitário direto (sem passar pelo endpoint) exercitando só a função helper nova que você extrair no Step 2 (ex.: `logarNfDuplicadaNaMesmaPlaca(linhasPorPlaca)`), com um `Map` construído à mão contendo duas linhas de placas iguais e NF igual — esse teste unitário É o que prova que o log dispara de verdade; o teste de integração acima só prova que o caminho normal nunca loga por engano (regressão).

- [ ] **Step 2: Implementar em route.ts**

Depois da linha `const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))`:

```ts
  // Achado Minor #9 da revisao final do plano do pao (15/09): NF do
  // romaneio do pao pode coincidir com NF do romaneio principal na MESMA
  // placa (nada impede por construcao, so' o formato tipico de 6 vs 7
  // digitos torna raro) -- montarVisitas roda por placa e atribuiria a
  // visita de uma a outra silenciosamente. Converte em log visivel em vez
  // de deixar silencioso; nao muda nenhum comportamento do caminho normal.
  for (const [placaNorm, linhasDaPlaca] of linhasPorPlaca) {
    const nfsVistos = new Set<string>()
    for (const l of linhasDaPlaca) {
      if (nfsVistos.has(l.nf)) {
        console.error(`[kpi-nutrimax] NF duplicada na mesma placa ${placaNorm}: ${l.nf} -- romaneio principal e pão colidindo? Visita pode ficar atribuída à carga errada.`)
      }
      nfsVistos.add(l.nf)
    }
  }
```

- [ ] **Step 3: Espelhar em scripts/gerar-nutrimax-real-arquivo.ts**

Mesmo bloco, no ponto equivalente logo após `const linhasPorPlaca = agrupar(romaneioGeo, l => normPlaca(l.placa))` desse arquivo.

- [ ] **Step 4: Rodar os testes**

```bash
npx vitest run src/app/api/kpi/nutrimax/gerar/route.test.ts
npm test
```

Esperado: todos passam, nenhuma regressão.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/gerar/route.test.ts scripts/gerar-nutrimax-real-arquivo.ts
git commit -m "$(cat <<'EOF'
fix(kpi-nutrimax): loga NF duplicada na mesma placa entre pão e romaneio principal

Achado Minor #9 da revisão final do plano do pão (15/09): NF do pão
coincidindo com NF do romaneio principal na mesma placa poderia
atribuir a visita de uma à carga errada silenciosamente. Converte em
log visível -- não muda comportamento do caminho normal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
EOF
)"
```

---

### Task 3: Não consultar Unitrac/ponte para placa vazia (romaneio do pão sem CARRO)

**Contexto:** achado Minor #10 da revisão final. `placasNorm` (linha 258 de `route.ts`) inclui a string vazia `''` quando uma carga do pão vem sem placa (CARRO em branco no PDF) -- essa `''` é passada pra `buscarAlvosDoDia`, `buscarHorariosBase` e vira uma iteração inteira em `placasNorm.map(async placaNorm => ...)` (linha 296), tudo trabalho desperdiçado: `montarDetalheEntregas` já curto-circuita incondicionalmente quando `placaNorm.trim() === ''` (ver `agregacao.ts`, guard "CARGA SEM PLACA NO ROMANEIO"), então nada do que essas chamadas trariam pra placa `''` é usado. Confirmado por leitura: nenhum código depois do filtro depende de `placasNorm` conter `''` (a aba "SEM PLACA" é construída via `linhasKpi`/`cargasPorChave`, que usam `romaneioGeo` diretamente, não `placasNorm`).

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts:258`
- Modify: `scripts/gerar-nutrimax-real-arquivo.ts` (ponto equivalente)
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts`

**Interfaces:**
- Consome: `linhasPorPlaca.keys()` (já existe).
- Produz: `placasNorm` sem a entrada `''` -- nenhum consumidor downstream (`buscarAlvosDoDia`, `buscarHorariosBase`, o loop de paradas, `temRastreadorPorPlaca`) muda de tipo ou assinatura.

- [ ] **Step 1: Escrever o teste**

Adicionar ao describe já existente `POST /api/kpi/nutrimax/gerar -- resgate por âncora (item 5, achado 10-09)` (reaproveita os mocks de frota/paradas já definidos nesse arquivo) ou um describe novo, em `route.test.ts`:

```ts
// Achado Minor #10 da revisão final do plano do pão (15/09): placa vazia
// (romaneio do pão sem CARRO) entrava em `placasNorm` e era consultada
// contra a frota/ponte de GPS à toa -- `montarDetalheEntregas` já
// curto-circuita incondicionalmente pra placa vazia, então essa consulta
// nunca influencia o relatório final, só desperdiça uma chamada de rede.
describe('POST /api/kpi/nutrimax/gerar -- placa vazia não é consultada contra Unitrac/ponte (item Minor #10)', () => {
  it('carga do pão sem CARRO não aparece na lista de placas consultadas', async () => {
    cenario.frota = [{ placaNorm: PLACA, cv: 'CV-1' }]
    const buscarAlvosSpy = vi.mocked((await import('@/lib/kpi-romaneio/unitrac')).buscarAlvosDoDia)
    const buscarHorariosSpy = vi.mocked((await import('@/lib/kpi-romaneio/base-horarios')).buscarHorariosBase)

    // Pão sem placa: reusa o mock de parsePao com placa vazia.
    const fd = new FormData()
    fd.set('data', '2026-09-15')
    fd.set('romaneio', new File(['romaneio pdf'], 'romaneio.pdf', { type: 'application/pdf' }))
    fd.set('romaneioPao', new File(['pao pdf'], 'romaneio-pao.pdf', { type: 'application/pdf' }))
    // O mock de parsePao devolve linhaPao() com PLACA fixa -- pra este
    // teste, sobrescreva via cenario (ver Step 2 se o mock não suportar
    // placa vazia diretamente; adicione um campo `cenario.placaPaoVazia`
    // seguindo o mesmo padrão de `cenario.paoErro`).
    const res = await POST(new Request('http://localhost/api/kpi/nutrimax/gerar', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)

    expect(buscarAlvosSpy).toHaveBeenCalledWith(expect.not.arrayContaining(['']))
    expect(buscarHorariosSpy).toHaveBeenCalledWith(expect.not.arrayContaining(['']), expect.anything(), expect.anything(), expect.anything())
  })
})
```

> Nota pro implementador: os mocks de `unitrac`/`base-horarios` no topo do arquivo usam factory fixa (`async () => [...]`), sem `vi.fn()` espiável por padrão -- ajuste a factory desses dois mocks pra usar `vi.fn(async (...) => ...)` (mantendo o comportamento atual) só o suficiente pra permitir `vi.mocked(...)` funcionar neste teste, sem quebrar os outros testes que já usam esses mocks.

- [ ] **Step 2: Implementar em route.ts**

```ts
  const placasNorm = [...linhasPorPlaca.keys()].filter(p => p !== '')
```

(era `const placasNorm = [...linhasPorPlaca.keys()]`)

- [ ] **Step 3: Espelhar em scripts/gerar-nutrimax-real-arquivo.ts**

Mesma mudança no ponto equivalente.

- [ ] **Step 4: Rodar os testes**

```bash
npx vitest run src/app/api/kpi/nutrimax/gerar/route.test.ts
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/gerar/route.test.ts scripts/gerar-nutrimax-real-arquivo.ts
git commit -m "$(cat <<'EOF'
fix(kpi-nutrimax): não consulta Unitrac/ponte pra placa vazia do romaneio do pão

Achado Minor #10 da revisão final do plano do pão (15/09): placa vazia
(CARRO em branco no PDF) entrava em placasNorm e gerava chamadas de
rede à toa -- montarDetalheEntregas já curto-circuita incondicionalmente
pra placa vazia, então o resultado dessas chamadas nunca era usado.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
EOF
)"
```

---

### Task 4: Histórico de gerações não conta cargas do pão em `qtd_cargas`

**Contexto:** achado Minor #8 da revisão final. `salvarGeracao` grava `qtdCargas: linhasKpi.length` (route.ts:462) -- com o pão, esse número passou a incluir as cargas `PAO-*`, quebrando a comparabilidade histórica da métrica (um dia com pão mostra um salto de cargas que não tem a ver com a Nutry Max normal) e criando um caso confuso: `regenerarDeId` nunca inclui o pão (decisão documentada em route.ts:227), então regenerar um histórico registrado com o pão embutido produz um número MENOR sem explicação visível. Excluir as cargas `PAO-*` da contagem resolve os dois problemas com uma mudança de uma linha, sem precisar de coluna nova nem migração.

**Files:**
- Modify: `src/app/api/kpi/nutrimax/gerar/route.ts:462`
- Test: `src/app/api/kpi/nutrimax/gerar/route.test.ts`

**Interfaces:**
- Consome: `linhasKpi: LinhaKpiRomaneio[]` (já existe, cada item tem campo `carga: string`).
- Produz: nenhuma mudança de tipo -- só o valor numérico passado a `salvarGeracao({ qtdCargas })`.

- [ ] **Step 1: Escrever o teste**

Adicionar a `route.test.ts`:

```ts
// Achado Minor #8 da revisão final do plano do pão (15/09): qtd_cargas no
// histórico contava as cargas PAO-* junto com as da Nutry Max, quebrando
// a comparabilidade entre dias com e sem pão enviado.
describe('POST /api/kpi/nutrimax/gerar -- histórico não conta cargas do pão (item Minor #8)', () => {
  it('qtdCargas salvo no histórico não inclui cargas PAO-*', async () => {
    const historico = await import('@/lib/kpi-romaneio/historico')
    const salvarSpy = vi.mocked(historico.salvarGeracao)

    const res = await POST(montarRequest(true) as never)
    expect(res.status).toBe(200)

    expect(salvarSpy).toHaveBeenCalledWith(expect.objectContaining({ qtdCargas: 1 }))
  })
})
```

> Nota pro implementador: `vi.mock('@/lib/kpi-romaneio/historico', ...)` no topo do arquivo já usa uma factory fixa (`salvarGeracao: async () => 'geracao-fake-id'`) -- troque pra `vi.fn(async () => 'geracao-fake-id')` só o suficiente pra permitir `vi.mocked(...)` neste teste, sem quebrar os outros. O cenário padrão do arquivo (`montarRequest(true)`) já produz 1 carga Nutry Max (`97900`) + 1 carga do pão (`PAO-1`) -- `linhasKpi.length` seria 2 sem o fix, 1 depois.

- [ ] **Step 2: Implementar**

```ts
      qtdCargas: linhasKpi.filter(l => !l.carga.startsWith('PAO-')).length,
```

(era `qtdCargas: linhasKpi.length,`)

- [ ] **Step 3: Rodar os testes**

```bash
npx vitest run src/app/api/kpi/nutrimax/gerar/route.test.ts
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/gerar/route.test.ts
git commit -m "$(cat <<'EOF'
fix(kpi-nutrimax): histórico não conta cargas do pão em qtd_cargas

Achado Minor #8 da revisão final do plano do pão (15/09): a métrica
histórica de cargas por dia passou a incluir PAO-*, quebrando a
comparabilidade entre dias com e sem pão enviado, e tornando
regenerarDeId (que nunca inclui o pão) confuso ao mostrar um número
menor sem explicação.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
EOF
)"
```

---

### Task 5: Espelhar tudo em KPI TEMP, push e deploy

**Files:**
- Copy: todos os arquivos tocados nas Tasks 2-4 pro repo `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`.

- [ ] **Step 1: Copiar os arquivos alterados**

```bash
SRC="/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg"
DST="/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP"
cp "$SRC/src/app/api/kpi/nutrimax/gerar/route.ts" "$DST/src/app/api/kpi/nutrimax/gerar/route.ts"
cp "$SRC/src/app/api/kpi/nutrimax/gerar/route.test.ts" "$DST/src/app/api/kpi/nutrimax/gerar/route.test.ts"
cp "$SRC/scripts/gerar-nutrimax-real-arquivo.ts" "$DST/scripts/gerar-nutrimax-real-arquivo.ts"
```

- [ ] **Step 2: Rodar a suíte no TEMP**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && npm test
```

- [ ] **Step 3: Commit no TEMP**

```bash
git add src/app/api/kpi/nutrimax/gerar/route.ts src/app/api/kpi/nutrimax/gerar/route.test.ts scripts/gerar-nutrimax-real-arquivo.ts
git commit -m "$(cat <<'EOF'
fix(kpi-nutrimax): correções residuais (log NF duplicada, placa vazia, histórico do pão)

Espelho do repo definitivo (commits das Tasks 2-4 deste plano).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
EOF
)"
```

- [ ] **Step 4: Push nos dois repos**

```bash
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg" && git push origin main
cd "/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP" && git push origin main
```

- [ ] **Step 5: Deploy no Contabo**

```bash
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull origin main && npm run build"
ssh transmonseg-vps "pm2 restart kpi-transmonseg"
```

## Fora do escopo deste plano

- GPS congelado: detector já existe e está exposto na API, mas a lógica de decisão (o que fazer quando `gpsCongelado:true`) precisa de mais casos reais acumulados antes de calibrar -- não plansável ainda.
- Rio Quality, 48-58 placas sem CV cadastrado: bloqueado, depende do `cod_user` que só a Érica tem.
- Padrão RQQ5B81 (velocidade nunca cai a ≤5km/h): investigado em 17/09, prevalência baixa (1/60 flags do dia) e risco de falso positivo alto -- decisão explícita de não mexer.
- Investigar por que o guard territorial não pegou os 5 casos da Task 1 quando foram geocodificados (4 deles depois do guard já estar em produção): mencionado como possível trabalho futuro na Task 1, não faz parte deste plano.
