import { describe, it, expect } from 'vitest'
import { avisosDoRecibo } from './recibo-dia'
import type { LinhaEscala, LinhaRomaneio } from './types'
import fixture from './recibo-dia.fixture-2026-10-23.json'

// F3-06 (ING-16): em 23/10 as divergências entre escala e romaneio só
// apareciam dentro da planilha. Fixture real: escala 8081 (77 cargas, carga,
// placa, destino, NF planejado, DUPLICADO) e romaneio 8012 (76 cargas, notas
// por carga), lidos dos PDFs da auditoria.
const escala23 = fixture.escala.map(e => ({ ...e, placaRaw: e.placaNorm, motorista: '', ajudante1: null, ajudante2: null, pesoKg: null, entPlanejado: null })) as LinhaEscala[]
const romaneio23: LinhaRomaneio[] = fixture.cargasRomaneio.flatMap(c => Array.from({ length: c.nfsRomaneio }, (_, i) => ({
  carga: c.carga, destino: '', placa: c.placaNorm, motorista: '', ajudantes: [], nf: `${c.carga}-${i}`, clienteCodigo: '', clienteNome: '', endereco: '',
})))
const vazio = { linhas: [], escala: [] }

describe('avisosDoRecibo (F3-06)', () => {
  it('23/10: exatamente os 2 avisos da auditoria -- 100751 (LLD4202) sem romaneio e ZONA NORTE 3 com 21 na escala e 20 no romaneio', () => {
    const avisos = avisosDoRecibo({ romaneio: romaneio23, escala: escala23, pao: vazio, escalaEnviada: true, paoEnviado: false })
    expect(avisos.map(a => a.texto)).toEqual([
      'Carga 100751 (LLD4202, JOSE ROBERTO) está na escala e não veio no romaneio.',
      'Carga 100787 (RQU8D91, ZONA NORTE 3): 21 notas na escala e 20 no romaneio.',
    ])
  })

  it('sem escala enviada: nenhum aviso de descasamento (não marca tudo "sem escala")', () => {
    expect(avisosDoRecibo({ romaneio: romaneio23, escala: [], pao: vazio, escalaEnviada: false, paoEnviado: false })).toEqual([])
  })

  it('escala guardada com o nome antigo da coluna: "VEICULO" vira aviso de placa em 2 cargas', () => {
    const esc = [
      { ...escala23[0], statusRastreador: 'MOT, VEICULO', duplicado: undefined },
      { ...escala23[1], placaNorm: escala23[0].placaNorm },
    ] as LinhaEscala[]
    const rom = romaneio23.filter(l => l.carga === esc[0].carga || l.carga === esc[1].carga).map(l => ({ ...l, placa: escala23[0].placaNorm }))
    const avisos = avisosDoRecibo({ romaneio: rom, escala: esc, pao: vazio, escalaEnviada: true, paoEnviado: false })
    expect(avisos.filter(a => a.tipo === 'veiculo_duas_cargas').map(a => a.texto))
      .toEqual([`Placa ${escala23[0].placaNorm} em 2 cargas na escala (${[esc[0].carga, esc[1].carga].sort().join(' e ')}).`])
  })

  it('"MOT," (motorista em 2 cargas) não vira aviso de veículo', () => {
    const avisos = avisosDoRecibo({ romaneio: romaneio23, escala: escala23, pao: vazio, escalaEnviada: true, paoEnviado: false })
    expect(avisos.some(a => a.tipo === 'veiculo_duas_cargas')).toBe(false)
  })

  it('carga no romaneio sem escala e pão contra a própria escala sintética', () => {
    const rom = [...romaneio23, { ...romaneio23[0], carga: '199999', placa: 'ABC1D23', nf: 'X1' }]
    const avisos = avisosDoRecibo({
      romaneio: rom, escala: escala23, escalaEnviada: true, paoEnviado: true,
      pao: { linhas: [{ ...romaneio23[0], carga: 'PAO-36', placa: 'RBI1J86', nf: '217492' }], escala: [{ ...escala23[0], carga: 'PAO-36', placaNorm: 'RBI1J86', nfPlanejado: 1 }] },
    })
    expect(avisos.map(a => a.texto)).toContain('Carga 199999 (ABC1D23) está no romaneio e não está na escala.')
    expect(avisos.some(a => a.texto.includes('PAO-36'))).toBe(false)
  })
})
