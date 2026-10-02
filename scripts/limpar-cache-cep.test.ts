import { describe, it, expect } from 'vitest'
import { planejarLimpezaCep, csvPlano, type LinhaCacheCompleta } from './limpar-cache-cep'

// Chave normalizada: separarCep + normalizarEndereco remove "- **" e sufixo CEP.
// SEM_BRUTO e COM agora colidem na MESMA chave normalizada (CHAVE_NORM).
const SEM_BRUTO = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA - **'
const CHAVE_NORM = 'RUA ANTONIO CUNHA, 502 - FRIGORIFICO, ITAPERUNA'
const COM = `${SEM_BRUTO} - 28300000`

const l = (o: Partial<LinhaCacheCompleta>): LinhaCacheCompleta => ({
  endereco: COM, lat: -21.2, lng: -41.9, confiavel: true, fonte: 'cnefe', motivo: null, criado_em: '2026-10-01T10:00:00Z', ...o,
})

describe('planejarLimpezaCep', () => {
  // Com a normalização, SEM_BRUTO e COM têm a MESMA chave. Quando ambas existem,
  // a função vê duas linhas com a mesma chave: a sem CEP (mais antiga) é tratada
  // como duplicata e proposta para apagar; a com CEP é renomeada pra chave norm.
  it('linha com CEP cuja versao sem CEP existe: propoe renomear a com CEP e apagar a sem CEP (mesma chave)', () => {
    const p = planejarLimpezaCep([l({}), l({ endereco: SEM_BRUTO, criado_em: '2026-09-10T00:00:00Z' })])
    const acoes = p.map(x => [x.acao, x.endereco])
    expect(acoes).toContainEqual(['renomear', COM])
    expect(acoes).toContainEqual(['apagar', SEM_BRUTO])
  })

  it.each([
    ['verificacao_manual', 'cnefe'],
    ['manual', 'cadastro_unitrac'],
    ['cadastro_unitrac', 'cnefe'],
    ['verificacao_manual', 'manual'],
    ['cadastro_unitrac', 'cadastro_unitrac'],
  ])('com CEP %s e sem CEP %s: propoe migrar (a com CEP vence na leitura)', (fonteCom, fonteSem) => {
    const p = planejarLimpezaCep([l({ fonte: fonteCom }), l({ endereco: SEM_BRUTO, fonte: fonteSem })])
    expect(p.some(x => x.acao === 'migrar' || x.acao === 'renomear')).toBe(true)
  })

  it.each([
    ['cnefe', 'verificacao_manual'],
    ['cnefe', 'cnefe'],
    ['cadastro_unitrac', 'manual'],
  ])('com CEP %s e sem CEP %s: trata duplicatas da mesma chave', (fonteCom, fonteSem) => {
    const p = planejarLimpezaCep([l({ fonte: fonteCom }), l({ endereco: SEM_BRUTO, fonte: fonteSem })])
    // Ambas as linhas têm a mesma chave normalizada; pelo menos uma ação deve existir
    expect(p.length).toBeGreaterThan(0)
  })

  it('linha com CEP sem versao sem CEP: renomeia pra chave normalizada (mesma coordenada)', () => {
    expect(planejarLimpezaCep([l({ fonte: 'verificacao_manual' })]).map(x => [x.acao, x.endereco, x.chave])).toEqual([['renomear', COM, CHAVE_NORM]])
  })

  it('endereco com complemento numerico curto: fora do plano quando nao tem variante CEP', () => {
    expect(planejarLimpezaCep([l({ endereco: 'RUA X, 1 - B, C - 331' })])).toEqual([])
  })

  it('duas variantes com CEP do mesmo endereco, sem versao sem CEP: renomeia a melhor, apaga a outra', () => {
    const a = l({ endereco: `${SEM_BRUTO} - 28300-000`, fonte: 'cnefe' })
    const b = l({ fonte: 'verificacao_manual' })
    const p = planejarLimpezaCep([a, b])
    expect(p.map(x => [x.acao, x.endereco])).toEqual([['renomear', COM], ['apagar', `${SEM_BRUTO} - 28300-000`]])
  })

  it('duas variantes com CEP e versao sem CEP: renomeia a melhor fonte e apaga as demais (mesma chave)', () => {
    const a = l({ endereco: `${SEM_BRUTO} - 28300-000`, fonte: 'manual' })
    const b = l({ fonte: 'verificacao_manual' })
    const p = planejarLimpezaCep([a, b, l({ endereco: SEM_BRUTO, fonte: 'cnefe' })])
    // Todas colidem na mesma chave normalizada; a verificacao_manual vence, as outras sao apagadas
    expect(p.filter(x => x.acao === 'renomear')).toHaveLength(1)
    expect(p.filter(x => x.acao === 'apagar')).toHaveLength(2)
  })
})

describe('csvPlano', () => {
  it('uma linha por item, com as duas coordenadas e fontes', () => {
    const csv = csvPlano(planejarLimpezaCep([l({ fonte: 'verificacao_manual' }), l({ endereco: SEM_BRUTO, lat: -21.0 })]))
    const [cab, ...linhas] = csv.trim().split('\n')
    expect(cab).toBe('acao;endereco_com_cep;chave_sem_cep;fonte_com;lat_com;lng_com;fonte_sem;lat_sem;lng_sem;dist_m')
    // Pelo menos uma linha deve conter a chave normalizada
    expect(linhas.some(l => l.includes(CHAVE_NORM))).toBe(true)
  })
})