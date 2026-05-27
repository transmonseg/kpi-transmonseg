import { readFileSync, readdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

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

;(async () => {
  const dia = '20'
  const data = '2026-05-20'
  const pasta = `${BASE}/ESCALA DIA ${dia}`
  const files = readdirSync(pasta)
  const arm = files.find(f => /ARMAZ/i.test(f) && /GR/i.test(f) && f.endsWith('.xlsx'))
  if (!arm) { console.log('Não achei arquivo ARMAZEM'); return }
  console.log('Arquivo encontrado:', arm)

  const buf = readFileSync(`${pasta}/${arm}`)
  const linhas = await parseEscalaArmazemGrao(buf, data)
  console.log(`Parser retornou ${linhas.length} linhas`)
  if (linhas.length === 0) { console.log('Sem linhas pra inserir'); return }

  const { data: existente } = await sb.from('escala_uploads')
    .select('id').eq('data_escala', data).eq('tipo', 'ARMAZEM_GRAO').maybeSingle()
  if (existente) await sb.from('escala_uploads').delete().eq('id', existente.id)

  const { data: upload, error: ue } = await sb.from('escala_uploads').insert({
    data_escala: data, tipo: 'ARMAZEM_GRAO', arquivo_path: `${pasta}/${arm}`,
    nome_arquivo: arm, qtd_linhas: linhas.length, status: 'processado',
    processado_em: new Date().toISOString(),
  }).select('id').single()
  if (ue || !upload) { console.log('erro upload:', ue?.message); return }

  const rows = linhas.map((l: any) => ({
    escala_upload_id: upload.id, rede_id: l.rede_id, sub_rede: l.sub_rede,
    loja_nome_raw: l.loja_nome_raw, loja_codigo_raw: l.loja_codigo_raw,
    placa_norm: l.placa_norm, placa_raw: l.placa_raw,
    motorista_nome: l.motorista_nome, motorista_codigo: l.motorista_codigo,
    tipo_carro: l.tipo_carro, carro_ordem: l.carro_ordem, turno: l.turno,
    obs: l.obs, restricao: l.restricao, peso_kg: l.peso_kg, paletes: l.paletes,
    data_entrega: l.data_entrega, raw_row_num: l.raw_row_num, raw_json: clean(l),
  }))
  const { error: le } = await sb.from('escala_linhas').insert(rows)
  if (le) { console.log('erro linhas:', le.message); return }
  console.log(`✓ ${rows.length} linhas inseridas pra ARMAZEM_GRAO dia 20`)
})()
