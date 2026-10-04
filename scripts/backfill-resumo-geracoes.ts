// Preenche kpi_romaneio_geracoes.resumo (dashboard do redesign 04/10/2026)
// nas geracoes antigas:
//  1. as que tem a planilha salva no Storage (arquivo_storage_path) -- lida
//     direto do arquivo entregue;
//  2. `--arquivo AAAA-MM-DD=caminho.xlsx` (opcional, repetivel): planilha
//     local (ex.: regenerada na medicao) pra dia SEM planilha salva -- grava
//     na geracao mais recente daquele dia do cliente, so' se ainda sem resumo.
// Nunca sobrescreve resumo existente. Dry-run por padrao; --aplicar grava.
//
// Uso: npx tsx --env-file=.env.production scripts/backfill-resumo-geracoes.ts [--aplicar] [--cliente nutrimax] [--arquivo 2026-09-22=/tmp/x.xlsx ...]
import { readFileSync } from 'node:fs'
import { createServiceClient } from '../src/lib/supabase/service'
import { extrairResumoKpiXlsx } from '../src/lib/kpi-romaneio/resumo-dashboard'
import { BUCKET_KPI_ROMANEIO } from '../src/lib/kpi-romaneio/xlsx-gerado'

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const iCli = args.indexOf('--cliente')
  const cliente = iCli >= 0 ? args[iCli + 1] : 'nutrimax'
  const arquivos = new Map<string, string>()
  args.forEach((a, i) => {
    if (a === '--arquivo') {
      const [dia, caminho] = (args[i + 1] ?? '').split('=')
      if (dia && caminho) arquivos.set(dia, caminho)
    }
  })

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('kpi_romaneio_geracoes')
    .select('id, data_referencia, gerado_em, arquivo_storage_path, resumo')
    .eq('cliente', cliente)
    .order('gerado_em', { ascending: false })
  if (error) throw new Error(error.message)

  let gravados = 0
  for (const g of data ?? []) {
    if (g.resumo || !g.arquivo_storage_path) continue
    const dl = await svc.storage.from(BUCKET_KPI_ROMANEIO).download(g.arquivo_storage_path)
    if (dl.error || !dl.data) { console.log(`  ${g.data_referencia} ${g.id}: download falhou (${dl.error?.message})`); continue }
    const r = await extrairResumoKpiXlsx(Buffer.from(await dl.data.arrayBuffer()))
    console.log(`  ${g.data_referencia} ${g.id} (Storage): taxa ${r.taxa}% / ${r.cargas.length} cargas`)
    if (aplicar) {
      const u = await svc.from('kpi_romaneio_geracoes').update({ resumo: r }).eq('id', g.id).is('resumo', null)
      if (u.error) console.log(`    ERRO: ${u.error.message}`); else gravados++
    }
  }

  for (const [dia, caminho] of arquivos) {
    const doDia = (data ?? []).filter(g => g.data_referencia === dia)
    if (doDia.some(g => g.resumo)) { console.log(`  ${dia}: ja tem resumo, pulado`); continue }
    const alvo = doDia[0] // mais recente (ordem desc)
    if (!alvo) { console.log(`  ${dia}: nenhuma geracao de ${cliente} nesse dia, pulado`); continue }
    const r = await extrairResumoKpiXlsx(readFileSync(caminho))
    console.log(`  ${dia} ${alvo.id} (arquivo local): taxa ${r.taxa}% / ${r.cargas.length} cargas`)
    if (aplicar) {
      const u = await svc.from('kpi_romaneio_geracoes').update({ resumo: r }).eq('id', alvo.id).is('resumo', null)
      if (u.error) console.log(`    ERRO: ${u.error.message}`); else gravados++
    }
  }
  console.log(aplicar ? `Gravados: ${gravados}` : 'Dry-run (use --aplicar pra gravar)')
}

main().catch(e => { console.error(e); process.exit(1) })
