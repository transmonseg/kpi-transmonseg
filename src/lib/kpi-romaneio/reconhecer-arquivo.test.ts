// @vitest-environment node
// (pdf.js do pdf-parse acha que happy-dom é navegador e pede worker)
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { classificarTexto, contarPortoFrio, reconhecerArquivo, cabeNoAoVivo } from './reconhecer-arquivo'
import { CABECALHO_55, LINHAS_55 } from '@/lib/kpi-rioquality/entregas-55col.fixture'

// F3-06 (ING-10): trechos reais (pdf-parse) dos 4 documentos da auditoria de
// 23/10 -- o começo de cada um, onde está a assinatura.
const TEXTO_8012 = '\n\n8012 - Romaneio de Entrega\n23/10/2026 06:51\nPLACA/MOTORISTA:TOS1H26 / MAICON VINICIUS DOS SANTOS BARBOSACARGA/DESTINO:100710 / ITAPERUNA\nAJUDANTE(S):,\n2438872 / 135944 - MERCADO DO LIZEU\nTR ANTONINO ALVES, 16 - PRES. COSTA E SILVA, ITAPERUNA - LOJA - 28300000\nNF / CLIENTE:\n'
const TEXTO_8081 = '\n\n8081 - Escala de Rota\n23/10/2026 03:38Page 1 of 3\nCAMPOS CROSS\nCARGAVEICULODESTINOPESOENTNFMOTORISTAAJUDANTE 1DUPLICADOAJUDANTE 2\n10071683 - RQV9E37CAMPOS1.4142828HUGO LEONARDO MARQUES PIRES(CAMPOS)\n'
const TEXTO_JAC = '\n\nDATA23/10/2026\nROMANEIO1MOTORISTAAJUDANTE\nCARRO36RBI-1J86\nLuis Paulo-\nORDEMNOTA FISCALCLIENTEENDEREÇOBAIRROQTD CAIXASPESO BRUTO PESO LÍQUIDOVALOR BRUTO\n5\n217492HORTIFRUTI HUMAITA   RUA DO HUMAITA,150   HUMAITA   751,149922,78R$\n'
const TEXTO_PORTOFRIO = '\n\nRotaPlacaRomaneioRazão socialEndereçoNúmeroCEPBairroCidadeUFRemetente\nOrdem de\natendimento\n42121TAM6J7442121GPANIC PUB E GASTROBAR LTDARUA FELICIO RICIO1928470000TAVARES\nSANTO ANTONIO DE\nPADUA\nRJ-1\n42121TAM6J7442121ADILSON PINTO NUNES MEPRACA TOLEDO PIZA3628570000CENTROITAOCARARJ-2\n42122RKT3A9342122MERCADO X LTDARUA Y1028470000CENTROPADUARJ-1\n'

describe('classificarTexto (F3-06): detector por assinatura', () => {
  it('8012 - Romaneio de Entrega', () => expect(classificarTexto(TEXTO_8012)).toBe('romaneio_entrega'))
  it('8081 - Escala de Rota', () => expect(classificarTexto(TEXTO_8081)).toBe('escala_rota'))
  it('PROGRAMAÇÃO JAC (cabeçalho DATA/ROMANEIO/CARRO) = Romaneio do Pão', () => expect(classificarTexto(TEXTO_JAC)).toBe('pao_jac'))
  it('cabeçalho Porto Frio ("Escala de rotas 21-10.pdf")', () => expect(classificarTexto(TEXTO_PORTOFRIO)).toBe('escala_portofrio'))
  it('texto qualquer: desconhecido', () => {
    expect(classificarTexto('Boleto bancário\nVencimento 30/10/2026')).toBe('desconhecido')
    expect(classificarTexto('')).toBe('desconhecido')
  })
})

describe('contarPortoFrio', () => {
  it('entregas, rotas e placas pela linha Rota+Placa+Romaneio', () => {
    expect(contarPortoFrio(TEXTO_PORTOFRIO)).toEqual({ entregas: 3, rotas: 2, placas: 2 })
  })
})

describe('reconhecerArquivo: xlsx da Rio Quality (55 colunas)', () => {
  const xlsx = (cab: (string | null)[], linhas: (string | number | null)[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), 'Relatório')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
  it('cabeçalho real de 55 colunas: Relatório de Entregas da RQ, com notas e romaneios', async () => {
    const r = await reconhecerArquivo(xlsx(CABECALHO_55, LINHAS_55), 'Relatório de Entregas (14).xlsx')
    expect(r).toMatchObject({ tipo: 'rq_entregas', cliente: 'rioquality', campo: 'completo', contagens: { notas: 4, romaneios: 3, colunas: 55 } })
    expect(r.resumo).toBe('Relatório de Entregas da Rio Quality (55 colunas) — 4 notas, 3 romaneios')
    expect(cabeNoAoVivo(r, 'rioquality')).toBe(true)
    expect(cabeNoAoVivo(r, 'nutrimax')).toBe(false)
  })
  it('planilha de outra coisa: desconhecido', async () => {
    const r = await reconhecerArquivo(xlsx(['Nome', 'Telefone'], [['A', '1']]), 'contatos.xlsx')
    expect(r).toMatchObject({ tipo: 'desconhecido', cliente: null, campo: null })
  })
  it('arquivo que não é PDF nem planilha: desconhecido, sem lançar', async () => {
    const r = await reconhecerArquivo(Buffer.from('oi'), 'foto.jpg')
    expect(r.tipo).toBe('desconhecido')
    expect(r.resumo).toBe('Não reconheci este arquivo')
  })
})

// ING-10 "Como validar": soltar os 4 PDFs reais da auditoria e conferir tipo e
// contagens (2.327/76, 77, 64/10, 273/14). Os PDFs não vão para o repositório
// (dados de clientes, CPF na Porto Frio): o teste roda onde eles estão.
const PASTA = process.env.KPI_PDFS_AUDITORIA_2310 ?? '/private/tmp/claude-501/-Users-joaquimsalles/7b1ba367-b266-4c73-832b-3166fc58b73b/scratchpad'
const PDFS = {
  escala: `${PASTA}/erica2310/17-AC65E7F500B947F76AD5EC282C39EC63.pdf`,
  romaneio: `${PASTA}/erica2310/18-AC192855509980DDDF7758557177E161.pdf`,
  jac: `${PASTA}/erica2310/19-AC86807D1918C8E8A98863796CBA8BD5.pdf`,
  portofrio: `${PASTA}/portofrio/portofrio.pdf`,
}
describe.skipIf(!Object.values(PDFS).every(existsSync))('os 4 PDFs reais da auditoria de 23/10 (F3-06)', { timeout: 60_000 }, () => {
  it('8012 de 23/10: 2.327 notas, 76 cargas', async () => {
    const r = await reconhecerArquivo(readFileSync(PDFS.romaneio), '8012.pdf')
    expect(r).toMatchObject({ tipo: 'romaneio_entrega', cliente: 'nutrimax', campo: 'romaneio', data: '2026-10-23', contagens: { notas: 2327, cargas: 76 } })
    expect(r.resumo).toBe('Romaneio de Entrega da Nutry de 23/10 — 2.327 notas, 76 cargas')
  })
  it('8081 de 23/10: 77 cargas', async () => {
    const r = await reconhecerArquivo(readFileSync(PDFS.escala), '8081.pdf')
    expect(r).toMatchObject({ tipo: 'escala_rota', cliente: 'nutrimax', campo: 'escala', data: '2026-10-23', contagens: { cargas: 77 } })
    expect(r.resumo).toBe('Escala de Rota da Nutry de 23/10 — 77 cargas')
  })
  it('PROGRAMAÇÃO JAC de 23/10: 64 notas, 10 carros, com o nome "Romaneio do Pão (Programação JAC)"', async () => {
    const r = await reconhecerArquivo(readFileSync(PDFS.jac), 'PROGRAMAÇÃO JAC (CONGELADO).pdf')
    expect(r).toMatchObject({ tipo: 'pao_jac', cliente: 'nutrimax', campo: 'romaneioPao', data: '2026-10-23', contagens: { notas: 64, carros: 10 } })
    expect(r.resumo).toBe('Romaneio do Pão (Programação JAC) de 23/10 — 64 notas, 10 carros')
  })
  it('Escala de rotas da Porto Frio (21/10): 273 entregas, 14 rotas -- reconhecida, mas não entra no Ao vivo', async () => {
    const r = await reconhecerArquivo(readFileSync(PDFS.portofrio), 'Escala de rotas 21-10.pdf')
    expect(r).toMatchObject({ tipo: 'escala_portofrio', cliente: 'portofrio', campo: null, contagens: { entregas: 273, rotas: 14, placas: 13 } })
    expect(r.resumo).toBe('Escala de rotas da Porto Frio — 273 entregas, 14 rotas')
    expect(cabeNoAoVivo(r, 'nutrimax')).toBe(false)
  })
})
