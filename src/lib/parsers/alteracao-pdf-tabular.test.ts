import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseAlteracaoPdfTabular } from './alteracao-pdf-tabular'

const PDF_PATH = 'docs/conversas-tia-erica/dia-25/alteracoes/ALTERACAO DE ESCALA GERAL 25.05 (1).pdf'

describe('Bug C — parseAlteracaoPdfTabular separa tipo_carro de motorista', () => {
  it('PDF dia 25: extrai ALLAN puro (sem "TRUCK C/ RAMPA E REFRI" prefix)', async () => {
    const buf = readFileSync(PDF_PATH)
    const alteracoes = await parseAlteracaoPdfTabular(buf)
    expect(alteracoes.length).toBeGreaterThan(0)

    const caxias = alteracoes.find(a =>
      a.loja_nome_raw?.toLowerCase().includes('caxias i') &&
      a.entra?.placa_norm === 'UBO5E05'
    )
    expect(caxias).toBeDefined()
    expect(caxias!.entra!.motorista_nome).toBe('ALLAN')
    expect(caxias!.entra!.motorista_codigo).toBe(294)
    expect(caxias!.rede_id).toBe('ASSAI')
  })

  it('PDF dia 25: extrai EDSON puro (sem "CARRETA" prefix) na Nova Iguacu 2', async () => {
    const buf = readFileSync(PDF_PATH)
    const alteracoes = await parseAlteracaoPdfTabular(buf)
    const novaIguacu = alteracoes.find(a =>
      a.loja_nome_raw?.toLowerCase().includes('nova igua') &&
      a.entra?.placa_norm === 'CPI4C81'
    )
    expect(novaIguacu).toBeDefined()
    expect(novaIguacu!.entra!.motorista_nome).toBe('EDSON')
    expect(novaIguacu!.entra!.motorista_codigo).toBe(184041)
  })

  it('motorista_nome NUNCA comeca com palavras de tipo de carro', async () => {
    const buf = readFileSync(PDF_PATH)
    const alteracoes = await parseAlteracaoPdfTabular(buf)
    const TIPOS = ['TRUCK', 'CARRETA', 'TOCO', 'KIA', 'BITRUCK', '710', 'VAN', 'VW']
    for (const a of alteracoes) {
      if (!a.entra?.motorista_nome) continue
      const nome = a.entra.motorista_nome.toUpperCase()
      for (const t of TIPOS) {
        expect(nome.startsWith(t + ' '), `motorista_nome="${nome}" comeca com tipo "${t}"`).toBe(false)
      }
    }
  })
})
