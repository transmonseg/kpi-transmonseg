import { describe, it, expect } from 'vitest'
import { parseRomaneioTexto } from './parse-romaneio'

// Texto real extraído via pdf-parse do PDF "Romaneio 01-07.pdf" (carga 92591/NATIVIDADE,
// 2 clientes, sem ajudante) — cola exatamente como o pdf-parse devolve, uma linha por item.
const TEXTO_BASICO = `
8012 - Romaneio de Entrega
01/07/2026 06:30
PLACA/MOTORISTA:TUL1C38 / JOSE ROBERTO MACHADO SALESCARGA/DESTINO:92591 / NATIVIDADE
AJUDANTE(S):,
2249581 / 137038 - CHICAGO'S MERCEARIA
RUA MONSENHOR MIGUEL DOS REIS MELLO, 20 - NOSSA SENHORA DO ROSARIO, NATIVIDADE - *
NF / CLIENTE:
2249582 / 137744 -  SURPERMERCADO  SANSAO
AV AMARAL PEIXOTO, 37 - CENTRO, NATIVIDADE - LOJA B
NF / CLIENTE:
Total de 2 clientes
`

describe('parseRomaneioTexto', () => {
  it('extrai carga, placa, motorista, destino e os clientes do bloco', () => {
    const linhas = parseRomaneioTexto(TEXTO_BASICO)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toEqual({
      carga: '92591',
      destino: 'NATIVIDADE',
      placa: 'TUL1C38',
      motorista: 'JOSE ROBERTO MACHADO SALES',
      ajudantes: [],
      nf: '2249581',
      clienteCodigo: '137038',
      clienteNome: "CHICAGO'S MERCEARIA",
      endereco: 'RUA MONSENHOR MIGUEL DOS REIS MELLO, 20 - NOSSA SENHORA DO ROSARIO, NATIVIDADE - *',
    })
    expect(linhas[1].nf).toBe('2249582')
    expect(linhas[1].clienteNome).toBe('SURPERMERCADO  SANSAO')
  })

  it('lê ajudante(s) quando presente, separando por vírgula', () => {
    const texto = `
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249517 / 133553 - SUPERMERCADO NELIO FILHO
AV JOSE LISANDRO ALBERNAZ, S/N - BARCELOS, SAO JOAO DA BAR - 6 DISTRITO
NF / CLIENTE:
Total de 1 clientes
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].ajudantes).toEqual(['LEANDRO DA HORA BATISTA'])
  })

  it('carga que continua em outra página (cabeçalho repete) acumula na mesma carga', () => {
    const texto = `
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249517 / 133553 - SUPERMERCADO NELIO FILHO
AV JOSE LISANDRO ALBERNAZ, S/N - BARCELOS, SAO JOAO DA BAR - 6 DISTRITO
NF / CLIENTE:

8012 - Romaneio de Entrega
01/07/2026 06:30
PLACA/MOTORISTA:TTL7D40 / LUAN VIANA AREAS RIBEIROCARGA/DESTINO:92593 / CAMPOS
AJUDANTE(S):LEANDRO DA HORA BATISTA ,
2249531 / 160992 - LANCHONETE DO VITOR
ESTRADA AZEITONA, S/N - AZEITONA, SAO JOAO DA BAR - *
NF / CLIENTE:
Total de 2 clientes
`
    const linhas = parseRomaneioTexto(texto)
    expect(linhas).toHaveLength(2)
    expect(linhas.every(l => l.carga === '92593')).toBe(true)
    expect(linhas.map(l => l.nf)).toEqual(['2249517', '2249531'])
  })

  it('texto sem nenhum bloco reconhecido → array vazio', () => {
    expect(parseRomaneioTexto('lixo qualquer\nsem estrutura nenhuma')).toEqual([])
  })
})
