// Auditoria 20/10 (GEO-10): a chave do kpi_romaneio_geocode_cache mudou em
// 01/10 (chaveCacheEndereco = sem CEP + normalizarEndereco) e as linhas com
// chave antiga deixaram de ser lidas -- inclusive correcoes humanas e do
// cadastro Unitrac (332; em 216 o ponto usado hoje fica a >150 m delas).
// Leva cada correcao (prioridadeFonte > 0) pra chave nova quando ela vence a
// linha atual pela MESMA regra da leitura (escolherLinhaCache). Antes de
// gravar, salva as linhas sobrescritas em JSON (pra desfazer).
// Uso: npx tsx --env-file=.env.production scripts/migrar-correcoes-cache-geocode.ts [--aplicar]
import { writeFileSync } from 'fs'
import { createServiceClient } from '../src/lib/supabase/service'
import { chaveCacheEndereco } from '../src/lib/kpi-romaneio/endereco-cep'
import { escolherLinhaCache, prioridadeFonte } from '../src/lib/kpi-romaneio/geocode'

type Linha = { endereco: string; lat: number; lng: number; fonte: string | null; confiavel: boolean; motivo: string | null; precisao?: string | null }

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const sb = createServiceClient()
  const todas: Linha[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('kpi_romaneio_geocode_cache').select('endereco, lat, lng, fonte, confiavel, motivo, precisao').order('endereco').range(de, de + 999)
    if (error) throw new Error(error.message)
    todas.push(...(data as Linha[]))
    if (!data || data.length < 1000) break
  }
  const porEndereco = new Map(todas.map(l => [l.endereco, l]))
  // Varias chaves antigas podem cair na mesma chave nova: entre elas vale a
  // mesma regra de prioridade da leitura.
  const porNova = new Map<string, Linha>()
  for (const l of todas) {
    if (prioridadeFonte(l.fonte ?? undefined) <= 0) continue
    const nova = chaveCacheEndereco(l.endereco)
    if (nova === l.endereco) continue
    const ja = porNova.get(nova)
    porNova.set(nova, ja ? escolherLinhaCache(ja, l)! : l)
  }
  const migrar: { de: Linha; para: string; atual: Linha | undefined }[] = []
  for (const [nova, l] of porNova) {
    const atual = porEndereco.get(nova)
    if (escolherLinhaCache(atual, l) !== l) continue
    if (atual && atual.lat === l.lat && atual.lng === l.lng) continue
    migrar.push({ de: l, para: nova, atual })
  }
  console.log(`linhas no cache: ${todas.length}; correcoes a levar pra chave nova: ${migrar.length}`)
  for (const m of migrar.slice(0, 10)) console.log(`  ${m.de.fonte}: "${m.para}" <- "${m.de.endereco}" (atual: ${m.atual?.fonte ?? 'nenhuma'})`)
  if (!aplicar) { console.log('modo teste: nada gravado (use --aplicar)'); return }
  const backup = `/tmp/backup-cache-geocode-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
  writeFileSync(backup, JSON.stringify(migrar.map(m => ({ chave: m.para, antes: m.atual ?? null }))))
  for (let i = 0; i < migrar.length; i += 200) {
    const lote = migrar.slice(i, i + 200).map(m => ({ endereco: m.para, lat: m.de.lat, lng: m.de.lng, fonte: m.de.fonte, confiavel: m.de.confiavel, motivo: m.de.motivo, precisao: m.de.precisao ?? null }))
    const { error } = await sb.from('kpi_romaneio_geocode_cache').upsert(lote, { onConflict: 'endereco' })
    if (error) throw new Error(error.message)
  }
  console.log(`gravado. backup das linhas sobrescritas: ${backup}`)
}

main().catch(e => { console.error(e); process.exit(1) })
