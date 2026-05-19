// Gera KPI Excel localmente a partir de PDF Unitrac + Escala XLSX, sem banco de dados.
// Uso (na raiz do projeto): npx tsx scripts/gerar-kpi-local.ts

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { parseUnitracPdf } from '@/lib/parsers/unitrac-pdf'
import { parseEscalaGeral } from '@/lib/parsers/escala-geral'
import { cruzaEscalaUnitrac } from '@/lib/kpi/matcher'
import { gerarKpi, type LinhaParaKpi } from '@/lib/kpi/gerador-kpi'
import type { KpiLinha } from '@/lib/types/kpi'

const PDF_PATH    = 'C:/Users/media/Downloads/relatorio_9279.pdf'
const ESCALA_PATH = 'C:/Users/media/Downloads/ESCALA GERAL DE MAIO 1 (3).xlsx'
const REDE_ID     = 'PRINCESA'
const IGNORAR     = new Set(['flamengo', 'princesa - flamengo'])

function normIgnore(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

async function main() {
  console.log('Lendo PDF Unitrac...')
  const pdfBuf = await readFile(PDF_PATH)
  const resumos = await parseUnitracPdf(pdfBuf)
  console.log(`  → ${resumos.length} veículos parseados`)
  for (const r of resumos) {
    const lojasCount = r.paradas.filter(p => p.classificacao === 'LOJA').length
    console.log(`     ${r.placa_norm}  loja-paradas=${lojasCount}  saida_cd=${r.saida_cd?.toISOString() ?? '-'}`)
  }

  // Detecta data de entrega a partir do PDF (data UTC da primeira parada LOJA)
  const todasParadasPdf = resumos.flatMap(r => r.paradas)
  const primeiraLoja = todasParadasPdf.find(p => p.classificacao === 'LOJA')
  const dataPdf = primeiraLoja
    ? primeiraLoja.chegada.toISOString().slice(0, 10)  // YYYY-MM-DD
    : null
  if (!dataPdf) { console.error('Não foi possível detectar data no PDF!'); process.exit(1) }
  console.log(`  Data detectada no PDF: ${dataPdf}`)

  console.log('\nLendo Escala XLSX...')
  const escalaBuf = await readFile(ESCALA_PATH)

  // Tenta o dia exato; se não encontrar, tenta D-1 (caminhões que saíram tarde/madrugada)
  let todasLinhas = await parseEscalaGeral(escalaBuf, dataPdf)
  let dataEscala = dataPdf
  if (!todasLinhas.some(l => l.rede_id === REDE_ID)) {
    const d = new Date(dataPdf + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    const dataMenos1 = d.toISOString().slice(0, 10)
    console.log(`  Dia ${dataPdf} não encontrado na escala, tentando ${dataMenos1}...`)
    todasLinhas = await parseEscalaGeral(escalaBuf, dataMenos1)
    dataEscala = dataMenos1
  }

  // Filtra PRINCESA e exclui Flamengo
  const linhasDoDia = todasLinhas
    .filter(l => l.rede_id === REDE_ID)
    .filter(l => !IGNORAR.has(normIgnore(l.loja_nome_raw)))

  if (linhasDoDia.length === 0) {
    console.error(`Nenhuma linha PRINCESA encontrada na escala!`)
    process.exit(1)
  }

  // A data do KPI segue a escala (data_entrega das linhas)
  const data = linhasDoDia[0].data_entrega
  console.log(`  → ${linhasDoDia.length} linhas PRINCESA (escala de ${dataEscala}, data_entrega=${data})  (excluindo Flamengo)`)

  // EscalaLinhaRow (formato interno do matcher)
  const escalaLinhaRows = linhasDoDia.map((l, i) => ({
    id: String(i + 1),
    rede_id: l.rede_id,
    placa_norm: l.placa_norm || null,
    loja_nome_raw: l.loja_nome_raw,
    loja_codigo_raw: l.loja_codigo_raw,
    motorista_nome: l.motorista_nome,
    carro_ordem: l.carro_ordem,
    data_entrega: l.data_entrega,
  }))

  // UnitracParadaRow (formato interno do matcher — datas como ISO string)
  const paradaRows = resumos.flatMap(resumo =>
    resumo.paradas.map(p => ({
      id: randomUUID(),
      placa_norm: p.placa_norm,
      chegada: p.chegada.toISOString(),
      saida: p.saida?.toISOString() ?? null,
      duracao_seg: p.duracao_seg,
      local_parada: p.local_parada,
      codigo_loja: p.codigo_loja,
      nome_loja: p.nome_loja,
      lat: p.lat,
      lng: p.lng,
      classificacao: p.classificacao,
      ordem: p.ordem,
    }))
  )

  console.log(`  → ${paradaRows.length} paradas Unitrac (todos os veículos)`)

  // Cruza escala × Unitrac
  console.log('\nCruzando...')
  const rotas = await cruzaEscalaUnitrac(
    escalaLinhaRows as Parameters<typeof cruzaEscalaUnitrac>[0],
    paradaRows as Parameters<typeof cruzaEscalaUnitrac>[1],
    [],
    undefined,
    undefined,
  )

  const matched = rotas.filter(r => r.paradas.length > 0).length
  console.log(`  → ${rotas.length} rotas | ${matched} com match GPS | ${rotas.length - matched} sem match`)

  for (const r of rotas) {
    const escala = escalaLinhaRows.find(l => l.id === r.escala_linha_id)
    const loja = escala?.loja_nome_raw ?? '?'
    if (r.paradas.length === 0) {
      console.log(`  [SEM GPS] ${loja}  (placa: ${r.placa_norm ?? '-'})`)
    } else {
      const p = r.paradas[0]
      const chd = p.chegada.toISOString().slice(11, 16)
      const sai = p.saida.toISOString().slice(11, 16)
      const saidaCd = r.saida_cd?.toISOString().slice(11, 16) ?? '-'
      const meta = r._matchMeta
      console.log(`  [OK] ${loja}  saida_cd=${saidaCd}  chd=${chd}  saida=${sai}  score=${meta?.score ?? '?'}`)
    }
  }

  // Converte RotaKpi[] → LinhaParaKpi[] (equivalente ao consolidaKpi mas sem DB)
  const escalaById = new Map(escalaLinhaRows.map(l => [l.id, l]))

  const kpiLinhas: LinhaParaKpi[] = rotas.map((rota, idx) => {
    const escala = escalaById.get(rota.escala_linha_id)
    const p1 = rota.paradas[0] ?? null
    const p2 = rota.paradas[1] ?? null
    const p3 = rota.paradas[2] ?? null

    let motorista = escala?.motorista_nome ?? null
    if (motorista && escala?.carro_ordem === 2) {
      motorista = motorista.replace(/^\(2[oº°]\s*CARRO\)\s*/i, '')
    }

    return {
      kpi_id: 'local',
      escala_linha_id: rota.escala_linha_id,
      ordem: idx + 1,
      loja_nome: escala?.loja_nome_raw ?? '',
      motorista,
      motorista_codigo: escala?.carro_ordem,
      placa: rota.placa_norm,
      carro_ordem: (escala?.carro_ordem ?? 1) as 1 | 2,
      saida_cd: rota.saida_cd,
      chd_loja_1: p1?.chegada ?? null,
      saida_loja_1: p1?.saida ?? null,
      tempo_loja_1_min: p1?.duracao_min ?? null,
      chd_loja_2: p2?.chegada ?? null,
      saida_loja_2: p2?.saida ?? null,
      tempo_loja_2_min: p2?.duracao_min ?? null,
      chd_loja_3: p3?.chegada ?? null,
      saida_loja_3: p3?.saida ?? null,
      tempo_loja_3_min: p3?.duracao_min ?? null,
      observacao: null,
      anomalias_codigos: rota.anomalias_codigos,
    } satisfies LinhaParaKpi
  })

  console.log('\nGerando Excel...')
  const excelBuf = await gerarKpi({
    rede_id: REDE_ID,
    data,
    linhas: kpiLinhas,
    arquivoExistente: null,
  })

  const outPath = join('C:/Users/media/Downloads', `KPI-PRINCESA-${data}-auto.xlsx`)
  await writeFile(outPath, excelBuf)
  console.log(`\n✓ Planilha gerada: ${outPath}`)
}

main().catch(err => {
  console.error('\nERRO:', err)
  process.exit(1)
})
