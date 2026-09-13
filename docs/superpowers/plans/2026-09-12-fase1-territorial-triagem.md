# Fase 1 — Validação territorial de geocode e triagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de afirmar "NÃO FOI AO CLIENTE" e "CARGA TRANSFERIDA" em cima de coordenada que caiu no município ou no bairro errado, e entregar à Ana uma lista de triagem que diz *por que* cada coordenada é suspeita.

**Architecture:** A cascata de geocode (`geocodificarEndereco`) não muda. Depois que ela devolve uma coordenada, a rota-ponte `/api/romaneio/geocode` do monitoramento confere se o ponto cai no território que o romaneio pediu — município por polígono oficial do IBGE (`ST_Contains`), bairro pelo vizinho mais próximo em `cnefe_enderecos`. Se divergir, a resposta sai com `validado: false` e um `motivo`. A checagem só roda quando o chamador pede (`validarTerritorio: true`), e só a rota do Nutry Max pede. A política de o que fazer com uma coordenada não confiável continua em `agregacao.ts`, no lado do KPI, onde `geoConfiavel` já suprime conclusões negativas.

**Tech Stack:** Next.js (versão do repo — leia `node_modules/next/dist/docs/` antes de escrever rota), TypeScript, Vitest, Postgres 16 + PostGIS 3.6, Supabase JS (client admin), PM2 no VPS `transmonseg-vps`.

**Spec:** `docs/superpowers/specs/2026-09-12-confiabilidade-kpi-nutrimax-design.md` (neste mesmo repo). Leia a spec antes de começar — o plano argumenta a partir dela.

## Global Constraints

- **Dois repos por projeto, sempre em sincronia.** Toda mudança no monitoramento vai para `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO transmonseg` **e** `/Users/joaquimsalles/Projects/Transmonseg/monitoramento/MONITORAMENTO TEMP`. Toda mudança no KPI vai para `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI transmonseg` **e** `/Users/joaquimsalles/Projects/Transmonseg/kpi/KPI TEMP`. Os dois pares são commitados e pushados juntos.
- **Mensagem de commit termina com:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KDT93K5kwJgVYnWFt4pmJ9
  ```
- **Escopo é Nutry Max.** Rio Quality, Porte Frio e o motor de desvio de rota não podem mudar de comportamento. A flag `validarTerritorio` entra com default `false`.
- **Fail-open.** Nenhuma falha nova (rede, tabela ausente, PostGIS indisponível, cobertura CNEFE inexistente) pode transformar uma coordenada boa em suspeita. Na dúvida, `validado` mantém o valor que a cascata já devolveu.
- **Nunca `CREATE INDEX` bloqueante em produção.** `cnefe_enderecos` tem 8,8M linhas — usar `CONCURRENTLY`.
- Testes: `npm test` (vitest) em cada repo. Baseline atual: KPI 1006 passando, monitoramento 935 passando. Nenhum pode regredir.
- Banco de produção: host `transmonseg-vps`, acesso via `ssh transmonseg-vps "sudo -u postgres psql -d <db>"`. Bancos: `transmonseg` (monitoramento, CNEFE, PostGIS) e `kpi_transmonseg` (KPI). Depois de DDL no `kpi_transmonseg`, rodar `NOTIFY pgrst, 'reload schema';` ou o PostgREST não enxerga a coluna nova.

---

## File Structure

**Monitoramento** (`MONITORAMENTO transmonseg` + `MONITORAMENTO TEMP`)

- Create `scripts/migrations/contabo/079_malha_municipios_rj.sql` — tabela `malha_municipios_rj` (código IBGE + geometria), vazia; o carregamento é por script.
- Create `scripts/migrations/contabo/080_cnefe_indice_espacial.sql` — índice GiST em `cnefe_enderecos`.
- Create `scripts/carregar-malha-municipios.ts` — baixa a malha do IBGE e popula a tabela. Roda uma vez; idempotente.
- Create `src/lib/territorio.ts` — a única sede da checagem territorial. Sem I/O direto: recebe funções de consulta por injeção, igual ao padrão de `romaneio-geocode.ts`.
- Create `src/lib/territorio.test.ts`
- Create `src/app/api/romaneio/geocode/territorio-deps.ts` + teste — adaptador entre o cliente Supabase e as deps puras de `territorio.ts`.
- Create `scripts/migrations/contabo/081_funcoes_territorio.sql` — funções RPC `municipio_da_coordenada` e `bairro_da_coordenada`.
- Create `src/app/api/romaneio/municipio-codigo/route.ts` + teste — nome de cidade → código IBGE, para o script de auditoria que roda no repo do KPI.
- Modify `src/app/api/romaneio/geocode/route.ts` — aceita `validarTerritorio` no corpo, e aplica a guarda entre a cascata e o `resultados.push`.

**KPI** (`KPI transmonseg` + `KPI TEMP`)

- Create `supabase/migrations/20260912010000_geocode_cache_motivo.sql` — coluna `motivo text` em `kpi_romaneio_geocode_cache`.
- Modify `src/lib/kpi-romaneio/geocode.ts` — manda `validarTerritorio: true`, carrega e persiste `motivo`.
- Modify `src/lib/kpi-romaneio/types.ts` — `LinhaGeocodificada.geoMotivo?: string`.
- Modify `src/app/api/kpi/nutrimax/gerar/route.ts` e `scripts/gerar-nutrimax-real-arquivo.ts` — propagam `geoMotivo`.
- Modify `src/lib/kpi-romaneio/agregacao.ts` — o rótulo de coordenada imprecisa passa a dizer o motivo.
- Create `scripts/auditar-geocode-territorio.ts` — reaudita o cache inteiro e marca `confiavel = false` no que estiver fora do território.
- Create `src/lib/kpi-romaneio/acesso-restrito.ts` + teste — clientes sem acesso rodoviário (ilha).

`src/lib/territorio.ts` fica no monitoramento, e não no KPI, porque o CNEFE e o PostGIS estão no banco do monitoramento e a rota-ponte já é o ponto de integração. Colocá-lo no KPI exigiria acesso cross-database.

---

### Task 1: Camada de municípios (migration + carga)

Cria a tabela de polígonos municipais e a popula com a malha oficial do IBGE. Entrega sozinha: dá para perguntar ao banco em que município está uma coordenada.

**Files:**
- Create: `MONITORAMENTO transmonseg/scripts/migrations/contabo/079_malha_municipios_rj.sql`
- Create: `MONITORAMENTO transmonseg/scripts/carregar-malha-municipios.ts`
- (espelhar os dois em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: nada.
- Produces: tabela `malha_municipios_rj(municipio_codigo text primary key, geom geometry(MultiPolygon, 4326))`, com 92 linhas. Consultada nas tasks 3 e 4 por `ST_Contains(geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326))`.

- [ ] **Step 1: Escrever a migration**

Criar `scripts/migrations/contabo/079_malha_municipios_rj.sql`:

```sql
-- Achado real 12/09 (auditoria do KPI Nutry Max do dia 11/09): 100 coordenadas
-- do cache estao em municipio diferente do que o romaneio pediu -- 22 foram
-- parar em Campos dos Goytacazes, 12 em Belford Roxo, 10 em Sao Goncalo.
-- Mediana do erro: 19,2 km.
--
-- A cascata ja filtra CNEFE por municipio_codigo desde 12/08, mas
-- escolherCandidatoMaisProximo aceita qualquer candidato a ate 30km do ponto
-- de referencia da cidade (DISTANCIA_MAX_MATCH_LOCAL_M) -- e 30km em volta do
-- centro do Rio contem Sao Goncalo, Belford Roxo, Duque de Caxias, Mage e Sao
-- Joao de Meriti INTEIROS. Google, Nominatim e o match OSM "local" nao tem
-- filtro de municipio nenhum, so' esse teto.
--
-- Polygon oficial resolve isso sem heuristica de distancia: ou o ponto esta
-- dentro do municipio pedido, ou nao esta. Fonte: malha municipal do IBGE
-- (servicodados.ibge.gov.br/api/v3/malhas/estados/33, qualidade intermediaria)
-- -- 92 features, 153 KB, cada uma com "codarea" igual ao codigo IBGE de 7
-- digitos ja usado em MUNICIPIO_CODIGO_IBGE (romaneio-geocode-local.ts) e em
-- cnefe_enderecos.municipio_codigo.
--
-- Tabela criada vazia de proposito: a carga e' feita por
-- scripts/carregar-malha-municipios.ts, que baixa do IBGE e e' idempotente.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS malha_municipios_rj (
  municipio_codigo text PRIMARY KEY,
  geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS malha_municipios_rj_geom_idx
  ON malha_municipios_rj USING GIST (geom);
```

- [ ] **Step 2: Aplicar a migration em produção e conferir**

```bash
scp "MONITORAMENTO transmonseg/scripts/migrations/contabo/079_malha_municipios_rj.sql" transmonseg-vps:/tmp/079.sql
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -f /tmp/079.sql"
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -t -A -c 'SELECT count(*) FROM malha_municipios_rj'"
```

Esperado: `CREATE TABLE`, `CREATE INDEX`, e a contagem `0`.

- [ ] **Step 3: Escrever o script de carga**

Criar `scripts/carregar-malha-municipios.ts`. O script baixa o GeoJSON, converte cada feature para WKT via PostGIS (`ST_GeomFromGeoJSON` + `ST_Multi`) e faz upsert. `ST_Multi` é necessário porque a malha mistura `Polygon` e `MultiPolygon`, e a coluna é tipada como `MultiPolygon`.

```ts
// Popula malha_municipios_rj com a malha municipal oficial do IBGE.
// Idempotente: pode rodar quantas vezes quiser, faz upsert por codigo.
// Uso: npx tsx scripts/carregar-malha-municipios.ts
import { Client } from "pg";
import { validarTerritorio } from "@/lib/territorio";
import { expandirCidadeTruncada, municipioCodigoIbge } from "@/lib/romaneio-geocode-local";

const URL_IBGE =
  "https://servicodados.ibge.gov.br/api/v3/malhas/estados/33" +
  "?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria";

type Feature = { properties: { codarea: string }; geometry: unknown };

async function main() {
  const res = await fetch(URL_IBGE);
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status}`);
  const geojson = (await res.json()) as { features: Feature[] };
  if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
    throw new Error("resposta do IBGE sem features");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const f of geojson.features) {
      const codigo = f.properties?.codarea;
      if (!codigo) throw new Error("feature sem codarea");
      await client.query(
        `INSERT INTO malha_municipios_rj (municipio_codigo, geom)
         VALUES ($1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)))
         ON CONFLICT (municipio_codigo) DO UPDATE SET geom = EXCLUDED.geom`,
        [codigo, JSON.stringify(f.geometry)],
      );
    }
    const { rows } = await client.query("SELECT count(*)::int AS n FROM malha_municipios_rj");
    console.log(`malha_municipios_rj: ${rows[0].n} municipios`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Rodar a carga e validar contra casos conhecidos**

Rodar o script apontando para o banco de produção. Depois validar com três coordenadas cujo município já foi verificado à mão na auditoria:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -t -A -F'|' -c \"
SELECT municipio_codigo FROM malha_municipios_rj
WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-43.297583, -22.811137), 4326));\""
```

Esperado: `3304557` (Rio de Janeiro) — é a coordenada errada do Galeão, que está em Parada de Lucas, município certo e bairro errado. Confirma que a camada de município **não** pega esse caso, que é justamente por que a task 4 existe.

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -t -A -c \"
SELECT count(*) FROM malha_municipios_rj\""
```

Esperado: `92`.

- [ ] **Step 5: Espelhar no TEMP e commitar**

```bash
cp "MONITORAMENTO transmonseg/scripts/migrations/contabo/079_malha_municipios_rj.sql" "MONITORAMENTO TEMP/scripts/migrations/contabo/"
cp "MONITORAMENTO transmonseg/scripts/carregar-malha-municipios.ts" "MONITORAMENTO TEMP/scripts/"
```

Commitar nos dois repos, com a mensagem terminando nas duas linhas de atribuição das Global Constraints.

---

### Task 2: Índice espacial no CNEFE

Sem isso a consulta de vizinho mais próximo leva 1,36 s por endereço, o que estouraria o prazo de 280 s da rota-ponte com um lote de 15.

**Files:**
- Create: `MONITORAMENTO transmonseg/scripts/migrations/contabo/080_cnefe_indice_espacial.sql`
- (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: nada.
- Produces: índice GiST usado implicitamente pelas consultas de vizinho mais próximo (operador `<->`) da task 4.

- [ ] **Step 1: Escrever a migration**

```sql
-- Achado real 12/09: a checagem de bairro (ver src/lib/territorio.ts) precisa
-- do vizinho CNEFE mais proximo de uma coordenada. cnefe_enderecos tem 8,8M
-- linhas e ate hoje so' a PRIMARY KEY -- uma consulta de vizinho mais proximo
-- com bounding box leva 1,36s. Com 15 enderecos por lote isso sozinho passaria
-- de 20s, dentro de uma rota que ja tem prazo apertado (PRAZO_MAXIMO_MS=280s
-- em api/romaneio/geocode/route.ts, disputado com o throttle do Nominatim).
--
-- Indice em expressao (geography sobre lng/lat) em vez de coluna nova: nao
-- reescreve as 8,8M linhas e nao muda o schema que o resto do codigo le.
-- CONCURRENTLY porque a tabela e' de producao e um CREATE INDEX comum a
-- travaria para escrita durante a construcao.
CREATE INDEX CONCURRENTLY IF NOT EXISTS cnefe_enderecos_geog_idx
  ON cnefe_enderecos
  USING GIST ((ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography));
```

- [ ] **Step 2: Aplicar (fora de transação) e medir o ganho**

`CREATE INDEX CONCURRENTLY` não roda dentro de bloco de transação, então aplicar com `-c`, não `-f` com `-1`:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -f /tmp/080.sql"
```

A construção sobre 8,8M linhas leva minutos. Depois, medir:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -c '\timing on' -c \"
SELECT localidade, municipio_codigo
FROM cnefe_enderecos
ORDER BY ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      <-> ST_SetSRID(ST_MakePoint(-43.297583, -22.811137), 4326)::geography
LIMIT 1;\""
```

Esperado: `PARADA DE LUCAS | 3304557`, em menos de 50 ms (contra 1.358 ms medidos antes do índice).

Se o índice não estiver sendo usado, `EXPLAIN` na mesma consulta deve mostrar `Index Scan using cnefe_enderecos_geog_idx`. Se mostrar `Seq Scan`, a expressão do índice não bate com a da consulta — as duas precisam ser textualmente idênticas, incluindo o cast `::geography`.

- [ ] **Step 3: Espelhar no TEMP e commitar**

---

### Task 3: `territorio.ts` — checagem de município

A sede da lógica territorial, testável sem banco. Só município nesta task; bairro entra na task 4.

**Files:**
- Create: `MONITORAMENTO transmonseg/src/lib/territorio.ts`
- Create: `MONITORAMENTO transmonseg/src/lib/territorio.test.ts`
- (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: tabela `malha_municipios_rj` da task 1, através de uma função injetada.
- Produces:
  ```ts
  export type MotivoTerritorio = "municipio_divergente" | "bairro_divergente";
  export type ResultadoTerritorio = { ok: true } | { ok: false; motivo: MotivoTerritorio };
  export type DepsTerritorio = {
    municipioDaCoordenada: (lat: number, lng: number) => Promise<string | null>;
  };
  export async function validarTerritorio(
    ponto: { lat: number; lng: number },
    esperado: { municipioCodigo: string | null; bairro: string | null },
    deps: DepsTerritorio,
  ): Promise<ResultadoTerritorio>;
  ```
  A task 4 acrescenta um segundo campo a `DepsTerritorio` e um segundo parâmetro de configuração; a assinatura de `validarTerritorio` não muda.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/territorio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarTerritorio } from "./territorio";

const semBairro = { municipioCodigo: "3304557", bairro: null };

describe("validarTerritorio - municipio", () => {
  it("aprova quando a coordenada cai no municipio pedido", async () => {
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      semBairro,
      { municipioDaCoordenada: async () => "3304557" },
    );
    expect(r).toEqual({ ok: true });
  });

  it("reprova quando a coordenada cai em outro municipio", async () => {
    // Caso real da auditoria: endereco de Paciencia/Rio de Janeiro que foi
    // parar em Sao Goncalo (3304904), 67,7 km de distancia.
    const r = await validarTerritorio(
      { lat: -22.83, lng: -43.05 },
      semBairro,
      { municipioDaCoordenada: async () => "3304904" },
    );
    expect(r).toEqual({ ok: false, motivo: "municipio_divergente" });
  });

  it("aprova quando o municipio esperado nao foi resolvido -- nada pra comparar", async () => {
    // Cidade truncada/corrompida que expandirCidadeTruncada nao resolveu.
    // Sem municipioCodigo nao ha afirmacao possivel; nunca inventar suspeita.
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      { municipioCodigo: null, bairro: null },
      { municipioDaCoordenada: async () => "3304904" },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando a coordenada nao cai em nenhum poligono -- fora do RJ ou malha incompleta", async () => {
    const r = await validarTerritorio(
      { lat: -20.8, lng: -41.9 },
      semBairro,
      { municipioDaCoordenada: async () => null },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando a consulta de municipio falha -- fail-open", async () => {
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      semBairro,
      { municipioDaCoordenada: async () => { throw new Error("banco fora"); } },
    );
    expect(r).toEqual({ ok: true });
  });
});
```

Sobre o quarto teste: uma coordenada em Espírito Santo (o caso real de `AV SANTA CLARA, 8 - SANTA CLARA, PORCIUNCULA`, que foi parar em `-20.822, -41.910`) não cai em nenhum polígono do RJ. Reprovar por isso seria tentador, mas a malha carregada é só do RJ e o cliente pode um dia ter endereço em outro estado — a task 7 pega esse caso pela auditoria, não pela guarda em tempo real. Fail-open aqui é deliberado.

- [ ] **Step 2: Rodar os testes e ver falhar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/lib/territorio.test.ts
```

Esperado: FAIL — `Failed to resolve import "./territorio"`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/lib/territorio.ts`:

```ts
// Guarda de saida territorial -- roda DEPOIS da cascata de geocodificacao
// (romaneio-geocode.ts), nunca dentro dela.
//
// Achado real 12/09 (auditoria do KPI Nutry Max do dia 11/09): 100 coordenadas
// do cache estao em municipio diferente do que o romaneio pediu, e 294 dos 304
// enderecos suspeitos estavam marcados como confiaveis. Nove desses erros foram
// criados no proprio dia 12/09, pelo motor atual -- nao e' so' estoque velho.
//
// Por que aqui e nao na cascata: a cascata e' compartilhada com Rio Quality,
// Porte Frio e o motor de desvio de rota, e o escopo decidido e' so' Nutry Max.
// Ver docs/superpowers/specs/2026-09-12-confiabilidade-kpi-nutrimax-design.md,
// secao "Decisoes de arquitetura".
//
// FAIL-OPEN em todo caminho de duvida: sem municipio esperado resolvido, sem
// poligono contendo o ponto, ou com a consulta falhando, o resultado e' "ok".
// Uma coordenada boa nunca pode virar suspeita por falta de dado nosso.

export type MotivoTerritorio = "municipio_divergente" | "bairro_divergente";

export type ResultadoTerritorio = { ok: true } | { ok: false; motivo: MotivoTerritorio };

export type DepsTerritorio = {
  /** Codigo IBGE de 7 digitos do municipio que CONTEM o ponto, ou null se
   *  nenhum poligono da malha carregada o contiver. */
  municipioDaCoordenada: (lat: number, lng: number) => Promise<string | null>;
};

export async function validarTerritorio(
  ponto: { lat: number; lng: number },
  esperado: { municipioCodigo: string | null; bairro: string | null },
  deps: DepsTerritorio,
): Promise<ResultadoTerritorio> {
  if (esperado.municipioCodigo) {
    let real: string | null;
    try {
      real = await deps.municipioDaCoordenada(ponto.lat, ponto.lng);
    } catch {
      return { ok: true };
    }
    if (real && real !== esperado.municipioCodigo) {
      return { ok: false, motivo: "municipio_divergente" };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/lib/territorio.test.ts
```

Esperado: 5 passando.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd "MONITORAMENTO transmonseg" && npm test
```

Esperado: 935 + 5 = 940 passando, nenhuma falha.

- [ ] **Step 6: Espelhar no TEMP e commitar**

---

### Task 4: `territorio.ts` — checagem de bairro

A camada de município não pega o Galeão (município certo, bairro errado). Esta task fecha esse caso.

**Files:**
- Modify: `MONITORAMENTO transmonseg/src/lib/territorio.ts`
- Modify: `MONITORAMENTO transmonseg/src/lib/territorio.test.ts`
- (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: `cnefe_enderecos` + índice da task 2, através de função injetada.
- Produces: `DepsTerritorio` ganha `bairroDaCoordenada`. Assinatura de `validarTerritorio` inalterada.
  ```ts
  export type DepsTerritorio = {
    municipioDaCoordenada: (lat: number, lng: number) => Promise<string | null>;
    bairroDaCoordenada: (lat: number, lng: number) => Promise<{ localidade: string; distanciaM: number } | null>;
  };
  export const RAIO_MAXIMO_VIZINHO_CNEFE_M = 300;
  ```

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/lib/territorio.test.ts`:

```ts
import { validarTerritorio, RAIO_MAXIMO_VIZINHO_CNEFE_M } from "./territorio";

const municipioOk = { municipioDaCoordenada: async () => "3304557" };

describe("validarTerritorio - bairro", () => {
  it("reprova o caso Galeao: municipio certo, bairro errado", async () => {
    // Caso real: AVENIDA VINTE DE JANEIRO, S/N - GALEAO, RIO DE JANEIRO caiu em
    // -22.811137,-43.297583, cujo vizinho CNEFE a 0m tem localidade PARADA DE
    // LUCAS. Municipio identico (3304557), 5.014m do endereco real.
    const r = await validarTerritorio(
      { lat: -22.811137, lng: -43.297583 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      { ...municipioOk, bairroDaCoordenada: async () => ({ localidade: "PARADA DE LUCAS", distanciaM: 0 }) },
    );
    expect(r).toEqual({ ok: false, motivo: "bairro_divergente" });
  });

  it("aprova quando o bairro bate", async () => {
    const r = await validarTerritorio(
      { lat: -22.811, lng: -43.228 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      { ...municipioOk, bairroDaCoordenada: async () => ({ localidade: "GALEAO", distanciaM: 40 }) },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova ignorando acento e caixa", async () => {
    const r = await validarTerritorio(
      { lat: -22.8, lng: -43.2 },
      { municipioCodigo: "3304557", bairro: "JARDIM GUANABARA" },
      { ...municipioOk, bairroDaCoordenada: async () => ({ localidade: "Jardim Guanabará", distanciaM: 50 }) },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando o vizinho CNEFE esta longe demais pra julgar", async () => {
    // Area rural sem cobertura CNEFE densa: o vizinho mais proximo pode ser de
    // outro bairro so' por ser o unico ponto cadastrado na regiao.
    const r = await validarTerritorio(
      { lat: -22.1, lng: -41.4 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      { ...municipioOk, bairroDaCoordenada: async () => ({ localidade: "OUTRO", distanciaM: RAIO_MAXIMO_VIZINHO_CNEFE_M + 1 }) },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando o romaneio nao trouxe bairro", async () => {
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      { municipioCodigo: "3304557", bairro: null },
      { ...municipioOk, bairroDaCoordenada: async () => ({ localidade: "QUALQUER", distanciaM: 10 }) },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando nao ha vizinho CNEFE nenhum", async () => {
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      { ...municipioOk, bairroDaCoordenada: async () => null },
    );
    expect(r).toEqual({ ok: true });
  });

  it("aprova quando a consulta de bairro falha -- fail-open", async () => {
    const r = await validarTerritorio(
      { lat: -22.9, lng: -43.2 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      { ...municipioOk, bairroDaCoordenada: async () => { throw new Error("banco fora"); } },
    );
    expect(r).toEqual({ ok: true });
  });

  it("municipio divergente ganha do bairro -- sinal mais forte primeiro", async () => {
    const r = await validarTerritorio(
      { lat: -22.83, lng: -43.05 },
      { municipioCodigo: "3304557", bairro: "GALEAO" },
      {
        municipioDaCoordenada: async () => "3304904",
        bairroDaCoordenada: async () => ({ localidade: "OUTRO", distanciaM: 10 }),
      },
    );
    expect(r).toEqual({ ok: false, motivo: "municipio_divergente" });
  });
});
```

Os testes da task 3 precisam ganhar `bairroDaCoordenada: async () => null` no objeto de deps para continuar compilando.

- [ ] **Step 2: Rodar os testes e ver falhar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/lib/territorio.test.ts
```

Esperado: FAIL — `RAIO_MAXIMO_VIZINHO_CNEFE_M` não é exportado e `bairroDaCoordenada` não existe no tipo.

- [ ] **Step 3: Implementar**

Em `src/lib/territorio.ts`, acrescentar antes de `validarTerritorio`:

```ts
/** Acima disso o vizinho CNEFE mais proximo nao diz nada util sobre o bairro
 *  do ponto -- area rural ou trecho sem cobertura do Censo tem vizinho unico a
 *  quilometros, de qualquer bairro. Conservador de proposito: a checagem de
 *  bairro compara NOME (localidade do CNEFE contra o bairro do romaneio) e
 *  nome de bairro varia de grafia, entao ela so' pode marcar suspeita quando a
 *  evidencia e' inequivoca. */
export const RAIO_MAXIMO_VIZINHO_CNEFE_M = 300;

function normalizarBairro(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

Estender `DepsTerritorio`:

```ts
export type DepsTerritorio = {
  municipioDaCoordenada: (lat: number, lng: number) => Promise<string | null>;
  /** Localidade (bairro) do endereco CNEFE mais proximo do ponto, com a
   *  distancia ate ele -- null quando nao ha nenhum. */
  bairroDaCoordenada: (lat: number, lng: number) => Promise<{ localidade: string; distanciaM: number } | null>;
};
```

E acrescentar ao corpo de `validarTerritorio`, depois do bloco de município e antes do `return { ok: true }` final:

```ts
  if (esperado.bairro) {
    let vizinho: { localidade: string; distanciaM: number } | null;
    try {
      vizinho = await deps.bairroDaCoordenada(ponto.lat, ponto.lng);
    } catch {
      return { ok: true };
    }
    if (
      vizinho &&
      vizinho.distanciaM <= RAIO_MAXIMO_VIZINHO_CNEFE_M &&
      normalizarBairro(vizinho.localidade) !== normalizarBairro(esperado.bairro)
    ) {
      return { ok: false, motivo: "bairro_divergente" };
    }
  }
```

- [ ] **Step 4: Rodar os testes e ver passar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/lib/territorio.test.ts
```

Esperado: 13 passando.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd "MONITORAMENTO transmonseg" && npm test
```

Esperado: 948 passando.

- [ ] **Step 6: Espelhar no TEMP e commitar**

---

### Task 5: Ligar a guarda na rota-ponte

**Files:**
- Modify: `MONITORAMENTO transmonseg/src/app/api/romaneio/geocode/route.ts` (aceitar a flag; aplicar a guarda logo antes de `resultados.push`, hoje na linha 369)
- (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: `validarTerritorio`, `DepsTerritorio` da task 4; `malha_municipios_rj` da task 1; índice da task 2.
- Produces: a resposta de `POST /api/romaneio/geocode` ganha o campo opcional `motivo` em cada resultado:
  ```ts
  { lat: number; lng: number; fonte: string; validado: boolean; motivo?: "municipio_divergente" | "bairro_divergente" }
  ```
  O corpo da requisição aceita `validarTerritorio?: boolean` (default `false`). Consumido pela task 8.

- [ ] **Step 1: Ler a documentação da versão do Next deste repo**

Este repo tem um `AGENTS.md` avisando que a versão do Next não é a que você conhece. Antes de mexer na rota, ler o guia de route handlers em `node_modules/next/dist/docs/`.

- [ ] **Step 2: Escrever o teste que falha**

O arquivo de rota não tem teste hoje. Criar `src/app/api/romaneio/geocode/territorio.test.ts` cobrindo só o adaptador de consulta, que é a parte nova com lógica:

```ts
import { describe, it, expect } from "vitest";
import { montarDepsTerritorio } from "./territorio-deps";

describe("montarDepsTerritorio", () => {
  it("municipioDaCoordenada devolve o codigo do poligono que contem o ponto", async () => {
    const rpc = async () => ({ data: [{ municipio_codigo: "3304557" }], error: null });
    const deps = montarDepsTerritorio({ rpc } as never);
    expect(await deps.municipioDaCoordenada(-22.9, -43.2)).toBe("3304557");
  });

  it("municipioDaCoordenada devolve null quando nenhum poligono contem o ponto", async () => {
    const rpc = async () => ({ data: [], error: null });
    const deps = montarDepsTerritorio({ rpc } as never);
    expect(await deps.municipioDaCoordenada(-20.8, -41.9)).toBeNull();
  });

  it("municipioDaCoordenada devolve null quando a consulta erra -- deixa o fail-open pra validarTerritorio", async () => {
    const rpc = async () => ({ data: null, error: { message: "boom" } });
    const deps = montarDepsTerritorio({ rpc } as never);
    expect(await deps.municipioDaCoordenada(-22.9, -43.2)).toBeNull();
  });

  it("bairroDaCoordenada devolve localidade e distancia do vizinho mais proximo", async () => {
    const rpc = async () => ({ data: [{ localidade: "PARADA DE LUCAS", distancia_m: 0 }], error: null });
    const deps = montarDepsTerritorio({ rpc } as never);
    expect(await deps.bairroDaCoordenada(-22.811137, -43.297583)).toEqual({
      localidade: "PARADA DE LUCAS",
      distanciaM: 0,
    });
  });

  it("bairroDaCoordenada devolve null quando nao ha vizinho", async () => {
    const rpc = async () => ({ data: [], error: null });
    const deps = montarDepsTerritorio({ rpc } as never);
    expect(await deps.bairroDaCoordenada(-22.9, -43.2)).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/app/api/romaneio/geocode/territorio.test.ts
```

Esperado: FAIL — `Failed to resolve import "./territorio-deps"`.

- [ ] **Step 4: Criar as funções SQL e o adaptador**

Criar `scripts/migrations/contabo/081_funcoes_territorio.sql`. Duas funções, porque o cliente Supabase JS não executa SQL arbitrário:

```sql
-- Consultas territoriais expostas como RPC pro cliente Supabase da rota-ponte
-- (src/app/api/romaneio/geocode/route.ts). Ver
-- docs/superpowers/specs/2026-09-12-confiabilidade-kpi-nutrimax-design.md.
CREATE OR REPLACE FUNCTION municipio_da_coordenada(p_lat float8, p_lng float8)
RETURNS TABLE (municipio_codigo text)
LANGUAGE sql STABLE AS $$
  SELECT m.municipio_codigo
  FROM malha_municipios_rj m
  WHERE ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  LIMIT 1;
$$;

-- ORDER BY <-> com a expressao EXATAMENTE igual a do indice
-- cnefe_enderecos_geog_idx (migration 080), senao o planejador cai em Seq Scan
-- sobre 8,8M linhas.
CREATE OR REPLACE FUNCTION bairro_da_coordenada(p_lat float8, p_lng float8)
RETURNS TABLE (localidade text, distancia_m float8)
LANGUAGE sql STABLE AS $$
  SELECT c.localidade,
         ST_Distance(
           ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
         )
  FROM cnefe_enderecos c
  WHERE c.localidade IS NOT NULL
  ORDER BY ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
        <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT 1;
$$;
```

Aplicar e conferir que o plano usa o índice:

```bash
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -f /tmp/081.sql"
ssh transmonseg-vps "sudo -u postgres psql -d transmonseg -t -A -F'|' -c \"
SELECT * FROM bairro_da_coordenada(-22.811137, -43.297583);\""
```

Esperado: `PARADA DE LUCAS|0`.

Criar `src/app/api/romaneio/geocode/territorio-deps.ts`:

```ts
// Adaptador entre o cliente Supabase da rota e as deps puras de
// src/lib/territorio.ts. Toda falha de consulta vira null -- quem decide o que
// fazer com a ausencia de dado e' validarTerritorio, que e' fail-open.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DepsTerritorio } from "@/lib/territorio";

export function montarDepsTerritorio(admin: SupabaseClient): DepsTerritorio {
  return {
    async municipioDaCoordenada(lat, lng) {
      const { data, error } = await admin.rpc("municipio_da_coordenada", { p_lat: lat, p_lng: lng });
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const codigo = (data[0] as { municipio_codigo?: unknown }).municipio_codigo;
      return typeof codigo === "string" ? codigo : null;
    },
    async bairroDaCoordenada(lat, lng) {
      const { data, error } = await admin.rpc("bairro_da_coordenada", { p_lat: lat, p_lng: lng });
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const linha = data[0] as { localidade?: unknown; distancia_m?: unknown };
      if (typeof linha.localidade !== "string" || typeof linha.distancia_m !== "number") return null;
      return { localidade: linha.localidade, distanciaM: linha.distancia_m };
    },
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd "MONITORAMENTO transmonseg" && npx vitest run src/app/api/romaneio/geocode/territorio.test.ts
```

Esperado: 5 passando.

- [ ] **Step 6: Ligar na rota**

Em `src/app/api/romaneio/geocode/route.ts`:

Acrescentar aos imports:
```ts
import { validarTerritorio, type MotivoTerritorio } from "@/lib/territorio";
import { montarDepsTerritorio } from "./territorio-deps";
```

Depois da validação de `enderecos` no corpo (após o bloco `if (enderecos.length === 0)`), ler a flag:
```ts
  // Guarda territorial: OPT-IN. Rio Quality, Porte Frio e o motor de desvio
  // usam esta mesma rota e nao podem mudar de comportamento -- so' a geracao
  // do Nutry Max liga. Ver a secao "Nao-objetivos" da spec de 12/09.
  const validarTerritorioLigado = (body as { validarTerritorio?: unknown })?.validarTerritorio === true;
```

Trocar a declaração de `resultados` e o `push` final do laço:
```ts
  const resultados: ({ lat: number; lng: number; fonte: string; validado: boolean; motivo?: MotivoTerritorio } | null)[] = [];
  const depsTerritorio = montarDepsTerritorio(admin);
```

```ts
    if (!geocode) {
      resultados.push(null);
      continue;
    }
    let validado = geocode.validado;
    let motivo: MotivoTerritorio | undefined;
    if (validarTerritorioLigado) {
      const t = await validarTerritorio(
        { lat: geocode.lat, lng: geocode.lng },
        { municipioCodigo, bairro },
        depsTerritorio,
      );
      if (!t.ok) {
        validado = false;
        motivo = t.motivo;
      }
    }
    resultados.push({ lat: geocode.lat, lng: geocode.lng, fonte: geocode.fonte, validado, motivo });
```

`municipioCodigo` e `bairro` já existem no escopo do laço (linhas 340 e 347 do arquivo atual).

- [ ] **Step 7: Rodar a suíte inteira e o build**

```bash
cd "MONITORAMENTO transmonseg" && npm test && npm run build
```

Esperado: 953 passando, build limpo.

- [ ] **Step 8: Espelhar no TEMP e commitar**

---

### Task 6: CANCELADA no pre-flight

**Não implementar.** Esta task criava uma rota `POST /api/romaneio/municipio-codigo`
no monitoramento cuja única razão de existir era servir o script de auditoria da
Task 7, que o plano colocava no repo do KPI.

O pre-flight achou o defeito que a motivava: o script usava `new Client()` do
pacote `pg`, e o repo do KPI **não tem `pg`** nas dependências (só
`@supabase/supabase-js`) — o código não rodaria. A correção certa não é adicionar
`pg` ao KPI e manter o hop HTTP: é mover o script para o repo do monitoramento,
onde `pg` já existe (`^8.22.0`), os dois bancos são alcançáveis por connection
string, e `expandirCidadeTruncada`/`municipioCodigoIbge` podem ser importados
**direto** — que era exatamente o motivo declarado desta rota existir.

Ver "Ruling 1" no ledger. A numeração das demais tasks foi preservada de
propósito, para não invalidar as referências cruzadas já escritas.

---

### Task 7: Auditoria e marcação do cache existente

Depende das tasks 1, 2 e 5. Entrega o efeito imediato: os 100 erros conhecidos param de sustentar conclusão negativa.

**Atenção — revisado no pre-flight (Ruling 1).** O script vive no repo do
**monitoramento**, não no do KPI: lá o pacote `pg` já é dependência
(`^8.22.0`), os dois bancos são alcançáveis por connection string, e
`expandirCidadeTruncada`/`municipioCodigoIbge` são importados direto de
`@/lib/romaneio-geocode-local` em vez de por HTTP. A migration continua do lado
do KPI, que é dono da tabela.

**Files:**
- Create: `KPI transmonseg/supabase/migrations/20260912010000_geocode_cache_motivo.sql` (espelhar em `KPI TEMP`)
- Create: `MONITORAMENTO transmonseg/scripts/auditar-geocode-territorio.ts` (espelhar em `MONITORAMENTO TEMP`)

**Interfaces:**
- Consumes: funções SQL `municipio_da_coordenada` e `distancia_ao_bairro` (task 5 — `bairro_da_coordenada` foi superseded por `distancia_ao_bairro`/Task 4b, ver `src/lib/territorio.ts`; corrigido no fix wave 12/09, Finding 9); `expandirCidadeTruncada` e `municipioCodigoIbge` de `@/lib/romaneio-geocode-local` (já existentes).
- Produces: coluna `motivo text` em `kpi_romaneio_geocode_cache`, lida pela task 8.

- [ ] **Step 1: Escrever e aplicar a migration**

```sql
-- Achado real 12/09: marcar uma coordenada como nao confiavel resolve metade do
-- problema -- a outra metade e' a Ana saber POR QUE, pra decidir se conserta o
-- cadastro do cliente (endereco errado no romaneio) ou se e' erro nosso de
-- geocodificacao. Ver a secao "Triagem" da spec de 12/09.
--
-- Nullable de proposito: linha antiga nao tem motivo conhecido, e "sem motivo"
-- e' informacao diferente de "motivo vazio".
ALTER TABLE kpi_romaneio_geocode_cache
  ADD COLUMN IF NOT EXISTS motivo text;
```

```bash
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -f /tmp/motivo.sql"
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -c \"NOTIFY pgrst, 'reload schema';\""
```

O `NOTIFY` não é opcional: sem ele o PostgREST rejeita o upsert com "Could not find the 'motivo' column" — foi exatamente o que aconteceu com a coluna `confiavel` em 12/09.

- [ ] **Step 2: Escrever o script de auditoria**

Criar `scripts/auditar-geocode-territorio.ts`. Dois modos: dry-run (default, só relata) e `--aplicar`. Nunca marcar sem ver o relatório primeiro.

O script importa `validarTerritorio` de `@/lib/territorio` (tasks 3 e 4) em vez de reimplementar a comparação — mesma sede de lógica, mesmo comportamento coberto por `territorio.test.ts`. A resolução de código IBGE vem de `expandirCidadeTruncada` + `municipioCodigoIbge`, importados direto.

```ts
// Reaudita kpi_romaneio_geocode_cache contra as camadas territoriais e marca
// confiavel=false + motivo no que estiver fora do municipio ou do bairro.
//
// Achado real 12/09 (auditoria do KPI Nutry Max do dia 11/09): 304 enderecos
// outliers, 294 deles marcados confiavel=true; reverse geocode independente
// confirmou 100 em municipio errado. 26 NFs do dia 11/09 cairam nesses
// enderecos e 21 viraram "NAO FOI AO CLIENTE".
//
// Uso:
//   npx tsx scripts/auditar-geocode-territorio.ts            # dry-run
//   npx tsx scripts/auditar-geocode-territorio.ts --aplicar
import { Client } from "pg";
import { validarTerritorio } from "@/lib/territorio";
import { expandirCidadeTruncada, municipioCodigoIbge } from "@/lib/romaneio-geocode-local";

const RAIO_MAXIMO_VIZINHO_CNEFE_M = 300;
const MONITORAMENTO_URL = process.env.MONITORAMENTO_URL ?? "http://127.0.0.1:3010";

function normalizarBairro(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** "VIA, NUM - BAIRRO, CIDADE - complemento" -> bairro e cidade. */
function partesDoEndereco(e: string): { bairro: string | null; cidade: string | null } {
  const seg = e.split(" - ");
  if (seg.length < 2 || !seg[1].includes(",")) return { bairro: null, cidade: null };
  const i = seg[1].lastIndexOf(",");
  return { bairro: seg[1].slice(0, i).trim(), cidade: seg[1].slice(i + 1).trim() };
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const kpi = new Client({ connectionString: process.env.KPI_DATABASE_URL });
  const monit = new Client({ connectionString: process.env.MONITORAMENTO_DATABASE_URL });
  await kpi.connect();
  await monit.connect();
  try {
    const { rows } = await kpi.query<{ endereco: string; lat: number; lng: number }>(
      "SELECT endereco, lat, lng FROM kpi_romaneio_geocode_cache",
    );
    console.log(`cache: ${rows.length} enderecos`);

    // Mesmas deps que a rota-ponte usa, so' que por pg em vez de Supabase RPC.
    const deps = {
      async municipioDaCoordenada(lat: number, lng: number) {
        const r = await monit.query<{ municipio_codigo: string }>(
          "SELECT * FROM municipio_da_coordenada($1, $2)", [lat, lng],
        );
        return r.rows[0]?.municipio_codigo ?? null;
      },
      async bairroDaCoordenada(lat: number, lng: number) {
        const r = await monit.query<{ localidade: string; distancia_m: number }>(
          "SELECT * FROM bairro_da_coordenada($1, $2)", [lat, lng],
        );
        const v = r.rows[0];
        return v ? { localidade: v.localidade, distanciaM: v.distancia_m } : null;
      },
    };

    const marcar: { endereco: string; motivo: string }[] = [];
    for (const r of rows) {
      const { bairro, cidade } = partesDoEndereco(r.endereco);
      const municipioCodigo = cidade ? municipioCodigoIbge(expandirCidadeTruncada(cidade)) ?? null : null;
      const t = await validarTerritorio({ lat: r.lat, lng: r.lng }, { municipioCodigo, bairro }, deps);
      if (!t.ok) marcar.push({ endereco: r.endereco, motivo: t.motivo });
    }

    const porMotivo = marcar.reduce<Record<string, number>>((a, m) => {
      a[m.motivo] = (a[m.motivo] ?? 0) + 1;
      return a;
    }, {});
    console.log(`a marcar: ${marcar.length}`, porMotivo);
    for (const m of marcar.slice(0, 40)) console.log(`  ${m.motivo} | ${m.endereco.slice(0, 90)}`);

    if (!aplicar) {
      console.log("\ndry-run -- nada foi escrito. Rode com --aplicar pra gravar.");
      return;
    }
    for (const m of marcar) {
      await kpi.query(
        "UPDATE kpi_romaneio_geocode_cache SET confiavel = false, motivo = $2 WHERE endereco = $1",
        [m.endereco, m.motivo],
      );
    }
    console.log(`marcados: ${marcar.length}`);
  } finally {
    await kpi.end();
    await monit.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Rodar em dry-run e conferir contra a auditoria manual**

O dry-run precisa reencontrar os casos já verificados à mão. Conferir na saída:

- `AVENIDA VINTE DE JANEIRO, S/N - GALEAO, RIO DE JANEIRO - PSU 3 PISO EIXOS 2/6 LINHAS 4/C2` → `bairro_divergente`
- `ESTRADA DA PACIENCIA, 713 - PACIENCIA, RIO DE JANEIRO - *` → `municipio_divergente` (está em São Gonçalo)
- `EST DA PEDRA, 4900 - GUARATIBA, RIO DE JANEIRO - *` → `municipio_divergente` (está em Maricá)

Se algum dos três não aparecer, parar e investigar antes de aplicar. Se o total a marcar passar muito de ~400, também parar: a checagem de bairro pode estar gerando falso positivo por grafia, e marcar em massa degradaria coordenada boa.

- [ ] **Step 4: Aplicar e conferir**

```bash
npx tsx scripts/auditar-geocode-territorio.ts --aplicar
ssh transmonseg-vps "sudo -u postgres psql -d kpi_transmonseg -t -A -F'|' -c \"
SELECT motivo, count(*) FROM kpi_romaneio_geocode_cache WHERE confiavel = false GROUP BY 1;\""
```

- [ ] **Step 5: Espelhar no TEMP e commitar**

---

### Task 8: Propagar `motivo` até o relatório

**Files:**
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/geocode.ts` (tipo `ResultadoGeocode` linha 52; `validarResultado` linha 138; `buscarNoCache` linha 162; `salvarNoCache` linha 197; corpo do POST linha 264)
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/types.ts` (perto de `geoConfiavel`, linha 42)
- Modify: `KPI transmonseg/src/app/api/kpi/nutrimax/gerar/route.ts:149`
- Modify: `KPI transmonseg/scripts/gerar-nutrimax-real-arquivo.ts:56`
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/agregacao.ts` (o rótulo em `if (observacao == null && status === 'pendente' && !geoConfiavel ...)`)
- (espelhar tudo em `KPI TEMP`)

**Interfaces:**
- Consumes: campo `motivo` da resposta da ponte (task 5) e a coluna `motivo` (task 7).
- Produces: rótulo final no relatório.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/kpi-romaneio/agregacao.test.ts`, acrescentar dois casos ao lado dos que já cobrem `geoConfiavel`:

```ts
it('diz o motivo quando a coordenada caiu em outro municipio', () => {
  const linhas = [linhaBase({ geoConfiavel: false, geoMotivo: 'municipio_divergente' })]
  const r = agregarPorCarga(linhas, /* demais args iguais aos testes vizinhos */)
  expect(r[0].itens[0].observacao).toBe(
    'ENDEREÇO COM COORDENADA IMPRECISA - COORDENADA CAIU EM OUTRO MUNICÍPIO - CONFERIR CADASTRO',
  )
})

it('diz o motivo quando a coordenada caiu em outro bairro', () => {
  const linhas = [linhaBase({ geoConfiavel: false, geoMotivo: 'bairro_divergente' })]
  const r = agregarPorCarga(linhas, /* demais args iguais aos testes vizinhos */)
  expect(r[0].itens[0].observacao).toBe(
    'ENDEREÇO COM COORDENADA IMPRECISA - COORDENADA CAIU EM OUTRO BAIRRO - CONFERIR CADASTRO',
  )
})
```

Copiar a forma exata da chamada de `agregarPorCarga` e do helper de linha dos testes já existentes no arquivo — não inventar assinatura.

O teste do rótulo genérico que já existe (`'ENDEREÇO COM COORDENADA IMPRECISA - CONFERIR CADASTRO (não dá pra afirmar se foi ou não)'`) deve continuar passando sem alteração, para o caso sem motivo.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/agregacao.test.ts
```

Esperado: FAIL — os dois casos novos recebem o rótulo genérico.

- [ ] **Step 3: Implementar a propagação**

`src/lib/kpi-romaneio/geocode.ts`:

```ts
export type ResultadoGeocode = { lat: number; lng: number; fonte?: string; confiavel: boolean; motivo?: string } | null
```

Em `validarResultado`, depois de ler `fonte`:
```ts
    const motivo = typeof (r as { motivo?: unknown }).motivo === 'string' ? (r as { motivo: string }).motivo : undefined
```
e incluir `motivo` no objeto retornado.

Em `buscarNoCache`: `.select('endereco, lat, lng, fonte, confiavel, motivo')` e `motivo: (row as { motivo?: string | null }).motivo ?? undefined` no objeto montado; ajustar as duas anotações de tipo do `Map` na assinatura e na inicialização.

Em `salvarNoCache`, no `.map`: `motivo: x.resultado.motivo ?? null`.

No corpo do POST (linha 264): `body: JSON.stringify({ enderecos, validarTerritorio: true })`.

Essa é a única linha que liga a guarda. Rio Quality e Porte Frio chegam aqui pela mesma função — o que significa que eles **também** passariam a validar. Para respeitar o escopo decidido, `geocodificarEnderecos` ganha um parâmetro:

```ts
export async function geocodificarEnderecos(
  enderecos: string[],
  opcoes: { validarTerritorio?: boolean } = {},
): Promise<ResultadoGeocode[]>
```

que atravessa até `geocodificarLote`. Só `src/app/api/kpi/nutrimax/gerar/route.ts:144` e `scripts/gerar-nutrimax-real-arquivo.ts:52` passam `{ validarTerritorio: true }`. `src/app/api/kpi/portefrio/gerar/route.ts:59` e `src/lib/kpi-rioquality/pipeline.ts:106` ficam como estão.

`src/lib/kpi-romaneio/types.ts`, junto de `geoConfiavel`:
```ts
  /** Por que geoConfiavel e' false -- "municipio_divergente" |
   *  "bairro_divergente". Ausente quando a coordenada e' confiavel ou quando a
   *  suspeita veio de outra origem (fonte cnefe_bairro). */
  geoMotivo?: string
```

Nas duas linhas de montagem da linha geocodificada (`gerar/route.ts:149` e `gerar-nutrimax-real-arquivo.ts:56`), acrescentar `geoMotivo: g?.motivo`.

`src/lib/kpi-romaneio/agregacao.ts`, no bloco do rótulo:
```ts
    if (observacao == null && status === 'pendente' && !geoConfiavel && linha.lat != null) {
      // O motivo importa pra triagem: "outro municipio" quase sempre e' erro de
      // geocodificacao nossa; "outro bairro" pode ser cadastro errado do cliente
      // no romaneio. Ver a secao "Triagem" da spec de 12/09.
      const detalhe =
        linha.geoMotivo === 'municipio_divergente' ? 'COORDENADA CAIU EM OUTRO MUNICÍPIO'
        : linha.geoMotivo === 'bairro_divergente' ? 'COORDENADA CAIU EM OUTRO BAIRRO'
        : null
      observacao = detalhe
        ? `ENDEREÇO COM COORDENADA IMPRECISA - ${detalhe} - CONFERIR CADASTRO`
        : 'ENDEREÇO COM COORDENADA IMPRECISA - CONFERIR CADASTRO (não dá pra afirmar se foi ou não)'
    }
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/agregacao.test.ts
```

- [ ] **Step 5: Rodar a suíte inteira e o build**

```bash
cd "KPI transmonseg" && npm test && npm run build
```

Esperado: 1008 passando, build limpo.

- [ ] **Step 6: Espelhar no TEMP e commitar**

---

### Task 9: Rótulo para cliente sem acesso rodoviário

A spec, seção "Triagem": nove NFs na Vila do Abraão (Ilha Grande) saem como falha todo dia, e não são erro nosso nem do cliente — só se chega lá de barco. Conferi as 22 entradas do cache: as coordenadas estão certas. A placa RBG-2D21 chegou no máximo a 11 km, passando pela costa a 75 km/h. Contar isso como "NÃO FOI AO CLIENTE" polui a triagem da Ana todo dia com o mesmo caso conhecido.

**Files:**
- Create: `KPI transmonseg/src/lib/kpi-romaneio/acesso-restrito.ts`
- Create: `KPI transmonseg/src/lib/kpi-romaneio/acesso-restrito.test.ts`
- Modify: `KPI transmonseg/src/lib/kpi-romaneio/agregacao.ts` (mesmo bloco de rótulo da task 8)
- (espelhar em `KPI TEMP`)

**Interfaces:**
- Consumes: `LinhaGeocodificada` de `./types`.
- Produces:
  ```ts
  export function acessoSomentePorBarco(endereco: string): boolean;
  ```

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/kpi-romaneio/acesso-restrito.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { acessoSomentePorBarco } from "./acesso-restrito";

describe("acessoSomentePorBarco", () => {
  it("reconhece Vila do Abraão na Ilha Grande", () => {
    expect(acessoSomentePorBarco("RUA SANTANA, 58 - VILA DO ABRAAO ILHA GRANDE, ANGRA DOS REIS - PARTE")).toBe(true);
  });

  it("reconhece a grafia com acento e parenteses", () => {
    expect(acessoSomentePorBarco("RUA PROFESSORA ALICE KURY DA SILVA, S/N - VILA DO ABRAÃO (ILHA GRANDE), ANGRA DOS REIS - CD IGREJA")).toBe(true);
  });

  it("reconhece o bairro escrito so como ILHA GRANDE", () => {
    expect(acessoSomentePorBarco("AV NACIB MONTEIRO DE QUEIROZ, 20 - ILHA GRANDE, ANGRA DOS REIS - *")).toBe(true);
  });

  it("nao marca endereco continental de Angra", () => {
    expect(acessoSomentePorBarco("RUA DO COMERCIO, 100 - CENTRO, ANGRA DOS REIS - *")).toBe(false);
  });

  it("nao marca ILHA em nome de rua no continente", () => {
    // Caso real do cache: ESTRADA DA ILHA fica em Guaratiba, Rio de Janeiro --
    // acesso rodoviario normal. So' o par bairro+cidade decide, nunca a
    // presenca da palavra "ilha" no endereco.
    expect(acessoSomentePorBarco("ESTRADA DA ILHA, 4528 - GUARATIBA, RIO DE JANEIRO - *")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/acesso-restrito.test.ts
```

Esperado: FAIL — `Failed to resolve import "./acesso-restrito"`.

- [ ] **Step 3: Implementar**

```ts
// Clientes que nao tem acesso rodoviario. Nao e' erro de geocodificacao nem
// cadastro errado do cliente: o caminhao genuinamente nao chega la.
//
// Achado real 12/09 (auditoria do dia 11/09): 9 NFs na Vila do Abraao, Ilha
// Grande. As 22 entradas do cache para la tem coordenada CERTA -- conferido
// contra fonte independente. A placa RBG-2D21 chegou no maximo a 11 km, pela
// costa, a 75 km/h, sem parar. Contar como "NAO FOI AO CLIENTE" todo dia enche
// a lista de triagem com o mesmo caso ja conhecido.
//
// Lista explicita em vez de heuristica: "ilha" no nome do endereco nao quer
// dizer nada (ESTRADA DA ILHA fica em Guaratiba, com acesso rodoviario
// normal). So' o par bairro+cidade decide.
//
// A Ilha da Gigoia (Barra da Tijuca) NAO entra aqui ainda: la a coordenada
// tambem esta errada (22.792 m), entao o caso e' duplo e precisa ser
// reavaliado depois que a task 7 marcar o endereco. Ver "Triagem" na spec.

const BAIRROS_SEM_ACESSO_RODOVIARIO: { bairro: RegExp; cidade: RegExp }[] = [
  { bairro: /\b(VILA DO ABRAAO|ABRAAO|ILHA GRANDE)\b/, cidade: /\bANGRA DOS REIS\b/ },
];

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "VIA, NUM - BAIRRO, CIDADE - complemento" -> o par bairro+cidade esta na
 *  lista de acesso so' por barco? */
export function acessoSomentePorBarco(endereco: string): boolean {
  const seg = endereco.split(" - ");
  if (seg.length < 2 || !seg[1].includes(",")) return false;
  const i = seg[1].lastIndexOf(",");
  const bairro = normalizar(seg[1].slice(0, i));
  const cidade = normalizar(seg[1].slice(i + 1));
  return BAIRROS_SEM_ACESSO_RODOVIARIO.some((r) => r.bairro.test(bairro) && r.cidade.test(cidade));
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "KPI transmonseg" && npx vitest run src/lib/kpi-romaneio/acesso-restrito.test.ts
```

Esperado: 5 passando.

- [ ] **Step 5: Escrever o teste do rótulo em agregacao**

Em `src/lib/kpi-romaneio/agregacao.test.ts`, ao lado dos casos da task 8:

```ts
it('marca cliente sem acesso rodoviario em vez de "nao foi ao cliente"', () => {
  const linhas = [linhaBase({
    endereco: 'RUA SANTANA, 58 - VILA DO ABRAAO ILHA GRANDE, ANGRA DOS REIS - PARTE',
    lat: -23.141789, lng: -44.167027, geoConfiavel: true,
  })]
  // demais args iguais aos testes vizinhos, com a placa longe do ponto
  const r = agregarPorCarga(linhas, /* ... */)
  expect(r[0].itens[0].observacao).toBe('CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO')
})
```

Copiar a forma exata da chamada e do helper dos testes já existentes no arquivo.

- [ ] **Step 6: Ligar em agregacao.ts**

No mesmo bloco de rótulo da task 8, **antes** da checagem de `geoConfiavel` (uma coordenada correta numa ilha não é imprecisa, e o rótulo de ilha é mais informativo que o de "não foi ao cliente"):

```ts
    if (observacao == null && status === 'pendente' && acessoSomentePorBarco(linha.endereco)) {
      observacao = 'CLIENTE SEM ACESSO RODOVIÁRIO (ILHA) - CONFERIR COM A OPERAÇÃO'
    }
```

Conferir o nome real do campo de endereço em `LinhaGeocodificada` (`src/lib/kpi-romaneio/types.ts`) antes de escrever — se não for `endereco`, usar o que estiver lá.

- [ ] **Step 7: Rodar a suíte inteira e o build**

```bash
cd "KPI transmonseg" && npm test && npm run build
```

Esperado: 1014 passando (1008 depois da task 8, mais 5 de `acesso-restrito.test.ts` e 1 de `agregacao.test.ts`), build limpo.

- [ ] **Step 8: Espelhar no TEMP e commitar**

---

### Task 10: Deploy e medição

**Files:** nenhum de código.

**Interfaces:**
- Consumes: tudo acima.
- Produces: o número que justifica (ou derruba) a Fase 1.

- [ ] **Step 1: Deploy dos dois serviços**

```bash
ssh transmonseg-vps "cd /srv/transmonseg/definitivo && git pull && npm run build && pm2 restart transmonseg-definitivo"
ssh transmonseg-vps "cd /srv/kpi-transmonseg && git pull && npm run build && pm2 restart kpi-transmonseg"
```

- [ ] **Step 2: Regerar 09, 10 e 11/09 internamente**

Usar `scripts/gerar-nutrimax-real-arquivo.ts` para os três dias. **Nada disso vai para o cliente** — a spec é explícita, os dias já enviados são reprocessados só para medir.

- [ ] **Step 3: Comparar contra o emitido**

Para cada dia, tabular a contagem por status antes e depois. Baseline do dia 11/09, extraída do arquivo que a Ana publicou no grupo às 07:25 de 12/09:

| Status | 11/09 emitido |
|---|---|
| CONFIRMADO (GPS) | 1720 |
| SEM CONFIRMAÇÃO | 161 |
| ENTREGUE - PARADA PRÓXIMA (500-800m) | 126 |
| NÃO FOI AO CLIENTE | 109 |
| PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA | 51 |
| ENDEREÇO COM COORDENADA IMPRECISA | 27 |
| ENTREGUE - PARADA COMPARTILHADA | 10 |
| CARGA TRANSFERIDA (todas as placas) | 18 |
| TEMPO EM LOJA ACIMA DE 4H | 1 |

Expectativa: "NÃO FOI AO CLIENTE" cai de 109 para perto de 80 — as 21 NFs em coordenada de município comprovadamente errado migram para o rótulo de coordenada imprecisa (agora com motivo), e as da Vila do Abraão migram para o rótulo de acesso rodoviário. "ENDEREÇO COM COORDENADA IMPRECISA" sobe na mesma medida. O total de confirmadas **não deve mudar** nesta fase — a Fase 1 não mexe em confirmação.

Se o número de confirmadas mudar, algo saiu do escopo: investigar antes de seguir.

- [ ] **Step 4: Escrever o resultado no fim da spec**

Acrescentar uma seção "Resultado medido — Fase 1" ao arquivo da spec, com a tabela antes/depois dos três dias. É o insumo da conversa com a Érica sobre o número, e a linha de base da Fase 2.

- [ ] **Step 5: Commitar**

---

## Fora do escopo desta fase

- Exigência de velocidade nas paradas da API Unitrac (Fase 2).
- Uma parada deixar de confirmar N notas de endereços colapsados (Fase 2).
- Recuperar os 12 falsos negativos (Fase 2).
- A contradição Unitrac × GPS em nove NFs — ver "Em aberto" na spec. Precisa de consulta direta à API da Unitrac e pode ser mais grave que tudo acima, mas não bloqueia esta fase.
