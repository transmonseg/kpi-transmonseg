// Gate de não-regressão: roda a auditoria e verifica que as redes ≥88% não cairam
// e que Inventou <= 2. Sai com código 1 se regrediu.
import { execSync } from 'child_process'

const MIN_PRECISAO: Record<string, number> = {
  ATACADAO: 100, SUPERPRIX: 100, GUANABARA: 88, PRINCESA: 88, PREZUNIC: 88, CARREFOUR: 85,
}
const out = execSync('npx tsx scripts/analise/auditoria_completa_d19.ts', { encoding: 'utf-8' })
console.log(out)
let falhou = false
for (const linha of out.split('\n')) {
  const m = linha.match(/^\|\s*([A-Z_]+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)%/)
  if (!m) continue
  const [, rede, , , inventou, , prec] = m
  const min = MIN_PRECISAO[rede]
  if (min != null && Number(prec) < min) { console.error(`REGRESSAO: ${rede} caiu para ${prec}% (min ${min}%)`); falhou = true }
  if (Number(inventou) > 2) { console.error(`REGRESSAO: ${rede} inventou ${inventou} (max 2)`); falhou = true }
}
if (falhou) process.exit(1)
console.log('\n✓ Sem regressão nas redes boas')
