/**
 * Auditoria MANUAL placa-por-placa ZONA_SUL dia 19/05/2026.
 * Lê escala, aplica alterações, lê Unitrac, e mostra para cada placa:
 *   - Está na escala? Quais lojas?
 *   - Está no Unitrac? Quais paradas?
 *
 * Output legível para inspeção humana.
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { parseEscalaZonaSul } from '@/lib/parsers/escala-zona-sul'
import { parseUnitrac } from '@/lib/parsers/unitrac'

const BASE = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 19'
const DATA = '2026-05-19'

function fmtHHMM(d: Date): string {
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
}

async function main() {
  // 1) ESCALA ZONA_SUL dia 19
  console.log('═══ ESCALA ZONA_SUL — 19/05/2026 ═══\n')
  const escalaBuf = readFileSync(BASE + '/ESCALA ZONA SUL - MAIO (6).xlsx')
  const escala = await parseEscalaZonaSul(escalaBuf, DATA)
  const escalaZS = escala.filter(l => l.rede_id === 'ZONA_SUL')
  console.log(`Total de linhas ZONA_SUL na escala: ${escalaZS.length}\n`)

  // Agrupar por placa
  const porPlaca = new Map<string, typeof escalaZS>()
  for (const l of escalaZS) {
    const p = l.placa_norm || '(SEM PLACA)'
    const arr = porPlaca.get(p) ?? []
    arr.push(l)
    porPlaca.set(p, arr)
  }

  // 2) UNITRAC
  console.log('═══ UNITRAC dia 19 ═══\n')
  const unitracBuf = readFileSync(BASE + '/relatorio_9391.xlsx')
  const veiculos = await parseUnitrac(unitracBuf)
  console.log(`Total de veículos no Unitrac: ${veiculos.length}\n`)

  const placasUnitrac = new Set(veiculos.map(v => v.placa_norm))

  // 3) AUDITORIA placa-por-placa
  console.log('═══ AUDITORIA PLACA POR PLACA ═══\n')
  const placasEscala = [...porPlaca.keys()].sort()

  let comGps = 0
  let semGps = 0
  const semGpsList: string[] = []

  for (const placa of placasEscala) {
    const linhas = porPlaca.get(placa)!
    const veiculo = veiculos.find(v => v.placa_norm === placa)
    const motorista = linhas[0].motorista_nome ?? '?'

    const escalaResumo = linhas.map(l => `Loja ${l.loja_codigo_raw}`).join(', ')

    if (!veiculo) {
      semGps++
      semGpsList.push(`${placa}|${motorista}|${escalaResumo}`)
      console.log(`❌ ${placa} | ${motorista}`)
      console.log(`   ESCALA: ${escalaResumo}`)
      console.log(`   UNITRAC: PLACA NÃO ENCONTRADA\n`)
      continue
    }

    comGps++
    const paradasLoja = veiculo.paradas.filter(p => p.classificacao === 'LOJA')
    const paradasFora = veiculo.paradas.filter(p => p.classificacao === 'FORA_BASE')
    const paradasBase = veiculo.paradas.filter(p => p.classificacao === 'BASE')

    console.log(`✓ ${placa} | ${motorista}`)
    console.log(`   ESCALA: ${escalaResumo}`)
    console.log(`   UNITRAC: ${veiculo.paradas.length}p (${paradasBase.length}B ${paradasLoja.length}L ${paradasFora.length}F)`)
    for (const p of paradasLoja) {
      const cod = p.codigo_loja ?? '?'
      const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 50)
      const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
      console.log(`     LOJA ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida ?? p.chegada)} ${dur} cod:${cod} ${nome}`)
    }
    for (const p of paradasFora.slice(0, 3)) {
      const nome = (p.nome_loja ?? p.local_parada ?? '').slice(0, 50)
      const dur = p.duracao_seg ? Math.round(p.duracao_seg / 60) + 'min' : '?'
      console.log(`     FB   ${fmtHHMM(p.chegada)}-${fmtHHMM(p.saida ?? p.chegada)} ${dur} ${nome}`)
    }
    console.log('')
  }

  console.log('═══════════════════════════════════════════')
  console.log(`Placas únicas na escala ZS:           ${placasEscala.length}`)
  console.log(`Placas COM GPS no Unitrac:            ${comGps}`)
  console.log(`Placas SEM GPS no Unitrac:            ${semGps}`)
  console.log('═══════════════════════════════════════════\n')

  if (semGpsList.length > 0) {
    console.log('PLACAS SEM GPS:')
    for (const item of semGpsList) console.log('  ' + item)
  }
}

main().catch(e => { console.error('ERRO:', e); process.exit(1) })
