// Pega a geração mais recente do KPI e baixa a escala + Unitrac do storage.
// Uso: npx tsx scripts/dev/pegar-hoje.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const OUT = 'C:/Users/media/Downloads'

async function baixar(bucket: string, path: string, prefixo: string) {
  const { data, error } = await svc.storage.from(bucket).download(path)
  if (error) { console.log(`  ✗ ${bucket}/${path}: ${error.message}`); return }
  const buf = Buffer.from(await data.arrayBuffer())
  const nome = `${prefixo}-${path.split('/').pop()}`
  writeFileSync(join(OUT, nome), buf)
  console.log(`  ✓ salvo: ${join(OUT, nome)}  (${buf.length} bytes)`)
}

;(async () => {
  const { data, error } = await svc
    .from('kpi_simples')
    .select('id, data, gerado_em, escala_paths, unitrac_path, redes, total_rotas, total_sem_gps, alteracoes, line_edits')
    .order('gerado_em', { ascending: false })
    .limit(6)
  if (error) { console.log('ERRO:', error.message); return }

  console.log(`Últimas ${data?.length ?? 0} gerações:\n`)
  for (const g of data ?? []) {
    const redes = (g.redes as Array<{ rede_id: string; qtd_rotas: number }>)?.map(r => `${r.rede_id}(${r.qtd_rotas})`).join(', ')
    console.log(`• ${g.gerado_em}  data=${g.data}  redes=[${redes}]  rotas=${g.total_rotas}  semGps=${g.total_sem_gps}`)
    console.log(`    id=${g.id}`)
    console.log(`    escala_paths=${JSON.stringify(g.escala_paths)}`)
    console.log(`    unitrac_path=${g.unitrac_path}`)
    const alts = g.alteracoes as unknown[] | null
    const edits = g.line_edits as unknown[] | null
    console.log(`    alteracoes=${alts?.length ?? 0}  line_edits=${edits?.length ?? 0}\n`)
  }

  const g = data?.[0]
  if (!g) return
  console.log(`Baixando arquivos da geração mais recente (${g.gerado_em})...`)
  for (const p of (g.escala_paths as string[] ?? [])) await baixar('escalas-raw', p, 'ESCALA-HOJE')
  if (g.unitrac_path) await baixar('unitrac-raw', g.unitrac_path as string, 'UNITRAC-HOJE')
})().catch(console.error)
