import { describe, it, expect } from 'vitest'
import { linhaParaEscala } from './parse-escala'
import type { ItemTexto } from './parse-escala'

describe('linhaParaEscala', () => {
  it('linha normal: NF e MOTORISTA grudados no mesmo item, 2 ajudantes', () => {
    // Coordenadas reais capturadas via pdfjs-serverless do PDF "Escala 01-07.pdf".
    const items: ItemTexto[] = [
      { str: '92612', x: 13 },
      { str: '27 - TTJ0F00', x: 42 },
      { str: 'CENTRO', x: 94 },
      { str: '2.739', x: 195 },
      { str: '36', x: 218 },
      { str: '38 ALEXSANDRO CARDOSO VALENTE', x: 233 },
      { str: 'ANDERSON ALVES LOPES', x: 401 },
      { str: 'TARCISO LISBOA DE MATOS JUNIOR', x: 561 },
    ]
    expect(linhaParaEscala(items)).toEqual({
      carga: '92612',
      placaRaw: 'TTJ0F00',
      placaNorm: 'TTJ0F00',
      destino: 'CENTRO',
      motorista: 'ALEXSANDRO CARDOSO VALENTE',
      ajudante1: 'ANDERSON ALVES LOPES',
      ajudante2: 'TARCISO LISBOA DE MATOS JUNIOR',
      pesoKg: 2739,
      entPlanejado: 36,
      nfPlanejado: 38,
    })
  })

  it('linha de carga pequena: PESO/ENT/NF/MOTORISTA em itens separados (não grudados), sem ajudante', () => {
    // Carga "DIRETA FRATELLI" do PDF real — peso baixo faz o layout do PDF
    // separar as células em vez de grudar num item só.
    const items: ItemTexto[] = [
      { str: '92595', x: 13 },
      { str: '94 - XXX0000', x: 42 },
      { str: 'DIRETA FRATELLI', x: 94 },
      { str: '67', x: 205 },
      { str: '1', x: 221 },
      { str: '1', x: 235 },
      { str: 'NELSON REIS MENDES SOARES', x: 245 },
      { str: 'MOT,', x: 717 },
    ]
    expect(linhaParaEscala(items)).toEqual({
      carga: '92595',
      placaRaw: 'XXX0000',
      placaNorm: 'XXX0000',
      destino: 'DIRETA FRATELLI',
      motorista: 'NELSON REIS MENDES SOARES',
      ajudante1: null,
      ajudante2: null,
      pesoKg: 67,
      entPlanejado: 1,
      nfPlanejado: 1,
    })
  })

  it('peso duplicado no PDF (quirk de wrap) não quebra o parse', () => {
    const items: ItemTexto[] = [
      { str: '92598', x: 13 },
      { str: '67 - TTJ9I18', x: 42 },
      { str: 'ITAPERUNA', x: 94 },
      { str: '3.713', x: 195 },
      { str: '3.714', x: 195 },
      { str: '38', x: 218 },
      { str: '47 JOBERTO DA MATA REIS', x: 233 },
      { str: 'ROMERIO DO NASCIMENTO S CONCEIÇÃO (MEI)', x: 401 },
    ]
    const r = linhaParaEscala(items)
    expect(r?.carga).toBe('92598')
    expect(r?.entPlanejado).toBe(38)
    expect(r?.nfPlanejado).toBe(47)
    expect(r?.motorista).toBe('JOBERTO DA MATA REIS')
    expect(typeof r?.pesoKg).toBe('number')
  })

  it('linha de cabeçalho ("CARGA VEICULO...") não é reconhecida como dado', () => {
    const items: ItemTexto[] = [
      { str: 'CARGA', x: 12 },
      { str: 'VEICULO', x: 41 },
      { str: 'DESTINO', x: 94 },
      { str: 'CAMPOS CROSS', x: 130 },
      { str: 'PESO ENT NF MOTORISTA', x: 196 },
    ]
    expect(linhaParaEscala(items)).toBeNull()
  })

  it('linha de rodapé ("Comboio: N carga(s)") não é reconhecida como dado', () => {
    const items: ItemTexto[] = [
      { str: 'Comboio: 10 carga(s)', x: 27 },
      { str: '27.557', x: 194 },
    ]
    expect(linhaParaEscala(items)).toBeNull()
  })

  it('linha de título ("8081 - Escala de Rota") não é reconhecida como dado', () => {
    expect(linhaParaEscala([{ str: '8081 - Escala de Rota', x: 18 }])).toBeNull()
  })
})
