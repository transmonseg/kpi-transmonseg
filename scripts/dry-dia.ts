// Teste a seco NF a NF (F0-07, plano mestre 23/10): regera o dia em memoria
// com o codigo do checkout e compara com o kpi_ao_vivo_calculo gravado, por
// CATEGORIA (entregue / pendente por motivo / fora da conta), nao por texto.
// Nao grava nada: escrita no Supabase (cache de geocode, cache negativo, cache
// do dia, storage) e' descartada no fetch (src/lib/kpi-romaneio/dry-guarda.ts).
// A ponte do monitoramento ainda pode gravar o cache DELE.
// Uso: npx tsx --env-file=.env.production scripts/dry-dia.ts <nutrimax|rioquality> <AAAA-MM-DD>...
// Saida: resumo no console + /tmp/dry-<cliente>-<data>.txt com cada NF que mudou.
import { writeFileSync } from 'fs'
import { instalarTravaDeEscrita } from '../src/lib/kpi-romaneio/dry-guarda'

const base = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
if (!base) throw new Error('sem URL do Supabase no ambiente')
const descartadas = instalarTravaDeEscrita(base)

const [cliente, ...dias] = process.argv.slice(2)
if (!cliente || dias.length === 0) { console.error('uso: dry-dia.ts <cliente> <AAAA-MM-DD>...'); process.exit(2) }

async function main() {
  // Import dinamico: nenhum modulo cria cliente Supabase antes da trava.
  const { gerarKpiDoDia } = await import('../src/lib/kpi-romaneio/ao-vivo-servico')
  const { extrairKpiCompleto, categoriaPendencia } = await import('../src/lib/kpi-romaneio/resumo-dashboard')
  const { createServiceClient } = await import('../src/lib/supabase/service')
  const categoria = (s: string | null | undefined) => {
    const t = s ?? ''
    if (/^ENTREGUE/.test(t)) return 'ENTREGUE'
    return categoriaPendencia(t) ?? 'Outros'
  }
  for (const data of dias) {
    const { data: row } = await createServiceClient().from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', cliente).eq('data', data).maybeSingle()
    const antes = new Map<string, string>()
    for (const p of (row?.resultado as { placas?: { placa: string; nfs: { nf: string; status?: string }[] }[] } | null)?.placas ?? []) for (const n of p.nfs) antes.set(`${p.placa}|${n.nf}`, n.status ?? '')
    const r = await gerarKpiDoDia(cliente as 'nutrimax' | 'rioquality', data)
    if (!r) { console.log(`${cliente} ${data}: sem dados`); continue }
    const lido = await extrairKpiCompleto(r.xlsx)
    const porCategoria = new Map<string, number>(); const porTexto = new Map<string, number>(); const linhas: string[] = []
    let ent0 = 0, ent1 = 0
    for (const n of lido.nfs) {
      const a = antes.get(`${n.placa}|${n.nf}`); const b = n.status ?? ''
      if (a != null && /^ENTREGUE/.test(a)) ent0++
      if (/^ENTREGUE/.test(b)) ent1++
      if (a === b) continue
      const ca = a == null ? '(nova)' : categoria(a); const cb = categoria(b)
      if (ca !== cb) porCategoria.set(`${ca} -> ${cb}`, (porCategoria.get(`${ca} -> ${cb}`) ?? 0) + 1)
      const t = `${(a ?? '(nova)').slice(0, 48)}  ->  ${b.slice(0, 48)}`
      porTexto.set(t, (porTexto.get(t) ?? 0) + 1)
      linhas.push(`${data}\t${n.placa}\t${n.nf}\t${ca}\t${cb}\t${a ?? '(nova)'}\t${b}`)
    }
    console.log(`\n== ${cliente} ${data}: NFs ${lido.nfs.length}, ENTREGUE antes ${ent0} depois ${ent1} (${ent1 - ent0 >= 0 ? '+' : ''}${ent1 - ent0})`)
    console.log('  mudou de categoria:')
    for (const [t, c] of [...porCategoria].sort((x, y) => y[1] - x[1])) console.log(`  ${String(c).padStart(5)}  ${t}`)
    console.log('  mudou de texto (top 15):')
    for (const [t, c] of [...porTexto].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${String(c).padStart(5)}  ${t}`)
    writeFileSync(`/tmp/dry-${cliente}-${data}.txt`, ['data\tplaca\tnf\tcategoria_antes\tcategoria_depois\tantes\tdepois', ...linhas].join('\n'))
  }
  const total = [...descartadas.values()].reduce((s, n) => s + n, 0)
  console.log(`\nescritas descartadas: ${total}${total ? ' (' + [...descartadas].map(([k, n]) => `${k} ${n}`).join(', ') + ')' : ''}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
