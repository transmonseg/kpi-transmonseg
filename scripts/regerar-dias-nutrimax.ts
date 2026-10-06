// Regenera o KPI da Nutry Max de dias passados com as regras atuais (06/10,
// "regera tudo": volta falsa a base, base de Lagos, pao em Campos, parada de
// outro cliente etc. mudaram depois que esses dias foram gerados).
//
// Uso: npx tsx --env-file=.env.production scripts/regerar-dias-nutrimax.ts AAAA-MM-DD [AAAA-MM-DD ...] [--aplicar]
// Sem --aplicar: só mostra antes x depois (taxa, entregues) e as trocas de
// carro sugeridas pelo GPS. Com --aplicar: grava uma geração nova (o
// dashboard passa a usar esta; as antigas ficam no histórico).
import { createServiceClient } from '../src/lib/supabase/service'
import { gerarKpiNutrimax } from '../src/lib/kpi-romaneio/gerar-nutrimax'
import { parseEscala } from '../src/lib/kpi-romaneio/parse-escala'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '../src/lib/kpi-romaneio/parse-pao'
import { extrairResumoKpiXlsx } from '../src/lib/kpi-romaneio/resumo-dashboard'
import { salvarGeracao } from '../src/lib/kpi-romaneio/historico'
import { novoPrefixoGeracao, guardarXlsxGerado } from '../src/lib/kpi-romaneio/xlsx-gerado'
import { sugerirTrocas, type SugestaoTroca } from '../src/lib/kpi-romaneio/sugerir-trocas'
import { normPlaca } from '../src/lib/unitrac-api'
import { entradaDoDia } from '../src/lib/kpi-romaneio/ao-vivo-servico'

const BUCKET = 'kpi-romaneio-inputs'

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const datas = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a))
  const svc = createServiceClient()
  for (const data of datas) {
    // Entrada mais completa do dia: geração com o pão guardado vence a sem pão
    // (05/10: a última com PDF não tinha o pão -- 898 NFs x 976 de verdade).
    const { data: gs } = await svc.from('kpi_romaneio_geracoes')
      .select('escala_storage_path, romaneio_storage_path, pao_storage_path, gerado_em')
      .eq('cliente', 'nutrimax').eq('data_referencia', data).not('romaneio_storage_path', 'is', null)
      .order('gerado_em', { ascending: false })
    const g = (gs ?? []).find(x => x.pao_storage_path) ?? (gs ?? [])[0]
    // "Antes" = o que o dashboard mostra hoje (última geração do dia, qualquer uma).
    const { data: atual } = await svc.from('kpi_romaneio_geracoes').select('resumo')
      .eq('cliente', 'nutrimax').eq('data_referencia', data).order('gerado_em', { ascending: false }).limit(1).maybeSingle()
    const aoVivo = await entradaDoDia('nutrimax', data)
    if (!g && !aoVivo) { console.log(`${data}: sem PDFs guardados, pulado`); continue }
    const baixar = async (p: string | null) => {
      if (!p) return null
      const { data: arq, error } = await svc.storage.from(BUCKET).download(p)
      if (error || !arq) throw new Error(`download ${p}: ${error?.message}`)
      return Buffer.from(await arq.arrayBuffer())
    }
    let entrada
    if (g && (g.pao_storage_path || !aoVivo?.paoEnviado)) {
      const [e, r, pa] = await Promise.all([baixar(g.escala_storage_path), baixar(g.romaneio_storage_path), baixar(g.pao_storage_path)])
      entrada = { data, escala: e ? await parseEscala(e) : [], romaneio: await parseRomaneio(r!), pao: pa ? await parsePao(pa, data) : { linhas: [], escala: [] }, escalaEnviada: !!e, paoEnviado: !!pa }
    } else {
      entrada = aoVivo!
    }
    let sugestoes: SugestaoTroca[] = []
    const res = await gerarKpiNutrimax(entrada, { aoMontarDetalhe: ({ romaneioGeo, paradasPorPlaca }) => {
      const pontos = romaneioGeo.filter(l => l.lat != null && l.lng != null).map(l => ({ carga: l.carga, placa: normPlaca(l.placa), endereco: l.endereco, lat: l.lat as number, lng: l.lng as number }))
      sugestoes = sugerirTrocas(pontos, paradasPorPlaca)
    } })
    const novo = await extrairResumoKpiXlsx(res.xlsx)
    const antes = atual?.resumo as { taxa?: number; entregues?: number; nfsNaConta?: number } | null
    console.log(`ENTRADA ${data}: ${entrada.romaneio.length} romaneio + ${entrada.pao.linhas.length} pão (${g && entrada !== aoVivo ? 'PDFs da geração' : 'ao vivo'})`)
    console.log(`RES ${data}: antes ${antes?.taxa ?? '?'}% (${antes?.entregues ?? '?'}/${antes?.nfsNaConta ?? '?'}) -> depois ${novo.taxa}% (${novo.entregues}/${novo.nfsNaConta})`)
    for (const s of sugestoes) console.log(`TROCA ${data}: ${s.carga} ${s.placaEscala} -> ${s.placaSugerida} (${s.enderecosVisitados}/${s.enderecosDaCarga})`)
    if (!aplicar) continue
    const arquivoStoragePath = await guardarXlsxGerado(svc, novoPrefixoGeracao('nutrimax', data), res.xlsx)
    await salvarGeracao({
      cliente: 'nutrimax', dataReferencia: data, geradoPor: 'Claude (regerado com as correções de 06/10)', qtdCargas: res.qtdCargasNutry,
      arquivoStoragePath, escalaStoragePath: g?.escala_storage_path ?? null, romaneioStoragePath: g?.romaneio_storage_path ?? null, paoStoragePath: g?.pao_storage_path ?? null, resumo: novo,
    })
    console.log(`GRAVADO ${data}`)
  }
}
main().catch(err => { console.error('ERRO', err); process.exit(1) })
