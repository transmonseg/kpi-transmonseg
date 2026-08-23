import { describe, it, expect } from 'vitest'
import { alvosDaData } from './alvos-data'
import type { AlvoApi } from '@/lib/unitrac-api'

function alvo(overrides: Partial<AlvoApi> = {}): AlvoApi {
  return {
    placaNorm: 'TTL7D40',
    codigoUnitrac: 'COD1',
    nome: 'LOJA TESTE',
    situacao: 1,
    feitoISO: null,
    documento: 'NF1',
    inicioISO: null,
    ordem: 1,
    rota: 'ROTA1',
    ...overrides,
  }
}

describe('alvosDaData', () => {
  it('mantém alvo cujo feitoISO bate com a data pedida', () => {
    const a = alvo({ feitoISO: '2026-08-20T10:00:00', inicioISO: '2026-08-20T02:00:00' })
    expect(alvosDaData([a], '2026-08-20')).toEqual([a])
  })

  it('descarta alvo cujo feitoISO é de outro dia (Unitrac já girou pro plano de hoje)', () => {
    const a = alvo({ feitoISO: '2026-08-21T10:00:00', inicioISO: '2026-08-21T02:00:00' })
    expect(alvosDaData([a], '2026-08-20')).toEqual([])
  })

  it('sem feitoISO (pendente), cai pro inicioISO', () => {
    const a = alvo({ feitoISO: null, inicioISO: '2026-08-20T02:00:00' })
    expect(alvosDaData([a], '2026-08-20')).toEqual([a])
  })

  it('sem feitoISO nem inicioISO, é descartado', () => {
    const a = alvo({ feitoISO: null, inicioISO: null })
    expect(alvosDaData([a], '2026-08-20')).toEqual([])
  })

  // LIMITE CONHECIDO (ver comentário em alvos-data.ts, Fix 2 do relatório de
  // correção pós-revisão) -- estes dois testes documentam o comportamento
  // atual usando o MESMO alvo, só variando a data pedida, pra deixar o
  // limite visível sem ambiguidade:
  //
  // Uma carga que começou ONTEM (inicioISO = ontem) só teve a entrega
  // confirmada depois da meia-noite -- feitoISO grava HOJE (o dia real da
  // confirmação), não ontem (o dia real da carga/rota). `alvosDaData` usa
  // feitoISO quando ele existe, ignorando inicioISO -- então:
  const alvoConfirmadoDepoisDaMeiaNoite = alvo({
    situacao: 1, // feito de verdade -- não é um alvo pendente
    inicioISO: '2026-08-20T22:00:00', // rota começou ONTEM à noite
    feitoISO: '2026-08-21T00:45:00', // só confirmou depois da meia-noite -> HOJE
  })

  it('LIMITE CONHECIDO: pedindo KPI do dia em que feitoISO caiu (hoje) -- alvo aparece normalmente', () => {
    expect(alvosDaData([alvoConfirmadoDepoisDaMeiaNoite], '2026-08-21')).toEqual([
      alvoConfirmadoDepoisDaMeiaNoite,
    ])
  })

  it('LIMITE CONHECIDO: pedindo KPI do dia real da carga (ontem, via inicioISO) -- alvo é DESCARTADO mesmo com situacao===1', () => {
    // Este é o achado da revisão: a carga era de ontem, foi feita de
    // verdade (situacao===1), mas some do KPI de ontem porque feitoISO
    // aponta pra hoje. Comportamento atual, não corrigido por falta de
    // dado real (Task 11) -- ver comentário em alvos-data.ts.
    expect(alvosDaData([alvoConfirmadoDepoisDaMeiaNoite], '2026-08-20')).toEqual([])
  })
})
