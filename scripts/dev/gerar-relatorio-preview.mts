// Gera o PDF de operação a partir de KPIs reais para verificação visual.
// Uso: npx tsx scripts/dev/gerar-relatorio-preview.mts
import { readFile, writeFile, glob } from 'node:fs/promises'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { parseKpiManual } from '@/lib/kpi/parse-kpi-manual'
import { calcularMetricas } from '@/lib/kpi/dashboard-metricas'
import { montarNarrativa } from '@/lib/kpi/relatorio-narrativa'
import { Relatorio, type RelatorioCtx } from '@/lib/relatorio/Relatorio'

const arquivos: string[] = []
for await (const p of glob('docs/conversas-tia-erica/dia-19/kpis-pos-deploy/KPI-*.xlsx')) arquivos.push(p)
const ents = (await Promise.all(arquivos.map(async (a) => {
  const rede = (a.match(/KPI-([A-Z_]+)-/)?.[1]) ?? 'REDE'
  return parseKpiManual(await readFile(a) as unknown as Buffer, rede, '2026-05-19')
}))).flat()

const m = calcularMetricas(ents)
const intervalo: [string, string] = ['2026-05-19', '2026-05-19']
const ctx: RelatorioCtx = {
  m, ant: null, periodo: 'dia', intervalo, redes: [],
  narrativa: montarNarrativa(m, null, 'dia', intervalo), mes: '2026-05', geradoEm: '19/05/2026 14:00',
}
const buf = await renderToBuffer(React.createElement(Relatorio, { ctx }) as React.ReactElement<DocumentProps>)
await writeFile('relatorio-preview.pdf', buf)
console.log(`OK: relatorio-preview.pdf (${buf.length} bytes), total ${m.total} linhas, taxa ${m.pctEntregue}%, visibilidade ${m.com_rastreador}/${m.total}`)
