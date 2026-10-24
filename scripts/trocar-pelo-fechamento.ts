// F3-01 (ACH-01, D-26): troca dias do Dashboard pelo fechamento das 00:30 --
// o mesmo que o botão "Trocar" da tela, para os dias de antes do deploy
// (16 e 17/10 da Nutry ficaram parciais: 99,2% e 98,7%; fechamento 94,5% e 95,1%).
//
// Uso: npx tsx --env-file=.env.production scripts/trocar-pelo-fechamento.ts <nutrimax|rioquality> AAAA-MM-DD [AAAA-MM-DD ...] [--aplicar]
// Sem --aplicar: só mostra Dashboard x fechamento e confere a planilha guardada.
// Com --aplicar: grava (kpi_dashboard_kpis). Só com OK do dono.
import { createServiceClient } from '../src/lib/supabase/service'
import { trocarPeloFechamento, depsReaisTrocar, fmtTaxa, clienteComFechamento } from '../src/lib/kpi-romaneio/fechamento-dashboard'

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const cliente = args.find(a => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a)) ?? ''
  const datas = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (!clienteComFechamento(cliente) || datas.length === 0) {
    console.error('uso: trocar-pelo-fechamento.ts <nutrimax|rioquality> AAAA-MM-DD [...] [--aplicar]')
    process.exit(1)
  }
  for (const data of datas) {
    const { data: atual } = await createServiceClient().from('kpi_dashboard_kpis').select('resumo, inserido_por').eq('cliente', cliente).eq('data', data).maybeSingle()
    const antes = atual ? `${fmtTaxa(atual.resumo?.taxa ?? null)}${atual.resumo?.aguardando ? ` (parcial, ${atual.resumo.aguardando} aguardando)` : ''} por ${atual.inserido_por ?? '—'}` : 'ausente'
    const r = await trocarPeloFechamento(cliente, data, 'trocado pelo fechamento (script F3-01)', {
      ...depsReaisTrocar,
      gravar: aplicar ? depsReaisTrocar.gravar : async () => {},
    })
    console.log(`${cliente} ${data}: Dashboard ${antes} -> ${r.ok ? `fechamento ${fmtTaxa(r.taxa)} (${r.nfs} NFs)${aplicar ? ' GRAVADO' : ' (a seco, nada gravado)'}` : `NÃO TROCA: ${r.erro}`}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
