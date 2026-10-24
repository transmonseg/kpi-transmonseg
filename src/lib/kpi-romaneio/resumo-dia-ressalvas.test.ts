import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { nfsDe2210 } from './ao-vivo.fixture-2026-10-22'
import { resumirPlacas, contarCorretas } from './ao-vivo'
import type { ResultadoAoVivo } from './ao-vivo-servico'
import { montarResumoDia, textoResumoDia, secoesResumoDia, ressalvasDoCalculo } from './resumo-dia'
import { gerarPdfResumoDia } from './resumo-dia-pdf'

// F3-R03: o Resumo do dia não pode sair "limpo" de um cálculo incompleto. O
// F3-01 recusa publicar no Dashboard cálculo degradado, com fonte que não leu
// ou que não é o fechamento; o texto copiado e o PDF circulam -- levam a ressalva.

function base(extra: Partial<ResultadoAoVivo> = {}): ResultadoAoVivo {
  const { nfs, cargas } = nfsDe2210()
  const placas = resumirPlacas('2026-10-22', nfs, cargas, new Map())
  return {
    calculadoEm: '2026-10-23T03:30:24.421Z',
    resumo: { taxa: 96.9, entregues: 2183, nfsNaConta: 2253, aguardando: 0, totalNfs: 2272, feitas: contarCorretas(placas), pct: 96 },
    placas, ...extra,
  }
}
const DEGRADADO = 'ponte de coerência do monitoramento falhou em 37 rua(s)'
const AVISO_DEGRADADO = `Cálculo incompleto: ${DEGRADADO}. Entregas confirmadas pela rua podem estar faltando; o próximo cálculo tenta de novo.`
const AVISO_FONTE = 'Não consegui ler as resoluções da operação neste cálculo — o resultado pode estar incompleto. O próximo cálculo tenta de novo.'
const AVISO_TERRITORIO = 'Conferência de endereço indisponível: o monitoramento não respondeu à conferência de território; entregas em outro bairro/município podem estar sem "CORRIGIR CADASTRO" (a taxa não muda). O dia fechado é refeito às 05:30.'

describe('ressalvasDoCalculo', () => {
  it('degradado (RQ 22/10 sem anterior bom) vira ressalva, uma vez só', () => {
    expect(ressalvasDoCalculo(base({ degradado: DEGRADADO, avisos: [AVISO_DEGRADADO] }))).toEqual([AVISO_DEGRADADO])
  })
  it('fonte que não leu (avisosFonte da Nutry) vira ressalva', () => {
    expect(ressalvasDoCalculo(base({ avisos: [AVISO_FONTE] }))).toEqual([AVISO_FONTE])
  })
  it('aviso que não muda a taxa (território) não vira ressalva', () => {
    expect(ressalvasDoCalculo(base({ avisos: [AVISO_TERRITORIO] }))).toEqual([])
  })
  it('degradado sem o aviso gravado também vira ressalva', () => {
    expect(ressalvasDoCalculo(base({ degradado: DEGRADADO }))[0]).toContain(DEGRADADO)
  })
  it('cálculo completo: nenhuma', () => {
    expect(ressalvasDoCalculo(base())).toEqual([])
  })
})

describe('Resumo com ressalva (texto e PDF)', () => {
  const r = montarResumoDia({ cliente: 'rioquality', data: '2026-10-22', meta: 93, anteriores: [], resultado: base({ degradado: DEGRADADO, avisos: [AVISO_DEGRADADO] }) })
  it('marca o resumo como incompleto', () => {
    expect(r.ressalvas).toEqual([AVISO_DEGRADADO])
  })
  it('"Copiar texto": cabeçalho com "incompleto, não oficial" e a ressalva antes do resultado', () => {
    const t = textoResumoDia(r, 'Rio Quality')
    expect(t.split('\n')[0]).toBe('Resumo do dia — Rio Quality — 22/10/2026 (cálculo incompleto, não oficial)')
    expect(t.indexOf(AVISO_DEGRADADO)).toBeGreaterThan(0)
    expect(t.indexOf(AVISO_DEGRADADO)).toBeLessThan(t.indexOf('no KPI'))
  })
  it('a seção Atenção vem primeiro', () => {
    expect(secoesResumoDia(r)[0]).toEqual({ titulo: 'Atenção', linhas: [AVISO_DEGRADADO] })
  })
  it('ressalva extra (não é o fechamento) entra igual', () => {
    const x = montarResumoDia({ cliente: 'nutrimax', data: '2026-10-22', meta: 97, anteriores: [], resultado: base(), ressalvasExtras: ['Não é o fechamento do dia.'] })
    expect(x.ressalvas).toEqual(['Não é o fechamento do dia.'])
    expect(textoResumoDia(x, 'Nutry Max').split('\n')[0]).toContain('(cálculo incompleto, não oficial)')
  })
  it('PDF leva o mesmo cabeçalho (assunto do arquivo)', async () => {
    const doc = await PDFDocument.load(await gerarPdfResumoDia(r, 'Rio Quality'))
    expect(doc.getSubject()).toBe('Resumo do dia - Rio Quality - 22/10/2026 (cálculo incompleto, não oficial)')
  })
  it('resumo completo continua sem ressalva', () => {
    const x = montarResumoDia({ cliente: 'nutrimax', data: '2026-10-22', meta: 97, anteriores: [], resultado: base() })
    expect(x.ressalvas).toEqual([])
    expect(textoResumoDia(x, 'Nutry Max').split('\n')[0]).toBe('Resumo do dia — Nutry Max — 22/10/2026')
    expect(secoesResumoDia(x)[0].titulo).toBe('Resultado')
  })
})
