import { describe, it, expect } from 'vitest'
import { aplicarAlteracoes, parsedToConfirmada, type AltConfirmada } from './aplicar-alteracoes'
import type { LinhaEscala } from '@/lib/types/escala'

function mkLinha(over: Partial<LinhaEscala>): LinhaEscala {
  return {
    data: '2026-05-22',
    rede_id: 'PREZUNIC',
    loja_nome_raw: 'Loja X',
    loja_codigo_raw: null,
    motorista_nome: 'Joao',
    motorista_codigo: '100',
    placa_raw: 'AAA1234',
    placa_norm: 'AAA1234',
    carro_ordem: 1,
    data_entrega: '2026-05-22',
    sub_rede: null,
    ...over,
  } as LinhaEscala
}

describe('aplicarAlteracoes', () => {
  it('retorna lista intacta quando sem alterações', () => {
    const linhas = [mkLinha({})]
    const out = aplicarAlteracoes(linhas, [])
    expect(out).toEqual(linhas)
  })

  it('SUBSTITUICAO troca placa+motorista quando match por placa de saída', () => {
    const linhas = [mkLinha({ placa_norm: 'OLD0000', motorista_nome: 'Antigo' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: 999, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[0].motorista_nome).toBe('Novo')
    expect(out[0].motorista_codigo).toBe('999')
  })

  it('SUBSTITUICAO match por motorista (primeiro nome) — case insensitive', () => {
    const linhas = [mkLinha({ motorista_nome: 'José Roberto Silva' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Carlos', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: 'José', placa_norm: null },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[0].motorista_nome).toBe('Carlos')
  })

  it('cross-rede: alteração PREZUNIC não afeta linha VIANENSE com mesma placa', () => {
    const linhas = [
      mkLinha({ rede_id: 'VIANENSE', placa_norm: 'AAA1234' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'AAA1234' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('AAA1234')  // não alterado
  })

  it('snapshot anti-cascata: SWAP mútuo', () => {
    // Filial 23 LQA5883↔LTE0A64 + Filial 43 LTE0A64↔LQA5883
    // Sem snapshot, a 2ª alt encontraria a placa já substituída pela 1ª e ficaria errado
    const linhas = [
      mkLinha({ loja_codigo_raw: '23', placa_norm: 'LQA5883', motorista_nome: 'A' }),
      mkLinha({ loja_codigo_raw: '43', placa_norm: 'LTE0A64', motorista_nome: 'B' }),
    ]
    const alts: AltConfirmada[] = [
      {
        tipo: 'SWAP',
        rede_id: 'PREZUNIC',
        loja_raw: 'Filial 23',
        entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'LTE0A64', placa_norm: 'LTE0A64' },
        sai: { motorista_nome: null, placa_norm: 'LQA5883' },
      },
      {
        tipo: 'SWAP',
        rede_id: 'PREZUNIC',
        loja_raw: 'Filial 43',
        entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'LQA5883', placa_norm: 'LQA5883' },
        sai: { motorista_nome: null, placa_norm: 'LTE0A64' },
      },
    ]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('LTE0A64')
    expect(out[1].placa_norm).toBe('LQA5883')
    // Motoristas devem ficar intactos (SWAP só troca placa)
    expect(out[0].motorista_nome).toBe('A')
    expect(out[1].motorista_nome).toBe('B')
  })

  it('match por loja_raw quando não tem placa nem motorista em sai', () => {
    const linhas = [mkLinha({ loja_codigo_raw: '23', placa_norm: 'OLD0000' })]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: 'Filial 23',
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: null,
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
  })

  it('SUBSTITUICAO afeta MÚLTIPLAS linhas com mesma placa (uma placa serve múltiplas lojas)', () => {
    const linhas = [
      mkLinha({ loja_nome_raw: 'Loja A', placa_norm: 'OLD0000' }),
      mkLinha({ loja_nome_raw: 'Loja B', placa_norm: 'OLD0000' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[1].placa_norm).toBe('NEW9999')
  })

  it('SWAP afeta APENAS UMA linha (a primeira que casa)', () => {
    const linhas = [
      mkLinha({ loja_nome_raw: 'Loja A', placa_norm: 'OLD0000' }),
      mkLinha({ loja_nome_raw: 'Loja B', placa_norm: 'OLD0000' }),
    ]
    const alts: AltConfirmada[] = [{
      tipo: 'SWAP',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: null, motorista_codigo: null, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'OLD0000' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('NEW9999')
    expect(out[1].placa_norm).toBe('OLD0000')
  })

  it('tipo COMUNICADO/INFORMATIVO é ignorado', () => {
    const linhas = [mkLinha({ placa_norm: 'AAA1234' })]
    const alts: AltConfirmada[] = [{
      tipo: 'COMUNICADO',
      rede_id: 'PREZUNIC',
      loja_raw: null,
      entra: { motorista_nome: 'Novo', motorista_codigo: null, placa_raw: null, placa_norm: 'NEW9999' },
      sai: { motorista_nome: null, placa_norm: 'AAA1234' },
    }]
    const out = aplicarAlteracoes(linhas, alts)
    expect(out[0].placa_norm).toBe('AAA1234')  // não alterado
  })

  it('INCLUSAO com loja especifica nao espalha pra outras lojas mesma rede (bug dia 19)', () => {
    // Bug dia 19 ASSAI: INCLUSAO em "Alcântara I - Loja 35" vazava pra "Alcântara II - Loja 293"
    // porque o fallback de tokens batia em "ALCANTARA" (I/II viram tokens curtos descartados).
    // Quando loja_raw da alteração tem número de filial e a linha também tem codigo, e eles
    // divergem, NÃO devemos cair no fallback de nome.
    const stub: any = {
      data: '2026-05-19',
      data_entrega: '2026-05-19',
      rede_id: 'ASSAI',
      motorista_codigo: null,
      tipo_carro: null,
      carro_ordem: 1,
      sub_rede: null,
    }
    const linhas: any[] = [
      { ...stub, loja_nome_raw: 'Assaí - Alcântara I - Loja 35',           loja_codigo_raw: '35',  placa_norm: 'OLDALC1', placa_raw: 'OLD-ALC1', motorista_nome: 'OLD ALC1'    },
      { ...stub, loja_nome_raw: 'Assaí - Alcântara II - Loja 293',         loja_codigo_raw: '293', placa_norm: 'FQN6J72', placa_raw: 'FQN-6J72', motorista_nome: 'LUIZ CARLOS' },
      { ...stub, loja_nome_raw: 'Assaí - Bangu II - Loja 332',             loja_codigo_raw: '332', placa_norm: 'LMF2049', placa_raw: 'LMF-2049', motorista_nome: 'LUIZ CESAR'  },
      { ...stub, loja_nome_raw: 'Assaí - Barra I (Senna) - Loja 133',      loja_codigo_raw: '133', placa_norm: 'OLDBAR1', placa_raw: 'OLD-BAR1', motorista_nome: 'OLD BAR1'    },
      { ...stub, loja_nome_raw: 'Assaí - Méier - Loja 160',                loja_codigo_raw: '160', placa_norm: 'AKZ2745', placa_raw: 'AKZ-2745', motorista_nome: 'LUIZ JR.'    },
      { ...stub, loja_nome_raw: 'Assaí - São Gonçalo Camil - Loja 211',    loja_codigo_raw: '211', placa_norm: 'OLD1234', placa_raw: 'OLD-1234', motorista_nome: 'OLD MOT'     },
    ]
    const alts: AltConfirmada[] = [
      {
        tipo: 'INCLUSAO',
        rede_id: 'ASSAI',
        loja_raw: 'Assaí - Alcântara I - Loja 35',
        sai: null,
        entra: { motorista_nome: 'PAULO HENRIQUE', motorista_codigo: 807, placa_raw: 'DBB-8D19', placa_norm: 'DBB8D19' },
      },
      {
        tipo: 'INCLUSAO',
        rede_id: 'ASSAI',
        loja_raw: 'Assaí - Barra I (Senna) - Loja 133',
        sai: null,
        entra: { motorista_nome: 'FELIPE DIEGO', motorista_codigo: 353, placa_raw: 'UBO-5E01', placa_norm: 'UBO5E01' },
      },
      {
        tipo: 'INCLUSAO',
        rede_id: 'ASSAI',
        loja_raw: 'Assaí - São Gonçalo Camil - Loja 211',
        sai: null,
        entra: { motorista_nome: 'MESSIAS', motorista_codigo: 141, placa_raw: 'AMW-3424', placa_norm: 'AMW3424' },
      },
    ]
    const out = aplicarAlteracoes(linhas, alts)
    // Loja 35 → DBB-8D19 (única loja que deveria receber esta placa)
    expect(out[0].placa_norm).toBe('DBB8D19')
    // Loja 293 (Alcântara II) NÃO deve receber DBB-8D19 — mantém FQN6J72
    expect(out[1].placa_norm).toBe('FQN6J72')
    // Loja 332 (Bangu II) mantém placa original
    expect(out[2].placa_norm).toBe('LMF2049')
    // Loja 133 (Barra I) recebe UBO-5E01
    expect(out[3].placa_norm).toBe('UBO5E01')
    // Loja 160 (Méier) mantém placa original
    expect(out[4].placa_norm).toBe('AKZ2745')
    // Loja 211 (Camil) recebe AMW-3424
    expect(out[5].placa_norm).toBe('AMW3424')
  })

  it('parsedToConfirmada converte AlteracaoParsed corretamente', () => {
    const parsed = {
      tipo: 'SUBSTITUICAO',
      rede_id: 'PREZUNIC',
      loja_nome_raw: 'Loja X',
      entra: { motorista_nome: 'Novo', motorista_codigo: 999, placa_raw: 'NEW9999', placa_norm: 'NEW9999' },
      sai: { motorista_nome: 'Antigo', placa_norm: 'OLD0000' },
    }
    const out = parsedToConfirmada(parsed)
    expect(out.loja_raw).toBe('Loja X')
    expect(out.tipo).toBe('SUBSTITUICAO')
    expect(out.entra?.placa_norm).toBe('NEW9999')
    expect(out.sai?.placa_norm).toBe('OLD0000')
  })
})

describe('aplicarAlteracoes — carro_ordem (não corrompe o outro carro)', () => {
  const escala = (): LinhaEscala[] => [
    mkLinha({ rede_id: 'ASSAI', loja_nome_raw: 'Assai Camil', loja_codigo_raw: '211', carro_ordem: 1, motorista_nome: 'LUIS', placa_norm: 'LOT2962', placa_raw: 'LOT2962' }),
    mkLinha({ rede_id: 'ASSAI', loja_nome_raw: 'Assai Camil', loja_codigo_raw: '211', carro_ordem: 2, motorista_nome: 'PEDRO', placa_norm: 'ABC1D23', placa_raw: 'ABC1D23' }),
  ]
  const alt = (carro: number, mot: string, placa: string): AltConfirmada => ({
    tipo: 'SUBSTITUICAO', rede_id: 'ASSAI', loja_raw: 'Assaí - Loja 211', carro,
    entra: { motorista_nome: mot, motorista_codigo: null, placa_raw: placa, placa_norm: placa }, sai: null,
  })

  it('alteração do 2º carro NÃO mexe no 1º (via loja_raw "Loja 211")', () => {
    const r = aplicarAlteracoes(escala(), [alt(2, 'MARCIO', 'KXR7F27')])
    const c1 = r.find(l => l.carro_ordem === 1)!
    const c2 = r.find(l => l.carro_ordem === 2)!
    expect(c1.motorista_nome).toBe('LUIS')       // 1º intacto
    expect(c2.motorista_nome).toBe('MARCIO')      // 2º trocado
    expect(c2.placa_norm).toBe('KXR7F27')
  })

  it('1º e 2º carro juntos → cada um no seu', () => {
    const r = aplicarAlteracoes(escala(), [alt(1, 'JOAO', 'LOT2962'), alt(2, 'MARCIO', 'KXR7F27')])
    expect(r.find(l => l.carro_ordem === 1)!.motorista_nome).toBe('JOAO')
    expect(r.find(l => l.carro_ordem === 2)!.motorista_nome).toBe('MARCIO')
  })

  it('carro NOVO (loja só tem 1º) → adiciona linha do 2º carro', () => {
    const so1 = [mkLinha({ rede_id: 'ASSAI', loja_nome_raw: 'Assai Camil', loja_codigo_raw: '211', carro_ordem: 1, motorista_nome: 'LUIS', placa_norm: 'LOT2962' })]
    const r = aplicarAlteracoes(so1, [alt(2, 'MARCIO', 'KXR7F27')])
    expect(r.length).toBe(2)
    const c2 = r.find(l => l.carro_ordem === 2)!
    expect(c2.motorista_nome).toBe('MARCIO')
    expect(c2.loja_codigo_raw).toBe('211')        // clonou o contexto da loja
    expect(r.find(l => l.carro_ordem === 1)!.motorista_nome).toBe('LUIS') // 1º intacto
  })

  it('parsedToConfirmada extrai carro do motivo "2º CARRO"', () => {
    const c = parsedToConfirmada({ tipo: 'INCLUSAO', rede_id: 'ASSAI', loja_nome_raw: 'Loja 211', motivo: '2º CARRO', entra: null, sai: null })
    expect(c.carro).toBe(2)
    expect(c.loja_raw).toBe('Loja 211')
  })
})
