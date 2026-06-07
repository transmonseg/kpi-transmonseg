/**
 * Snapshot LOCAL do cadastro (lojas + frota), pro KPI rodar offline.
 *
 * - Quando há internet: baixa `lojas` (ativo) + `veiculos` (ativo) do Supabase e
 *   grava `cadastro.json` em `userData`.
 * - Offline: `gerarKpiLocal` usa o último snapshot baixado.
 *
 * A chave do Supabase é lida do ENV em runtime (nunca embutida no código): o
 * `.env.local` do repo em dev, ou variáveis no ambiente do operador em produção.
 * Sem chave/sem internet → mantém o cache (degrada com elegância).
 */
import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { LojaRow } from '@/lib/kpi/matcher'
import type { CadastroLocal } from '@/lib/kpi/gerar-kpi-local'

type Snapshot = CadastroLocal & { baixadoEm: string }

function cadastroPath(): string {
  return path.join(app.getPath('userData'), 'cadastro.json')
}

export function supaConfig(): { url: string; key: string } | null {
  const url = process.env.KPI_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  // Prefere uma chave com leitura plena do cadastro (service/own); cai no anon.
  const key =
    process.env.KPI_SUPABASE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

const LOJA_COLS =
  'id,rede_id,nome,nome_normalizado,codigo_escala,codigo_unitrac,nome_unitrac,lat,lng,raio_metros,endereco,bairro,municipio,numero'

type LojaApi = Partial<Record<keyof LojaRow, unknown>>

function mapLoja(l: LojaApi): LojaRow {
  return {
    id: String(l.id ?? ''),
    rede_id: String(l.rede_id ?? ''),
    nome: (l.nome as string) ?? '',
    nome_normalizado: (l.nome_normalizado as string) ?? '',
    codigo_escala: (l.codigo_escala as string | null) ?? null,
    codigo_unitrac: (l.codigo_unitrac as string | null) ?? null,
    nome_unitrac: (l.nome_unitrac as string | null) ?? null,
    lat: (l.lat as number | null) ?? null,
    lng: (l.lng as number | null) ?? null,
    raio_metros: (l.raio_metros as number | null) ?? 150,
    endereco: (l.endereco as string | null) ?? null,
    bairro: (l.bairro as string | null) ?? null,
    municipio: (l.municipio as string | null) ?? null,
    numero: (l.numero as string | null) ?? null,
  }
}

async function fetchAll(url: string, key: string, pathQ: string): Promise<unknown[]> {
  const out: unknown[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1
    const r = await fetch(`${url}/rest/v1/${pathQ}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${to}` },
    })
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 160)}`)
    const batch = (await r.json()) as unknown[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

/** Baixa o cadastro se houver internet+chave; senão mantém o cache. */
export async function atualizarCadastroSeOnline(): Promise<{ ok: boolean; motivo?: string; lojas?: number }> {
  const cfg = supaConfig()
  if (!cfg) return { ok: false, motivo: 'Sem URL/chave do Supabase no ambiente.' }
  try {
    const [lojasRaw, veicRaw] = await Promise.all([
      fetchAll(cfg.url, cfg.key, `lojas?select=${LOJA_COLS}&ativo=eq.true&order=id`),
      fetchAll(cfg.url, cfg.key, `veiculos?select=placa_norm&ativo=eq.true`),
    ])
    const snap: Snapshot = {
      baixadoEm: new Date().toISOString(),
      lojas: (lojasRaw as LojaApi[]).map(mapLoja),
      veiculos: (veicRaw as { placa_norm: string }[])
        .filter((v) => v.placa_norm)
        .map((v) => ({ placa_norm: String(v.placa_norm) })),
    }
    await mkdir(path.dirname(cadastroPath()), { recursive: true })
    await writeFile(cadastroPath(), JSON.stringify(snap), 'utf8')
    return { ok: true, lojas: snap.lojas.length }
  } catch (e) {
    // Offline ou erro de rede → segue com o cache existente.
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/** Lê o snapshot local; se não existir, devolve cadastro vazio (KPI ainda gera). */
export async function carregarCadastroLocal(): Promise<CadastroLocal> {
  try {
    const raw = await readFile(cadastroPath(), 'utf8')
    const snap = JSON.parse(raw) as Snapshot
    return { lojas: snap.lojas ?? [], veiculos: snap.veiculos ?? [] }
  } catch {
    return { lojas: [], veiculos: [] }
  }
}

/** Metadados do snapshot pra UI (quando baixou, quantas lojas). */
export async function statusCadastro(): Promise<{ baixadoEm: string | null; lojas: number; veiculos: number }> {
  try {
    const raw = await readFile(cadastroPath(), 'utf8')
    const snap = JSON.parse(raw) as Snapshot
    return { baixadoEm: snap.baixadoEm ?? null, lojas: snap.lojas?.length ?? 0, veiculos: snap.veiculos?.length ?? 0 }
  } catch {
    return { baixadoEm: null, lojas: 0, veiculos: 0 }
  }
}
