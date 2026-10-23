// F1-14 (GEO-25, auditoria 23/10): normalizarEndereco trocava a cidade real
// quando o bairro comecava com nome de municipio ("SAO FRANCISCO DE ASSIS,
// BARRA MANSA" -> Sao Francisco de Itabapoana) e grafava TRAJANO DE MORAIS. O
// codigo novo gera outra chave de cache pra esses enderecos. Este script monta
// o plano a partir dos enderecos BRUTOS das NFs (a chave antiga ja' perdeu a
// cidade, nao da' pra recalcular a nova so' com ela -- por isso nao serve o
// migrar-correcoes-cache-geocode.ts do GEO-10):
//   - migrar: correcao humana (manual, verificacao_manual, cadastro_unitrac)
//     na chave antiga, que so' uma cidade usava -> vai pra chave nova;
//   - revisar_colisao: correcao humana numa chave antiga de 2+ cidades -- o
//     dono decide de qual cidade ela e';
//   - manter_nova: a chave nova ja' tem linha que vence pela regra da leitura;
//   - refazer_geocode: o que havia era geocode automatico feito na cidade
//     errada -- a cascata refaz na proxima geracao.
// So' "migrar" e' gravado com --aplicar (backup JSON antes). A linha antiga
// nunca e' apagada.
// Uso: npx tsx --env-file=.env.production scripts/migrar-chaves-cidade-trocada.ts [--aplicar] [--csv arquivo.csv]
import { writeFileSync } from 'fs'
import { separarCep, chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'
import { expandirSegmentoCidade } from '../src/lib/kpi-romaneio/normalizar-endereco'
import { escolherLinhaCache, prioridadeFonte } from '../src/lib/kpi-romaneio/geocode'
import { normalizarEnderecoLegado } from './normalizar-endereco-legado'

export type LinhaCache = { endereco: string; lat: number; lng: number; fonte: string | null; confiavel: boolean; motivo: string | null; precisao: string | null }
export type AcaoMigracao = 'migrar' | 'revisar_colisao' | 'manter_nova' | 'refazer_geocode'
export type ItemPlano = {
  chaveAntiga: string
  chaveNova: string
  municipio: string | null
  enderecos: string[]
  nfs: number
  colisao: string[] | null
  antiga: LinhaCache | null
  nova: LinhaCache | null
  acao: AcaoMigracao
}

export function chaveAntiga(endereco: string): string {
  return normalizarEnderecoLegado(separarCep(endereco).chave)
}

const semAcento = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Cidade do romaneio: a de "BAIRRO, CIDADE" (a partir do 2o segmento " - ")
 *  quando conhecida; senao o segmento que e' cidade; senao o primeiro
 *  "X, CIDADE" depois da rua. Sem acento, nome completo. */
export function municipioDoEndereco(endereco: string): string | null {
  const corpo = separarCep(endereco).chave.replace(/\s+-\s*[A-Z]{2}\s*$/i, '').replace(/\s+-\s*$/, '')
  const segs = corpo.split(' - ').map(s => s.trim())
  const canon = (c: string) => semAcento(expandirSegmentoCidade(c) ?? c)
  const depoisDaVirgula = (s: string) => s.slice(s.lastIndexOf(', ') + 2)
  for (let i = 1; i < segs.length; i++) if (segs[i].includes(', ') && expandirSegmentoCidade(depoisDaVirgula(segs[i]))) return canon(depoisDaVirgula(segs[i]))
  for (let i = segs.length - 1; i >= 1; i--) if (expandirSegmentoCidade(segs[i])) return canon(segs[i])
  for (let i = 1; i < segs.length; i++) if (segs[i].includes(', ')) return canon(depoisDaVirgula(segs[i]))
  return null
}

export function planejarMigracaoCidade(enderecos: { endereco: string; nfs: number }[], cache: Map<string, LinhaCache>): ItemPlano[] {
  // Cidades que caiam em cada chave antiga (TODOS os enderecos, mudando ou nao).
  const cidadesPorAntiga = new Map<string, Set<string>>()
  const porNova = new Map<string, { antigas: Set<string>; enderecos: string[]; nfs: number; municipio: string | null }>()
  for (const { endereco, nfs } of enderecos) {
    const a = chaveAntiga(endereco), n = chaveCacheEndereco(endereco), m = municipioDoEndereco(endereco)
    const set = cidadesPorAntiga.get(a) ?? new Set<string>()
    set.add(m ?? '?')
    cidadesPorAntiga.set(a, set)
    if (a === n) continue
    const g = porNova.get(n) ?? { antigas: new Set<string>(), enderecos: [], nfs: 0, municipio: m }
    g.antigas.add(a); g.enderecos.push(endereco); g.nfs += nfs
    porNova.set(n, g)
  }
  const plano: ItemPlano[] = []
  for (const [chaveNova, g] of porNova) {
    for (const antigaK of g.antigas) {
      const antiga = cache.get(antigaK) ?? null
      const nova = cache.get(chaveNova) ?? null
      const cidades = [...(cidadesPorAntiga.get(antigaK) ?? [])].sort()
      const colisao = cidades.length > 1 ? cidades : null
      let acao: AcaoMigracao = 'refazer_geocode'
      if (antiga && prioridadeFonte(antiga.fonte) > 0) {
        if (colisao) acao = 'revisar_colisao'
        // Correcao humana ja' feita na chave nova (mesma prioridade ou maior)
        // nunca e' sobrescrita.
        else if (nova && prioridadeFonte(nova.fonte) >= prioridadeFonte(antiga.fonte)) acao = 'manter_nova'
        else if (escolherLinhaCache(nova ?? undefined, antiga) !== antiga) acao = 'manter_nova'
        else acao = 'migrar'
      } else if (nova) acao = 'manter_nova'
      plano.push({ chaveAntiga: antigaK, chaveNova, municipio: g.municipio, enderecos: g.enderecos, nfs: g.nfs, colisao, antiga, nova, acao })
    }
  }
  return plano.sort((a, b) => a.acao.localeCompare(b.acao) || a.chaveNova.localeCompare(b.chaveNova))
}

const csvCampo = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvPlanoCidade(plano: ItemPlano[]): string {
  const cab = ['acao', 'municipio_romaneio', 'nfs', 'chave_antiga', 'chave_nova', 'fonte_antiga', 'lat_antiga', 'lng_antiga', 'confiavel_antiga', 'fonte_nova', 'lat_nova', 'lng_nova', 'colisao', 'endereco_exemplo']
  const linhas = plano.map(p => [p.acao, p.municipio, p.nfs, p.chaveAntiga, p.chaveNova, p.antiga?.fonte, p.antiga?.lat, p.antiga?.lng, p.antiga?.confiavel, p.nova?.fonte, p.nova?.lat, p.nova?.lng, p.colisao?.join(' | '), p.enderecos[0]].map(csvCampo).join(','))
  return [cab.join(','), ...linhas].join('\n')
}

async function main() {
  const { createServiceClient } = await import('../src/lib/supabase/service')
  const aplicar = process.argv.includes('--aplicar')
  const iCsv = process.argv.indexOf('--csv')
  const arquivoCsv = iCsv > 0 ? process.argv[iCsv + 1] : `migrar-chaves-cidade-trocada-${new Date().toISOString().slice(0, 10)}.csv`
  const sb = createServiceClient()

  // Enderecos brutos: todas as NFs guardadas no Ao vivo (Nutry e RQ).
  const nfsPorEndereco = new Map<string, number>()
  const { data: dias, error: eDias } = await sb.from('kpi_ao_vivo_calculo').select('cliente, data')
  if (eDias) throw new Error(eDias.message)
  for (const d of dias ?? []) {
    const { data: row, error } = await sb.from('kpi_ao_vivo_calculo').select('resultado').eq('cliente', d.cliente).eq('data', d.data).maybeSingle()
    if (error) throw new Error(error.message)
    for (const p of (row?.resultado as { placas?: { nfs: { endereco?: string }[] }[] } | null)?.placas ?? []) {
      for (const n of p.nfs) if (n.endereco) nfsPorEndereco.set(n.endereco, (nfsPorEndereco.get(n.endereco) ?? 0) + 1)
    }
  }
  const enderecos = [...nfsPorEndereco].map(([endereco, nfs]) => ({ endereco, nfs }))
  const chaves = new Set<string>()
  for (const { endereco } of enderecos) {
    const a = chaveAntiga(endereco), n = chaveCacheEndereco(endereco)
    if (a !== n) { chaves.add(a); chaves.add(n) }
  }
  const cache = new Map<string, LinhaCache>()
  const lista = [...chaves]
  for (let i = 0; i < lista.length; i += 100) {
    const { data, error } = await sb.from('kpi_romaneio_geocode_cache').select('endereco, lat, lng, fonte, confiavel, motivo, precisao').in('endereco', lista.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const l of (data ?? []) as LinhaCache[]) cache.set(l.endereco, l)
  }
  const plano = planejarMigracaoCidade(enderecos, cache)
  writeFileSync(arquivoCsv, csvPlanoCidade(plano))
  const porAcao = new Map<string, { chaves: number; nfs: number }>()
  for (const p of plano) { const x = porAcao.get(p.acao) ?? { chaves: 0, nfs: 0 }; x.chaves++; x.nfs += p.nfs; porAcao.set(p.acao, x) }
  console.log(`dias lidos: ${dias?.length ?? 0}; enderecos: ${enderecos.length}; chaves que mudam: ${plano.length}`)
  for (const [a, x] of porAcao) console.log(`  ${a}: ${x.chaves} chaves, ${x.nfs} NFs`)
  console.log(`plano em ${arquivoCsv}`)
  if (!aplicar) { console.log('modo teste: nada gravado (use --aplicar)'); return }

  const migrar = plano.filter(p => p.acao === 'migrar' && p.antiga)
  const backup = `/tmp/backup-chaves-cidade-trocada-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
  writeFileSync(backup, JSON.stringify(migrar.map(m => ({ chave: m.chaveNova, antes: m.nova }))))
  for (let i = 0; i < migrar.length; i += 200) {
    const lote = migrar.slice(i, i + 200).map(m => ({ endereco: m.chaveNova, lat: m.antiga!.lat, lng: m.antiga!.lng, fonte: m.antiga!.fonte, confiavel: m.antiga!.confiavel, motivo: m.antiga!.motivo, precisao: m.antiga!.precisao }))
    const { error } = await sb.from('kpi_romaneio_geocode_cache').upsert(lote, { onConflict: 'endereco' })
    if (error) throw new Error(error.message)
  }
  console.log(`gravado: ${migrar.length} chaves. backup das linhas sobrescritas: ${backup}`)
}

if (process.argv[1]?.endsWith('migrar-chaves-cidade-trocada.ts')) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
