// Aplica as correcoes de coordenada verificadas manualmente (Task 5, verificacao
// manual de 24/09) no kpi_romaneio_geocode_cache.
//
// Entrada: CSV `endereco;lat;lng;fonte;evidencia` (ex.
// ~/ClaudeGerado/kpi-regen-0922/correcoes-geocode-24-09.csv). A chave e' o
// endereco EXATO (trim/uppercase da fonte, sem colapsar espaco interno -- ver
// cadastrar-endereco-manual.ts) igual ao que geocode.ts grava/le no cache.
//
// Uso:
//   npx tsx scripts/aplicar-correcoes-geocode.ts <correcoes.csv>              (so' imprime, nada grava)
//   npx tsx --env-file=.env.production scripts/aplicar-correcoes-geocode.ts <correcoes.csv> --aplicar
//
// Sem --aplicar: le o CSV e imprime o que seria gravado (nenhuma rede).
// Com --aplicar: le o estado atual das linhas no cache (backup CSV antes de
// gravar) e faz upsert onConflict:'endereco' -- NUNCA sobrescreve uma linha
// com fonte === 'manual' (correcao humana anterior vence a automatica desta
// verificacao, mesmo mesmo indicando coordenada diferente).
import { readFileSync, writeFileSync } from 'fs'
import { createServiceClient } from '../src/lib/supabase/service'

export type LinhaCorrecao = { endereco: string; lat: number; lng: number; fonte: string; evidencia: string }

/** Parser simples de CSV `;` com aspas duplas pra campos que contem `;`/`,`/quebra de linha
 *  (a evidencia tem virgula e ponto-e-virgula em texto livre). */
export function parseCsvCorrecoes(conteudo: string): LinhaCorrecao[] {
  const linhas = dividirLinhasCsv(conteudo)
  if (linhas.length === 0) return []
  const [, ...resto] = linhas // descarta cabecalho
  return resto
    .filter(l => l.trim() !== '')
    .map(l => {
      const campos = dividirCamposCsv(l)
      const [endereco, latStr, lngStr, fonte, evidencia] = campos
      return { endereco: (endereco ?? '').trim(), lat: Number(latStr), lng: Number(lngStr), fonte: fonte ?? '', evidencia: evidencia ?? '' }
    })
}

/** Quebra o CSV em linhas respeitando aspas (uma linha pode conter \n dentro de "..."). */
function dividirLinhasCsv(conteudo: string): string[] {
  const linhas: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (const ch of conteudo.replace(/\r\n/g, '\n')) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas
    if (ch === '\n' && !dentroDeAspas) {
      linhas.push(atual)
      atual = ''
    } else {
      atual += ch
    }
  }
  if (atual.trim() !== '') linhas.push(atual)
  return linhas
}

function dividirCamposCsv(linha: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (ch === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++ } else { dentroDeAspas = !dentroDeAspas }
    } else if (ch === ';' && !dentroDeAspas) {
      campos.push(atual)
      atual = ''
    } else {
      atual += ch
    }
  }
  campos.push(atual)
  return campos
}

export type LinhaCacheAtual = { endereco: string; lat: number | null; lng: number | null; confiavel: boolean | null; fonte: string | null; motivo: string | null }

export type ResultadoMontagem = {
  gravar: { endereco: string; lat: number; lng: number; confiavel: true; motivo: null; fonte: 'verificacao_manual' }[]
  pulados: { endereco: string; motivo: 'fonte_manual' | 'coordenada_invalida' }[]
}

// Achado real 26/09 (correcoes finais pre-deploy, item 2): caixa aproximada
// do estado do RJ -- barra coordenada de outro estado/pais entrando por
// digitacao trocada ou parse quebrado do CSV (NaN, celula vazia, Infinity).
// Nao e' um poligono exato (nao precisa ser -- so' precisa pegar erro grosso
// de mao), so' uma faixa generosa que cobre todo o territorio do RJ.
const LAT_MIN_RJ = -23.5
const LAT_MAX_RJ = -20.7
const LNG_MIN_RJ = -45.0
const LNG_MAX_RJ = -40.9

function coordenadaValidaRj(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= LAT_MIN_RJ && lat <= LAT_MAX_RJ
    && lng >= LNG_MIN_RJ && lng <= LNG_MAX_RJ
}

/** Monta os upserts a partir das correcoes + estado atual do cache.
 *  Regras: NUNCA sobrescreve uma linha com fonte === 'manual' (correcao
 *  humana anterior); NUNCA grava lat/lng nao numerico/nao finito ou fora da
 *  caixa aproximada do RJ (achado real 26/09 -- CSV pode vir com coordenada
 *  quebrada ou de outro estado). Endereco sem linha no cache (ausente) entra
 *  normalmente quando a coordenada e' valida. */
export function montarUpserts(correcoes: LinhaCorrecao[], cacheAtual: Map<string, LinhaCacheAtual>): ResultadoMontagem {
  const gravar: ResultadoMontagem['gravar'] = []
  const pulados: ResultadoMontagem['pulados'] = []
  for (const c of correcoes) {
    const atual = cacheAtual.get(c.endereco)
    if (atual?.fonte === 'manual') {
      pulados.push({ endereco: c.endereco, motivo: 'fonte_manual' })
      continue
    }
    if (!coordenadaValidaRj(c.lat, c.lng)) {
      pulados.push({ endereco: c.endereco, motivo: 'coordenada_invalida' })
      continue
    }
    gravar.push({ endereco: c.endereco, lat: c.lat, lng: c.lng, confiavel: true, motivo: null, fonte: 'verificacao_manual' })
  }
  return { gravar, pulados }
}

const limpa = (v: unknown) => String(v ?? '').replace(/[;\n\r]/g, ',')

export function csvBackup(linhas: LinhaCacheAtual[]): string {
  return ['endereco;lat;lng;confiavel;fonte;motivo', ...linhas.map(l => [l.endereco, l.lat, l.lng, l.confiavel, l.fonte, l.motivo].map(limpa).join(';'))].join('\n') + '\n'
}

async function lerCacheAtual(svc: ReturnType<typeof createServiceClient>, enderecos: string[]): Promise<Map<string, LinhaCacheAtual>> {
  const mapa = new Map<string, LinhaCacheAtual>()
  for (let i = 0; i < enderecos.length; i += 20) {
    const { data, error } = await svc.from('kpi_romaneio_geocode_cache').select('endereco,lat,lng,confiavel,fonte,motivo').in('endereco', enderecos.slice(i, i + 20))
    if (error) throw new Error(`leitura do cache falhou: ${error.message}`)
    for (const r of data ?? []) mapa.set(r.endereco, r)
  }
  return mapa
}

export async function rodar(csvPath: string, opcoes: { aplicar: boolean; dirSaida: string }) {
  const correcoes = parseCsvCorrecoes(readFileSync(csvPath, 'utf-8'))
  console.log(`${correcoes.length} correcoes lidas de ${csvPath}`)

  if (!opcoes.aplicar) {
    for (const c of correcoes) console.log(`  ${c.endereco} -> ${c.lat},${c.lng} (fonte=${c.fonte})`)
    console.log('(sem --aplicar: nada gravado)')
    return { gravados: 0, pulados: 0 }
  }

  const svc = createServiceClient()
  const cacheAtual = await lerCacheAtual(svc, correcoes.map(c => c.endereco))
  const { gravar, pulados } = montarUpserts(correcoes, cacheAtual)
  console.log(`gravar=${gravar.length}, pulados=${pulados.length}`)
  for (const p of pulados) console.log(`  pulado (${p.motivo}): ${p.endereco}`)

  // Backup ANTES de gravar: estado atual das linhas que serao sobrescritas.
  const backup = gravar.map(g => cacheAtual.get(g.endereco) ?? { endereco: g.endereco, lat: null, lng: null, confiavel: null, fonte: null, motivo: null })
  const caminhoBackup = `${opcoes.dirSaida}/backup-cache-antes-aplicar-correcoes.csv`
  writeFileSync(caminhoBackup, csvBackup(backup))
  console.log(`backup: ${backup.length} linhas em ${caminhoBackup}`)

  let ok = 0
  for (const g of gravar) {
    const { error } = await svc.from('kpi_romaneio_geocode_cache').upsert(g, { onConflict: 'endereco' })
    if (error) console.error(`falha ${g.endereco}: ${error.message}`); else ok++
  }
  console.log(`gravados ${ok}/${gravar.length}`)
  if (ok < gravar.length) throw new Error(`gravados apenas ${ok}/${gravar.length} no cache`)
  return { gravados: ok, pulados: pulados.length }
}

async function main() {
  const [csvPath] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const aplicar = process.argv.includes('--aplicar')
  if (!csvPath) {
    console.error('Uso: aplicar-correcoes-geocode.ts <correcoes.csv> [--aplicar]')
    process.exit(1)
    return
  }
  await rodar(csvPath, { aplicar, dirSaida: process.cwd() })
}

// So' roda o CLI quando este arquivo e' o entrypoint (mesmo guard usado em
// corrigir-geocode-por-alvo.ts) -- evita rodar main() quando importado por
// teste ou por outro script.
const ehEntrypoint = (process.argv[1] ?? '').endsWith('aplicar-correcoes-geocode.ts')
if (process.env.VITEST !== 'true' && ehEntrypoint) main().catch(e => { console.error(e); process.exit(1) })
