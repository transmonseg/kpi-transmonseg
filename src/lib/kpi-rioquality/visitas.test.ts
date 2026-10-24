import { describe, it, expect } from 'vitest'
import { montarVisitasInclusivas } from './visitas'
import type { LinhaGeocodificada } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'

// Achado real 05/09 (primeira geracao Rio Quality, 04/09): montarVisitas da
// Nutry Max casa cada PARADA com UMA entrega (a mais proxima). Na Rio Quality
// varias entregas da mesma placa caem na MESMA rua (mesma coordenada, sem
// numero) -- so' uma confirmava, o resto ficava pendente: 60% pendente com
// rastreador contra ~70% "entregue" na propria Unitrac.

function linha(nf: string, lat: number | null, lng: number | null, pontosAlternativos?: { lat: number; lng: number }[]): LinhaGeocodificada {
  return { carga: 'BAIXADA 2', destino: 'BAIXADA 2', placa: 'RJM5B51', motorista: '', ajudantes: [], nf, clienteCodigo: '', clienteNome: nf, endereco: nf, lat, lng, pontosAlternativos }
}
function parada(id: string, lat: number, lng: number, chegada: string, fim: string, classificacao = 'FORA_BASE'): UnitracParadaRow {
  return { id, placa_norm: 'RJM5B51', chegada, saida: null, fim_real: fim, duracao_seg: null, local_parada: '', codigo_loja: null, nome_loja: null, lat, lng, classificacao, ordem: 0 }
}

const AUTOMOVEL = { lat: -22.7900, lng: -43.3050 }
const LONGE = { lat: -22.9000, lng: -43.2000 }     // outra regiao

describe('montarVisitasInclusivas', () => {
  it('TODAS as entregas a <= 500m de uma parada confirmam (nao so a mais proxima) -- 3 entregas na mesma rua', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('A-2', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('A-3', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.0005, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect([...v.keys()].sort()).toEqual(['A-1', 'A-2', 'A-3'])
    for (const nf of ['A-1', 'A-2', 'A-3']) {
      expect(v.get(nf)).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: false })
      expect(v.get(nf)!.distanciaMetrosDoPonto).toBeLessThan(100)
    }
  })

  it('entrega com mais de uma parada no raio fica com a de MAIOR permanencia', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('curta', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:03:00Z'),
      parada('longa', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T11:00:00Z', '2026-09-04T11:25:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T11:00:00Z')
  })

  it('RQ-05 (auditoria 20/10): P1 a 40 m com 8 min e P2 a 450 m com 70 min -> visita usa P1 (nao a mais longa)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('perto', AUTOMOVEL.lat + 0.00036, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:08:00Z'),
      parada('almoco', AUTOMOVEL.lat + 0.00405, AUTOMOVEL.lng, '2026-09-04T12:00:00Z', '2026-09-04T13:10:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T09:00:00Z')
  })

  // F2-14 (RQ-05, revisao Fases 3-4): degrau de 150 m -- parada curta a
  // 149 m ganhava de uma longa a 151 m (o mesmo lugar, na pratica) e levava
  // o horario. A colada so' ganha quando a mais longa esta' bem mais longe.
  it('F2-14 RQ-05: curta a ~145 m x longa a ~155 m (lados opostos): fica a longa (sem degrau em 150 m)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('curta', AUTOMOVEL.lat + 0.0013, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:03:00Z'),
      parada('longa', AUTOMOVEL.lat - 0.0014, AUTOMOVEL.lng, '2026-09-04T11:00:00Z', '2026-09-04T12:00:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T11:00:00Z')
  })

  it('F2-14 RQ-05: colada a 40 m x longa a ~260 m: a colada continua ganhando', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('perto', AUTOMOVEL.lat + 0.00036, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:08:00Z'),
      parada('longa', AUTOMOVEL.lat - 0.00234, AUTOMOVEL.lng, '2026-09-04T12:00:00Z', '2026-09-04T13:10:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T09:00:00Z')
  })

  it('RQ-05: paradas so a >150 m -> continua a de maior permanencia', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('a', AUTOMOVEL.lat + 0.0018, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:08:00Z'),
      parada('b', AUTOMOVEL.lat + 0.0036, AUTOMOVEL.lng, '2026-09-04T12:00:00Z', '2026-09-04T13:10:00Z'),
    ]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')!.chegada).toBe('2026-09-04T12:00:00Z')
  })

  // Geometria numa linha norte-sul (0.001 de lat ~ 111m). RQ-06 (auditoria
  // 20/10): so' irma confirmada DIRETO (<=500 m, sem raio ampliado) empresta.
  it('vizinhanca: irma confirmada direto -> NF a <=800 m dela herda, marcada viaVizinhanca', () => {
    const norte = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng } // ~700 m de A-1
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', norte.lat, norte.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0018, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~200 m de A-1, ~900 m de N-1
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaVizinhanca: false, viaRaioAmpliado: false })
    expect(v.get('N-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: true })
  })

  it('RQ-06: irma confirmada pelo raio ampliado (500-800 m) NAO empresta', () => {
    const norte = { lat: AUTOMOVEL.lat + 0.0030, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', norte.lat, norte.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~700 m de A-1
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaRaioAmpliado: true })
    expect(v.has('N-1')).toBe(false)
  })

  it('vizinhanca NAO encadeia (irma confirmada por vizinhanca nao empresta pra terceira) e respeita o raio', () => {
    const viz = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng }
    const meio = { lat: AUTOMOVEL.lat + 0.0145, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', viz.lat, viz.lng), linha('M-1', meio.lat, meio.lng), linha('L-1', LONGE.lat, LONGE.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0018, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.has('A-1')).toBe(true)
    expect(v.get('N-1')?.viaVizinhanca).toBe(true)
    expect(v.has('M-1')).toBe(false)
    expect(v.has('L-1')).toBe(false)
  })

  // Achado real 05/09 (conferencia manual de 20 entregas da Rio Quality): duas
  // pendentes tinham a coordenada CERTA (verificada por reverse geocode -- 85m
  // da Rua Raul Pompeia, e a Rua Beira Rio em Mage) e mesmo assim ficaram
  // pendentes porque a parada da propria placa estava a 607m e 547m -- fora do
  // raio de 500m por pouco. No romaneio da Rio Quality nao ha NUMERO, entao a
  // coordenada e' de trecho de rua (+-200m facil): 500m e' apertado demais.
  // Vira confirmada, mas MARCADA (raio ampliado), nunca como confirmacao
  // normal -- mesma filosofia da vizinhanca.
  it('parada entre 500m e 800m confirma, marcada como raio ampliado', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0055, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~610m
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaRaioAmpliado: true, viaVizinhanca: false })
    expect(v.get('A-1')!.distanciaMetrosDoPonto).toBeGreaterThan(500)
  })

  it('parada dentro de 500m continua confirmacao normal (nao marca raio ampliado)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')).toMatchObject({ viaRaioAmpliado: false, viaVizinhanca: false })
  })

  it('parada dentro de 500m tem prioridade sobre outra a 700m (nao rebaixa a toa)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [
      parada('longe', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T09:00:00Z', '2026-09-04T09:40:00Z'), // ~700m, mais demorada
      parada('perto', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T11:00:00Z', '2026-09-04T11:10:00Z'), // ~110m
    ]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaRaioAmpliado: false })
    expect(v.get('A-1')!.chegada).toBe('2026-09-04T11:00:00Z')
  })

  it('acima de 800m nao confirma direto (so por vizinhanca, se houver irma)', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0090, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')] // ~1km
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })

  // Pedido do usuario 06/09: "se disser a rua, e o caminhao parou naquela
  // rua, conta como entrega" -- rua comprida, o CNEFE tem varios trechos e a
  // coerencia so' escolhe UM (o mais perto das ancoras). O caminhao pode
  // parar num trecho DIFERENTE da mesma rua, longe demais do escolhido pro
  // raio ampliado, e ainda assim ter entregue.
  it('confirma em OUTRO trecho da mesma rua quando o escolhido fica longe demais (>800m)', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng } // ~2,2km do escolhido
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', outroTrecho.lat, outroTrecho.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', viaVizinhanca: false, viaRaioAmpliado: false, viaOutroPontoDaRua: true })
  })

  it('sem pontos alternativos ou nenhum deles perto: continua sem confirmar', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', LONGE.lat, LONGE.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })

  it('confirmacao direta no ponto escolhido tem prioridade sobre outro trecho da rua', () => {
    const outroTrecho = { lat: AUTOMOVEL.lat + 0.02, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng, [AUTOMOVEL, outroTrecho])]
    const paradas = [parada('p1', AUTOMOVEL.lat + 0.001, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    expect(montarVisitasInclusivas(linhas, paradas).get('A-1')?.viaOutroPontoDaRua).toBeFalsy()
  })

  it('ignora parada BASE e entrega sem coordenada', () => {
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('S-1', null, null)]
    const paradas = [parada('b', AUTOMOVEL.lat, AUTOMOVEL.lng, '2026-09-04T06:00:00Z', '2026-09-04T06:30:00Z', 'BASE')]
    expect(montarVisitasInclusivas(linhas, paradas).size).toBe(0)
  })
  // Corredor da rua (relatorio rq-mesmo-lugar-e-sem-rastreador.md, 01/10):
  // endereco sem numero -> 61 clientes da AV. DAS AMERICAS no mesmo ponto
  // (-23.00075,-43.37481). Confirma quando a PROPRIA placa parou >= 2 min a
  // <= 200 m de QUALQUER ponto CNEFE da mesma rua/municipio.
  describe('corredor da rua (endereco sem numero)', () => {
    const PONTO = { lat: -23.00075, lng: -43.37481 }
    const C1 = { lat: -23.0003, lng: -43.3650 }
    const C2 = { lat: -23.0005, lng: -43.3950 } // ~2 km a oeste do ponto
    const corredor = [PONTO, C1, C2]
    // Correcao 02/10: endereco SEM NUMERO e' requisito pro corredor; a fixture
    // precisa passar um endereco sem numero pra simular o cenario real da RQ.
    const comCorredor = (nf: string, p = PONTO, pontos = corredor, endereco = 'AVENIDA DAS AMERICAS - BARRA DA TIJUCA, RIO DE JANEIRO'): LinhaGeocodificada => ({ ...linha(nf, p.lat, p.lng), pontosCorredorRua: pontos, endereco })

    it('parada propria de 12 min a ~150 m de outro ponto da rua (2 km do ponto aproximado) confirma, marcada viaCorredorDaRua, com o horario da parada', () => {
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      const v = montarVisitasInclusivas([comCorredor('NF-1')], paradas)
      expect(v.get('NF-1')).toMatchObject({ chegada: '2026-09-30T13:05:00Z', saida: '2026-09-30T13:17:00Z', viaCorredorDaRua: true, viaVizinhanca: false, viaRaioAmpliado: false })
      expect(v.get('NF-1')!.distanciaMetrosDoPonto).toBeLessThan(200)
    })

    // RQ-02 (auditoria 20/10): 603 NFs pelo corredor, 91% sem parada a <=800 m,
    // 44% com parada que era entrega de cliente de OUTRA rua.
    it('RQ-02: parada que confirmou direto NF de outra rua nao serve ao corredor', () => {
      const parada1 = parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')
      const outraRua = { ...linha('Y-1', C2.lat + 0.00135, C2.lng), endereco: 'RUA DO OUTRO CLIENTE - BARRA DA TIJUCA, RIO DE JANEIRO' }
      const v = montarVisitasInclusivas([comCorredor('NF-1'), outraRua], [parada1])
      expect(v.get('Y-1')).toBeTruthy()
      expect(v.has('NF-1')).toBe(false)
    })

    it('RQ-02: rua generica ("RUA A") nao usa corredor', () => {
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      expect(montarVisitasInclusivas([comCorredor('NF-1', PONTO, corredor, 'RUA A - CENTRO, VOLTA REDONDA')], paradas).size).toBe(0)
    })

    it('RQ-02: endereco sem bairro so usa ponto do corredor a <=2 km do ponto', () => {
      const longe = { lat: -23.0005, lng: -43.4000 } // ~2,6 km a oeste
      const paradas = [parada('p1', longe.lat + 0.00135, longe.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      expect(montarVisitasInclusivas([comCorredor('NF-1', PONTO, [PONTO, longe], 'AVENIDA DAS AMERICAS, RIO DE JANEIRO')], paradas).size).toBe(0)
      expect(montarVisitasInclusivas([comCorredor('NF-1', PONTO, [PONTO, longe])], paradas).get('NF-1')?.viaCorredorDaRua).toBe(true)
    })

    // F2-14 (RQ-02, revisao Fases 3-4): a rua era comparada crua. Na RQ de
    // 20-23/10 ha' 94 pares placa+cidade com a mesma rua escrita de dois
    // jeitos -- ex.: 23/10 KWM9877 "AV. EMBAIXADOR ABELARDO BUENO" e
    // "AVENIDA EMBAIXADOR ABELARDO BUENO"; LHI9D08 "AVENIDA DO PEPE" e
    // "AVENIDA PEPE". A parada que entregou a primeira bloqueava a segunda.
    it('F2-14 RQ-02: variante de grafia da MESMA rua nao bloqueia o corredor (AV. x AVENIDA, DO PEPE x PEPE)', () => {
      const p1 = parada('p1', C2.lat + 0.00135, C2.lng, '2026-10-23T13:05:00Z', '2026-10-23T13:17:00Z')
      const casos: [string, string][] = [
        ['AV. EMBAIXADOR ABELARDO BUENO', 'AVENIDA EMBAIXADOR ABELARDO BUENO'],
        ['AVENIDA DO PEPE', 'AVENIDA PEPE'],
        ['EST DE JACAREPAGUA', 'ESTRADA DE JACAREPAGUA'],
        ['RUA LUIZ BELTRAO', 'RUA LUIZ BELTRÃO'],
      ]
      for (const [a, b] of casos) {
        const direta = { ...linha('Y-1', C2.lat + 0.00135, C2.lng), endereco: `${a} - BARRA DA TIJUCA, RIO DE JANEIRO` }
        const v = montarVisitasInclusivas([comCorredor('NF-1', PONTO, corredor, `${b} - BARRA DA TIJUCA, RIO DE JANEIRO`), direta], [p1])
        expect(v.get('Y-1')).toBeTruthy()
        expect(v.get('NF-1')?.viaCorredorDaRua).toBe(true)
      }
    })

    it('F2-14 RQ-02: mesmo nome com tipo de via diferente (RUA x TRAVESSA) continua bloqueando', () => {
      const p1 = parada('p1', C2.lat + 0.00135, C2.lng, '2026-10-23T13:05:00Z', '2026-10-23T13:17:00Z')
      const direta = { ...linha('Y-1', C2.lat + 0.00135, C2.lng), endereco: 'TRAVESSA AIRES SALDANHA - COPACABANA, RIO DE JANEIRO' }
      const v = montarVisitasInclusivas([comCorredor('NF-1', PONTO, corredor, 'RUA AIRES SALDANHA - COPACABANA, RIO DE JANEIRO'), direta], [p1])
      expect(v.has('NF-1')).toBe(false)
    })

    // F2-14 (RQ-02): " - " dentro da rua ligava o "tem bairro" e desligava o
    // teto de 2 km. Caso real 20/10 (Fusion, bairro vazio): "RUA DOUGLAS
    // MARQUES RIENTI QUADRA - DE", Niteroi.
    it('F2-14 RQ-02: " - " dentro do nome da rua (Fusion, sem bairro) nao desliga o teto de 2 km', () => {
      const longe = { lat: -23.0005, lng: -43.4000 } // ~2,6 km a oeste
      const paradas = [parada('p1', longe.lat + 0.00135, longe.lng, '2026-10-20T13:05:00Z', '2026-10-20T13:17:00Z')]
      const rua = 'RUA DOUGLAS MARQUES RIENTI QUADRA - DE'
      const semBairro = { ...comCorredor('NF-1', PONTO, [PONTO, longe], `${rua}, NITEROI`), ruaRQ: rua }
      expect(montarVisitasInclusivas([semBairro], paradas).size).toBe(0)
      const comBairro = { ...comCorredor('NF-1', PONTO, [PONTO, longe], `${rua} - ITAIPU, NITEROI`), ruaRQ: rua }
      expect(montarVisitasInclusivas([comBairro], paradas).get('NF-1')?.viaCorredorDaRua).toBe(true)
    })

    // F2-14 (RQ-02): a regex so' pegava "RUA A"/"RUA 2". Na RQ de 20-23/10:
    // RUA QUATRO (7), RUA CINCO (7), RUA DOIS (5), RUA PROJETADA B (2), RUA
    // PROJETADA 3, TRAVESSA DOIS, RUA 05.
    it('F2-14 RQ-02: rua generica por extenso, projetada, com zero a esquerda ou letra+numero nao usa corredor', () => {
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      for (const rua of ['RUA QUATRO', 'RUA CINCO', 'RUA DOIS', 'RUA PROJETADA', 'RUA PROJETADA B', 'RUA PROJETADA 3', 'TRAVESSA DOIS', 'RUA 05', 'RUA A1', 'RUA 1-A', 'ALAMEDA B', 'RUA SEM NOME', 'R. C']) {
        expect(montarVisitasInclusivas([comCorredor('NF-1', PONTO, corredor, `${rua} - CENTRO, MACAE`)], paradas).size, rua).toBe(0)
      }
    })

    it('F2-14 RQ-02: nome curto de verdade (RUA VAZ, AVENIDA UBA, RUA RIO) continua usando corredor', () => {
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      for (const rua of ['RUA VAZ', 'AVENIDA UBA', 'RUA RIO']) {
        expect(montarVisitasInclusivas([comCorredor('NF-1', PONTO, corredor, `${rua} - CENTRO, MACAE`)], paradas).get('NF-1')?.viaCorredorDaRua, rua).toBe(true)
      }
    })

    it('parada de menos de 2 min no corredor nao confirma', () => {
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:06:30Z')]
      expect(montarVisitasInclusivas([comCorredor('NF-1')], paradas).size).toBe(0)
    })

    it('parada a ~300 m do ponto da rua mais proximo nao confirma (raio do corredor e 200 m)', () => {
      const paradas = [parada('p1', C2.lat + 0.0027, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:25:00Z')]
      expect(montarVisitasInclusivas([comCorredor('NF-1')], paradas).size).toBe(0)
    })

    it('parada BASE no corredor nao confirma', () => {
      const paradas = [parada('b', C2.lat, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:25:00Z', 'BASE')]
      expect(montarVisitasInclusivas([comCorredor('NF-1')], paradas).size).toBe(0)
    })

    it('rua longa sem parada da placa em nenhum ponto: nao confirma', () => {
      const paradas = [parada('p1', LONGE.lat, LONGE.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:25:00Z')]
      expect(montarVisitasInclusivas([comCorredor('NF-1')], paradas).size).toBe(0)
    })

    it('vizinhanca <= 800 m segue como esta: quem herdaria da irma continua viaVizinhanca (corredor so pega o que sobrou)', () => {
      // irma A-1 confirmada direto; NF-1 a ~700 m dela -> vizinhanca,
      // mesmo havendo parada propria no corredor
      const irma = linha('A-1', PONTO.lat, PONTO.lng)
      const nf = comCorredor('NF-1', { lat: PONTO.lat + 0.0063, lng: PONTO.lng })
      const paradas = [
        parada('p0', PONTO.lat - 0.0018, PONTO.lng, '2026-09-30T10:00:00Z', '2026-09-30T10:10:00Z'), // ~200 m ao sul da irma (direta, RQ-06), ~900 m de NF-1
        parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z'),
      ]
      const v = montarVisitasInclusivas([irma, nf], paradas)
      expect(v.get('NF-1')).toMatchObject({ viaVizinhanca: true })
      expect(v.get('NF-1')?.viaCorredorDaRua).toBeFalsy()
    })

    it('entrega confirmada pelo corredor nao empresta horario por vizinhanca (sem encadear)', () => {
      const nf = comCorredor('NF-1')
      const irmaSemCorredor = linha('N-1', PONTO.lat + 0.0063, PONTO.lng) // ~700 m, sem parada propria
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      const v = montarVisitasInclusivas([nf, irmaSemCorredor], paradas)
      expect(v.get('NF-1')?.viaCorredorDaRua).toBe(true)
      expect(v.has('N-1')).toBe(false)
    })

    // Correcao 02/10: endereco COM NUMERO nao usa corredor (cluster falso em via longa).
    it('endereco COM numero + parada propria: NAO confirma pelo corredor (regressao)', () => {
      const nf = comCorredor('NF-1', PONTO, corredor, 'AVENIDA DAS AMERICAS, 3000 - BARRA DA TIJUCA, RIO DE JANEIRO')
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      const v = montarVisitasInclusivas([nf], paradas)
      expect(v.get('NF-1')?.viaCorredorDaRua).toBeFalsy()
    })

    // Correcao 02/10: limite proporcional de NFs por parada (1 NF / 3 min).
    it('parada de 5 min com 8 NFs candidatas: confirma so 2 (as mais proximas)', () => {
      // O corredor confirma quando a PARADA esta' a <=200m de um ponto CNEFE
      // (independente da posicao da NF). As NFs precisam estar FORA do raio
      // ampliado (800m) pra nao serem confirmadas no passo 1. Criamos um
      // ponto CNEFE proximo da parada (~100m) e colocamos as NFs a ~900m.
      const pontoCnefeProxParada = { lat: C2.lat + 0.0009, lng: C2.lng } // ~100m da parada
      const pontoParada = { lat: C2.lat, lng: C2.lng }
      // NFs a ~900m da parada (fora do raio ampliado de 800m)
      const pontoNfs = { lat: C2.lat - 0.0081, lng: C2.lng }
      // Corredor inclui o ponto proximo da parada
      const corredorLocal = [pontoCnefeProxParada, PONTO, C1]
      const nfs = Array.from({ length: 8 }, (_, i) =>
        comCorredor(`NF-${i}`, pontoNfs, corredorLocal, 'AVENIDA DAS AMERICAS - BARRA DA TIJUCA, RIO DE JANEIRO'),
      )
      const paradas = [parada('p1', pontoParada.lat, pontoParada.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:10:00Z')] // 5 min -> max 2
      const v = montarVisitasInclusivas(nfs, paradas)
      const confirmadas = nfs.filter(nf => v.get(nf.nf)?.viaCorredorDaRua)
      expect(confirmadas).toHaveLength(2)
      // Mesma distancia (todas no mesmo ponto); desempate por NF (ordem lexicografica)
      expect(confirmadas.map(c => c.nf)).toEqual(['NF-0', 'NF-1'])
    })

    // Correcao 02/10: shopping/condominio com mesmo endereco exato confirma todas.
    it('shopping com mesmo endereco exato: confirma todas (mesmo endereco = legitimo)', () => {
      const shoppingEndereco = 'SHOPPING BARRA SQUARE - AVENIDA DAS AMERICAS, 4666'
      const nfs = Array.from({ length: 5 }, (_, i) =>
        comCorredor(`NF-SHOP-${i}`, PONTO, corredor, shoppingEndereco),
      )
      const paradas = [parada('p1', C2.lat + 0.00135, C2.lng, '2026-09-30T13:05:00Z', '2026-09-30T13:17:00Z')]
      const v = montarVisitasInclusivas(nfs, paradas)
      // endereco COM numero -> nenhuma confirma pelo corredor (todas tem numero)
      for (const nf of nfs) expect(v.get(nf.nf)?.viaCorredorDaRua).toBeFalsy()
    })
  })
})

// Helpers unitarios dos filtros do corredor (correcao 02/10)
import { enderecoTemNumero, limiteNfsPorParadaNoCorredor } from './visitas'

describe('enderecoTemNumero (correcao 02/10)', () => {
  it('endereco sem numero (RQ padrao): false', () => {
    expect(enderecoTemNumero('AVENIDA DAS AMERICAS - BARRA DA TIJUCA, RIO DE JANEIRO')).toBe(false)
    expect(enderecoTemNumero('RUA COPACABANA, RIO DE JANEIRO')).toBe(false)
    expect(enderecoTemNumero(null)).toBe(false)
    expect(enderecoTemNumero('')).toBe(false)
  })
  it('S/N e SN: false', () => {
    expect(enderecoTemNumero('RUA X, S/N')).toBe(false)
    expect(enderecoTemNumero('RUA Y SN')).toBe(false)
    expect(enderecoTemNumero('RUA Z, S.N.')).toBe(false)
  })
  it('endereco com numero: true', () => {
    expect(enderecoTemNumero('AVENIDA DAS AMERICAS, 3000')).toBe(true)
    expect(enderecoTemNumero('RUA X, 123 - BAIRRO')).toBe(true)
    expect(enderecoTemNumero('RUA X - 456, CIDADE')).toBe(true)
  })
  it('nomes proprios numericos (25 DE MARCO) nao contam como numero', () => {
    expect(enderecoTemNumero('RUA 25 DE MARCO, SAO PAULO')).toBe(false)
    expect(enderecoTemNumero('AVENIDA 7 DE SETEMBRO')).toBe(false)
  })
})

describe('limiteNfsPorParadaNoCorredor (correcao 02/10)', () => {
  it('5 min -> 2 NFs; 30 min -> 10 NFs; 2 min -> 1 NF', () => {
    expect(limiteNfsPorParadaNoCorredor(5 * 60_000)).toBe(2)
    expect(limiteNfsPorParadaNoCorredor(30 * 60_000)).toBe(10)
    expect(limiteNfsPorParadaNoCorredor(2 * 60_000)).toBe(1)
  })
  it('duracao invalida ou zero -> 0', () => {
    expect(limiteNfsPorParadaNoCorredor(0)).toBe(0)
    expect(limiteNfsPorParadaNoCorredor(-1000)).toBe(0)
    expect(limiteNfsPorParadaNoCorredor(NaN)).toBe(0)
  })
})
