/**
 * Sobe todas as escalas do dia 25 (ZS/ARMAZEM/PAX/GERAL) — único dia
 * que não havia sido importado. 213 placas dependem disso.
 */
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaPax } from '@/lib/parsers/escala-pax'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import type { LinhaEscala } from '@/lib/types/escala'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

type Tipo = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO'

const DIA25: Array<{ tipo: Tipo; arquivo: string }> = [
  { tipo: 'GERAL',        arquivo: 'docs/conversas-tia-erica/dia-25/escalas/ESCALA GERAL DE MAIO 0 (2).xlsx' },
  { tipo: 'PAX',          arquivo: 'docs/conversas-tia-erica/dia-25/escalas/ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (7).xlsx' },
  { tipo: 'ARMAZEM_GRAO', arquivo: 'docs/conversas-tia-erica/dia-25/escalas/ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx' },
  { tipo: 'ZONA_SUL',     arquivo: 'docs/conversas-tia-erica/dia-25/escalas/ESCALA ZONA SUL - MAIO (9).xlsx' },
]

const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')
function clean<T>(v: T): T {
  if (typeof v === 'string') return v.replace(CONTROL_CHARS_RE, '') as T
  if (v == null) return v
  if (Array.isArray(v)) return v.map(clean) as T
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = clean(val)
    }
    return out as T
  }
  return v
}

async function parseArquivo(tipo: Tipo, buf: Buffer, data: string): Promise<LinhaEscala[]> {
  if (tipo === 'GERAL') return parseEscalaGeral(buf, data)
  if (tipo === 'ZONA_SUL') return parseEscalaZonaSul(buf, data)
  if (tipo === 'PAX') return parseEscalaPax(buf, data)
  if (tipo === 'ARMAZEM_GRAO') return parseEscalaArmazemGrao(buf, data)
  throw new Error(`Tipo desconhecido: ${tipo}`)
}

async function subir(tipo: Tipo, arquivo: string): Promise<{ ok: boolean; linhas: number; erro?: string }> {
  const data = '2026-05-25'

  if (!existsSync(arquivo)) {
    return { ok: false, linhas: 0, erro: `Arquivo não encontrado: ${arquivo}` }
  }

  let linhas: LinhaEscala[]
  try {
    const buf = readFileSync(arquivo)
    linhas = await parseArquivo(tipo, buf, data)
  } catch (e: any) {
    return { ok: false, linhas: 0, erro: `Erro ao parsear: ${e.message}` }
  }

  if (linhas.length === 0) {
    return { ok: false, linhas: 0, erro: 'Parser não retornou linhas' }
  }

  const { data: existente } = await sb
    .from('escala_uploads')
    .select('id')
    .eq('data_escala', data)
    .eq('tipo', tipo)
    .maybeSingle()

  if (existente) {
    await sb.from('escala_uploads').delete().eq('id', existente.id)
  }

  const { data: upload, error: uploadErr } = await sb
    .from('escala_uploads')
    .insert({
      data_escala: data,
      tipo,
      arquivo_path: arquivo,
      nome_arquivo: arquivo.split('/').pop()!,
      qtd_linhas: linhas.length,
      status: 'processado',
      processado_em: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (uploadErr || !upload) {
    return { ok: false, linhas: 0, erro: `INSERT upload falhou: ${uploadErr?.message}` }
  }

  const sanitizeStr = (s: string | null | undefined) =>
    s == null ? null : s.replace(CONTROL_CHARS_RE, '')

  const rows = linhas.map((l: any) => ({
    escala_upload_id: upload.id,
    rede_id: l.rede_id,
    sub_rede: l.sub_rede,
    loja_nome_raw: sanitizeStr(l.loja_nome_raw),
    loja_codigo_raw: sanitizeStr(l.loja_codigo_raw),
    placa_norm: sanitizeStr(l.placa_norm),
    placa_raw: sanitizeStr(l.placa_raw),
    motorista_nome: sanitizeStr(l.motorista_nome),
    motorista_codigo: sanitizeStr(l.motorista_codigo),
    tipo_carro: sanitizeStr(l.tipo_carro),
    carro_ordem: l.carro_ordem,
    turno: l.turno,
    obs: sanitizeStr(l.obs),
    restricao: sanitizeStr(l.restricao),
    peso_kg: l.peso_kg,
    paletes: l.paletes,
    data_entrega: l.data_entrega,
    raw_row_num: l.raw_row_num,
    raw_json: clean(l),
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await sb.from('escala_linhas').insert(batch)
    if (error) {
      await sb.from('escala_uploads').delete().eq('id', upload.id)
      return { ok: false, linhas: 0, erro: `INSERT linhas falhou: ${error.message}` }
    }
  }

  return { ok: true, linhas: linhas.length }
}

;(async () => {
  console.log(`Subindo escalas dia 25 (${DIA25.length} arquivos)...\n`)
  let totais = 0
  for (const f of DIA25) {
    process.stdout.write(`  ${f.tipo.padEnd(12)} ${f.arquivo.slice(-60).padEnd(62)} ... `)
    const r = await subir(f.tipo, f.arquivo)
    if (r.ok) {
      console.log(`✓ ${r.linhas} linhas`)
      totais += r.linhas
    } else {
      console.log(`✗ ${r.erro}`)
    }
  }
  console.log(`\nTotal: ${totais} linhas inseridas dia 25`)
})()
