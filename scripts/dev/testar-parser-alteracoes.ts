// Testa o parser de alterações com a mensagem REAL do user (dia 20/05)
// pra ver se parsea corretamente.

import { createClient } from '@supabase/supabase-js'
import { parseAlteracoesV2 } from '@/lib/parsers/alteracoes-v2'
import { buildLookupContext } from '@/lib/parsers/lookup-canonical'

const MSG = `🚨Alteraçães 🚨
Assai camil
Entra : Messias
Cod : 141
Placa: AMW 3424

Sai : Luiz Ferreira
Cod : 789
Placa : LAU 1I64

Assai Alcântara 1
Entra paulo Henrique
Cod : 807
Placa : DBB 8D19

Sai : Simão
Cod : 184846
Placa : LSN 6I72
OVOS NÃO SAIU NA ESCALA.

🚨Alteração 🚨
Assai Barra 1
Troca de carro
Entra : UBO 5E05
Sai : UGA 1D55
CARRO SEM CHAVE
MOTORISTA PERMANECE.

🚨ALTERAÇÃO 🚨
Carrefour campo grande
Entra: Simão 184846 LSN6I72
SAI : John 772 KVI9088

🚨Alteração 🚨
Assai Niterói ponte
Sai : Mesias
Cod : 141
Placa : AMW 3424

Entra : LUIZ FERREIRA
cod : 789
Placa : LAU 1I64`

async function main() {
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const ctx = await buildLookupContext(svc)
  const blocos = parseAlteracoesV2(MSG, ctx)
  console.log(`Total blocos detectados: ${blocos.length}\n`)
  for (const b of blocos) {
    console.log('━'.repeat(60))
    console.log(`[${b.confianca}] tipo=${b.sai ? (b.entra ? 'SUBSTITUICAO' : 'SAIDA') : (b.entra ? 'INCLUSAO' : 'OUTRO')}`)
    console.log(`  Rede: ${b.rede_id ?? '(none)'} | Loja: ${b.loja_nome_raw ?? '(none)'} | Filial: ${b.filial ?? '(none)'}`)
    console.log(`  Sai:  ${b.sai ? `${b.sai.motorista_nome ?? '—'} cod=${b.sai.motorista_codigo ?? '—'} placa=${b.sai.placa_norm ?? '—'}` : '—'}`)
    console.log(`  Entra: ${b.entra ? `${b.entra.motorista_nome ?? '—'} cod=${b.entra.motorista_codigo ?? '—'} placa=${b.entra.placa_norm ?? '—'}` : '—'}`)
    console.log(`  Motivo: ${b.motivo ?? '—'}`)
    if (b.warnings?.length) console.log(`  Warnings: ${b.warnings.join('; ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
