import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseRomaneioPortefrio } from './parse-romaneio'
import { separarNumero } from './parse-programacao'

// PDF real que a operacao mandou no grupo KPI AJUSTES em 27/10 ("PROGRAMAÇÃO
// JAC (CONGELADO) 27-10.pdf"): formato novo da Porte Frio, blocos
// ROMANEIO/CARRO com ORDEM, NOTA FISCAL, CLIENTE, ENDEREÇO, BAIRRO...
const PDF_27_10 = readFileSync(join(__dirname, '__fixtures__', 'programacao-jac-2026-10-27.pdf'))

describe('parseRomaneioPortefrio -- formato novo (PROGRAMAÇÃO JAC)', () => {
  it('le todas as 59 NFs dos 10 carros', async () => {
    const linhas = await parseRomaneioPortefrio(PDF_27_10)
    expect(linhas).toHaveLength(59)
    expect(new Set(linhas.map(l => l.placa)).size).toBe(10)
    expect(linhas.every(l => /^\d{6,}$/.test(l.codigoCliente))).toBe(true)
    expect(new Set(linhas.map(l => l.codigoCliente)).size).toBe(59)
  })

  it('monta a linha com placa sem hifen, endereco/numero separados e cidade do Rio', async () => {
    const linhas = await parseRomaneioPortefrio(PDF_27_10)
    expect(linhas.find(l => l.codigoCliente === '217646')).toEqual({
      placa: 'RBI1J86',
      codigoCliente: '217646',
      cnpj: '',
      razaoSocial: 'HORTIFRUTI HUMAITA',
      nomeInformal: '',
      endereco: 'RUA DO HUMAITA',
      numero: '150',
      cep: '',
      bairro: 'HUMAITA',
      cidade: 'RIO DE JANEIRO',
      uf: 'RJ',
      ordem: 5,
    })
  })

  it('carro sem motorista e endereco longo continuam inteiros', async () => {
    const linhas = await parseRomaneioPortefrio(PDF_27_10)
    const posto = linhas.find(l => l.codigoCliente === '217622')!
    expect(posto.placa).toBe('RQO5E38')
    expect(posto.ordem).toBe(10)
    expect(posto.endereco).toBe('ESTRADA DA BARRA DA TIJUCA, EM FRENTE AO 793,SN')
    expect(posto.bairro).toBe('BARRA DA TIJUCA')
  })

  it('bairro grudado no endereco (sem coluna BAIRRO) vai pro bairro', async () => {
    const linhas = await parseRomaneioPortefrio(PDF_27_10)
    const campeao = linhas.find(l => l.codigoCliente === '217627')!
    expect(campeao).toMatchObject({ endereco: 'AV AFONSO ARINOS DE MELO FRANCO', numero: '222', bairro: 'BARRA DA TIJUCA' })
  })

  it('complemento depois do numero fica no numero quando o bairro veio na coluna', async () => {
    const linhas = await parseRomaneioPortefrio(PDF_27_10)
    expect(linhas.find(l => l.codigoCliente === '217618')).toMatchObject({ numero: '1677 LOJA 13', bairro: 'CAMPO GRANDE' })
  })
})

describe('separarNumero', () => {
  it.each([
    ['RUA DO HUMAITA,150', { endereco: 'RUA DO HUMAITA', numero: '150', resto: '' }],
    ['RUA DA PASSAGEM ,133135', { endereco: 'RUA DA PASSAGEM', numero: '133135', resto: '' }],
    ['AV RODOLFO AMOEDO, 347', { endereco: 'AV RODOLFO AMOEDO', numero: '347', resto: '' }],
    ['AV AFONSO ARINOS DE MELO FRANCO,222 BARRA DA TIJUCA', { endereco: 'AV AFONSO ARINOS DE MELO FRANCO', numero: '222', resto: 'BARRA DA TIJUCA' }],
    ['RUA FONTE DA SAUDADE 241', { endereco: 'RUA FONTE DA SAUDADE 241', numero: '', resto: '' }],
    ['EST DE INHOAIBA,0, QUADRA 31 LOTE 32', { endereco: 'EST DE INHOAIBA,0, QUADRA 31 LOTE 32', numero: '', resto: '' }],
    ['ESTRADA DOS CABOCLOS, 1677 LOJA 13', { endereco: 'ESTRADA DOS CABOCLOS', numero: '1677', resto: 'LOJA 13' }],
  ])('%s', (entrada, esperado) => {
    expect(separarNumero(entrada)).toEqual(esperado)
  })
})
