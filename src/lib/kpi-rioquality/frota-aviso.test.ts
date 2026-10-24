import { describe, it, expect } from 'vitest'
import { placasForaDoCadastro, avisoPlacasForaDoCadastro } from './frota-aviso'

// F2-15 (MON-12): placa do relatorio fora do cadastro de rastreadores conta
// como "sem rastreador" (correta) calada. Caso real RQ 21/10: TUP0B49 39 NFs,
// TUB7J93 29 e KZA2F01 28 fora da kpi_rioquality_frota (parada desde 02/10).
describe('placas do relatorio fora do cadastro (F2-15)', () => {
  const frota = new Map([['LTU7C95', '19364'], ['RJM5B51', '15277']])
  const linhas = (placa: string, n: number) => Array.from({ length: n }, () => ({ placaNorm: placa }))
  const dia21 = [...linhas('TUP0B49', 39), ...linhas('TUB7J93', 29), ...linhas('KZA2F01', 28), ...linhas('LTU7C95', 30), ...linhas('', 4), ...linhas('XXX5678', 2), ...linhas('rjm-5b51', 3)]
  it('lista as placas fora da frota com o numero de NFs, maior primeiro; ignora vazia e a de preenchimento (XXX)', () => {
    expect(placasForaDoCadastro(dia21, frota)).toEqual([
      { placa: 'TUP0B49', nfs: 39 }, { placa: 'TUB7J93', nfs: 29 }, { placa: 'KZA2F01', nfs: 28 },
    ])
  })
  it('aviso interno so\' quando ha placa fora; diz que conta como sem rastreador e que a taxa nao muda', () => {
    const a = avisoPlacasForaDoCadastro(placasForaDoCadastro(dia21, frota))!
    expect(a).toMatch(/TUP0B49 \(39 NFs\), TUB7J93 \(29 NFs\), KZA2F01 \(28 NFs\)/)
    expect(a).toMatch(/sem rastreador/i)
    expect(avisoPlacasForaDoCadastro([])).toBeNull()
    expect(avisoPlacasForaDoCadastro([{ placa: 'KZA2F01', nfs: 1 }])).toMatch(/KZA2F01 \(1 NF\)/)
  })
})
