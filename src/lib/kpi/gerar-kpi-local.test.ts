import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gerarKpiLocal, gerarKpiLocalComPreview, rotaToLinha, saidaBaseSeEmRota, saidaBaseConhecida } from './gerar-kpi-local'
import type { RotaKpi } from '@/lib/types/kpi'
import type { LinhaEscala } from '@/lib/types/escala'

describe('saidaBaseSeEmRota — caso KOP-4978 (relatório parcial)', () => {
  // BRT mascarado como UTC. Corte do relatório 16:11.
  const corte = Date.UTC(2026, 5, 9, 16, 11)
  const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 9, h, m))

  it('última parada BASE com saída ≥15min antes do corte → devolve a saída de base', () => {
    const paradas = [
      { classificacao: 'FORA_BASE', chegada: d(0, 5), saida: d(7, 11) },
      { classificacao: 'BASE', chegada: d(10, 21), saida: d(15, 4) }, // saiu 15:04, dirigindo no corte
    ]
    expect(saidaBaseSeEmRota(paradas, corte)).toEqual(d(15, 4))
  })
  it('caminhão ainda na base no corte (saída ~corte) → null', () => {
    const paradas = [{ classificacao: 'BASE', chegada: d(10, 0), saida: d(16, 8) }]
    expect(saidaBaseSeEmRota(paradas, corte)).toBeNull()
  })
  it('última parada NÃO é base (parou na rua) → null', () => {
    const paradas = [{ classificacao: 'FORA_BASE', chegada: d(14, 0), saida: d(14, 30) }]
    expect(saidaBaseSeEmRota(paradas, corte)).toBeNull()
  })
  it('BASE seguida de blip FAKE_EXIT e trecho FORA_BASE em rota → devolve a saída da base (dia 15)', () => {
    // Caso INW/FQN: saiu da base 15:04, GPS registrou um blip e um trecho em rota
    // antes do corte. A saída de base continua sendo fato.
    const paradas = [
      { classificacao: 'BASE', chegada: d(10, 21), saida: d(15, 4) },
      { classificacao: 'FAKE_EXIT', chegada: d(15, 20), saida: d(15, 23) },
      { classificacao: 'FORA_BASE', chegada: d(15, 40), saida: d(16, 0) },
    ]
    expect(saidaBaseSeEmRota(paradas, corte)).toEqual(d(15, 4))
  })
  it('foi a outra loja depois da base → AINDA mostra a saída de base (o horário é fato; regra do operador)', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(5, 0), saida: d(5, 30) },
      { classificacao: 'LOJA', chegada: d(7, 0), saida: d(7, 20) },
    ]
    expect(saidaBaseSeEmRota(paradas, corte)).toEqual(d(5, 30))
  })
  it('saiu da base há <15min mas JÁ está em rota (tem parada fora) → mostra a saída', () => {
    // Caso real dia 15: base 06:20, corte 06:30 (10min), mas já tem trecho fora de base.
    const c2 = Date.UTC(2026, 5, 9, 6, 30)
    const paradas = [
      { classificacao: 'BASE', chegada: d(0, 5), saida: d(6, 20) },
      { classificacao: 'FORA_BASE', chegada: d(6, 25), saida: d(6, 28) },
    ]
    expect(saidaBaseSeEmRota(paradas, c2)).toEqual(d(6, 20))
  })
})

describe('saidaBaseConhecida (FHO: em rota mostra a saída)', () => {
  const d = (h: number, m: number) => new Date(Date.UTC(2026, 5, 16, h, m))
  it('FHO: operou (LOJA 06:01), voltou e saiu de novo 08:20 → 08:20 mesmo perto do corte', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(4, 38), saida: d(5, 10) },
      { classificacao: 'LOJA', chegada: d(6, 1), saida: d(6, 59) },
      { classificacao: 'BASE', chegada: d(7, 55), saida: d(8, 20) },
    ]
    expect(saidaBaseConhecida(paradas)).toEqual(d(8, 20))
  })
  it('só ficou na base o dia todo → null (não operou)', () => {
    expect(saidaBaseConhecida([{ classificacao: 'BASE', chegada: d(0, 5), saida: d(8, 20) }])).toBeNull()
  })
  it('sem parada nenhuma → null', () => {
    expect(saidaBaseConhecida([])).toBeNull()
  })
})

const DIA20 = join(process.cwd(), 'docs', 'conversas-tia-erica', 'dia-20')

function arq(rel: string) {
  return { nome: rel.split('/').pop()!, buffer: readFileSync(join(DIA20, rel)) }
}

describe('gerarKpiLocal (núcleo offline)', () => {
  it('gera XLSX + PDF por rede a partir de escala + Unitrac reais, sem nuvem', async () => {
    const escalas = [arq('escalas/ESCALA GERAL DE MAIO 1 (7).xlsx')]
    // Usa o Unitrac XLSX: o caminho .pdf (parseUnitracPdf → pdf-parse) precisa do
    // worker do pdfjs, que o vitest não inicializa (mesma razão pela qual os testes
    // de unitrac-pdf usam texto). Esse caminho roda no Node real (rota + Electron) e
    // é validado no E2E offline da Fase 6.
    const unitracs = [arq('unitrac/relatorio_9573.xlsx')]

    const saidas = await gerarKpiLocal({
      escalas,
      unitracs,
      cadastro: { lojas: [], veiculos: [] }, // offline puro, sem snapshot de cadastro
      data: '2026-05-20',
    })

    expect(saidas.length).toBeGreaterThanOrEqual(1)
    for (const s of saidas) {
      expect(s.rede_id).toBeTruthy()
      expect(s.linhas).toBeGreaterThan(0)
      expect(s.xlsx.length).toBeGreaterThan(0)
      expect(s.xlsx_com_cd.length).toBeGreaterThan(0)
      expect(s.pdf.length).toBeGreaterThan(0)
      expect(s.pdf_com_cd.length).toBeGreaterThan(0)
      // XLSX começa com a assinatura ZIP (PK); PDF com "%PDF".
      expect(s.xlsx.subarray(0, 2).toString('latin1')).toBe('PK')
      expect(s.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    }
  }, 60_000)

  it('gerarKpiLocalComPreview devolve preview por linha (pro app desktop)', async () => {
    const escalas = [arq('escalas/ESCALA GERAL DE MAIO 1 (7).xlsx')]
    const unitracs = [arq('unitrac/relatorio_9573.xlsx')]

    const saidas = await gerarKpiLocalComPreview({
      escalas,
      unitracs,
      cadastro: { lojas: [], veiculos: [] },
      data: '2026-05-20',
    })

    expect(saidas.length).toBeGreaterThanOrEqual(1)
    for (const s of saidas) {
      // Uma linha de preview por rota, na mesma quantidade do KPI.
      expect(s.preview.length).toBe(s.linhas)
      expect(s.xlsx.length).toBeGreaterThan(0)
      expect(s.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
      for (const p of s.preview) {
        expect(typeof p.ordem).toBe('number')
        expect(typeof p.loja_nome).toBe('string')
        expect(typeof p.tem_gps).toBe('boolean')
        // status é um dos rótulos válidos do sistema.
        expect(p.status).toMatch(/^(ENTREGUE|ENTREGUE_GEO|MUDOU_DE_ROTA|SEM_RASTREADOR|NAO_SAIU_DA_BASE|NAO_FOI_AO_CLIENTE|FORA_DE_BASE)$/)
      }
    }
  }, 60_000)

  it('rotaToLinha mapeia rota+escala pra linha do gerador', () => {
    const escala = {
      rede_id: 'GUANABARA',
      loja_nome_raw: 'Loja 1',
      loja_codigo_raw: '1',
      motorista_nome: 'FULANO',
      motorista_codigo: 10,
      placa_norm: 'ABC1234',
      carro_ordem: 1,
      data_entrega: '2026-05-20',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0',
      placa_norm: 'ABC1234',
      placa_real: null,
      saida_cd: null,
      chegada_base: null,
      paradas: [],
      anomalias_codigos: [],
      status: 'OK',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.ordem).toBe(1)
    expect(linha.loja_nome).toBe('Loja 1')
    expect(linha.placa).toBe('ABC1234')
    expect(linha.motorista).toBe('FULANO')
  })

  it('lança erro claro quando a escala não tem linhas', async () => {
    await expect(
      gerarKpiLocal({
        escalas: [{ nome: 'vazio.xlsx', buffer: Buffer.from('') }],
        unitracs: [],
        cadastro: { lojas: [], veiculos: [] },
        data: '2026-05-20',
      }),
    ).rejects.toThrow(/escala/i)
  })
})
