// Várias lojas SENDAS no Unitrac são na verdade ASSAI convertidas (mesmo
// endereço, novo nome). A escala chama "Assaí - Loja X", mas o Unitrac
// mantém nome "SENDAS - LJ X" cadastrado.
//
// Cadastra cada parada SENDAS no Unitrac como rede_id=ASSAI quando o número
// de loja bate com algum Assaí da escala dia 19. Idem outras conversões.

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { parseUnitrac } from '@/lib/parsers/unitrac'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'

const ROOT = 'C:/Users/media/Downloads/dia 19'

async function main() {
  const unitracBuf = await readFile(`${ROOT}/relatorio_9521.xlsx`)
  const geralBuf = await readFile(`${ROOT}/ESCALA GERAL DE MAIO 1 (6).xlsx`)

  const veiculos = await parseUnitrac(unitracBuf.buffer.slice(unitracBuf.byteOffset, unitracBuf.byteOffset + unitracBuf.byteLength) as ArrayBuffer)
  const escala = await parseEscalaGeral(geralBuf.buffer.slice(geralBuf.byteOffset, geralBuf.byteOffset + geralBuf.byteLength) as ArrayBuffer, '2026-05-19')

  // Extrai todas as paradas SENDAS_X_LJ_N do Unitrac com lat/lng
  const paradasSendas = veiculos.flatMap(v => v.paradas.filter(p =>
    p.classificacao === 'LOJA' &&
    p.nome_loja &&
    /SENDAS/i.test(p.nome_loja) &&
    p.lat != null && p.lng != null,
  ))

  // Linhas ASSAI da escala que ficaram unmatched (placa entregou em SENDAS X)
  const assaiLinhas = escala.filter(l => l.rede_id === 'ASSAI' && l.placa_norm)

  // Pra cada parada SENDAS, descobre se há ASSAI com MESMO NÚMERO DE LOJA
  // (Sendas convertida em Assaí mantém número). Sem match de número, rejeita.
  const numeroLoja = (nome: string): string | null => {
    const m = nome.match(/(?:Loja|LJ\.?)\s*(\d+)/i) ?? nome.match(/-\s*(\d+)\s*$/)
    return m ? m[1] : null
  }
  const candidatos: Array<{ codigo_unitrac: string; nome_unitrac: string; lat: number; lng: number; numero: string; nome_escala: string }> = []
  const vistosCods = new Set<string>()
  for (const p of paradasSendas) {
    if (!p.codigo_loja || vistosCods.has(p.codigo_loja)) continue
    const numP = numeroLoja(p.nome_loja!)
    if (!numP) continue
    // Match exige: mesmo número + ao menos 1 token de bairro/cidade em comum
    const normTokens = (s: string) => new Set(s
      .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/SENDAS|ASSA[IÍ]|LOJA|LJ\.?|ATACAD[AÃ]O|-|\(|\)|\d+/g, ' ')
      .split(/\s+/).filter(t => t.length >= 4))
    const tokensP = normTokens(p.nome_loja!)
    const assaiMatch = assaiLinhas.find(l => {
      if (numeroLoja(l.loja_nome_raw) !== numP) return false
      const tokensL = normTokens(l.loja_nome_raw)
      for (const t of tokensL) if (tokensP.has(t)) return true
      return false
    })
    if (!assaiMatch) continue
    vistosCods.add(p.codigo_loja)
    candidatos.push({
      codigo_unitrac: p.codigo_loja,
      nome_unitrac: p.nome_loja!,
      lat: p.lat!, lng: p.lng!,
      numero: numP,
      nome_escala: assaiMatch.loja_nome_raw,
    })
  }

  console.log(`${candidatos.length} paradas SENDAS no Unitrac com MESMO NÚMERO de loja Assaí:\n`)
  for (const c of candidatos) {
    console.log(`  loja ${c.numero.padEnd(4)}  ${c.nome_unitrac.padEnd(40)} ↔ ${c.nome_escala}`)
  }

  // Checa quais já estão cadastrados como ASSAI no Supabase
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: jaCad } = await svc
    .from('lojas')
    .select('codigo_unitrac, rede_id')
    .in('codigo_unitrac', candidatos.map(c => c.codigo_unitrac))

  const cadComoAssai = new Set((jaCad ?? []).filter(l => l.rede_id === 'ASSAI').map(l => l.codigo_unitrac))
  const cadEmOutraRede = new Map<string, string>((jaCad ?? []).filter(l => l.rede_id !== 'ASSAI').map(l => [l.codigo_unitrac as string, l.rede_id as string]))

  const novos = candidatos.filter(c => !cadComoAssai.has(c.codigo_unitrac))
  console.log(`\n${novos.length} pra cadastrar (${candidatos.length - novos.length} já são ASSAI no Supabase):`)
  for (const n of novos) {
    const dup = cadEmOutraRede.get(n.codigo_unitrac)
    console.log(`  ${n.codigo_unitrac.padEnd(10)} ${n.nome_unitrac.padEnd(40)} ${dup ? `(também ${dup})` : '(novo)'}`)
  }

  // Salva SQL gerado pra inspeção
  const inserts = novos.map(n =>
    `('ASSAI', '${n.nome_unitrac.replace(/'/g, "''")}', '${n.codigo_unitrac}', '${n.nome_unitrac.replace(/'/g, "''")}', ${n.lat}, ${n.lng}, 200, true)`
  ).join(',\n')

  if (novos.length > 0) {
    console.log(`\nSQL:\nINSERT INTO lojas (rede_id, nome, codigo_unitrac, nome_unitrac, lat, lng, raio_metros, ativo) VALUES\n${inserts};`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
