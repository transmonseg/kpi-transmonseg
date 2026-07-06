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
  it('KNC-1I34: relatório parcial avançou até a 2ª partida → ainda mostra a saída da MANHÃ (05:26), não a 2ª (11:15)', () => {
    // Era a causa da inconsistência: de manhã a última base era 05:26 (correto); à
    // tarde virava 11:15. A regra de "1ª viagem pendente" estabiliza em 05:26.
    const c2 = Date.UTC(2026, 5, 9, 11, 49) // corte ~11:49 (relatório do meio-dia)
    const paradas = [
      { classificacao: 'BASE', chegada: d(4, 29), saida: d(5, 26) }, // partida da manhã
      { classificacao: 'FORA_BASE', chegada: d(6, 10), saida: d(6, 58) }, // loja não reconhecida
      { classificacao: 'BASE', chegada: d(7, 34), saida: d(7, 51) },
      { classificacao: 'BASE', chegada: d(10, 0), saida: d(11, 15) }, // 2ª partida
      { classificacao: 'FORA_BASE', chegada: d(11, 36), saida: d(11, 49) },
    ]
    expect(saidaBaseSeEmRota(paradas, c2)).toEqual(d(5, 26))
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
  it('FHO real: saiu de novo 08:20 e o corte foi bem depois → ainda 08:20', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(4, 38), saida: d(5, 10) },
      { classificacao: 'LOJA', chegada: d(6, 1), saida: d(6, 59) },
      { classificacao: 'BASE', chegada: d(7, 55), saida: d(8, 20) },
    ]
    expect(saidaBaseConhecida(paradas, d(9, 30).getTime())).toEqual(d(8, 20))
  })
  it('UBO-5E05: voltou no fim e o relatório cortou em cima da volta → usa a PARTIDA (02:56), não a volta (11:47)', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(0, 6), saida: d(0, 21) },
      { classificacao: 'BASE', chegada: d(2, 7), saida: d(2, 56) },
      { classificacao: 'FORA_BASE', chegada: d(4, 27), saida: d(4, 41) },
      { classificacao: 'FORA_BASE', chegada: d(9, 10), saida: d(9, 42) },
      { classificacao: 'BASE', chegada: d(11, 24), saida: d(11, 47) },
    ]
    expect(saidaBaseConhecida(paradas, d(11, 47).getTime())).toEqual(d(2, 56))
  })
  it('KNC-1I34 (20/06): 1ª viagem não foi reconhecida (loja virou FORA_BASE), voltou e saiu de novo 11:15 → usa a PARTIDA da manhã (05:26), não a 2ª saída', () => {
    const paradas = [
      { classificacao: 'FORA_BASE', chegada: d(0, 2), saida: d(3, 49) }, // ruído de madrugada
      { classificacao: 'FAKE_EXIT', chegada: d(4, 11), saida: d(4, 25) },
      { classificacao: 'BASE', chegada: d(4, 29), saida: d(5, 26) }, // partida da manhã
      { classificacao: 'FORA_BASE', chegada: d(6, 10), saida: d(6, 58) }, // a loja (não reconhecida)
      { classificacao: 'BASE', chegada: d(7, 34), saida: d(7, 51) }, // voltou
      { classificacao: 'BASE', chegada: d(7, 54), saida: d(9, 57) },
      { classificacao: 'BASE', chegada: d(10, 0), saida: d(11, 15) }, // 2ª partida (tarde)
      { classificacao: 'FAKE_EXIT', chegada: d(11, 17), saida: d(11, 28) },
      { classificacao: 'FORA_BASE', chegada: d(11, 36), saida: d(11, 49) },
      { classificacao: 'FORA_BASE', chegada: d(11, 59), saida: d(13, 18) },
      { classificacao: 'FAKE_EXIT', chegada: d(13, 45), saida: d(13, 53) },
      { classificacao: 'FORA_BASE', chegada: d(13, 57), saida: d(14, 46) },
    ]
    expect(saidaBaseConhecida(paradas, d(14, 49).getTime())).toEqual(d(5, 26))
  })
  it('duas viagens, a 1ª ENTREGOU (LOJA): a saída em-rota é a 2ª partida (não a 1ª)', () => {
    const paradas = [
      { classificacao: 'BASE', chegada: d(4, 38), saida: d(5, 10) },
      { classificacao: 'LOJA', chegada: d(6, 1), saida: d(6, 59) }, // 1ª viagem entregou
      { classificacao: 'BASE', chegada: d(7, 55), saida: d(8, 20) },
      { classificacao: 'FORA_BASE', chegada: d(9, 0), saida: d(9, 30) }, // 2ª viagem, sem loja
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

  it('rotaToLinha emite observação de sugestão ALTA + liga a flag do XLSX', () => {
    const escala = {
      rede_id: 'GUANABARA', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-05-20',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: null, chegada_base: null, paradas: [], anomalias_codigos: [], status: 'sem_entrega',
      placa_sugerida: 'LTQ0783', sugestao_confianca: 'alta', sugestao_hora: '06:17',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.observacao).toBe('Possível troca: a placa LTQ0783 esteve nesta loja às 06:17, confirmar.')
    expect(linha.sugestao_troca_alta).toBe(true)
    expect(linha.placa).toBe('ABC1234') // placa exibida continua a da escala
  })

  it('rotaToLinha: parada em andamento no corte → AINDA NO CLIENTE (sem saída inventada)', () => {
    // Caso FKY-8H51 (06/07): relatório puxado 06:41 com o caminhão DENTRO da loja
    // desde 06:35 — a "Data Saída" da parada é só o corte do relatório, não uma
    // saída real. O KPI mostrava "saída 6:41 / 0:06 em loja"; o certo é chegada
    // 06:35 + AINDA NO CLIENTE (sem saída, sem tempo em loja).
    const escala = {
      rede_id: 'ASSAI', loja_nome_raw: 'Assaí - Barra I (Senna) - Loja 133', loja_codigo_raw: '133',
      motorista_nome: 'CLAUDO', motorista_codigo: 353, placa_norm: 'FKY8H51',
      carro_ordem: 1, data_entrega: '2026-07-06',
    } as unknown as LinhaEscala
    const corte = new Date('2026-07-06T06:41:00Z')
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'FKY8H51', placa_real: null,
      saida_cd: new Date('2026-07-06T05:24:00Z'), chegada_base: null,
      paradas: [{
        parada_id: 'p1', loja_id: 'loja-133', nome: 'SENDAS BARRA I - LJ 32',
        chegada: new Date('2026-07-06T06:35:00Z'), saida: corte, duracao_min: 6,
        classificacao: 'LOJA',
      }],
      anomalias_codigos: [], status: 'OK',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1, corte.getTime())
    expect(linha.chd_loja_1).toEqual(new Date('2026-07-06T06:35:00Z')) // chegada é fato
    expect(linha.saida_loja_1).toBeNull()                              // saída NÃO é fato
    expect(linha.tempo_loja_1_min).toBeNull()
    expect(linha.ainda_no_cliente_1).toBe(true)
    expect(linha.observacao).toContain('no cliente')
  })

  it('rotaToLinha: parada encerrada bem antes do corte → saída normal (sem flag)', () => {
    const escala = {
      rede_id: 'ASSAI', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-07-06',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: new Date('2026-07-06T05:00:00Z'), chegada_base: null,
      paradas: [{
        parada_id: 'p1', loja_id: 'loja-1', nome: 'LOJA 1',
        chegada: new Date('2026-07-06T06:00:00Z'), saida: new Date('2026-07-06T06:45:00Z'),
        duracao_min: 45, classificacao: 'LOJA',
      }],
      anomalias_codigos: [], status: 'OK',
    } as unknown as RotaKpi

    // Corte 4h depois da saída: a saída é real.
    const linha = rotaToLinha(rota, escala, 1, new Date('2026-07-06T10:45:00Z').getTime())
    expect(linha.saida_loja_1).toEqual(new Date('2026-07-06T06:45:00Z'))
    expect(linha.tempo_loja_1_min).toBe(45)
    expect(linha.ainda_no_cliente_1).toBeUndefined()
  })

  it('rotaToLinha: sem corte informado → comportamento antigo intacto', () => {
    const escala = {
      rede_id: 'ASSAI', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-07-06',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: null, chegada_base: null,
      paradas: [{
        parada_id: 'p1', loja_id: 'loja-1', nome: 'LOJA 1',
        chegada: new Date('2026-07-06T06:00:00Z'), saida: new Date('2026-07-06T06:45:00Z'),
        duracao_min: 45, classificacao: 'LOJA',
      }],
      anomalias_codigos: [], status: 'OK',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.saida_loja_1).toEqual(new Date('2026-07-06T06:45:00Z'))
    expect(linha.ainda_no_cliente_1).toBeUndefined()
  })

  it('rotaToLinha: sugestão BAIXA vai na observação mas NÃO liga a flag do XLSX', () => {
    const escala = {
      rede_id: 'GUANABARA', loja_nome_raw: 'Loja 1', loja_codigo_raw: '1',
      motorista_nome: 'FULANO', motorista_codigo: 10, placa_norm: 'ABC1234',
      carro_ordem: 1, data_entrega: '2026-05-20',
    } as unknown as LinhaEscala
    const rota = {
      escala_linha_id: 'esc-0', placa_norm: 'ABC1234', placa_real: null,
      saida_cd: null, chegada_base: null, paradas: [], anomalias_codigos: [], status: 'sem_entrega',
      placa_sugerida: 'XYZ9K88', sugestao_confianca: 'baixa', sugestao_hora: '06:10',
    } as unknown as RotaKpi

    const linha = rotaToLinha(rota, escala, 1)
    expect(linha.observacao).toContain('Verificar')
    expect(linha.observacao).toContain('XYZ9K88')
    expect(linha.sugestao_troca_alta).toBe(false)
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
