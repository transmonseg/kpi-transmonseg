/**
 * Investiga conflitos de codigo_unitrac: pra cada erro de unique constraint,
 * mostrar qual loja JÁ está usando esse código e seu status (ativo/inativo).
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  // Pegar os erros mais recentes
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  const files = fs.readdirSync('docs/db-changes/').filter((f: string) => f.endsWith('-erros.json')).sort()
  if (files.length === 0) { console.log('Sem arquivos de erro.'); return }
  const errosPath = 'docs/db-changes/' + files[files.length - 1]
  console.log(`Erros: ${errosPath}\n`)
  const erros = JSON.parse(readFileSync(errosPath, 'utf8')) as Array<{
    loja_id: string; loja_nome: string; campo: string; valor: string; erro: string
  }>

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const codigosConflito = [...new Set(erros.filter(e => e.campo === 'codigo_unitrac').map(e => e.valor))]
  console.log(`Códigos em conflito: ${codigosConflito.length}\n`)

  const { data: ocupantes } = await supabase
    .from('lojas')
    .select('id, rede_id, nome, codigo_unitrac, nome_unitrac, ativo')
    .in('codigo_unitrac', codigosConflito)

  const porCodigo = new Map<string, any[]>()
  for (const l of ocupantes ?? []) {
    const arr = porCodigo.get(l.codigo_unitrac) ?? []
    arr.push(l)
    porCodigo.set(l.codigo_unitrac, arr)
  }

  console.log('Conflitos detalhados:')
  for (const e of erros.filter(er => er.campo === 'codigo_unitrac')) {
    console.log(`\nLoja sem código: ${e.loja_nome} (id=${e.loja_id})`)
    console.log(`  Código proposto: ${e.valor}`)
    const usadoPor = porCodigo.get(e.valor) ?? []
    for (const ocup of usadoPor) {
      console.log(`  → JÁ USADO por: ${ocup.rede_id} | ${ocup.nome} (ativo=${ocup.ativo})`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
