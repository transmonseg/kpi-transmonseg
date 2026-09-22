// Correcao de geocode pela parada real do dia (ver src/lib/kpi-romaneio/correcao-por-alvo.ts).
// Uso: npx tsx --env-file=.env.production scripts/corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]
// Sem --aplicar: so' gera os CSVs. Com --aplicar: grava no kpi_romaneio_geocode_cache (PRODUCAO).
import { readFileSync, writeFileSync } from 'fs'
import { parseRomaneio } from '../src/lib/kpi-romaneio/parse-romaneio'
import { lerSnapshotAlvos } from '../src/lib/kpi-romaneio/alvos-snapshot'
import { alvosDaData } from '../src/lib/kpi-romaneio/alvos-data'
import { buscarAlvosDoDia } from '../src/lib/kpi-romaneio/unitrac'
import { buscarHorariosBase, type HorarioBase, type ParadaBridge } from '../src/lib/kpi-romaneio/base-horarios'
import { normPlaca } from '../src/lib/unitrac-api'
import { createServiceClient } from '../src/lib/supabase/service'
import {
  sugerirCorrecoesPorAlvo, LIMITE_CADASTRO_DIVERGENTE_M,
  type EntregaParaCorrigir, type Rejeicao, type SugestaoCorrecao,
} from '../src/lib/kpi-romaneio/correcao-por-alvo'

const limpa = (v: unknown) => String(v ?? '').replace(/[;\n\r]/g, ',')

export function montarUpsertCorrecao(s: SugestaoCorrecao) {
  return { endereco: s.endereco, lat: s.latNova, lng: s.lngNova, confiavel: true as const, motivo: null, fonte: 'parada_alvo' as const }
}

export function csvCorrecoes(sugestoes: SugestaoCorrecao[], rejeicoes: Rejeicao[]): string {
  const cab = 'acao;placa;nfs;endereco;lat_atual;lng_atual;dist_atual_m;lat_nova;lng_nova;duracao_parada_min;motivo'
  const linhas = [
    ...sugestoes.map(s => ['corrigir', s.placaNorm, s.nfs.join(' '), s.endereco, s.latAtual, s.lngAtual,
      s.distAtualM != null ? Math.round(s.distAtualM) : '', s.latNova, s.lngNova, s.duracaoParadaMin, ''].map(limpa).join(';')),
    ...rejeicoes.map(r => ['manter', r.placaNorm, r.nf, r.endereco, '', '', '', '', '', '', r.motivo].map(limpa).join(';')),
  ]
  return [cab, ...linhas].join('\n') + '\n'
}

export function csvCadastrosDivergentes(sugestoes: SugestaoCorrecao[]): string {
  const cab = 'codigo_unitrac;placa;nfs;endereco;cadastro_lat;cadastro_lng;parada_real_lat;parada_real_lng;distancia_m'
  const linhas = sugestoes
    .filter(s => s.distCadastroM != null && s.distCadastroM > LIMITE_CADASTRO_DIVERGENTE_M)
    .sort((a, b) => (b.distCadastroM ?? 0) - (a.distCadastroM ?? 0))
    .map(s => [s.codigoUnitrac, s.placaNorm, s.nfs.join(' '), s.endereco, s.cadastroLat, s.cadastroLng, s.latNova, s.lngNova, Math.round(s.distCadastroM as number)].map(limpa).join(';'))
  return [cab, ...linhas].join('\n') + '\n'
}

// Controller ruling 22/09: dia com apagao de sinal congela a ultima posicao
// conhecida -- as paradas derivadas nesse dia nao sao evidencia de parada
// real, entao a placa fica sem nenhuma parada pra essa correcao (rejeita
// tudo dela como 'feito_fora_de_parada'/'sem_alvo_feito' em vez de arriscar
// gravar coordenada errada por congelamento de GPS).
export function paradasConfiaveis(horarios: Map<string, HorarioBase>): { paradasPorPlaca: Map<string, ParadaBridge[]>; placasEmApagao: string[] } {
  const paradasPorPlaca = new Map<string, ParadaBridge[]>()
  const placasEmApagao: string[] = []
  for (const [placa, h] of horarios) {
    if (h.apagaoDeSinal === true) {
      paradasPorPlaca.set(placa, [])
      placasEmApagao.push(placa)
    } else {
      paradasPorPlaca.set(placa, h.paradas ?? [])
    }
  }
  return { paradasPorPlaca, placasEmApagao }
}

async function lerCache(enderecos: string[]) {
  const svc = createServiceClient()
  const mapa = new Map<string, { lat: number; lng: number; confiavel: boolean }>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select('endereco,lat,lng,confiavel').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) mapa.set(r.endereco, { lat: r.lat, lng: r.lng, confiavel: r.confiavel })
  }
  return mapa
}

async function main() {
  const [romaneioPath, data] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const aplicar = process.argv.includes('--aplicar')
  if (!romaneioPath || !/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]'); process.exit(1)
  }
  const romaneio = await parseRomaneio(Buffer.from(readFileSync(romaneioPath)))
  const placas = [...new Set(romaneio.map(l => normPlaca(l.placa)).filter(p => p !== ''))]
  const cache = await lerCache([...new Set(romaneio.map(l => l.endereco))])
  const entregas: EntregaParaCorrigir[] = romaneio.map(l => {
    const c = cache.get(l.endereco)
    return { nf: l.nf, placaNorm: normPlaca(l.placa), endereco: l.endereco, latAtual: c?.lat ?? null, lngAtual: c?.lng ?? null, confiavelAtual: c?.confiavel ?? false }
  })
  const alvos = (await lerSnapshotAlvos('nutrimax', data)) ?? alvosDaData(await buscarAlvosDoDia(placas), data)
  const horarios = await buscarHorariosBase(placas, data, new Map(), true)
  const { paradasPorPlaca, placasEmApagao } = paradasConfiaveis(horarios)
  console.log(`romaneio=${romaneio.length} NFs, placas=${placas.length}, alvos=${alvos.length}, placas com paradas=${[...paradasPorPlaca.values()].filter(v => v.length).length}, placas em apagao de sinal (excluidas)=${placasEmApagao.length}`)

  const { sugestoes, rejeicoes } = sugerirCorrecoesPorAlvo(entregas, alvos, paradasPorPlaca)
  const cont = rejeicoes.reduce<Record<string, number>>((m, r) => ({ ...m, [r.motivo]: (m[r.motivo] ?? 0) + 1 }), {})
  console.log(`sugestoes=${sugestoes.length} enderecos | rejeicoes:`, cont)
  writeFileSync(`correcoes-geocode-${data}.csv`, csvCorrecoes(sugestoes, rejeicoes))
  writeFileSync(`cadastros-unitrac-divergentes-${data}.csv`, csvCadastrosDivergentes(sugestoes))
  console.log(`CSVs: correcoes-geocode-${data}.csv, cadastros-unitrac-divergentes-${data}.csv`)

  if (!aplicar) { console.log('(sem --aplicar: nada gravado)'); return }
  const svc = createServiceClient()
  let ok = 0
  for (const s of sugestoes) {
    const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(montarUpsertCorrecao(s), { onConflict: 'endereco' })
    if (error) console.error(`falha ${s.endereco}: ${error.message}`); else ok++
  }
  console.log(`gravados ${ok}/${sugestoes.length}`)
  if (ok < sugestoes.length) process.exit(1)
}

if (process.env.VITEST !== 'true') main().catch(e => { console.error(e); process.exit(1) })
