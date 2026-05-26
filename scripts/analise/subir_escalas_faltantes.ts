/**
 * Sobe escalas faltantes (ZS/ARMAZEM/PAX/GUANABARA/GERAL dias 18-21) diretamente
 * pro banco, parseando local + INSERT em escala_uploads + escala_linhas.
 *
 * Bypassa a API /upload pq exige auth e storage. Faz exatamente o mesmo que
 * src/app/api/escalas/upload/route.ts faz no final.
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

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

type Tipo = 'GERAL' | 'ZONA_SUL' | 'PAX' | 'ARMAZEM_GRAO' | 'GUANABARA'

const FALTANTES: Array<{ dia: string; tipo: Tipo; arquivo: string }> = [
  { dia: '18', tipo: 'GUANABARA',    arquivo: 'ESCALA 18.04 (1).pdf' },
  { dia: '18', tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx' },
  { dia: '18', tipo: 'PAX',          arquivo: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (5).xlsx' },
  { dia: '18', tipo: 'ZONA_SUL',     arquivo: 'ESCALA ZONA SUL - MAIO (6).xlsx' },
  { dia: '19', tipo: 'PAX',          arquivo: 'ESCALA - PAX , FEIRA NOVA , EMANUEL.xlsx' },
  { dia: '19', tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx' },
  { dia: '19', tipo: 'ZONA_SUL',     arquivo: 'ESCALA ZONA SUL - MAIO (6).xlsx' },
  { dia: '20', tipo: 'GUANABARA',    arquivo: 'ESCALA 21.pdf' }, // nome confuso mas é dia 20
  { dia: '20', tipo: 'GERAL',        arquivo: 'ESCALA GERAL DE MAIO 1 (7).xlsx' },
  { dia: '20', tipo: 'PAX',          arquivo: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx' },
  { dia: '20', tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx' },
  { dia: '21', tipo: 'ARMAZEM_GRAO', arquivo: 'ESCALA DO ARMAZÉM DO GRÃO MAIO (6).xlsx' },
  { dia: '21', tipo: 'PAX',          arquivo: 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (6).xlsx' },
  { dia: '21', tipo: 'ZONA_SUL',     arquivo: 'ESCALA ZONA SUL - MAIO (7).xlsx' },
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
  if (tipo === 'GUANABARA') {
    const { parseEscalaGuanabaraPdf } = await import('@/lib/parsers/escala-guanabara-pdf')
    return parseEscalaGuanabaraPdf(buf, data)
  }
  throw new Error(`Tipo desconhecido: ${tipo}`)
}

async function subir(dia: string, tipo: Tipo, arquivo: string): Promise<{ ok: boolean; linhas: number; erro?: string }> {
  const data = `2026-05-${dia.padStart(2, '0')}`
  const path = `${BASE}/ESCALA DIA ${dia}/${arquivo}`

  if (!existsSync(path)) {
    return { ok: false, linhas: 0, erro: `Arquivo não encontrado: ${path}` }
  }

  let linhas: LinhaEscala[]
  try {
    const buf = readFileSync(path)
    linhas = await parseArquivo(tipo, buf, data)
  } catch (e: any) {
    return { ok: false, linhas: 0, erro: `Erro ao parsear: ${e.message}` }
  }

  if (linhas.length === 0) {
    return { ok: false, linhas: 0, erro: 'Parser não retornou linhas' }
  }

  // Sobrescreve upload anterior do mesmo dia/tipo
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
      arquivo_path: path,
      nome_arquivo: arquivo,
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

  // Insere em batches de 500
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
  console.log(`Subindo ${FALTANTES.length} escalas faltantes...\n`)
  let totais = 0
  for (const f of FALTANTES) {
    process.stdout.write(`  ${f.dia} ${f.tipo.padEnd(12)} ${f.arquivo.slice(0, 50).padEnd(52)} ... `)
    const r = await subir(f.dia, f.tipo, f.arquivo)
    if (r.ok) {
      console.log(`✓ ${r.linhas} linhas`)
      totais += r.linhas
    } else {
      console.log(`✗ ${r.erro}`)
    }
  }
  console.log(`\nTotal: ${totais} linhas inseridas`)
})()
