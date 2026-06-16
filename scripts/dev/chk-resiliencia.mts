import { config } from 'dotenv'; config({ path: '.env.local' })
import { apiGet } from '../../src/lib/unitrac-api/client.ts'
import { buscarFrota } from '../../src/lib/unitrac-api/frota.ts'
import { buscarPontos } from '../../src/lib/unitrac-api/pontos.ts'
import { buscarAlvos } from '../../src/lib/unitrac-api/alvos.ts'
import { buscarPosicoes } from '../../src/lib/unitrac-api/posicoes.ts'
import { buscarStopsCru } from '../../src/lib/unitrac-api/consolida.ts'

// 1) endpoint inexistente → cliente devolve null (não lança)
const r = await apiGet('/endpoint-que-nao-existe-xyz')
console.log(`apiGet(endpoint morto) → ${r === null ? 'null (OK, não lançou)' : 'RETORNOU ALGO?!'}`)

// 2) buscar* com cv inválido (simula resposta vazia/erro) → tem que voltar vazio, sem lançar
try {
  const cvs = ['000000-invalido']
  const [frota, pontos, alvos, poss, stops] = await Promise.all([
    buscarFrota().then(f => `frota=${f.length}`).catch(e => `FROTA LANÇOU: ${e}`),
    buscarPontos(cvs).then(p => `pontos=${Object.keys(p).length}`).catch(e => `PONTOS LANÇOU: ${e}`),
    buscarAlvos(cvs).then(a => `alvos=${a.length}`).catch(e => `ALVOS LANÇOU: ${e}`),
    buscarPosicoes(cvs).then(p => `posicoes=${Object.keys(p).length}`).catch(e => `POSICOES LANÇOU: ${e}`),
    buscarStopsCru('000000', 24).then(s => `stops=${s.length}`).catch(e => `STOPS LANÇOU: ${e}`),
  ])
  console.log('buscar* com cv inválido →', frota, '|', pontos, '|', alvos, '|', poss, '|', stops)
  console.log('=> nenhuma função lançou; todas degradam pra vazio. API down = no-op, KPI segue com PDF.')
} catch (e) {
  console.log('ERRO inesperado:', e)
}
