# Visita pela parada real mais próxima — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chegada/saída de cada entrega passam a vir da parada real (GPS contínuo) mais próxima do endereço dentro de 500 m, em vez da "maior permanência dentro do círculo de 500 m".

**Architecture:** Só na ponte de monitoramento (`src/app/api/kpi/base-horarios/route.ts`, repo `MONITORAMENTO transmonseg`, porta 3010). `acharVisitasPorPonto` passa a derivar as paradas da placa (`derivarParadas`, já existente) e, por ponto, escolhe a parada FORA_BASE mais próxima com distância ≤ `RAIO_ENTREGA_M`. Sem parada elegível, cai nos fallbacks atuais (janela por raio, ampliado, vizinhança), inalterados. Contrato da resposta (`VisitaPonto`) não muda; o KPI não precisa de código novo.

**Tech Stack:** TypeScript, Vitest (`npx vitest run src/app/api/kpi/base-horarios/route.test.ts`).

**Spec:** Análise de 23/09 (conversa): hoje 207/1017 chegadas dentro de 2 min da parada Unitrac (468 dentro de 10 min); regra simulada R=500 m: 527 / 717.

## Global Constraints

- Timezone: ponte usa UTC real; não mexer em conversões (o KPI cuida de `paraBrtMascaradoComoUtc`).
- `VisitaPonto` mantém `{id, chegada, saida, viaVizinhanca?, viaRaioAmpliado?}`; parada escolhida NÃO recebe marcador (é evidência direta).
- Nunca inventar: sem parada ≤500 m e sem fallback → `null`.
- Paradas de dia com apagão/GPS congelado seguem a regra existente (o KPI/`teveApagaoDeSinal` já sinaliza); não alterar.
- Deploy de monitoramento (`transmonseg-definitivo`) e espelho no repo TEMP só com OK do usuário. Dois repos sempre juntos.

## Review Focus

- Duas paradas a distâncias quase iguais do ponto (rua com dois clientes): desempata pela mais longa; nunca pela primeira do dia.
- Parada BASE (CD) a <500 m do cliente: não pode virar visita (ver `estaMaisPertoDaBaseQueDoPonto` — regra deve valer também para paradas).
- Parada única servindo dois pontos vizinhos: ambos recebem a mesma janela (sem "roubo"), como hoje.
- Ponto sem nenhuma parada ≤500 m mas com dwell ampliado (≤800 m): continua `viaRaioAmpliado`.
- `posicoes` vazio / só ruído de velocidade: `[]` paradas → tudo `null`, sem exceção.

---

### Task 1: Escolher a parada real mais próxima em `acharVisitasPorPonto`

**Files:**
- Modify: `src/app/api/kpi/base-horarios/route.ts` (`acharVisitasPorPonto`, ~L605; adicionar helper `acharParadaMaisProxima` logo acima)
- Test: `src/app/api/kpi/base-horarios/route.test.ts` (bloco `describe("acharVisitasPorPonto")`, ~L333)

**Interfaces:**
- Consumes: `derivarParadas(posicoes, basesCentro): ParadaDerivada[]`, `haversineM`, `RAIO_ENTREGA_M`, `estaMaisPertoDaBaseQueDoPonto`.
- Produces: `acharParadaMaisProxima(pt: PontoEntrega, paradas: ParadaDerivada[], raioM: number, basesCentro: BaseCentro[]): ParadaDerivada | null` (interna). `acharVisitasPorPonto` mantém a assinatura.

- [ ] **Step 1: Testes que falham** (adicionar ao describe; usar velocidade 0 e posições espaçadas ≥ `DUR_MINIMA_PARADA_MS`)

```ts
it("varias paradas no raio: escolhe a MAIS PROXIMA do ponto, nao a mais longa", () => {
  // parada perto (~30m, 6min) e parada longa mais longe (~400m, 40min)
  const perto = { lat: -22.0003, lng: -43.0 };
  const longe = { lat: -22.0036, lng: -43.0 };
  const posicoes = [
    { ...longe, criado_em: "2026-08-25T09:00:00.000Z", velocidade: 0 },
    { ...longe, criado_em: "2026-08-25T09:40:00.000Z", velocidade: 0 },
    { lat: -23.0, lng: -44.0, criado_em: "2026-08-25T09:50:00.000Z", velocidade: 40 },
    { ...perto, criado_em: "2026-08-25T10:00:00.000Z", velocidade: 0 },
    { ...perto, criado_em: "2026-08-25T10:06:00.000Z", velocidade: 0 },
    { lat: -23.0, lng: -44.0, criado_em: "2026-08-25T10:10:00.000Z", velocidade: 40 },
  ];
  const [v] = acharVisitasPorPonto(posicoes, [LOJA_A]);
  expect(v).toEqual({ id: "NF1", chegada: "2026-08-25T10:00:00.000Z", saida: "2026-08-25T10:06:00.000Z" });
});

it("parada de BASE proxima do cliente nao vira visita", () => {
  const base = { id: "CD", lat: -22.0002, lng: -43.0 };
  const posicoes = [
    { lat: -22.0002, lng: -43.0, criado_em: "2026-08-25T00:00:00.000Z", velocidade: 0 },
    { lat: -22.0002, lng: -43.0, criado_em: "2026-08-25T03:00:00.000Z", velocidade: 0 },
  ];
  const [v] = acharVisitasPorPonto(posicoes, [LOJA_A], [base as any]);
  expect(v.chegada).toBeNull();
});

it("parada unica servindo dois pontos vizinhos: os dois recebem a mesma janela", () => {
  const vizinho = { id: "NF3", lat: -22.0009, lng: -43.0 };
  const posicoes = [
    { lat: -22.0004, lng: -43.0, criado_em: "2026-08-25T10:00:00.000Z", velocidade: 0 },
    { lat: -22.0004, lng: -43.0, criado_em: "2026-08-25T10:20:00.000Z", velocidade: 0 },
  ];
  const [a, b] = acharVisitasPorPonto(posicoes, [LOJA_A, vizinho]);
  expect(a.chegada).toBe("2026-08-25T10:00:00.000Z");
  expect(b.chegada).toBe("2026-08-25T10:00:00.000Z");
});

it("sem parada em 500m mas com dwell ampliado: continua viaRaioAmpliado", () => {
  // ~650m do ponto
  const posicoes = [
    { lat: -22.0058, lng: -43.0, criado_em: "2026-08-25T10:00:00.000Z", velocidade: 0 },
    { lat: -22.0058, lng: -43.0, criado_em: "2026-08-25T10:15:00.000Z", velocidade: 0 },
  ];
  const [v] = acharVisitasPorPonto(posicoes, [LOJA_A]);
  expect(v.viaRaioAmpliado).toBe(true);
});
```

Ajustar nomes de campos de base (`BaseCentro`) ao tipo real do arquivo antes de rodar (`grep -n "type BaseCentro" route.ts`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/api/kpi/base-horarios/route.test.ts -t acharVisitasPorPonto` → o teste 1 falha (hoje devolve a janela longa).

- [ ] **Step 3: Implementar**

```ts
function acharParadaMaisProxima(pt: PontoEntrega, paradas: ParadaDerivada[], raioM: number, basesCentro: BaseCentro[]): ParadaDerivada | null {
  let melhor: ParadaDerivada | null = null
  let melhorDist = Infinity
  for (const p of paradas) {
    if (p.classificacao !== "FORA_BASE") continue
    if (estaMaisPertoDaBaseQueDoPonto({ lat: p.lat, lng: p.lng } as Posicao, pt, basesCentro)) continue
    const d = haversineM(pt.lat, pt.lng, p.lat, p.lng)
    if (d > raioM) continue
    if (d < melhorDist - 25 || (Math.abs(d - melhorDist) <= 25 && melhor !== null && p.duracaoSeg > melhor.duracaoSeg) || melhor === null) {
      melhor = p
      melhorDist = d
    }
  }
  return melhor
}
```

Em `acharVisitasPorPonto`, calcular `const paradas = derivarParadas(posicoes, basesCentro)` uma vez e trocar o passo `diretas` por: parada mais próxima → `{id, chegada: parada.chegada, saida: parada.saida}`; senão o `acharBlocoDentroDoRaio(RAIO_ENTREGA_M)` atual. Restante (ampliado, vizinhança) inalterado. Ajustar a chamada de `estaMaisPertoDaBaseQueDoPonto` à assinatura real (ler a função; se exigir `Posicao` completa, montar `{lat,lng,criado_em:"",velocidade:0}`).

- [ ] **Step 4: Suite inteira** — `npx vitest run` → tudo verde (os testes antigos de janela por raio precisam continuar passando; se algum quebrar por a parada derivada ter duração mínima diferente, ajustar o TESTE só se o comportamento novo for o desejado e registrar no ledger).

- [ ] **Step 5: Commit** — `git add route.ts route.test.ts && git commit -m "feat(base-horarios): visita = parada real mais proxima em 500m"`

### Task 2: Verificação contra a Unitrac com dado real de 22/09

**Files:**
- Create: `scripts/verificar-visita-vs-unitrac.ts` (monitoramento, só leitura)

- [ ] **Step 1:** Script que, para as placas de 22/09, carrega posições do banco, chama `acharVisitasPorPonto` (antes/depois via flag `--legado` que força o caminho antigo) com os pontos geocodificados do KPI (`kpi_romaneio_geocode_cache`) e compara `chegada` com o `feitoISO` dos alvos do snapshot (`kpi_alvos_snapshot`) convertendo a convenção (dígitos BRT + 'Z' ↔ UTC real +3h).
- [ ] **Step 2:** Rodar e imprimir: % dentro de 2 min, 10 min; contagem de `null` antes/depois. **Critério de aceite:** dentro de 2 min ≥ 45% (baseline 20%), dentro de 10 min ≥ 65% (baseline 46%), nenhum aumento de `null` acima de 2%. Se não atingir, parar e reportar ao usuário — não ajustar limiares por tentativa.
- [ ] **Step 3:** Commit do script.

### Task 3: Verificação no KPI e espelho

- [ ] **Step 1:** No KPI, regenerar 22/09 localmente com a ponte nova (apontando `BRIDGE_URL` para instância de teste) e comparar contagem de NFs sem horário e de "ENTREGUE" antes/depois.
- [ ] **Step 2:** Espelhar a alteração no repo TEMP do monitoramento (mesmo commit) — regra "push nos dois repos".
- [ ] **Step 3:** Reportar ao usuário números antes/depois e pedir OK para deploy (`git pull` + build + `pm2 restart transmonseg-definitivo` no Contabo). Sem OK, nada vai a produção.
