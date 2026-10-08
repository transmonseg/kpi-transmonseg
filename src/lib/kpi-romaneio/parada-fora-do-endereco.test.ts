import { describe, expect, it } from 'vitest'
import { conferirParadaForaDoEndereco, candidatosParadaForaDoEndereco } from './parada-fora-do-endereco'
import { PREFIXO_OBS_PARADA_FORA_DO_ENDERECO } from './agregacao'
import type { LinhaDetalheEntrega, LinhaGeocodificada } from './types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import type { AlvoApi } from '@/lib/unitrac-api/alvos'

// Endereco em (-22.90, -43.20); cadastro errado da Unitrac ~5,5 km a leste.
const END = 'RUA X, 10 - CENTRO, RIO DE JANEIRO - 20000000'
const linha = (nf: string, extra: Partial<LinhaGeocodificada> = {}): LinhaGeocodificada => ({
  carga: 'C1', destino: '', placa: 'AAA1A11', motorista: '', ajudantes: [], nf, clienteCodigo: nf, clienteNome: 'CLIENTE ' + nf,
  endereco: END, lat: -22.90, lng: -43.20, geoConfiavel: true, ...extra,
})
const det = (nf: string, extra: Partial<LinhaDetalheEntrega> = {}): LinhaDetalheEntrega => ({
  carga: 'C1', placa: 'AAA1A11', motorista: '', clienteCodigo: nf, nf, clienteNome: 'CLIENTE ' + nf, endereco: END,
  saidaCd: '2026-10-07T08:00:00Z', chegadaCd: '2026-10-07T18:00:00Z', tempoOperacaoMin: 600,
  chegada: '2026-10-07T12:00:00Z', saida: '2026-10-07T12:20:00Z', tempoParadaMin: 20,
  status: 'confirmado_gps', temRastreador: true, observacao: null, evidencia: 'parada_no_cadastro_unitrac', distParadaM: 50,
  motivo: '', confianca: 'CONFIRMADA', ...extra,
})
const parada = (lat: number, lng: number, ini: string, fim: string): UnitracParadaRow => ({
  id: ini, placa_norm: 'AAA1A11', chegada: ini, saida: fim, fim_real: fim, duracao_seg: null, local_parada: '', codigo_loja: null, nome_loja: null,
  lat, lng, classificacao: 'FORA_BASE', ordem: 0,
})
const alvo = (nf: string, lat: number, lng: number): AlvoApi => ({
  placaNorm: 'AAA1A11', codigoUnitrac: nf, nome: '', situacao: 1, feitoISO: null, documento: nf, inicioISO: null, ordem: 0, rota: '', pontoLat: lat, pontoLng: lng,
})
const LONGE = parada(-22.90, -43.146, '2026-10-07T12:00:00Z', '2026-10-07T12:20:00Z') // ~5,5 km

const ctx = (linhas: LinhaGeocodificada[], paradas: UnitracParadaRow[], alvos: AlvoApi[] = []) => ({
  linhaPorNf: new Map(linhas.map(l => [l.nf, l])),
  alvoPorNf: new Map(alvos.map(a => [a.documento as string, a])),
  paradasPorPlaca: new Map([['AAA1A11', paradas]]),
  paradasCruasPorPlaca: new Map<string, UnitracParadaRow[]>(),
  data: '2026-10-07',
})

describe('candidatosParadaForaDoEndereco', () => {
  it('entregue por parada a mais de 1 km do endereco vira candidato com a coordenada da parada', () => {
    const c = candidatosParadaForaDoEndereco([det('1')], ctx([linha('1')], [LONGE]))
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ nf: '1', lat: -22.90, lng: -43.146, endereco: END })
    expect(c[0].distM).toBeGreaterThan(5000)
  })
  it('parada perto do endereco nao e candidato', () => {
    const perto = parada(-22.9005, -43.2005, '2026-10-07T12:00:00Z', '2026-10-07T12:20:00Z')
    expect(candidatosParadaForaDoEndereco([det('1')], ctx([linha('1')], [perto]))).toHaveLength(0)
  })
  it('carro parou no endereco em outra hora do dia: nao e candidato (entrega real, horario casado errado)', () => {
    const noEndereco = parada(-22.901, -43.2005, '2026-10-07T10:00:00Z', '2026-10-07T10:30:00Z')
    expect(candidatosParadaForaDoEndereco([det('1')], ctx([linha('1')], [LONGE, noEndereco]))).toHaveLength(0)
  })
  it('pendente, geocode nao confiavel ou ilha (acesso por barco) nao entram', () => {
    expect(candidatosParadaForaDoEndereco([det('1', { status: 'pendente' })], ctx([linha('1')], [LONGE]))).toHaveLength(0)
    expect(candidatosParadaForaDoEndereco([det('1')], ctx([linha('1', { geoConfiavel: false })], [LONGE]))).toHaveLength(0)
    const ilha = 'RUA DA PRAIA, SN - VILA DO ABRAAO, ANGRA DOS REIS - 23900000'
    expect(candidatosParadaForaDoEndereco([det('1', { endereco: ilha })], ctx([linha('1', { endereco: ilha })], [LONGE]))).toHaveLength(0)
  })
  it('alvo feito na Unitrac sem horario: usa o cadastro da Unitrac como lugar da parada', () => {
    const c = candidatosParadaForaDoEndereco(
      [det('1', { status: 'confirmado_unitrac', chegada: null, saida: null, evidencia: 'alvo_feito_unitrac' })],
      ctx([linha('1')], [], [alvo('1', -22.90, -43.146)]),
    )
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ lat: -22.90, lng: -43.146 })
  })
})

describe('conferirParadaForaDoEndereco', () => {
  const fora = async (pts: { id: string }[]) => new Map(pts.map(p => [p.id, { ok: false as const, motivo: 'municipio_divergente' as const }]))
  it('parada fora do bairro/municipio, sem outro cliente no ponto: continua entregue, com aviso de cadastro', async () => {
    const r = await conferirParadaForaDoEndereco([det('1'), det('2')], ctx([linha('1'), linha('2')], [LONGE]),
      async pts => new Map(pts.map(p => [p.id, p.id === '1' ? { ok: false as const, motivo: 'municipio_divergente' as const } : { ok: true as const }])))
    expect(r[0].status).toBe('confirmado_gps')
    expect(r[0].observacao).toBe(`${PREFIXO_OBS_PARADA_FORA_DO_ENDERECO} (5,5 km, OUTRO MUNICÍPIO) - CORRIGIR CADASTRO`)
    expect(r[0].confianca).toBe('CONFIRMADA')
    expect(r[0].motivo).toMatch(/corrigir cadastro/)
    // Parada no mesmo bairro (nosso ponto e' que e' impreciso): nada muda.
    expect(r[1].observacao).toBeNull()
  })
  it('a parada e\' o endereco de OUTRO cliente entregue no mesmo horario: continua entregue, aviso diz isso', async () => {
    const l9 = linha('9', { clienteCodigo: '9', endereco: 'RUA Y, 1 - CENTRO, NITEROI - 24000000', lat: -22.90, lng: -43.146 })
    const r = await conferirParadaForaDoEndereco(
      [det('1'), det('9', { endereco: l9.endereco, evidencia: 'parada_no_endereco' })],
      ctx([linha('1'), l9], [LONGE]), fora)
    expect(r[0].status).toBe('confirmado_gps')
    expect(r[0].observacao).toBe(`${PREFIXO_OBS_PARADA_FORA_DO_ENDERECO} (5,5 km, OUTRO MUNICÍPIO, NO PONTO DE OUTRO CLIENTE) - CORRIGIR CADASTRO`)
    expect(r[1].observacao).toBeNull()
  })
  it('outro cliente "no ponto" so\' pelo cadastro da Unitrac nao conta como ponto de outro cliente', async () => {
    const l9 = linha('9', { clienteCodigo: '9', endereco: 'RUA Y, 1 - CENTRO, NITEROI - 24000000', lat: -22.95, lng: -43.25 })
    const r = await conferirParadaForaDoEndereco(
      [det('1'), det('9', { endereco: l9.endereco })],
      ctx([linha('1'), l9], [LONGE], [alvo('1', -22.90, -43.146), alvo('9', -22.90, -43.146)]), fora)
    expect(r[0].observacao).not.toMatch(/OUTRO CLIENTE/)
  })
  it('nao sobrescreve outra observacao ja\' existente', async () => {
    const r = await conferirParadaForaDoEndereco([det('1', { observacao: 'ENTREGUE - PARADA PRÓXIMA (500m-2km)' })], ctx([linha('1')], [LONGE]), fora)
    expect(r[0].observacao).toBe('ENTREGUE - PARADA PRÓXIMA (500m-2km)')
  })
  it('ponte fora do ar (erro) ou sem veredito: nada muda', async () => {
    const d = [det('1')]
    expect((await conferirParadaForaDoEndereco(d, ctx([linha('1')], [LONGE]), async () => { throw new Error('caiu') }))[0]).toEqual(d[0])
    expect((await conferirParadaForaDoEndereco(d, ctx([linha('1')], [LONGE]), async () => new Map()))[0]).toEqual(d[0])
  })
})
