import { describe, it, expect } from 'vitest'
import { sugerirCadastroUnitrac, RAIO_CADASTRO_CONFIRMADO_M, LIMITE_NOSSA_COORD_LONGE_M, RAIO_PARADA_NA_COORD_ATUAL_M, RAIO_CNEFE_CONFIRMA_ATUAL_M, LIMITE_SUGESTAO_LONGE_DO_CNEFE_M, MARGEM_OUTRA_NF_MAIS_PERTO_M } from './cadastro-unitrac'
import type { EntregaParaCorrigir } from './correcao-por-alvo'
import type { AlvoApi } from '@/lib/unitrac-api'
import type { ParadaBridge } from './base-horarios'

const alvo = (o: Partial<AlvoApi> = {}): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: '900', nome: 'LOJA', situacao: 1,
  feitoISO: '2026-09-22T10:20:00', documento: '100', inicioISO: '2026-09-22T06:00:00',
  ordem: 1, rota: 'R1', pontoLat: -22.0000, pontoLng: -43.0000, ...o,
})
// paradas na convencao MASCARADA (digitos BRT + Z falso), igual ao feitoISO
const parada = (o: Partial<ParadaBridge> = {}): ParadaBridge => ({
  chegada: '2026-09-22T10:10:00.000Z', saida: '2026-09-22T10:30:00.000Z', duracaoSeg: 1200,
  lat: -22.0009, lng: -43.0, classificacao: 'FORA_BASE', ...o,
})
const entrega = (o: Partial<EntregaParaCorrigir> = {}): EntregaParaCorrigir => ({
  nf: '100', placaNorm: 'AAA1A11', endereco: 'RUA X, 1 - CENTRO, CABO FRIO',
  latAtual: -22.5, lngAtual: -43.5, confiavelAtual: true, fonteAtual: 'nominatim', ...o,
})
const paradas = (p: ParadaBridge[] = [parada()]) => new Map([['AAA1A11', p]])

describe('sugerirCadastroUnitrac', () => {
  it('constantes: 300 m confirmam o cadastro, nossa coord precisa estar a >500 m', () => {
    expect(RAIO_CADASTRO_CONFIRMADO_M).toBe(300)
    expect(LIMITE_NOSSA_COORD_LONGE_M).toBe(500)
  })

  it('cadastro a <=300m de parada que contem o feito e coord nossa longe -> grava o CADASTRO', () => {
    const r = sugerirCadastroUnitrac([entrega()], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(1)
    expect(r.sugestoes[0]).toMatchObject({ endereco: 'RUA X, 1 - CENTRO, CABO FRIO', latNova: -22.0, lngNova: -43.0, nfs: ['100'] })
  })

  it('NF com alvos feitos em instantes diferentes (>5 min) -> nao gera candidato (alvo_duplicado)', () => {
    const a = [alvo({ codigoUnitrac: '900' }), alvo({ codigoUnitrac: '901', feitoISO: '2026-09-22T10:40:00', pontoLat: -22.0001 })]
    const r = sugerirCadastroUnitrac([entrega()], a, paradas([parada({ saida: '2026-09-22T11:00:00.000Z' })]))
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0]).toMatchObject({ nf: '100', motivo: 'alvo_duplicado' })
  })

  it('NF com alvos duplicados no mesmo instante (<=5 min) segue valendo', () => {
    const a = [alvo({ codigoUnitrac: '900' }), alvo({ codigoUnitrac: '901', feitoISO: '2026-09-22T10:22:00' })]
    expect(sugerirCadastroUnitrac([entrega()], a, paradas()).sugestoes).toHaveLength(1)
  })

  it('feito com tolerancia de 10 min fora da janela da parada ainda confirma', () => {
    const p = parada({ chegada: '2026-09-22T10:00:00.000Z', saida: '2026-09-22T10:10:00.000Z' })
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T10:18:00' })], paradas([p])).sugestoes).toHaveLength(1)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T10:40:00' })], paradas([p])).sugestoes).toHaveLength(0)
  })

  it('fuso: feito 3h deslocado NAO casa (convencao mascarada)', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ feitoISO: '2026-09-22T13:20:00' })], paradas()).sugestoes).toHaveLength(0)
  })

  it('cadastro longe da parada (>300m): nao grava', () => {
    const r = sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: -22.01 })], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('cadastro_nao_confirmado')
  })

  it('nossa coordenada perto do cadastro (<=500m): nao mexe', () => {
    const r = sugerirCadastroUnitrac([entrega({ latAtual: -22.002, lngAtual: -43.0 })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('coordenada_atual_ok')
  })

  it('nossa coord a >500m do cadastro mas <=500m da PARADA que confirmou: ja esta ok, nao mexe', () => {
    const p = parada({ lat: -22.0025 }) // ~275m do cadastro
    const r = sugerirCadastroUnitrac([entrega({ latAtual: -22.0064, lngAtual: -43.0 })], [alvo()], paradas([p]))
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('coordenada_atual_ok')
  })

  it('sem coordenada nossa (K1): grava o cadastro', () => {
    const r = sugerirCadastroUnitrac([entrega({ latAtual: null, lngAtual: null, confiavelAtual: false, fonteAtual: null })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(1)
  })

  it('fonte manual nunca e sobrescrita', () => {
    const r = sugerirCadastroUnitrac([entrega({ fonteAtual: 'manual' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('correcao_manual')
  })

  // Achado real 26/09 (correcoes finais pre-deploy, item 3): mesmo tratamento
  // de correcao-por-alvo.ts -- 'verificacao_manual' e' correcao humana
  // (aplicar-correcoes-geocode.ts), nunca sobrescrita pelo upsert automatico.
  it('fonte verificacao_manual nunca e sobrescrita', () => {
    const r = sugerirCadastroUnitrac([entrega({ fonteAtual: 'verificacao_manual' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('correcao_manual')
  })

  it('parada BASE ou longa demais (>120min) nao confirma', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada({ classificacao: 'BASE' })])).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada({ duracaoSeg: 3 * 3600 })])).sugestoes).toHaveLength(0)
  })

  it('cadastro invalido (null/0) ou alvo nao feito: rejeita', () => {
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: null })], paradas()).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ pontoLat: 0, pontoLng: 0 })], paradas()).sugestoes).toHaveLength(0)
    expect(sugerirCadastroUnitrac([entrega()], [alvo({ situacao: 0, feitoISO: null })], paradas()).sugestoes).toHaveLength(0)
  })

  it('mesmo endereco com cadastros divergentes (>300m) entre NFs: nao grava', () => {
    const e = [entrega({ nf: '100' }), entrega({ nf: '101' })]
    const a = [alvo({ documento: '100' }), alvo({ documento: '101', pontoLat: -22.0009, pontoLng: -43.0, codigoUnitrac: '901' })]
    // cadastro 100 = -22.0000 ; cadastro 101 = -22.0009 (~100m) -> compativel, grava
    expect(sugerirCadastroUnitrac(e, a, paradas()).sugestoes).toHaveLength(1)
    const a2 = [alvo({ documento: '100' }), alvo({ documento: '101', pontoLat: -22.004, codigoUnitrac: '901' })]
    const r = sugerirCadastroUnitrac(e, a2, new Map([['AAA1A11', [parada(), parada({ chegada: '2026-09-22T10:10:00.000Z', lat: -22.0041 })]]]))
    expect(r.sugestoes).toHaveLength(0)
  })

  it('endereco nao identificado: rejeita', () => {
    const r = sugerirCadastroUnitrac([entrega({ endereco: '(endereço não identificado)' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
  })
})

// Filtros de 30/09 -- verificacao manual das 89 sugestoes de 28-29/09
// (56 CORRETA / 19 ERRADA / 14 INDETERMINADA). Fixtures resumidas dos casos
// reais (numeracao = linha do CSV verificacao-cadastro-unitrac-30e.csv).
describe('sugerirCadastroUnitrac -- filtros 30/09', () => {
  it('constantes nomeadas', () => {
    expect(RAIO_PARADA_NA_COORD_ATUAL_M).toBe(75)
    expect(RAIO_CNEFE_CONFIRMA_ATUAL_M).toBe(100)
    expect(LIMITE_SUGESTAO_LONGE_DO_CNEFE_M).toBe(500)
  })

  describe('(a) parada de prova de OUTRA NF da mesma placa', () => {
    // #17 (RQP2G33, 28/09): cadastro nosso a 109 m da parada; a NF 2394479
    // (AVENIDA SAQUAREMA, outro cliente) tem feito na mesma parada e cadastro
    // a 45 m -- a parada e' dela.
    const nossa = entrega({ nf: '100', endereco: 'RUA BEATRIZ AMARAL PEREIRA, 119 - BACAXA, SAQUAREMA - LOJA 02' })
    const outra = entrega({ nf: '200', endereco: 'AVENIDA SAQUAREMA , 5414 - BACAXA, SAQUAREMA - *' })
    const alvoNosso = alvo({ documento: '100', codigoUnitrac: '154272', pontoLat: -22.0 }) // ~100 m da parada
    const alvoOutro = alvo({ documento: '200', codigoUnitrac: '999', pontoLat: -22.0005, feitoISO: '2026-09-22T10:15:00' }) // ~44 m

    it('outra NF (outro codigo e endereco) com feito na janela e cadastro MAIS perto da parada -> descarta', () => {
      const r = sugerirCadastroUnitrac([nossa, outra], [alvoNosso, alvoOutro], paradas())
      expect(r.sugestoes.map(s => s.endereco)).not.toContain(nossa.endereco)
      expect(r.rejeicoes).toContainEqual(expect.objectContaining({ nf: '100', motivo: 'parada_de_outra_nf' }))
    })

    it('outra NF com cadastro MAIS LONGE da parada que o nosso (#2 Granja dos Cavaleiros) -> segue', () => {
      const longe = alvo({ ...alvoOutro, pontoLat: -21.9990 }) // ~210 m da parada
      const r = sugerirCadastroUnitrac([nossa, outra], [alvoNosso, longe], paradas())
      expect(r.sugestoes.map(s => s.endereco)).toContain(nossa.endereco)
    })

    // #72/#79 (29/09, CORRETAS): o cadastro da outra NF esta' 0,2 m mais perto
    // que o nosso -- empate dentro do ruido do GPS nao aponta dono.
    it('outra NF so ate 5 m mais perto que a nossa (empate) -> segue', () => {
      expect(MARGEM_OUTRA_NF_MAIS_PERTO_M).toBe(5)
      const empate = alvo({ ...alvoOutro, pontoLat: -22.00002 }) // ~98 m vs ~100 m nosso
      const r = sugerirCadastroUnitrac([nossa, outra], [alvoNosso, empate], paradas())
      expect(r.sugestoes.map(s => s.endereco)).toContain(nossa.endereco)
    })

    it('outra NF com feito FORA da janela da parada -> segue', () => {
      const fora = alvo({ ...alvoOutro, feitoISO: '2026-09-22T12:00:00' })
      const r = sugerirCadastroUnitrac([nossa, outra], [alvoNosso, fora], paradas())
      expect(r.sugestoes.map(s => s.endereco)).toContain(nossa.endereco)
    })

    it('outra NF no MESMO local (mesma rua+numero, grafia diferente: shopping #12 MLK 126) -> segue', () => {
      const a = entrega({ nf: '100', endereco: 'AV PASTOR MARTIN LUTHER KING JR, 126 - DEL CASTILHO, RIO DE JANEIRO - LOJA 1' })
      const b = entrega({ nf: '200', endereco: 'AVENIDA PASTOR MARTIN  LUTHER KING JR, 126 - DEL CASTILHO, RIO DE JANEIRO - LOJA 9' })
      const r = sugerirCadastroUnitrac([a, b], [alvoNosso, alvoOutro], paradas())
      expect(r.sugestoes.map(s => s.endereco)).toContain(a.endereco)
    })

    it('S/N nao conta como mesmo numero (#51 VISCONDE DO RIO BRANCO S/N x SN) -> descarta', () => {
      const a = entrega({ nf: '100', endereco: 'AVENIDA VISCONDE DO RIO BRANCO, S/N - CENTRO, NITEROI - LOJA LE 00' })
      const b = entrega({ nf: '200', endereco: 'RUA VISCONDE DO RIO BRANCO, SN - CENTRO, NITEROI - LOJA 41' })
      const r = sugerirCadastroUnitrac([a, b], [alvoNosso, alvoOutro], paradas())
      expect(r.rejeicoes).toContainEqual(expect.objectContaining({ nf: '100', motivo: 'parada_de_outra_nf' }))
    })

    it('outra NF do MESMO codigo Unitrac nao conta como outro cliente', () => {
      const mesmoCod = alvo({ ...alvoOutro, codigoUnitrac: '154272' })
      const r = sugerirCadastroUnitrac([nossa], [alvoNosso, mesmoCod], paradas())
      expect(r.sugestoes.map(s => s.endereco)).toContain(nossa.endereco)
    })

    // #78 (TUS1A47, 29/09): o caminhao tambem parou 7-9 min a 63 m da NOSSA
    // coordenada (o endereco real) -- a parada que "confirma" o cadastro e'
    // de outro cliente.
    it('placa tambem parou a <=75 m da nossa coordenada atual -> descarta (parada_na_coordenada_atual)', () => {
      const naNossa = parada({ chegada: '2026-09-22T11:00:00.000Z', saida: '2026-09-22T11:09:00.000Z', duracaoSeg: 540, lat: -22.5005, lng: -43.5 }) // ~55 m
      const r = sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada(), naNossa]))
      expect(r.sugestoes).toHaveLength(0)
      expect(r.rejeicoes[0].motivo).toBe('parada_na_coordenada_atual')
    })

    it('parada a >75 m da nossa coordenada (#8 Ilha do Fundao, 79 m) ou parada BASE -> segue', () => {
      const perto = parada({ chegada: '2026-09-22T11:00:00.000Z', saida: '2026-09-22T11:09:00.000Z', lat: -22.5008, lng: -43.5 }) // ~89 m
      expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada(), perto])).sugestoes).toHaveLength(1)
      const base = parada({ chegada: '2026-09-22T11:00:00.000Z', saida: '2026-09-22T11:09:00.000Z', lat: -22.5, lng: -43.5, classificacao: 'BASE' })
      expect(sugerirCadastroUnitrac([entrega()], [alvo()], paradas([parada(), base])).sugestoes).toHaveLength(1)
    })
  })

  describe('(a/d) cadastro Unitrac compartilhado por 2+ enderecos do romaneio', () => {
    // #26/#27 (TOS0H81, 28/09, Louise Vita): o mesmo codigo 148772 atende
    // RUA OPERARIO MARCOS ANDREOTTI, 06 e RUA AUGUSTO DE CASTRO, 554 -- um
    // cadastro so' pra dois enderecos; nao da' pra saber de qual e' o ponto.
    it('mesmo codigo em dois enderecos distintos -> descarta os dois', () => {
      const e1 = entrega({ nf: '100', endereco: 'RUA OPERÁRIO MARCOS ANDREOTTI, 06 - INHOAÍBA, RIO DE JANEIRO - casa' })
      const e2 = entrega({ nf: '101', endereco: 'RUA AUGUSTO DE CASTRO, 554 - INHOAÍBA, RIO DE JANEIRO - *' })
      const a = [alvo({ documento: '100', codigoUnitrac: '148772' }), alvo({ documento: '101', codigoUnitrac: '148772' })]
      const r = sugerirCadastroUnitrac([e1, e2], a, paradas())
      expect(r.sugestoes).toHaveLength(0)
      expect(r.rejeicoes.filter(x => x.motivo === 'cadastro_compartilhado').map(x => x.nf).sort()).toEqual(['100', '101'])
    })

    it('codigo compartilhado conta mesmo se a outra NF nao foi feita', () => {
      const e1 = entrega({ nf: '100' })
      const e2 = entrega({ nf: '101', endereco: 'RUA Y, 2 - CENTRO, CABO FRIO' })
      const a = [alvo({ documento: '100' }), alvo({ documento: '101', situacao: 0, feitoISO: null })]
      expect(sugerirCadastroUnitrac([e1, e2], a, paradas()).rejeicoes[0].motivo).toBe('cadastro_compartilhado')
    })

    it('mesmo codigo, mesmo endereco em 2 NFs -> segue (nao e compartilhado)', () => {
      const e = [entrega({ nf: '100' }), entrega({ nf: '101' })]
      const a = [alvo({ documento: '100' }), alvo({ documento: '101' })]
      expect(sugerirCadastroUnitrac(e, a, paradas()).sugestoes).toHaveLength(1)
    })
  })

  describe('(b) coordenada atual ja bate rua+numero com o CNEFE', () => {
    // #32 (RBJ9I44, 28/09): NOSSA SENHORA DE COPACABANA, 581 -- nossa coord
    // cai exatamente num ponto CNEFE da rua+numero; a sugestao fica a 678 m.
    const e = entrega({ endereco: 'AVENIDA NOSSA SENHORA DE COPACABANA, 581 - COPACABANA, RIO DE JANEIRO - LOJA', latAtual: -22.5, lngAtual: -43.5, confiavelAtual: true, fonteAtual: null })
    const cnefe = (pts: { lat: number; lng: number }[]) => ({ cnefeRuaNumero: new Map([[e.endereco, pts]]) })

    it('atual a <=100 m de ponto CNEFE rua+numero, sugestao >500 m -> descarta', () => {
      const r = sugerirCadastroUnitrac([e], [alvo()], paradas(), cnefe([{ lat: -22.5004, lng: -43.5 }]))
      expect(r.sugestoes).toHaveLength(0)
      expect(r.rejeicoes[0].motivo).toBe('cnefe_confirma_atual')
    })

    it('sugestao TAMBEM bate com outro ponto CNEFE da mesma rua+numero (#80, condominio) -> segue', () => {
      const r = sugerirCadastroUnitrac([e], [alvo()], paradas(), cnefe([{ lat: -22.5, lng: -43.5 }, { lat: -22.0003, lng: -43.0 }]))
      expect(r.sugestoes).toHaveLength(1)
    })

    it('ponto CNEFE a >100 m da atual, sem CNEFE, ou coordenada nao confiavel -> segue', () => {
      expect(sugerirCadastroUnitrac([e], [alvo()], paradas(), cnefe([{ lat: -22.502, lng: -43.5 }])).sugestoes).toHaveLength(1)
      expect(sugerirCadastroUnitrac([e], [alvo()], paradas()).sugestoes).toHaveLength(1)
      const naoConf = { cnefeRuaNumero: new Map([[e.endereco, [{ lat: -22.5, lng: -43.5 }]]]) }
      expect(sugerirCadastroUnitrac([{ ...e, confiavelAtual: false }], [alvo()], paradas(), naoConf).sugestoes).toHaveLength(1)
      expect(sugerirCadastroUnitrac([{ ...e, fonteAtual: 'cnefe_bairro' }], [alvo()], paradas(), naoConf).sugestoes).toHaveLength(1)
    })
  })

  it('(c) cliente de ilha (Ilha da Gipoia, #66) -> descarta', () => {
    const r = sugerirCadastroUnitrac([entrega({ endereco: 'RUA PROJETADA, SN - ILHA DA GIPOIA, ANGRA DOS REIS - PRAIA DO VITORINO' })], [alvo()], paradas())
    expect(r.sugestoes).toHaveLength(0)
    expect(r.rejeicoes[0].motivo).toBe('ilha')
  })
})
