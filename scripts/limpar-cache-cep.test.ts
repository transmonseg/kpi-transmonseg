import { describe, it, expect } from 'vitest'
import { planejarLimpezaCep, csvPlano, type LinhaCacheCompleta } from './limpar-cache-cep'

const SEM = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - **'
const COM = `${SEM} - 28300000`

const l = (o: Partial<LinhaCacheCompleta>): LinhaCacheCompleta => ({
  endereco: COM, lat: -21.2, lng: -41.9, confiavel: true, fonte: 'cnefe', motivo: null, criado_em: '2026-10-01T10:00:00Z', ...o,
})

describe('planejarLimpezaCep', () => {
  it('linha com CEP cuja versao sem CEP existe: propoe apagar a com CEP', () => {
    const p = planejarLimpezaCep([l({}), l({ endereco: SEM, criado_em: '2026-09-10T00:00:00Z' })])
    expect(p).toEqual([{ acao: 'apagar', endereco: COM, chave: SEM, com: l({}), sem: l({ endereco: SEM, criado_em: '2026-09-10T00:00:00Z' }) }])
  })

  it.each([
    ['verificacao_manual', 'cnefe'],
    ['manual', 'cadastro_unitrac'],
    ['cadastro_unitrac', 'cnefe'],
  ])('com CEP %s e sem CEP %s: propoe migrar (a com CEP vence na leitura)', (fonteCom, fonteSem) => {
    const p = planejarLimpezaCep([l({ fonte: fonteCom }), l({ endereco: SEM, fonte: fonteSem })])
    expect(p.map(x => x.acao)).toEqual(['migrar'])
  })

  it.each([
    ['verificacao_manual', 'manual'],
    ['cnefe', 'verificacao_manual'],
    ['cadastro_unitrac', 'cadastro_unitrac'],
  ])('com CEP %s e sem CEP %s: apaga (a sem CEP ja vence)', (fonteCom, fonteSem) => {
    expect(planejarLimpezaCep([l({ fonte: fonteCom }), l({ endereco: SEM, fonte: fonteSem })]).map(x => x.acao)).toEqual(['apagar'])
  })

  it('linha com CEP sem versao sem CEP: renomeia pra chave sem CEP (mesma coordenada)', () => {
    expect(planejarLimpezaCep([l({ fonte: 'verificacao_manual' })]).map(x => [x.acao, x.endereco, x.chave])).toEqual([['renomear', COM, SEM]])
  })

  it('linha sem CEP sozinha ou endereco com complemento numerico curto: fora do plano', () => {
    expect(planejarLimpezaCep([l({ endereco: SEM }), l({ endereco: 'RUA X, 1 - B, C - 331' })])).toEqual([])
  })

  it('duas variantes com CEP do mesmo endereco, sem versao sem CEP: renomeia a melhor, apaga a outra', () => {
    const a = l({ endereco: `${SEM} - 28300-000`, fonte: 'cnefe' })
    const b = l({ fonte: 'verificacao_manual' })
    const p = planejarLimpezaCep([a, b])
    expect(p.map(x => [x.acao, x.endereco])).toEqual([['renomear', COM], ['apagar', `${SEM} - 28300-000`]])
  })

  it('duas variantes com CEP e versao sem CEP: no maximo uma migra', () => {
    const a = l({ endereco: `${SEM} - 28300-000`, fonte: 'manual' })
    const b = l({ fonte: 'verificacao_manual' })
    const p = planejarLimpezaCep([a, b, l({ endereco: SEM, fonte: 'cnefe' })])
    expect(p.filter(x => x.acao === 'migrar')).toHaveLength(1)
    expect(p.filter(x => x.acao === 'apagar')).toHaveLength(1)
  })
})

describe('csvPlano', () => {
  it('uma linha por item, com as duas coordenadas e fontes', () => {
    const csv = csvPlano(planejarLimpezaCep([l({ fonte: 'verificacao_manual' }), l({ endereco: SEM, lat: -21.0 })]))
    const [cab, linha] = csv.trim().split('\n')
    expect(cab).toBe('acao;endereco_com_cep;chave_sem_cep;fonte_com;lat_com;lng_com;fonte_sem;lat_sem;lng_sem;dist_m')
    expect(linha.startsWith(`migrar;${COM};${SEM};verificacao_manual;-21.2;-41.9;cnefe;-21;-41.9;`)).toBe(true)
  })
})
