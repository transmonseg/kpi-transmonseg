// Cron noturno: captura as paradas (/stops, 48h) da Unitrac pra cada placa da
// frota Nutry Max e grava o snapshot por dia (hoje e ontem BR) em
// kpi_paradas_snapshot -- /stops so' guarda 48h, gerar um dia depois disso
// traz paradas incompletas (ver Task 7, plano 2026-09-24). Mesmo padrão de
// erro do snapshot-alvos-noturno.ts.
//
// Uso: npx tsx --env-file=.env.local scripts/snapshot-paradas-noturno.ts [--dry]
// --dry: só imprime contagens (sem gravar). Sai com código 1 se a API falhar.

import { buscarFrota } from '../src/lib/unitrac-api'
import { buscarParadasDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { COD_USER_NUTRIMAX } from '../src/lib/kpi-romaneio/constants'

// Mesmo valor usado em kpi_alvos_snapshot (alvosEfetivos('nutrimax', ...)) --
// NÃO é EMPRESA_NUTRIMAX ('NUTRY MAX', usado só em kpi_resolucao_nf).
const CLIENTE_SNAPSHOT = 'nutrimax'
import { hojeBR } from '../src/lib/data-br'
import { salvarSnapshotParadas } from '../src/lib/kpi-romaneio/paradas-snapshot'
import type { UnitracParadaRow } from '../src/lib/kpi/matcher'

function ontemBR(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`) // meio-dia evita virada de dia por fuso
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const dry = process.argv.includes('--dry')
  const frota = await buscarFrota(COD_USER_NUTRIMAX)
  // buscarFrota engole erro de rede e devolve vazio: frota vazia = API falhou.
  if (frota.length === 0) throw new Error('frota vazia (API Unitrac falhou ou sem credenciais)')

  const hoje = hojeBR()
  const ontem = ontemBR(hoje)
  const porDia = new Map<string, Map<string, UnitracParadaRow[]>>([
    [hoje, new Map()],
    [ontem, new Map()],
  ])

  const falhas: string[] = []
  for (const veiculo of frota) {
    // buscarParadasDoDia(cv, placaNorm, data, horas=48) já agrupa por dia BR
    // internamente (consolidaParadasApi filtra pelo `data` pedido) -- pedimos
    // as 48h uma vez pra HOJE (cobre o dia corrente inteiro) e uma vez pra
    // ONTEM (cobre o que ainda sobra da janela de 48h daquele dia).
    for (const dia of [hoje, ontem]) {
      try {
        const paradas = await buscarParadasDoDia(veiculo.cv, veiculo.placaNorm, dia, 48)
        porDia.get(dia)!.set(veiculo.placaNorm, paradas)
      } catch (err) {
        falhas.push(`${veiculo.placaNorm}/${dia}`)
        console.error(`  falha ao buscar paradas ${veiculo.placaNorm}/${dia}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  let salvos = 0
  for (const [dia, porPlaca] of porDia) {
    const comParadas = [...porPlaca].filter(([, ps]) => ps.length > 0).length
    console.log(`${dia}: ${porPlaca.size} placas consultadas, ${comParadas} com paradas`)
    if (dry) continue
    try {
      await salvarSnapshotParadas(CLIENTE_SNAPSHOT, dia, porPlaca)
      salvos++
    } catch (err) {
      falhas.push(`salvar ${dia}`)
      console.error(`  falha ao salvar snapshot ${dia}:`, err instanceof Error ? err.message : err)
    }
  }

  if (dry) {
    console.log('(dry) nada gravado')
    return
  }
  console.log(`dias salvos=${salvos} falhas=${falhas.length}`)
  if (falhas.length > 0) throw new Error(`falhas: ${falhas.join(', ')}`)
}

main().catch(err => { console.error('snapshot-paradas-noturno falhou:', err instanceof Error ? err.message : err); process.exit(1) })
