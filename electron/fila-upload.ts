/**
 * Fila de upload dos KPIs gerados offline.
 *
 * Cada geração grava os buffers (.xlsx/.pdf) + um manifesto .json em
 * `userData/fila/`, com status `pendente`. Quando há internet, `sincronizarFila`
 * sobe os pendentes pro bucket `kpis-gerados` do Supabase e marca `enviado`.
 *
 * Single-writer (um operador) → sem conflito; a fila só faz APPEND/upsert. Nada
 * é perdido se cair a internet: fica `pendente` e sobe na próxima sincronização.
 */
import { app } from 'electron'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { supaConfig } from './cadastro'
import type { SaidaRede } from '@/lib/kpi/gerar-kpi-local'

const BUCKET = 'kpis-gerados'

type ItemFila = {
  id: string
  data: string
  rede_id: string
  rede_nome: string
  linhas: number
  status: 'pendente' | 'enviado'
  criadoEm: string
  enviadoEm?: string
  erro?: string
}

function filaDir(): string {
  return path.join(app.getPath('userData'), 'fila')
}

function safeId(data: string, rede_id: string): string {
  return `${data}__${rede_id}`.replace(/[^A-Za-z0-9_.-]/g, '_')
}

/** Enfileira os XLSX/PDF gerados (status `pendente`). */
export async function enfileirarSaidas(data: string, saidas: SaidaRede[]): Promise<void> {
  await mkdir(filaDir(), { recursive: true })
  for (const s of saidas) {
    const id = safeId(data, s.rede_id)
    await writeFile(path.join(filaDir(), `${id}.xlsx`), s.xlsx)
    await writeFile(path.join(filaDir(), `${id}.pdf`), s.pdf)
    const item: ItemFila = {
      id,
      data,
      rede_id: s.rede_id,
      rede_nome: s.rede_nome,
      linhas: s.linhas,
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    }
    await writeFile(path.join(filaDir(), `${id}.json`), JSON.stringify(item), 'utf8')
  }
}

async function lerManifestos(): Promise<ItemFila[]> {
  let nomes: string[]
  try {
    nomes = await readdir(filaDir())
  } catch {
    return []
  }
  const itens: ItemFila[] = []
  for (const n of nomes) {
    if (!n.endsWith('.json')) continue
    try {
      itens.push(JSON.parse(await readFile(path.join(filaDir(), n), 'utf8')) as ItemFila)
    } catch {
      /* manifesto corrompido — ignora */
    }
  }
  return itens.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
}

/** Lista a fila (pendentes + enviados) pra UI. */
export async function listarFila(): Promise<ItemFila[]> {
  return lerManifestos()
}

async function uploadObjeto(
  cfg: { url: string; key: string },
  objPath: string,
  body: Buffer,
  mime: string,
): Promise<void> {
  const r = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${objPath}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: new Uint8Array(body),
  })
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 160)}`)
}

/** Sobe os pendentes pro Supabase (se online). Retorna o resumo. */
export async function sincronizarFila(): Promise<{ ok: boolean; enviados: number; pendentes: number; motivo?: string }> {
  const cfg = supaConfig()
  const itens = await lerManifestos()
  const pendentes = itens.filter((i) => i.status === 'pendente')
  if (!cfg) return { ok: false, enviados: 0, pendentes: pendentes.length, motivo: 'Sem URL/chave do Supabase.' }

  let enviados = 0
  for (const item of pendentes) {
    try {
      const xlsx = await readFile(path.join(filaDir(), `${item.id}.xlsx`))
      const pdf = await readFile(path.join(filaDir(), `${item.id}.pdf`))
      const baseObj = `${item.data}/KPI-${item.rede_id}-${item.data}`
      await uploadObjeto(cfg, `${baseObj}.xlsx`, xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      await uploadObjeto(cfg, `${baseObj}.pdf`, pdf, 'application/pdf')
      const atualizado: ItemFila = { ...item, status: 'enviado', enviadoEm: new Date().toISOString(), erro: undefined }
      await writeFile(path.join(filaDir(), `${item.id}.json`), JSON.stringify(atualizado), 'utf8')
      enviados++
    } catch (e) {
      // Provavelmente offline — para e tenta tudo de novo na próxima.
      const msg = e instanceof Error ? e.message : String(e)
      const comErro: ItemFila = { ...item, erro: msg }
      await writeFile(path.join(filaDir(), `${item.id}.json`), JSON.stringify(comErro), 'utf8')
      return { ok: false, enviados, pendentes: pendentes.length - enviados, motivo: msg }
    }
  }
  return { ok: true, enviados, pendentes: pendentes.length - enviados }
}
