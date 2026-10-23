// F1-16 (plano mestre 23/10): causa de cada NF pendente das prioridades da
// Erica (Itaperuna 2, Tres Rios, Duque de Caxias 2, Zona Norte 2; RQU2G47,
// RQV9B26, TOS2B69). Casos reais de 13 a 23/10 (kpi_ao_vivo_calculo,
// kpi_paradas_snapshot e posicoes_historico). So' diagnostico: nao muda o KPI.
import { classificarCausa, buracoCompativel, rastreadorComFalha, prioridadeDaErica, descontarApagoes, type EvidenciaNf } from './causa-pendencia'

const base = (e: Partial<EvidenciaNf>): EvidenciaNf => ({
  situacao: 'revisar', status: '', investigacao: null, outraPlaca: null, buraco: null, rastreador: { leituras: 1900, atrasadas: 10 }, ...e,
})

describe('classificarCausa', () => {
  it('22/10 RQU2G47 Itaperuna 2, NF 2436530: NAO FOI, nenhum carro a 20 km, GPS bom -> operacao real (forte)', () => {
    const r = classificarCausa(base({ situacao: 'nao_foi', status: 'NÃO FOI AO CLIENTE (caminhão não esteve na região)', investigacao: { categoria: 'nao_chegou_perto', distM: 20018 } }))
    expect(r.causa).toBe('operacao_real')
    expect(r.forca).toBe('forte')
  })

  it('13/10 RQU2G47 Macae 2, NF 2419659: NAO FOI, mas RQU1B50 parou a 5 m por 32 min e cobre a carga -> troca de placa (forte)', () => {
    const r = classificarCausa(base({ situacao: 'nao_foi', status: 'NÃO FOI AO CLIENTE (caminhão não esteve na região)', investigacao: { categoria: 'nao_chegou_perto', distM: 3898 }, outraPlaca: { placa: 'RQU1B50', distM: 5, hora: '09:57', minutos: 32, cobreCarga: true } }))
    expect(r.causa).toBe('troca_placa')
    expect(r.forca).toBe('forte')
    expect(r.motivo).toContain('RQU1B50')
  })

  it('23/10 RQU2G47 Macae, NF 2439169: placa da escala nao passou e RBJ2J67 parou no cliente -> troca de placa (forte)', () => {
    const r = classificarCausa(base({ status: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA', investigacao: { categoria: 'nao_chegou_perto', distM: 95809 }, outraPlaca: { placa: 'RBJ2J67', distM: 33, hora: '16:48', minutos: 29, cobreCarga: true } }))
    expect(r.causa).toBe('troca_placa')
    expect(r.forca).toBe('forte')
  })

  it('placa da escala nao passou e nenhum carro da frota parou la\' -> troca de placa (fraca, so\' o rotulo do KPI)', () => {
    const r = classificarCausa(base({ status: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA', investigacao: { categoria: 'nao_chegou_perto', distM: 9000 } }))
    expect(r.causa).toBe('troca_placa')
    expect(r.forca).toBe('fraca')
  })

  it('22/10 RQV9B26 Duque de Caxias 2, NF 2438528: NAO FOI com 59% das leituras atrasadas e buraco de 104 min -> rastreador/sinal (forte) (KN-05/06)', () => {
    const r = classificarCausa(base({ situacao: 'nao_foi', status: 'NÃO FOI AO CLIENTE (caminhão não esteve na região)', investigacao: { categoria: 'nao_chegou_perto', distM: 3161 }, rastreador: { leituras: 2870, atrasadas: 1704 }, buraco: { inicio: '12:25', fim: '14:09', minutos: 104, desvioM: 5100 } }))
    expect(r.causa).toBe('rastreador_sinal')
    expect(r.forca).toBe('forte')
  })

  it('NAO FOI com GPS bom no dia mas buraco no trecho do cliente -> rastreador/sinal', () => {
    const r = classificarCausa(base({ situacao: 'nao_foi', status: 'NÃO FOI AO CLIENTE (caminhão não esteve na região)', investigacao: { categoria: 'nao_chegou_perto', distM: 4000 }, buraco: { inicio: '10:00', fim: '10:40', minutos: 40, desvioM: 800 } }))
    expect(r.causa).toBe('rastreador_sinal')
    expect(r.forca).toBe('forte')
  })

  it('placa sem nenhuma leitura no dia -> rastreador/sinal (forte)', () => {
    const r = classificarCausa(base({ status: 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE - CONFERIR ESCALA', rastreador: { leituras: 0, atrasadas: 0 } }))
    expect(r.causa).toBe('rastreador_sinal')
  })

  it('sem rastreador no KPI -> rastreador/sinal', () => {
    expect(classificarCausa(base({ situacao: 'sem_rastreador', status: 'SEM RASTREADOR - SEM COMUNICAR' })).causa).toBe('rastreador_sinal')
  })

  it('cadastro da Unitrac diverge, carro longe, GPS bom -> ponto/cadastro', () => {
    const r = classificarCausa(base({ status: 'CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ENDEREÇO', investigacao: { categoria: 'nao_chegou_perto', distM: 2567 } }))
    expect(r.causa).toBe('ponto_cadastro')
  })

  it('parada de outro cliente, mas o carro parou a <=150 m do ponto -> ponto/cadastro (forte): esteve la\' e o KPI nao contou', () => {
    const r = classificarCausa(base({ status: 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTA ENTREGA', investigacao: { categoria: 'parou_no_cliente', distM: 80 } }))
    expect(r.causa).toBe('ponto_cadastro')
    expect(r.forca).toBe('forte')
  })

  it('parada de outro cliente, carro so\' na regiao, GPS bom -> operacao real (fraca)', () => {
    const r = classificarCausa(base({ status: 'PARADA DE OUTRO CLIENTE - NÃO CONFIRMA ESTA ENTREGA', investigacao: { categoria: 'parou_na_regiao', distM: 900 } }))
    expect(r.causa).toBe('operacao_real')
    expect(r.forca).toBe('fraca')
  })

  it('passou no endereco sem registrar parada -> rastreador/sinal (fraca)', () => {
    const r = classificarCausa(base({ status: 'PASSOU NO ENDEREÇO MAS NÃO REGISTROU PARADA', investigacao: { categoria: 'parou_na_regiao', distM: 700 } }))
    expect(r.causa).toBe('rastreador_sinal')
    expect(r.forca).toBe('fraca')
  })

  it('14/10 RQS7H76 Duque de Caxias 2, NF 2423801: "PASSOU A 500m-2km SEM PARAR" (m minusculo) -> ponto/cadastro, nao "Outros"', () => {
    const r = classificarCausa(base({ status: 'PASSOU A 500m-2km SEM PARAR - CONFERIR', investigacao: { categoria: 'nao_chegou_perto', distM: 3424 } }))
    expect(r.causa).toBe('ponto_cadastro')
    expect(r.motivo).not.toContain('Outros')
  })

  it('rota ainda rodando (23/10) -> em andamento, sem causa ainda', () => {
    expect(classificarCausa(base({ situacao: 'pendente', status: 'AGUARDANDO - ROTA EM ANDAMENTO' })).causa).toBe('em_andamento')
  })

  it('toda NF sai com causa e motivo (nunca vazio)', () => {
    const r = classificarCausa(base({ status: 'QUALQUER COISA NOVA' }))
    expect(r.causa).toBeTruthy()
    expect(r.motivo.length).toBeGreaterThan(0)
  })
})

describe('buracoCompativel (KN-05)', () => {
  // RQV9B26 22/10: leituras frescas (atraso <= 15 min) param 12:25 e voltam 14:09.
  const buracos = [
    { inicio: '12:25', fim: '14:09', minutos: 104, a: { lat: -22.643597, lng: -43.290258 }, b: { lat: -22.645013, lng: -43.283873 } },
    { inicio: '17:34', fim: '17:55', minutos: 21, a: { lat: -22.815612, lng: -43.277573 }, b: { lat: -22.815612, lng: -43.277573 } },
  ]
  it('NF 2438528 (SUPER COMPRAS) cabe no buraco das 12:25-14:09', () => {
    const b = buracoCompativel(buracos, -22.633078, -43.260591)
    expect(b?.inicio).toBe('12:25')
  })
  it('cliente em Itaperuna (300 km) nao cabe em buraco nenhum', () => {
    expect(buracoCompativel(buracos, -20.959559, -41.734772)).toBeNull()
  })
})

describe('rastreadorComFalha (KN-06)', () => {
  it('mais de 30% das leituras da operacao atrasadas = falha', () => {
    expect(rastreadorComFalha({ leituras: 2870, atrasadas: 1704 })).toBe(true)
    expect(rastreadorComFalha({ leituras: 1900, atrasadas: 10 })).toBe(false)
  })
  it('nenhuma leitura no dia = falha; sem dado = nao afirma', () => {
    expect(rastreadorComFalha({ leituras: 0, atrasadas: 0 })).toBe(true)
    expect(rastreadorComFalha(null)).toBe(false)
  })
})

describe('prioridadeDaErica', () => {
  it('rota pelo nome, sem acento e sem confundir "ZONA NORTE" com "ZONA NORTE 2"', () => {
    expect(prioridadeDaErica('TRÊS RIOS', 'RQV5F64')).toEqual({ rota: 'TRES RIOS', placa: null })
    expect(prioridadeDaErica(' zona norte 2 ', 'RQU8D91')).toEqual({ rota: 'ZONA NORTE 2', placa: null })
    expect(prioridadeDaErica('ZONA NORTE', 'RBI0J25')).toBeNull()
    expect(prioridadeDaErica('ITAPERUNA', 'XXX0000')).toBeNull()
  })
  it('placa da lista em qualquer rota (RQU2G47 em Macae 2)', () => {
    expect(prioridadeDaErica('MACAÉ 2', 'RQU2G47')).toEqual({ rota: null, placa: 'RQU2G47' })
    expect(prioridadeDaErica('ITAPERUNA 2', 'RQU2G47')).toEqual({ rota: 'ITAPERUNA 2', placa: 'RQU2G47' })
  })
})

describe('descontarApagoes (KN-05: apagao do coletor nao e\' falha do rastreador)', () => {
  it('20/10 RQQ5B81: buraco 07:42-09:27 cai no apagao da frota 08:00-09:30 -> descartado; o de 16:57 fica', () => {
    const b = (inicio: string, fim: string, minutos: number) => ({ inicio, fim, minutos, a: { lat: 0, lng: 0 }, b: { lat: 0, lng: 0 } })
    const r = descontarApagoes([b('07:42', '09:27', 105), b('16:57', '17:21', 24)], [{ inicio: '08:00', fim: '09:30' }])
    expect(r.map(x => x.inicio)).toEqual(['16:57'])
  })
})
