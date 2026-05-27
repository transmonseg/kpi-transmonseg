import { readdirSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

;(async () => {
  // Lista uploads no banco por data e tipo
  const { data: uploads } = await sb.from('escala_uploads')
    .select('data_escala, tipo, qtd_linhas')
    .order('data_escala')

  const noBanco = new Set((uploads ?? []).map(u => `${u.data_escala}:${u.tipo}`))
  console.log('No banco:')
  for (const u of uploads ?? []) console.log(`  ${u.data_escala} ${u.tipo} (${u.qtd_linhas} linhas)`)

  // Lista arquivos disponíveis nas pastas dia 19/20/21
  console.log('\n═══ Análise por dia ═══')
  for (const dia of ['18','19','20','21']) {
    const pasta = `${BASE}/ESCALA DIA ${dia}`
    if (!existsSync(pasta)) { console.log(`\nDIA ${dia}: pasta não existe`); continue }
    const data = `2026-05-${dia.padStart(2,'0')}`
    const files = readdirSync(pasta)
    console.log(`\nDIA ${dia} (${data}):`)
    for (const f of files) {
      if (!f.endsWith('.xlsx') && !f.endsWith('.pdf')) continue
      if (f.toLowerCase().startsWith('relatorio')) continue
      // Detecta tipo
      let tipo = ''
      if (/ZONA.*SUL/i.test(f)) tipo = 'ZONA_SUL'
      else if (/ARMAZ.M.*GR.O/i.test(f)) tipo = 'ARMAZEM_GRAO'
      else if (/PAX|FEIRA|EMANUEL/i.test(f)) tipo = 'PAX'
      else if (/GERAL/i.test(f)) tipo = 'GERAL'
      else if (/GUANABARA|ESCALA \d+/i.test(f)) tipo = 'GUANABARA'
      else continue
      const status = noBanco.has(`${data}:${tipo}`) ? '✅ no banco' : '❌ FALTA'
      console.log(`  ${tipo.padEnd(12)} ${status}  ${f}`)
    }
  }
})()
