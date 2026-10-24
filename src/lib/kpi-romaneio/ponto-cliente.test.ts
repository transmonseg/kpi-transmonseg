import { describe, it, expect } from 'vitest'
import fixture from './ponto-cliente.fixture-2026-10.json'
import {
  nfsComCliente, clientesQueFalham, candidatasParada, candidatosCadastro, decidirCorrecao, ruaDoEndereco, chavePlacaDia,
  coordenadaNoRj, caminhoEvidenciaPonto, type CandidatoCadastro, type NfCliente, type ParadaSnapshot, type NfDaPlaca, type AlvoSnapshot, type PainelPonto,
} from './ponto-cliente'
import type { LocalCliente } from './locais-clientes'

// F4-07 (GEO-24, ACH-07, D-08): dados reais de produção (só leitura, 24/10) dos
// três clientes do ACH-07: GASPERI GRILL (6044, "Coordenada imprecisa" 7 de 7
// dias), TIA ZANINHA (139241, "Cadastro divergente" 4 de 4) e CHURRASCARIA
// JACARÉ (163983, ponto aprendido com 5 confirmações a 84 km do geocode).
type Fx = typeof fixture
const fx = fixture as Fx

function montar() {
  const dias = [...new Set(fx.romaneio.map(r => r.data))].sort()
  const nfs: NfCliente[] = []
  const nfsDaPlaca = new Map<string, NfDaPlaca[]>()
  for (const n of fx.nfs) {
    const k = chavePlacaDia(n.data, n.placa)
    nfsDaPlaca.set(k, [...(nfsDaPlaca.get(k) ?? []), { nf: n.nf, situacao: n.situacao, lat: n.lat, lng: n.lng }])
  }
  for (const data of dias) {
    const placas = new Map<string, { placa: string; nfs: { nf: string; carga: string; situacao: string; status: string; lat: number | null; lng: number | null }[] }>()
    for (const n of fx.nfs.filter(x => x.data === data)) {
      const p = placas.get(n.placa) ?? { placa: n.placa, nfs: [] }
      p.nfs.push({ nf: n.nf, carga: n.carga, situacao: n.situacao, status: n.status ?? '', lat: n.lat, lng: n.lng })
      placas.set(n.placa, p)
    }
    nfs.push(...nfsComCliente(data, fx.romaneio.filter(r => r.data === data), [...placas.values()]))
  }
  const paradas = new Map<string, ParadaSnapshot[]>(fx.paradas.map(p => [chavePlacaDia(p.data, p.placa), p.paradas as ParadaSnapshot[]]))
  const alvosPorDia = new Map<string, AlvoSnapshot[]>(fx.alvos.map(a => [a.data, a.alvos as AlvoSnapshot[]]))
  const locais = new Map<string, LocalCliente>(fx.locais.map(l => [l.cliente_codigo, {
    chave: l.cliente_codigo, lat: l.lat, lng: l.lng, raioM: l.raio_m, fonte: l.fonte as LocalCliente['fonte'], confirmacoes: l.confirmacoes, enderecoRef: l.endereco_ref,
  }]))
  return { nfs, nfsDaPlaca, paradas, alvosPorDia, locais }
}
const base = montar()
const doCliente = (codigo: string) => base.nfs.filter(n => n.codigo === codigo)
const pontoAtual = (codigo: string) => {
  const n = doCliente(codigo).filter(x => x.lat != null).sort((a, b) => b.data.localeCompare(a.data))[0]
  return n ? { lat: n.lat as number, lng: n.lng as number } : null
}

describe('nfsComCliente', () => {
  it('liga a NF do resultado ao código do cliente do romaneio (carga + NF) e só ele', () => {
    const g = doCliente('6044')
    expect(g.map(n => n.nf)).toEqual(['2408611', '2408612', '2413374', '2418099', '2420416', '2427900', '2435056', '2439975'])
    expect(g[0]).toMatchObject({ data: '2026-10-06', placa: 'TOS4J82', nome: 'GASPERI GRILL', situacao: 'revisar', categoria: 'Coordenada imprecisa' })
    // NF de outro cliente da mesma placa não entra (não está no romaneio do fixture).
    expect(base.nfs.every(n => ['6044', '139241', '163983'].includes(n.codigo))).toBe(true)
  })
  it('pão (carga PAO-) fica de fora: o código é a própria NF', () => {
    const r = nfsComCliente('2026-10-22', [{ nf: '217418', carga: 'PAO-1', clienteCodigo: '217418', clienteNome: 'PADARIA', endereco: 'RUA A, 1' }],
      [{ placa: 'SEM PLACA', nfs: [{ nf: '217418', carga: 'PAO-1', situacao: 'fora_da_conta', status: 'CARGA SEM PLACA', lat: null, lng: null }] }])
    expect(r).toEqual([])
  })
})

describe('clientesQueFalham (ACH-07)', () => {
  it('GASPERI GRILL 7 de 7 dias pela coordenada; TIA ZANINHA 4 de 4 pelo cadastro; JACARÉ 3 dias de ponto (o 4º é placa da escala)', () => {
    const lista = clientesQueFalham(base.nfs)
    expect(lista.map(c => [c.nome, c.dias, c.diasFalha, c.diasFalhaPonto])).toEqual([
      ['GASPERI GRILL', 7, 7, 7],
      ['TIA ZANINHA RESTAURANTE', 4, 4, 4],
      ['CHURRASCARIA JACARE', 4, 4, 3],
    ])
    expect(lista[0].motivos).toEqual([{ motivo: 'Coordenada imprecisa', dias: 7 }])
    expect(lista[1].motivos).toEqual([{ motivo: 'Cadastro divergente', dias: 4 }])
    expect(lista[2].motivos).toEqual([{ motivo: 'Coordenada imprecisa', dias: 3 }, { motivo: 'Placa da escala divergente', dias: 1 }])
    expect(lista[0]).toMatchObject({ ultimaFalha: '2026-10-23', endereco: expect.stringContaining('WILSON PEDRO FRANCISCO') })
  })
  it('menos de 3 dias de falha pelo ponto não entra', () => {
    expect(clientesQueFalham(base.nfs, 5).map(c => c.codigo)).toEqual(['6044'])
  })
})

describe('candidatasParada (parada GPS real repetida)', () => {
  it('JACARÉ: a placa RBI0J25 parou no mesmo lugar em 07, 15 e 22/10 (7-11 min), a ~85 m do ponto aprendido e a 84 km do geocode', () => {
    const c = candidatasParada({ nfsCliente: doCliente('163983'), paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: pontoAtual('163983') })
    const jac = c.find(x => Math.round(x.lat * 1e4) / 1e4 === -21.6381)!
    expect(jac).toMatchObject({ id: 'parada:-21.63810,-42.09926', dias: ['2026-10-07', '2026-10-15', '2026-10-22'], paradas: 3, minutosMediana: 7 })
    const local = base.locais.get('163983')!
    const aoLocal = Math.round(Math.hypot((jac.lat - local.lat) * 111_000, (jac.lng - local.lng) * 103_000))
    expect(aoLocal).toBeGreaterThan(60)
    expect(aoLocal).toBeLessThan(110)
    expect(jac.distPontoAtualM).toBeGreaterThan(80_000)
    // A rota repete outras paradas todo dia (outros clientes): repetição sozinha
    // não identifica o cliente -- por isso a rua do CNEFE tem que bater (servidor).
    expect(c.filter(x => x.dias.length >= 3).length).toBeGreaterThan(1)
  })
  it('parada colada numa entrega feita de OUTRO cliente da placa no mesmo dia não é evidência deste (regra A)', () => {
    const nfsDaPlaca = new Map(base.nfsDaPlaca)
    const k = chavePlacaDia('2026-10-07', 'RBI0J25')
    nfsDaPlaca.set(k, [...(nfsDaPlaca.get(k) ?? []), { nf: 'VIZINHO', situacao: 'entregue', lat: -21.6381, lng: -42.0993 }])
    const c = candidatasParada({ nfsCliente: doCliente('163983'), paradas: base.paradas, nfsDaPlaca, pontoAtual: null })
    expect(c.find(x => x.id === 'parada:-21.63810,-42.09926')).toBeUndefined()
    expect(c.find(x => Math.abs(x.lat + 21.6381) < 0.0005 && Math.abs(x.lng + 42.0993) < 0.0005)?.dias).toEqual(['2026-10-15', '2026-10-22'])
  })
  it('uma parada só (1 dia) não vira candidata', () => {
    const um = doCliente('163983').filter(n => n.data === '2026-10-07')
    expect(candidatasParada({ nfsCliente: um, paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: null })).toEqual([])
  })
})

describe('candidatosCadastro (cadastro Unitrac confirmado por parada)', () => {
  it('GASPERI: o cadastro da Unitrac está colado no nosso ponto e nenhuma parada o confirma', () => {
    const c = candidatosCadastro({ codigo: '6044', nfsCliente: doCliente('6044'), alvosPorDia: base.alvosPorDia, paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: pontoAtual('6044') })
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ lat: -22.919159, lng: -43.849953, diasConfirmados: [], generico: false })
    expect(c[0].distPontoAtualM).toBeLessThan(100)
  })
  it('TIA ZANINHA: o mesmo cadastro em todos os dias, com o resultado das paradas da placa', () => {
    const c = candidatosCadastro({ codigo: '139241', nfsCliente: doCliente('139241'), alvosPorDia: base.alvosPorDia, paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: pontoAtual('139241') })
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ id: 'cadastro:-22.242005,-42.644545', dias: ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-21'] })
    expect(c[0].distPontoAtualM).toBeGreaterThan(1700)
  })
  it('cadastro com o mesmo ponto de outro cliente no dia é genérico (regra B)', () => {
    const alvos = new Map(base.alvosPorDia)
    alvos.set('2026-10-13', [...(alvos.get('2026-10-13') ?? []), { documento: '1', codigoUnitrac: '999', pontoLat: -22.242005, pontoLng: -42.644545 }])
    const c = candidatosCadastro({ codigo: '139241', nfsCliente: doCliente('139241'), alvosPorDia: alvos, paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: null })
    expect(c[0].generico).toBe(true)
  })
})

describe('decidirCorrecao (D-08: só com evidência)', () => {
  const jacare = (): PainelPonto => {
    const paradas = candidatasParada({ nfsCliente: doCliente('163983'), paradas: base.paradas, nfsDaPlaca: base.nfsDaPlaca, pontoAtual: pontoAtual('163983') })
    return { codigo: '163983', nome: 'CHURRASCARIA JACARE', endereco: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521', pontoAtual: null, local: base.locais.get('163983')!, paradas, cadastros: [] }
  }
  const op = { admin: false, temAnexo: false }
  it('parada repetida com a rua do CNEFE batendo: grava o centro das paradas', () => {
    const p = jacare()
    p.paradas[0] = { ...p.paradas[0], ruaConfere: true, ruaDistM: 40, territorio: 'ok' }
    const d = decidirCorrecao(p, { acao: 'parada', id: p.paradas[0].id }, op)
    expect(d).toMatchObject({ ok: true, lat: p.paradas[0].lat, lng: p.paradas[0].lng, confirmacoes: 3 })
  })
  it('parada sem a rua do CNEFE conferida (GASPERI: a rua não está no CNEFE de Itaguaí) é recusada', () => {
    const p = jacare()
    expect(decidirCorrecao(p, { acao: 'parada', id: p.paradas[0].id }, op)).toMatchObject({ ok: false, status: 422 })
    p.paradas[0] = { ...p.paradas[0], ruaConfere: false }
    expect(decidirCorrecao(p, { acao: 'parada', id: p.paradas[0].id }, op)).toMatchObject({ ok: false, status: 422 })
  })
  it('rodovia longa: a rua "bate" em qualquer lugar dela -- parada fora do município/bairro do endereço é recusada (AMERICAN GRILL, Dutra a 60 km de Barra Mansa)', () => {
    const p = jacare()
    const longe = { id: 'parada:-22.58305,-43.97197', lat: -22.583053, lng: -43.971974, dias: ['2026-10-07', '2026-10-16'], paradas: 2, minutosMediana: 8, distPontoAtualM: 60_000, ruaConfere: true, ruaDistM: 111 }
    p.paradas = [{ ...longe, territorio: 'municipio_divergente' }]
    expect(decidirCorrecao(p, { acao: 'parada', id: longe.id }, op)).toMatchObject({ ok: false, status: 422 })
    p.paradas = [{ ...longe, territorio: null }]
    expect(decidirCorrecao(p, { acao: 'parada', id: longe.id }, op)).toMatchObject({ ok: false, status: 422 })
  })
  it('id que não é evidência do servidor (coordenada inventada pela tela) é recusado', () => {
    expect(decidirCorrecao(jacare(), { acao: 'parada', id: 'parada:-21.00000,-42.00000', lat: -21, lng: -42 }, op)).toMatchObject({ ok: false, status: 404 })
  })
  it('JACARÉ: confirma o ponto aprendido (5 confirmações); TIA ZANINHA (1 confirmação) não', () => {
    expect(decidirCorrecao(jacare(), { acao: 'aprendido' }, op)).toMatchObject({ ok: true, lat: -21.638572, lng: -42.099901, confirmacoes: 5 })
    const tia = { ...jacare(), local: base.locais.get('139241')! }
    expect(decidirCorrecao(tia, { acao: 'aprendido' }, op)).toMatchObject({ ok: false, status: 422 })
  })
  it('cadastro Unitrac: sem parada que confirme ou genérico é recusado; confirmado grava', () => {
    const cad: CandidatoCadastro = { id: 'cadastro:x', lat: -22.242005, lng: -42.644545, dias: ['2026-10-13'], diasConfirmados: [], distParadaM: null, generico: false, distPontoAtualM: 1800 }
    const p = { ...jacare(), cadastros: [cad] }
    expect(decidirCorrecao(p, { acao: 'cadastro_unitrac', id: 'cadastro:x' }, op)).toMatchObject({ ok: false, status: 422 })
    p.cadastros = [{ ...cad, generico: true, diasConfirmados: ['2026-10-13'], distParadaM: 80 }]
    expect(decidirCorrecao(p, { acao: 'cadastro_unitrac', id: 'cadastro:x' }, op)).toMatchObject({ ok: false, status: 422 })
    p.cadastros = [{ ...cad, diasConfirmados: ['2026-10-13'], distParadaM: 80 }]
    // Sem a conferência de território (ponte fora) não grava.
    expect(decidirCorrecao(p, { acao: 'cadastro_unitrac', id: 'cadastro:x' }, op)).toMatchObject({ ok: false, status: 422 })
    p.cadastros = [{ ...cad, diasConfirmados: ['2026-10-13'], distParadaM: 80, territorio: 'bairro_divergente' }]
    expect(decidirCorrecao(p, { acao: 'cadastro_unitrac', id: 'cadastro:x' }, op)).toMatchObject({ ok: false, status: 422 })
    p.cadastros = [{ ...cad, diasConfirmados: ['2026-10-13'], distParadaM: 80, territorio: 'ok' }]
    expect(decidirCorrecao(p, { acao: 'cadastro_unitrac', id: 'cadastro:x' }, op)).toMatchObject({ ok: true, lat: -22.242005, lng: -42.644545, confirmacoes: 1 })
  })
  it('arrastar o pino: só admin, só com evidência anexada e explicação', () => {
    const pino = { acao: 'pino' as const, lat: -22.8882, lng: -43.8241, observacao: 'print do cadastro da Nutry' }
    expect(decidirCorrecao(jacare(), pino, { admin: false, temAnexo: true })).toMatchObject({ ok: false, status: 403 })
    expect(decidirCorrecao(jacare(), pino, { admin: true, temAnexo: false })).toMatchObject({ ok: false, status: 400 })
    expect(decidirCorrecao(jacare(), { ...pino, observacao: ' ' }, { admin: true, temAnexo: true })).toMatchObject({ ok: false, status: 400 })
    expect(decidirCorrecao(jacare(), pino, { admin: true, temAnexo: true })).toMatchObject({ ok: true, lat: -22.8882, lng: -43.8241 })
    expect(decidirCorrecao(jacare(), { ...pino, lat: -43.8241, lng: -22.8882 }, { admin: true, temAnexo: true })).toMatchObject({ ok: false, status: 422 })
  })
  it('fonte protegida: correção manual anterior só o admin troca', () => {
    const p = { ...jacare(), local: { ...base.locais.get('163983')!, fonte: 'manual' as const } }
    expect(decidirCorrecao(p, { acao: 'aprendido' }, op)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('auxiliares', () => {
  it('rua do endereço do romaneio', () => {
    expect(ruaDoEndereco('ESTRADA PREFEITO WILSON PEDRO FRANCISCO, 560 - ILHA DA MADEIRA, ITAGUAI - QUADRA 46 LOTE 56 - 23826640')).toBe('ESTRADA PREFEITO WILSON PEDRO FRANCISCO')
    expect(ruaDoEndereco('RODOVIA RJ 122 - KM 35')).toBe('RODOVIA RJ 122')
  })
  it('caixa do RJ e caminho da evidência no bucket da fila Conferir', () => {
    expect(coordenadaNoRj(-22.9, -43.2)).toBe(true)
    expect(coordenadaNoRj(-23.6, -46.6)).toBe(false)
    expect(caminhoEvidenciaPonto('nutrimax', '6044', 'jpg', 1, 'ab')).toBe('comprovantes/nutrimax/ponto-cliente/6044-1-ab.jpg')
  })
})
