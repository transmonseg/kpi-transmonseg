import { readFileSync, readdirSync } from 'fs'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function fmtT(d: Date | string | null): string {
  if (!d) return '---'
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}`
}

;(async () => {
  const pasta20 = `${BASE}/ESCALA DIA 20`
  const files = readdirSync(pasta20)
  const geralFile = files.find(f => /ESCALA GERAL/i.test(f) && f.endsWith('.xlsx'))!
  const xlsxFile = files.find(f => /relatorio.*\.xlsx$/i.test(f))
  const pdfFile = files.find(f => /relatorio.*\.pdf$/i.test(f))

  const escala = await parseEscalaGeral(readFileSync(`${pasta20}/${geralFile}`), '2026-05-20')
  let veiculos: any[] = []
  if (xlsxFile) veiculos.push(...await parseUnitrac(readFileSync(`${pasta20}/${xlsxFile}`)))
  if (pdfFile) veiculos.push(...await parseUnitracPdf(readFileSync(`${pasta20}/${pdfFile}`), new Set()).catch(() => []))

  const { data: lojas } = await sb.from('lojas').select('id, rede_id, nome, nome_normalizado, codigo_escala, codigo_unitrac, nome_unitrac, lat, lng, raio_metros').eq('ativo', true)

  // Casos a verificar (placa + loja)
  const CASOS = [
    { placa: 'KQV1D80', lojaPattern: /fonseca/i, manualCHD: '05:35', manualSL: '09:30' },
    { placa: 'QSW3B65', lojaPattern: /recreio/i, manualCHD: '06:35', manualSL: '10:40' },
    { placa: 'KOA6A27', lojaPattern: /vilar.*teles/i, manualCHD: '05:45', manualSL: '10:25' },
  ]

  for (const caso of CASOS) {
    const linhas = escala.filter(l => l.placa_norm === caso.placa)
    if (!linhas.length) { console.log(`\n${caso.placa}: sem escala`); continue }
    const linhasComId: any = linhas.map((l, i) => ({ ...l, id: `${caso.placa}-${i}` }))

    const veic = veiculos.find(v => v.placa_norm === caso.placa)
    if (!veic) { console.log(`\n${caso.placa}: sem GPS`); continue }
    const paradas = veic.paradas.map((p: any, i: number) => ({
      ...p,
      id: `${caso.placa}-p-${i}`,
      chegada: p.chegada,
      saida: p.saida,
    }))

    const rotas = await cruzaEscalaUnitrac(linhasComId, paradas, lojas as any)
    for (const r of rotas) {
      const linha = linhasComId.find((l: any) => l.id === r.escala_linha_id)
      if (!caso.lojaPattern.test(linha?.loja_nome_raw || '')) continue
      const p = r.paradas[0]
      console.log(`\n[${caso.placa}] ${linha?.loja_nome_raw}`)
      console.log(`  Manual:  CHD=${caso.manualCHD}  SL=${caso.manualSL}`)
      console.log(`  Sistema: CHD=${p ? fmtT(p.chegada) : '---'}  SL=${p ? fmtT(p.saida) : '---'}`)
      if (p) {
        console.log(`  dur=${p.duracao_min}min  classificacao=${p.classificacao}`)
      }
    }
  }
})()
