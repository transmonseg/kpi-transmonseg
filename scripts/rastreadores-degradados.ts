// F2-09 (KN-06, D-05, plano mestre 23/10): lista semanal e INTERNA de
// rastreadores degradados (pra Érica mandar consertar). SO' LEITURA: pergunta
// a ponte base-horarios (monitoramento, sem efeito colateral) pelas placas de
// cada dia gravadas no Ao vivo e aplica a mesma regra do KPI
// (avaliarRastreadoresNoDia: > 30% das leituras fora da base atrasadas entre
// 05h e 21h, sem as faixas de coletor fora). Nao grava nada, nao manda nada.
//
// Uso (no servidor):
//   npx tsx --env-file=.env.production scripts/rastreadores-degradados.ts [nutrimax|rioquality] [AAAA-MM-DD fim] [dias=7]
import { createServiceClient } from '../src/lib/supabase/service'
import { buscarHorariosBase } from '../src/lib/kpi-romaneio/base-horarios'
import { avaliarRastreadoresNoDia } from '../src/lib/kpi-romaneio/placas-sem-rastreador'
import { hojeBR } from '../src/lib/data-br'

function diasAte(fim: string, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${fim}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function main() {
  const [cliente = 'nutrimax', fimArg, nArg] = process.argv.slice(2)
  const fim = fimArg ?? (() => { const d = new Date(`${hojeBR()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) })()
  const porPlaca = new Map<string, { dia: string; fracao: number }[]>()
  for (const dia of diasAte(fim, Number(nArg ?? 7))) {
    const { data: row } = await createServiceClient().from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', cliente).eq('data', dia).maybeSingle()
    const placas = [...new Set(((row?.resultado as { placas?: { placa: string }[] } | null)?.placas ?? []).map(p => p.placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()))]
    if (placas.length === 0) { console.log(`${dia}: sem cálculo do Ao vivo`); continue }
    const horarios = await buscarHorariosBase(placas, dia, new Map(), true)
    const { coletorFora, falhas } = avaliarRastreadoresNoDia(placas, horarios)
    console.log(`${dia}: ${placas.length} placas, ${falhas.size} com falha${coletorFora.length ? `, coletor fora ${coletorFora.map(c => `${c.inicio}–${c.fim}`).join(', ')}` : ''}`)
    for (const [placa, fracao] of falhas) porPlaca.set(placa, [...(porPlaca.get(placa) ?? []), { dia, fracao }])
  }
  console.log(`\nRastreadores degradados (${cliente}, até ${fim}) -- uso interno:`)
  for (const [placa, dias] of [...porPlaca].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    console.log(`  ${placa}: ${dias.length} dia(s) -- ${dias.map(d => `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)} ${Math.round(d.fracao * 100)}%`).join(', ')}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
