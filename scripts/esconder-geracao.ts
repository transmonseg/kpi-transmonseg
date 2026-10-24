// F3-04 (ACH-10, D-26): esconde uma geração do histórico SEM apagar (a linha
// e o arquivo continuam; resumo.oculta guarda motivo, quem e quando).
// Caso de origem: 17/10 gerado às 20:41 com o romaneio de 16/10 (59,3%),
// id b7176129-d81e-4ef6-940f-2b0bf02947a8.
//
// Uso: npx tsx --env-file=.env.production scripts/esconder-geracao.ts <id> --motivo "texto" [--por quem] [--aplicar] [--mostrar]
// Sem --aplicar: só mostra a geração e o que mudaria. --mostrar desfaz (tira o oculta).
import { createServiceClient } from '../src/lib/supabase/service'
import { motivoValido } from '../src/lib/kpi-romaneio/versao-oficial'

function arg(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] ?? null : null
}

async function main() {
  const id = process.argv[2]
  const aplicar = process.argv.includes('--aplicar')
  const mostrar = process.argv.includes('--mostrar')
  const motivo = motivoValido(arg('--motivo'))
  const por = arg('--por') ?? 'dono (script F3-04)'
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || (!mostrar && !motivo)) {
    console.error('uso: esconder-geracao.ts <id> --motivo "texto (5+ letras)" [--por quem] [--aplicar] [--mostrar]')
    process.exit(1)
  }
  const svc = createServiceClient()
  const { data: g, error } = await svc.from('kpi_romaneio_geracoes').select('id, cliente, data_referencia, gerado_em, gerado_por, qtd_cargas, resumo').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!g) { console.error(`geração ${id} não encontrada`); process.exit(1) }
  const resumo = (g.resumo ?? {}) as Record<string, unknown>
  console.log(`${g.cliente} ${g.data_referencia} gerada ${g.gerado_em} por ${g.gerado_por}: ${g.qtd_cargas} cargas, taxa ${resumo.taxa}% ${resumo.oculta ? `(JÁ ESCONDIDA: ${JSON.stringify(resumo.oculta)})` : ''}`)
  const novo = { ...resumo }
  if (mostrar) delete novo.oculta
  else novo.oculta = { motivo, por, em: new Date().toISOString() }
  console.log(mostrar ? '-> volta a aparecer no histórico' : `-> escondida: ${JSON.stringify(novo.oculta)}`)
  if (!aplicar) { console.log('(a seco, nada gravado)'); return }
  const u = await svc.from('kpi_romaneio_geracoes').update({ resumo: novo }).eq('id', id)
  if (u.error) throw new Error(u.error.message)
  console.log('GRAVADO (a linha e o arquivo continuam guardados)')
}

main().catch(err => { console.error(err); process.exit(1) })
