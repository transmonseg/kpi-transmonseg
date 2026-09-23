// Correcao de geocode pela parada real do dia (ver src/lib/kpi-romaneio/correcao-por-alvo.ts).
// Uso: npx tsx --env-file=.env.production scripts/corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]
// Sem --aplicar: so' gera os CSVs. Com --aplicar: grava no kpi_romaneio_geocode_cache (PRODUCAO).
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
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
import { sugerirCadastroUnitrac, type SugestaoCadastro, type RejeicaoCadastro } from '../src/lib/kpi-romaneio/cadastro-unitrac'

const limpa = (v: unknown) => String(v ?? '').replace(/[;\n\r]/g, ',')

export function montarUpsertCorrecao(s: SugestaoCorrecao) {
  return { endereco: s.endereco, lat: s.latNova, lng: s.lngNova, confiavel: true as const, motivo: null, fonte: 'parada_alvo' as const }
}

export function csvCorrecoes(sugestoes: SugestaoCorrecao[], rejeicoes: Rejeicao[]): string {
  const cab = 'acao;placa;nfs;endereco;lat_atual;lng_atual;dist_atual_m;lat_nova;lng_nova;duracao_parada_min;fonte_atual;motivo'
  const linhas = [
    ...sugestoes.map(s => ['corrigir', s.placaNorm, s.nfs.join(' '), s.endereco, s.latAtual, s.lngAtual,
      s.distAtualM != null ? Math.round(s.distAtualM) : '', s.latNova, s.lngNova, s.duracaoParadaMin, s.fonteAtual, ''].map(limpa).join(';')),
    ...rejeicoes.map(r => ['manter', r.placaNorm, r.nf, r.endereco, '', '', '', '', '', '', '', r.motivo].map(limpa).join(';')),
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

export function montarUpsertCadastro(s: SugestaoCadastro) {
  return { endereco: s.endereco, lat: s.latNova, lng: s.lngNova, confiavel: true as const, motivo: null, fonte: 'cadastro_unitrac' as const }
}

export function csvCadastroUnitrac(sugestoes: SugestaoCadastro[], rejeicoes: RejeicaoCadastro[]): string {
  const cab = 'acao;placa;nfs;endereco;lat_atual;lng_atual;dist_atual_m;lat_nova;lng_nova;dist_parada_m;fonte_atual;motivo'
  const linhas = [
    ...sugestoes.map(s => ['cadastro', s.placaNorm, s.nfs.join(' '), s.endereco, s.latAtual, s.lngAtual,
      s.distAtualM != null ? Math.round(s.distAtualM) : '', s.latNova, s.lngNova, Math.round(s.distParadaM), s.fonteAtual, ''].map(limpa).join(';')),
    ...rejeicoes.map(r => ['manter', r.placaNorm, r.nf, r.endereco, '', '', '', '', '', '', '', r.motivo].map(limpa).join(';')),
  ]
  return [cab, ...linhas].join('\n') + '\n'
}

export function csvBackupCache(linhas: { endereco: string; lat: number | null; lng: number | null; confiavel: boolean | null; fonte: string | null; motivo: string | null }[]): string {
  return ['endereco;lat;lng;confiavel;fonte;motivo', ...linhas.map(l => [l.endereco, l.lat, l.lng, l.confiavel, l.fonte, l.motivo].map(limpa).join(';'))].join('\n') + '\n'
}

type LinhaCache = { lat: number; lng: number; confiavel: boolean; fonte: string | null }

export function entregaDoRomaneio(l: { nf: string; placa: string; endereco: string }, cache: Map<string, LinhaCache>): EntregaParaCorrigir {
  const c = cache.get(l.endereco)
  return {
    nf: l.nf, placaNorm: normPlaca(l.placa), endereco: l.endereco,
    latAtual: c?.lat ?? null, lngAtual: c?.lng ?? null, confiavelAtual: c?.confiavel ?? false, fonteAtual: c?.fonte ?? null,
  }
}

async function lerCache(enderecos: string[]) {
  const svc = createServiceClient()
  const mapa = new Map<string, LinhaCache>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select('endereco,lat,lng,confiavel,fonte').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) mapa.set(r.endereco, { lat: r.lat, lng: r.lng, confiavel: r.confiavel, fonte: r.fonte ?? null })
  }
  return mapa
}

/** Corpo de main() extraido pra reuso pelo runner noturno (report-only, ver
 *  scripts/correcao-geocode-noturna.ts) -- mesma logica, so' recebe o PDF ja
 *  em memoria (em vez de ler de disco) e escreve os CSVs em `dirSaida` (em
 *  vez de sempre no cwd). --aplicar continua com a mesma semantica: sem ela,
 *  nada e' gravado no cache de producao. */
export async function rodarCorrecao(
  romaneioBuf: Buffer,
  data: string,
  opcoes: { aplicar: boolean; dirSaida: string },
): Promise<{ sugestoes: number; rejeicoes: Record<string, number>; arquivos: string[] }> {
  const romaneio = await parseRomaneio(romaneioBuf)
  const placas = [...new Set(romaneio.map(l => normPlaca(l.placa)).filter(p => p !== ''))]
  const cache = await lerCache([...new Set(romaneio.map(l => l.endereco))])
  const entregas: EntregaParaCorrigir[] = romaneio.map(l => entregaDoRomaneio(l, cache))
  const alvos = (await lerSnapshotAlvos('nutrimax', data)) ?? alvosDaData(await buscarAlvosDoDia(placas), data)
  const horarios = await buscarHorariosBase(placas, data, new Map(), true)
  const { paradasPorPlaca, placasEmApagao } = paradasConfiaveis(horarios)
  console.log(`romaneio=${romaneio.length} NFs, placas=${placas.length}, alvos=${alvos.length}, placas com paradas=${[...paradasPorPlaca.values()].filter(v => v.length).length}, placas em apagao de sinal (excluidas)=${placasEmApagao.length}`)

  // Regra 1 primeiro: cadastro Unitrac confirmado por parada real; o resto cai na regra da coordenada da parada.
  const cad = sugerirCadastroUnitrac(entregas, alvos, paradasPorPlaca)
  const enderecosCadastro = new Set(cad.sugestoes.map(x => x.endereco))
  const { sugestoes, rejeicoes } = sugerirCorrecoesPorAlvo(entregas.filter(e => !enderecosCadastro.has(e.endereco)), alvos, paradasPorPlaca)
  console.log(`cadastro_unitrac=${cad.sugestoes.length} enderecos`)
  const cont = rejeicoes.reduce<Record<string, number>>((m, r) => ({ ...m, [r.motivo]: (m[r.motivo] ?? 0) + 1 }), {})
  console.log(`sugestoes=${sugestoes.length} enderecos | rejeicoes:`, cont)

  mkdirSync(opcoes.dirSaida, { recursive: true })
  const caminhoCorrecoes = join(opcoes.dirSaida, `correcoes-geocode-${data}.csv`)
  const caminhoDivergentes = join(opcoes.dirSaida, `cadastros-unitrac-divergentes-${data}.csv`)
  writeFileSync(caminhoCorrecoes, csvCorrecoes(sugestoes, rejeicoes))
  writeFileSync(caminhoDivergentes, csvCadastrosDivergentes(sugestoes))
  writeFileSync(join(opcoes.dirSaida, `cadastro-unitrac-${data}.csv`), csvCadastroUnitrac(cad.sugestoes, cad.rejeicoes))
  console.log(`CSVs: ${caminhoCorrecoes}, ${caminhoDivergentes}`)

  if (!opcoes.aplicar) {
    console.log('(sem --aplicar: nada gravado)')
    return { sugestoes: sugestoes.length, rejeicoes: cont, arquivos: [caminhoCorrecoes, caminhoDivergentes] }
  }
  const svc = createServiceClient()
  // Backup ANTES de gravar: estado atual das linhas que serao sobrescritas.
  const alvosDoUpsert = [...sugestoes.map(x => x.endereco), ...cad.sugestoes.map(x => x.endereco)]
  const backup: Parameters<typeof csvBackupCache>[0] = []
  for (let i = 0; i < alvosDoUpsert.length; i += 20) {
    const { data: rows, error } = await svc.from('kpi_romaneio_geocode_cache').select('endereco,lat,lng,confiavel,fonte,motivo').in('endereco', alvosDoUpsert.slice(i, i + 20))
    if (error) throw new Error(`backup do cache falhou: ${error.message}`)
    backup.push(...(rows ?? []))
  }
  writeFileSync(join(opcoes.dirSaida, `backup-cache-antes-${data}.csv`), csvBackupCache(backup))
  console.log(`backup: ${backup.length} linhas em backup-cache-antes-${data}.csv`)
  let okCad = 0
  for (const s of cad.sugestoes) {
    const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(montarUpsertCadastro(s), { onConflict: 'endereco' })
    if (error) console.error(`falha ${s.endereco}: ${error.message}`); else okCad++
  }
  console.log(`cadastro_unitrac gravados ${okCad}/${cad.sugestoes.length}`)
  if (okCad < cad.sugestoes.length) throw new Error(`gravados apenas ${okCad}/${cad.sugestoes.length} (cadastro_unitrac)`)
  let ok = 0
  for (const s of sugestoes) {
    const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(montarUpsertCorrecao(s), { onConflict: 'endereco' })
    if (error) console.error(`falha ${s.endereco}: ${error.message}`); else ok++
  }
  console.log(`gravados ${ok}/${sugestoes.length}`)
  if (ok < sugestoes.length) throw new Error(`gravados apenas ${ok}/${sugestoes.length} no cache`)
  return { sugestoes: sugestoes.length, rejeicoes: cont, arquivos: [caminhoCorrecoes, caminhoDivergentes] }
}

async function main() {
  const [romaneioPath, data] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const aplicar = process.argv.includes('--aplicar')
  if (!romaneioPath || !/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: corrigir-geocode-por-alvo.ts <romaneio.pdf> <AAAA-MM-DD> [--aplicar]'); process.exit(1)
    return
  }
  await rodarCorrecao(Buffer.from(readFileSync(romaneioPath)), data, { aplicar, dirSaida: process.cwd() })
}

// So' roda o CLI quando este arquivo e' o entrypoint -- o runner noturno
// (correcao-geocode-noturna.ts) importa rodarCorrecao daqui, e sem essa
// checagem o main() deste arquivo rodava junto, lia o argv do outro script
// e saia com a mensagem de uso (achado no 1o teste real, 23/09).
const ehEntrypoint = (process.argv[1] ?? '').endsWith('corrigir-geocode-por-alvo.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
