import { describe, it, expect, beforeEach } from 'vitest'
import { aplicarCorrecaoPonto, desfazerCorrecaoPonto, TrilhaIndisponivel, type RepoPonto, type LinhaLocal, type CorrecaoPonto } from './ponto-cliente-correcao'
import type { PainelPonto } from './ponto-cliente'

// F4-07 (GEO-24, D-08): a correção grava kpi_cliente_local com fonte manual,
// responsável e trilha (estado anterior guardado); "Desfazer" volta exatamente
// ao estado anterior. Caso real: CHURRASCARIA JACARÉ (163983), ponto aprendido
// por 5 entregas confirmadas, parada repetida da RBI0J25 em 07, 15 e 22/10.
const JACARE_LOCAL: LinhaLocal = {
  empresa: 'nutrimax', cliente_codigo: '163983', cliente_nome: 'CHURRASCARIA JACARE', lat: -21.638572, lng: -42.099901, raio_m: null,
  fonte: 'entrega_confirmada', confirmacoes: 5, endereco_ref: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521',
  observacao: null, atualizado_em: '2026-10-06T05:45:03.439Z',
}
const painel = (): PainelPonto => ({
  codigo: '163983', nome: 'CHURRASCARIA JACARE', endereco: 'RODOVIA PRESIDENTE JOAO GOULART, S/N - APERIBÉ, APERIBE - ANEXO - 28495521',
  pontoAtual: { lat: -22.3736899, lng: -42.5470193, data: '2026-10-23' },
  local: { chave: '163983', lat: -21.638572, lng: -42.099901, raioM: null, fonte: 'entrega_confirmada', confirmacoes: 5, enderecoRef: JACARE_LOCAL.endereco_ref },
  paradas: [{ id: 'parada:-21.63810,-42.09926', lat: -21.638098, lng: -42.099263, dias: ['2026-10-07', '2026-10-15', '2026-10-22'], paradas: 3, minutosMediana: 7, distPontoAtualM: 93920, ruaConfere: true, ruaDistM: 35, territorio: 'ok' }],
  cadastros: [],
})

function repoMemoria(inicial: LinhaLocal | null, opcoes: { semTrilha?: boolean; falhaGravar?: boolean } = {}) {
  const locais = new Map<string, LinhaLocal>(inicial ? [[inicial.cliente_codigo, { ...inicial }]] : [])
  const trilha: CorrecaoPonto[] = []
  const repo: RepoPonto = {
    async lerLocal(codigo) { const l = locais.get(codigo); return l ? { ...l } : null },
    async gravarLocal(l) { if (opcoes.falhaGravar) throw new Error('falhou'); locais.set(l.cliente_codigo, { ...l }) },
    async apagarLocal(codigo) { locais.delete(codigo) },
    async inserirCorrecao(c) {
      if (opcoes.semTrilha) throw new TrilhaIndisponivel()
      const linha = { ...c, id: trilha.length + 1, criado_em: '2026-10-24T20:00:00Z', desfeita_em: null, desfeita_por: null }
      trilha.push(linha)
      return { ...linha }
    },
    async lerCorrecao(id) { const t = trilha.find(x => x.id === id); return t ? { ...t } : null },
    async marcarDesfeita(id, por) { const t = trilha.find(x => x.id === id)!; t.desfeita_em = '2026-10-24T21:00:00Z'; t.desfeita_por = por },
  }
  return { repo, locais, trilha }
}

const ERICA = { email: 'erica@transmonseg.com.br', admin: false }

describe('aplicarCorrecaoPonto', () => {
  let m: ReturnType<typeof repoMemoria>
  beforeEach(() => { m = repoMemoria(JACARE_LOCAL) })

  it('parada repetida: grava fonte manual com o endereço, a trilha guarda o estado anterior e o responsável', async () => {
    const r = await aplicarCorrecaoPonto(m.repo, painel(), { acao: 'parada', id: 'parada:-21.63810,-42.09926', observacao: 'parada de toda semana' }, { ...ERICA, documento: null }, '2026-10-24T20:00:00Z')
    expect(r.ok).toBe(true)
    expect(m.locais.get('163983')).toMatchObject({
      fonte: 'manual', lat: -21.638098, lng: -42.099263, confirmacoes: 3, endereco_ref: JACARE_LOCAL.endereco_ref, cliente_nome: 'CHURRASCARIA JACARE',
    })
    expect(m.locais.get('163983')!.observacao).toContain('erica@transmonseg.com.br')
    expect(m.trilha).toHaveLength(1)
    expect(m.trilha[0]).toMatchObject({ empresa: 'nutrimax', cliente_codigo: '163983', acao: 'parada', responsavel: 'erica@transmonseg.com.br', anterior: JACARE_LOCAL, lat: -21.638098, lng: -42.099263 })
    expect(m.trilha[0].evidencia).toMatchObject({ tipo: 'parada', dias: ['2026-10-07', '2026-10-15', '2026-10-22'] })
  })

  it('sem evidência (id que o servidor não achou) não grava nada', async () => {
    const r = await aplicarCorrecaoPonto(m.repo, painel(), { acao: 'parada', id: 'parada:-22.00000,-43.00000' }, { ...ERICA, documento: null })
    expect(r).toMatchObject({ ok: false, status: 404 })
    expect(m.locais.get('163983')).toEqual(JACARE_LOCAL)
    expect(m.trilha).toHaveLength(0)
  })

  it('sem a tabela da trilha (migration não aplicada) não grava o ponto', async () => {
    const s = repoMemoria(JACARE_LOCAL, { semTrilha: true })
    await expect(aplicarCorrecaoPonto(s.repo, painel(), { acao: 'aprendido' }, { ...ERICA, documento: null })).rejects.toBeInstanceOf(TrilhaIndisponivel)
    expect(s.locais.get('163983')).toEqual(JACARE_LOCAL)
  })

  it('falha ao gravar o ponto marca a trilha como desfeita pelo sistema', async () => {
    const s = repoMemoria(JACARE_LOCAL, { falhaGravar: true })
    await expect(aplicarCorrecaoPonto(s.repo, painel(), { acao: 'aprendido' }, { ...ERICA, documento: null })).rejects.toThrow()
    expect(s.trilha[0].desfeita_por).toMatch(/^sistema/)
  })
})

describe('desfazerCorrecaoPonto', () => {
  it('volta exatamente ao ponto aprendido anterior', async () => {
    const m = repoMemoria(JACARE_LOCAL)
    const r = await aplicarCorrecaoPonto(m.repo, painel(), { acao: 'parada', id: 'parada:-21.63810,-42.09926' }, { ...ERICA, documento: null })
    if (!r.ok) throw new Error('devia gravar')
    const d = await desfazerCorrecaoPonto(m.repo, '163983', r.correcao.id, ERICA)
    expect(d).toMatchObject({ ok: true })
    expect(m.locais.get('163983')).toEqual(JACARE_LOCAL)
    expect(m.trilha[0]).toMatchObject({ desfeita_por: 'erica@transmonseg.com.br' })
  })
  it('cliente que não tinha ponto: desfazer apaga a linha criada', async () => {
    const m = repoMemoria(null)
    const p = { ...painel(), local: null }
    const r = await aplicarCorrecaoPonto(m.repo, p, { acao: 'parada', id: 'parada:-21.63810,-42.09926' }, { ...ERICA, documento: null })
    if (!r.ok) throw new Error('devia gravar')
    expect(m.locais.has('163983')).toBe(true)
    await desfazerCorrecaoPonto(m.repo, '163983', r.correcao.id, ERICA)
    expect(m.locais.has('163983')).toBe(false)
  })
  it('desfazer duas vezes, de outro cliente, ou com o ponto mudado depois: recusa sem mexer', async () => {
    const m = repoMemoria(JACARE_LOCAL)
    const r = await aplicarCorrecaoPonto(m.repo, painel(), { acao: 'parada', id: 'parada:-21.63810,-42.09926' }, { ...ERICA, documento: null })
    if (!r.ok) throw new Error('devia gravar')
    expect(await desfazerCorrecaoPonto(m.repo, '999', r.correcao.id, ERICA)).toMatchObject({ ok: false, status: 404 })
    m.locais.set('163983', { ...m.locais.get('163983')!, lat: -21.7 })
    expect(await desfazerCorrecaoPonto(m.repo, '163983', r.correcao.id, ERICA)).toMatchObject({ ok: false, status: 409 })
    m.locais.set('163983', { ...m.locais.get('163983')!, lat: -21.638098 })
    expect(await desfazerCorrecaoPonto(m.repo, '163983', r.correcao.id, ERICA)).toMatchObject({ ok: true })
    expect(await desfazerCorrecaoPonto(m.repo, '163983', r.correcao.id, ERICA)).toMatchObject({ ok: false, status: 409 })
    expect(await desfazerCorrecaoPonto(m.repo, '163983', 999, ERICA)).toMatchObject({ ok: false, status: 404 })
  })
})
