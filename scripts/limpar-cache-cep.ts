// Limpeza das linhas do kpi_romaneio_geocode_cache gravadas com o sufixo de
// CEP na chave (regressao do Romaneio de 01/10/2026 -- ver
// src/lib/kpi-romaneio/endereco-cep.ts). Desde o fix, o geocode le/grava pela
// chave SEM CEP e so' usa a linha com CEP como fallback; estas linhas viraram
// duplicata da versao sem CEP.
//
// Plano por linha com CEP (agrupado pela chave sem CEP):
//   - apagar:   a versao sem CEP existe e ja' vence na leitura (escolherLinhaCache)
//   - migrar:   a versao sem CEP existe mas a com CEP vence (correcao manual /
//               verificacao_manual / cadastro_unitrac sobre fonte automatica) --
//               copia lat/lng/fonte/confiavel/motivo pra chave sem CEP e apaga a com CEP
//   - renomear: nao existe versao sem CEP -- cria a chave sem CEP com os dados da
//               melhor variante com CEP e apaga a com CEP (mesma coordenada)
//   - variantes extras (ex.: com e sem hifen no CEP) alem da melhor: apagar
// Em todos os casos a coordenada que o geocode usa pra cada endereco nao muda.
//
// Uso:
//   npx tsx --env-file=.env.production scripts/limpar-cache-cep.ts [--saida <dir>]            (so' lista + CSV)
//   npx tsx --env-file=.env.production scripts/limpar-cache-cep.ts --aplicar [--saida <dir>]  (backup CSV antes, depois grava)
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createServiceClient } from '../src/lib/supabase/service'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'
import { escolherLinhaCache } from '../src/lib/kpi-romaneio/geocode'

export type LinhaCacheCompleta = {
  endereco: string
  lat: number
  lng: number
  confiavel: boolean
  fonte: string | null
  motivo: string | null
  criado_em: string
}

export type ItemPlano = {
  acao: 'apagar' | 'migrar' | 'renomear'
  endereco: string // linha com CEP
  chave: string // chave sem CEP
  com: LinhaCacheCompleta
  sem: LinhaCacheCompleta | null
}

/** Pura. Recebe as linhas com CEP e as versoes sem CEP que existirem (qualquer
 *  outra linha e' ignorada) e devolve o plano. */
export function planejarLimpezaCep(linhas: LinhaCacheCompleta[]): ItemPlano[] {
  const porEndereco = new Map(linhas.map(l => [l.endereco, l]))
  const gruposCep = new Map<string, LinhaCacheCompleta[]>()
  for (const l of linhas) {
    const chave = chaveCacheEndereco(l.endereco)
    if (chave === l.endereco) continue
    const g = gruposCep.get(chave) ?? []
    g.push(l)
    gruposCep.set(chave, g)
  }
  const plano: ItemPlano[] = []
  for (const [chave, variantes] of gruposCep) {
    const sem = porEndereco.get(chave) ?? null
    const melhor = variantes.reduce((m, v) => (escolherLinhaCache(m, v) === v ? v : m))
    let acaoMelhor: ItemPlano['acao']
    if (!sem) acaoMelhor = 'renomear'
    else acaoMelhor = escolherLinhaCache(sem, melhor) === melhor ? 'migrar' : 'apagar'
    plano.push({ acao: acaoMelhor, endereco: melhor.endereco, chave, com: melhor, sem })
    for (const v of variantes) if (v !== melhor) plano.push({ acao: 'apagar', endereco: v.endereco, chave, com: v, sem })
  }
  return plano
}

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const limpa = (v: unknown) => String(v ?? '').replace(/[;\n\r]/g, ',')

export function csvPlano(plano: ItemPlano[]): string {
  const cab = 'acao;endereco_com_cep;chave_sem_cep;fonte_com;lat_com;lng_com;fonte_sem;lat_sem;lng_sem;dist_m'
  const linhas = plano.map(p => [
    p.acao, p.endereco, p.chave, p.com.fonte, p.com.lat, p.com.lng,
    p.sem?.fonte, p.sem?.lat, p.sem?.lng, p.sem ? Math.round(distM(p.com, p.sem)) : '',
  ].map(limpa).join(';'))
  return [cab, ...linhas].join('\n') + '\n'
}

export function csvBackupCompleto(linhas: LinhaCacheCompleta[]): string {
  return ['endereco;lat;lng;confiavel;fonte;motivo;criado_em',
    ...linhas.map(l => [l.endereco, l.lat, l.lng, l.confiavel, l.fonte, l.motivo, l.criado_em].map(limpa).join(';'))].join('\n') + '\n'
}

const COLUNAS = 'endereco,lat,lng,confiavel,fonte,motivo,criado_em'
const TABELA = 'kpi_romaneio_geocode_cache'
// Pre-filtro no servidor (regex POSIX do PostgREST `match`); o corte exato e'
// o de chaveCacheEndereco, aplicado em seguida.
const REGEX_CEP_SERVIDOR = '[-,] *([0-9]{5}-?[0-9]{3}|[0-9]{4}-[0-9]{4}) *$'

async function lerLinhas(svc: ReturnType<typeof createServiceClient>): Promise<LinhaCacheCompleta[]> {
  const comCep: LinhaCacheCompleta[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await svc.from(TABELA).select(COLUNAS).filter('endereco', 'match', REGEX_CEP_SERVIDOR).order('endereco').range(de, de + 999)
    if (error) throw new Error(`leitura das linhas com CEP falhou: ${error.message}`)
    comCep.push(...((data ?? []) as LinhaCacheCompleta[]).filter(l => chaveCacheEndereco(l.endereco) !== l.endereco))
    if (!data || data.length < 1000) break
  }
  const chaves = [...new Set(comCep.map(l => chaveCacheEndereco(l.endereco)))]
  const semCep: LinhaCacheCompleta[] = []
  for (let i = 0; i < chaves.length; i += 20) {
    const { data, error } = await svc.from(TABELA).select(COLUNAS).in('endereco', chaves.slice(i, i + 20))
    if (error) throw new Error(`leitura das versoes sem CEP falhou: ${error.message}`)
    semCep.push(...((data ?? []) as LinhaCacheCompleta[]))
  }
  return [...comCep, ...semCep]
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const iSaida = process.argv.indexOf('--saida')
  const dirSaida = iSaida >= 0 && process.argv[iSaida + 1] ? process.argv[iSaida + 1] : process.cwd()
  mkdirSync(dirSaida, { recursive: true })

  const svc = createServiceClient()
  const linhas = await lerLinhas(svc)
  const plano = planejarLimpezaCep(linhas)
  const cont = plano.reduce<Record<string, number>>((m, p) => ({ ...m, [p.acao]: (m[p.acao] ?? 0) + 1 }), {})
  const caminhoPlano = join(dirSaida, 'limpar-cache-cep-plano.csv')
  writeFileSync(caminhoPlano, csvPlano(plano))
  console.log(`linhas com CEP: ${plano.length} | plano: ${JSON.stringify(cont)} | CSV: ${caminhoPlano}`)
  for (const p of plano.filter(x => x.acao === 'migrar')) {
    console.log(`  migrar: ${p.endereco} (${p.com.fonte}) -> ${p.chave} (era ${p.sem?.fonte})`)
  }
  if (!aplicar) {
    console.log('(sem --aplicar: nada gravado)')
    return
  }

  // Backup ANTES de gravar: toda linha com CEP do plano + toda versao sem CEP que sera' sobrescrita.
  const backup = [...plano.map(p => p.com), ...plano.filter(p => p.acao === 'migrar' && p.sem).map(p => p.sem as LinhaCacheCompleta)]
  const caminhoBackup = join(dirSaida, `backup-limpar-cache-cep-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`)
  writeFileSync(caminhoBackup, csvBackupCompleto(backup))
  console.log(`backup: ${backup.length} linhas em ${caminhoBackup}`)

  const upserts = plano.filter(p => p.acao === 'migrar' || p.acao === 'renomear')
    .map(p => ({ endereco: p.chave, lat: p.com.lat, lng: p.com.lng, confiavel: p.com.confiavel, fonte: p.com.fonte, motivo: p.com.motivo }))
  for (let i = 0; i < upserts.length; i += 100) {
    const { error } = await svc.from(TABELA).upsert(upserts.slice(i, i + 100), { onConflict: 'endereco' })
    if (error) throw new Error(`upsert falhou (lote ${i}): ${error.message} -- nada foi apagado ainda; backup em ${caminhoBackup}`)
  }
  console.log(`gravadas ${upserts.length} chaves sem CEP (migrar+renomear)`)

  const apagar = plano.map(p => p.endereco)
  for (let i = 0; i < apagar.length; i += 20) {
    const { error } = await svc.from(TABELA).delete().in('endereco', apagar.slice(i, i + 20))
    if (error) throw new Error(`delete falhou (lote ${i}): ${error.message} -- backup em ${caminhoBackup}`)
  }
  console.log(`apagadas ${apagar.length} linhas com CEP`)
}

const ehEntrypoint = (process.argv[1] ?? '').endsWith('limpar-cache-cep.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
