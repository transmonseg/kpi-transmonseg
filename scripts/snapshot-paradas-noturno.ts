// Cron noturno: captura as paradas (/stops, 48h) da Unitrac pra cada placa da
// frota Nutry Max e grava o snapshot por dia (hoje e ontem BR) em
// kpi_paradas_snapshot -- /stops so' guarda 48h, gerar um dia depois disso
// traz paradas incompletas (ver Task 7, plano 2026-09-24). Mesmo padrão de
// erro do snapshot-alvos-noturno.ts.
//
// Task 4 (plano 2026-09-30-rioquality-aprendizados): tambem captura a Rio
// Quality -- por CV da tabela kpi_rioquality_frota (a RQ nao tem frota pela
// API), gravado com empresa 'rioquality'. Consolidacao com a base PROPRIA da
// RQ (buscarParadasUnitracRioQuality), nunca as bases da Nutry Max. Placa com
// erro de consulta nao e' gravada (nunca [] por falha). Falha da RQ nao
// impede a Nutry Max de ser gravada (roda depois dela).
//
// Revisao independente 30/09: cada consulta /stops (placa x dia) tem 1 retry
// com pequena espera (comUmRetry) -- Nutry Max e Rio Quality. Falha numa
// placa nunca derruba a gravacao das outras. Nutry Max: fora o retry, nada
// muda (qualquer falha restante ainda sai com codigo 1). Rio Quality: falha
// por placa fica no log; so' sai com codigo 1 se mais de
// LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ (20%) das consultas RQ falharem (ver
// snapshot-paradas.ts). Frota vazia, erro ao salvar e retencao seguem
// saindo com codigo 1.
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
import { createServiceClient } from '../src/lib/supabase/service'
import type { UnitracParadaRow } from '../src/lib/kpi/matcher'
import { buscarFrotaRioQuality } from '../src/lib/kpi-rioquality/frota'
import { buscarParadasUnitracRioQuality } from '../src/lib/kpi-rioquality/pipeline'
import {
  capturarParadasRioQuality, EMPRESA_SNAPSHOT_RIOQUALITY, comUmRetry,
  falhasSnapshotRqExcedemLimite, LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ,
} from '../src/lib/kpi-rioquality/snapshot-paradas'

const RETENCAO_DIAS = 90

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
        const paradas = await comUmRetry(() => buscarParadasDoDia(veiculo.cv, veiculo.placaNorm, dia, 48))
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

  // Rio Quality (Task 4): mesma janela hoje/ontem, empresa 'rioquality'.
  const frotaRq = await buscarFrotaRioQuality()
  // buscarFrotaRioQuality engole erro de banco e devolve vazio.
  if (frotaRq.size === 0) {
    falhas.push('rioquality: frota vazia (kpi_rioquality_frota)')
  } else {
    const rq = await capturarParadasRioQuality(frotaRq, [hoje, ontem], buscarParadasUnitracRioQuality)
    if (rq.falhas.length > 0) {
      const pct = Math.round((100 * rq.falhas.length) / rq.totalConsultas)
      console.error(`rioquality: ${rq.falhas.length} de ${rq.totalConsultas} consultas falharam apos retry (${pct}%): ${rq.falhas.join(', ')}`)
      if (falhasSnapshotRqExcedemLimite(rq.falhas.length, rq.totalConsultas)) {
        falhas.push(`rioquality: ${rq.falhas.length} de ${rq.totalConsultas} consultas falharam (> ${LIMITE_FRACAO_FALHAS_SNAPSHOT_RQ * 100}%)`)
      }
    }
    for (const [dia, porPlaca] of rq.porDia) {
      const comParadas = [...porPlaca].filter(([, ps]) => ps.length > 0).length
      console.log(`rioquality ${dia}: ${porPlaca.size} de ${frotaRq.size} placas consultadas, ${comParadas} com paradas`)
      if (dry) continue
      try {
        await salvarSnapshotParadas(EMPRESA_SNAPSHOT_RIOQUALITY, dia, porPlaca)
        salvos++
      } catch (err) {
        falhas.push(`salvar rioquality ${dia}`)
        console.error(`  falha ao salvar snapshot rioquality ${dia}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  // Retenção: mesma cadência do snapshot de alvos (snapshot-alvos-noturno.ts)
  // -- apaga linhas mais antigas que RETENCAO_DIAS pra não crescer sem limite.
  const corte = new Date(`${hoje}T12:00:00Z`)
  corte.setUTCDate(corte.getUTCDate() - RETENCAO_DIAS)
  const limite = corte.toISOString().slice(0, 10)

  if (dry) {
    console.log(`(dry) apagaria kpi_paradas_snapshot com data < ${limite}`)
    console.log('(dry) nada gravado')
    return
  }

  for (const empresa of [CLIENTE_SNAPSHOT, EMPRESA_SNAPSHOT_RIOQUALITY]) {
    const { error, count } = await createServiceClient().from('kpi_paradas_snapshot')
      .delete({ count: 'exact' }).eq('empresa', empresa).lt('data', limite)
    if (error) falhas.push(`retencao ${empresa}: ${error.message}`)
    else console.log(`snapshots antigos apagados ${empresa} (< ${limite}): ${count ?? 0}`)
  }

  console.log(`dias salvos=${salvos} falhas=${falhas.length}`)
  if (falhas.length > 0) throw new Error(`falhas: ${falhas.join(', ')}`)
}

main().catch(err => { console.error('snapshot-paradas-noturno falhou:', err instanceof Error ? err.message : err); process.exit(1) })
