// Pra cada linha ASSAI/ARMAZEM/ZONA_SUL/CARREFOUR/SENDAS na escala dia 19,
// reporta o porquê não casou: placa fora do Unitrac, sem parada-LOJA,
// paradas-LOJA de outra rede, etc.

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseEscalaArmazemGrao } from '@/lib/parsers/escala-armazem-grao'
import { parseUnitrac } from '@/lib/parsers/unitrac'

const ROOT = 'C:/Users/media/Downloads/dia 19'

const REDES_FOCO = new Set(['ASSAI', 'ARMAZEM_GRAO', 'CARREFOUR', 'SENDAS'])

async function main() {
  const geralBuf = await readFile(`${ROOT}/ESCALA GERAL DE MAIO 1 (6).xlsx`)
  const armazemBuf = await readFile(`${ROOT}/ESCALA DO ARMAZÉM DO GRÃO MAIO (5).xlsx`)
  const zsBuf = await readFile(`${ROOT}/ESCALA ZONA SUL - MAIO (6).xlsx`)
  const unitracBuf = await readFile(`${ROOT}/relatorio_9521.xlsx`)

  const linhas = [
    ...await parseEscalaGeral(geralBuf.buffer.slice(geralBuf.byteOffset, geralBuf.byteOffset + geralBuf.byteLength) as ArrayBuffer, '2026-05-19'),
    ...await parseEscalaArmazemGrao(armazemBuf.buffer.slice(armazemBuf.byteOffset, armazemBuf.byteOffset + armazemBuf.byteLength) as ArrayBuffer, '2026-05-19'),
    ...await parseEscalaZonaSul(zsBuf.buffer.slice(zsBuf.byteOffset, zsBuf.byteOffset + zsBuf.byteLength) as ArrayBuffer, '2026-05-19'),
  ]
  const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength) as ArrayBuffer)
  const porPlaca = new Map(veiculos.map(v => [v.placa_norm, v]))

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: lojasRaw } = await svc.from('lojas').select('rede_id, nome, nome_normalizado, codigo_unitrac, nome_unitrac').eq('ativo', true)
  const lojas = (lojasRaw ?? []) as Array<{ rede_id: string; nome: string; nome_normalizado: string; codigo_unitrac: string | null; nome_unitrac: string | null }>

  for (const rede of REDES_FOCO) {
    const linhasRede = linhas.filter(l => l.rede_id === rede && l.placa_norm)
    if (linhasRede.length === 0) continue
    console.log(`\n━━━ ${rede} (${linhasRede.length} linhas com placa) ━━━`)
    const lojasDaRede = lojas.filter(l => l.rede_id === rede)
    console.log(`  ${lojasDaRede.length} lojas cadastradas dessa rede`)

    for (const l of linhasRede) {
      const v = porPlaca.get(l.placa_norm!)
      if (!v) {
        console.log(`  ❌ ${l.loja_nome_raw.padEnd(40)} ${l.placa_norm}  → placa não no Unitrac`)
        continue
      }
      const paradasLoja = v.paradas.filter(p => p.classificacao === 'LOJA')
      if (paradasLoja.length === 0) {
        const fb = v.paradas.filter(p => p.classificacao === 'FORA_BASE').length
        console.log(`  ⚠ ${l.loja_nome_raw.padEnd(40)} ${l.placa_norm}  → sem LOJA (${fb} FORA_BASE no Unitrac — sem geofence)`)
        continue
      }
      // Tem paradas LOJA, vê se alguma é da rede
      const paradasNaRede = paradasLoja.filter(p => {
        if (p.codigo_loja && lojasDaRede.some(x => x.codigo_unitrac === p.codigo_loja)) return true
        if (p.nome_loja && lojasDaRede.some(x => x.nome_unitrac && x.nome_unitrac.trim() === p.nome_loja!.trim())) return true
        return false
      })
      if (paradasNaRede.length === 0) {
        const cross = paradasLoja.map(p => p.nome_loja ?? p.local_parada).slice(0, 2).join(' | ')
        console.log(`  ⚠ ${l.loja_nome_raw.padEnd(40)} ${l.placa_norm}  → cross-rede: ${cross}`)
        continue
      }
      console.log(`  ✓ ${l.loja_nome_raw.padEnd(40)} ${l.placa_norm}  → match disponível (${paradasNaRede.length} parada(s) na rede)`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
