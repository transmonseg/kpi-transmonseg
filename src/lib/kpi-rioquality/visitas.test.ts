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

  // Geometria numa linha norte-sul (0.001 de lat ~ 111m): a parada fica ~700m
  // ao SUL de A-1 (confirma A-1 pela faixa ampliada) e N-1 fica ~700m ao
  // NORTE de A-1 -- ou seja ~1,4km da parada (longe demais pra confirmar
  // direto) mas dentro dos 800m de A-1, entao herda por vizinhanca.
  it('vizinhanca: entrega sem parada propria mas com irma confirmada a <= 800m herda a visita, marcada viaVizinhanca', () => {
    const norte = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', norte.lat, norte.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
    const v = montarVisitasInclusivas(linhas, paradas)
    expect(v.get('A-1')).toMatchObject({ viaVizinhanca: false, viaRaioAmpliado: true })
    expect(v.get('N-1')).toMatchObject({ chegada: '2026-09-04T10:00:00Z', saida: '2026-09-04T10:20:00Z', viaVizinhanca: true })
  })

  it('vizinhanca NAO encadeia (irma confirmada por vizinhanca nao empresta pra terceira) e respeita o raio', () => {
    // parada 700m ao SUL de A-1; N-1 700m ao NORTE de A-1 (1,4km da parada ->
    // so' vizinhanca); M-1 1,6km ao norte de A-1 e ~900m de N-1 -> ninguem
    // pode confirmar (nem direto, nem por N-1, que so' tem vizinhanca)
    const viz = { lat: AUTOMOVEL.lat + 0.0063, lng: AUTOMOVEL.lng }
    const meio = { lat: AUTOMOVEL.lat + 0.0145, lng: AUTOMOVEL.lng }
    const linhas = [linha('A-1', AUTOMOVEL.lat, AUTOMOVEL.lng), linha('N-1', viz.lat, viz.lng), linha('M-1', meio.lat, meio.lng), linha('L-1', LONGE.lat, LONGE.lng)]
    const paradas = [parada('p1', AUTOMOVEL.lat - 0.0063, AUTOMOVEL.lng, '2026-09-04T10:00:00Z', '2026-09-04T10:20:00Z')]
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
        parada('p0', PONTO.lat - 0.0063, PONTO.lng, '2026-09-30T10:00:00Z', '2026-09-30T10:10:00Z'), // ~700 m ao sul da irma, ~1,4 km de NF-1
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
