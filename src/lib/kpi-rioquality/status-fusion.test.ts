import { describe, it, expect } from 'vitest'
import { proximoStatusFusion, decidirAlertaFusion, bannerFusion, marcarAlertaFusion, type StatusFusion } from './status-fusion'
import { registrarSyncFusion, lerStatusFusion, chaveStatusFusion } from './status-fusion-banco'

// F2-05 (KRQ-05, OPS-07, KP-11): a Fusion caia quase todo dia e nada
// aparecia -- 21/10 das 05:00 as 15:01 BRT o tick so' logava "TypeError:
// fetch failed" (61 vezes), ultimo_erro vazio, a tela dizia "sem romaneio".
// 23/10 (upload manual) teve 0 tentativas o dia inteiro, sem ninguem saber.

const FALHA_21_10 = 'TypeError: fetch failed'
const brt = (hhmm: string, dia = '2026-10-21') => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()

function rodar(eventos: { situacao: StatusFusion['situacao']; em: string; erro?: string }[]): StatusFusion {
  let s: StatusFusion | null = null
  for (const e of eventos) s = proximoStatusFusion(s, e)
  return s!
}

describe('proximoStatusFusion', () => {
  it('erro grava ultimoErro, a hora e desde quando a Fusion nao responde', () => {
    const s = rodar([
      { situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 },
      { situacao: 'erro', em: brt('05:10'), erro: FALHA_21_10 },
    ])
    expect(s.situacao).toBe('erro')
    expect(s.ultimoErro).toBe(FALHA_21_10)
    expect(s.ultimoErroEm).toBe(brt('05:10'))
    expect(s.falhandoDesde).toBe(brt('05:00'))
    expect(s.ultimaTentativa).toBe(brt('05:10'))
    expect(s.ultimoSucesso).toBeNull()
  })

  it('a Fusion volta (15:01): sucesso registrado, falha zerada, o erro fica no historico', () => {
    const s = rodar([
      { situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 },
      { situacao: 'ok', em: brt('15:01') },
    ])
    expect(s.situacao).toBe('ok')
    expect(s.fonteDoDia).toBe('fusion')
    expect(s.ultimoSucesso).toBe(brt('15:01'))
    expect(s.falhandoDesde).toBeNull()
    expect(s.ultimoErro).toBe(FALHA_21_10)
  })

  it('sem_dados e resposta da Fusion (nao conta como falha)', () => {
    const s = rodar([
      { situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 },
      { situacao: 'sem_dados', em: brt('05:10') },
    ])
    expect(s.falhandoDesde).toBeNull()
    expect(s.ultimoSucesso).toBe(brt('05:10'))
  })

  it('dia manual (23/10) grava "manual", distinto de "Fusion OK"', () => {
    const s = rodar([
      { situacao: 'ok', em: brt('05:00', '2026-10-23') },
      { situacao: 'manual', em: brt('09:10', '2026-10-23') },
    ])
    expect(s.situacao).toBe('manual')
    expect(s.fonteDoDia).toBe('manual')
    expect(s.ultimaTentativa).toBe(brt('09:10', '2026-10-23'))
    expect(s.ultimoSucesso).toBe(brt('05:00', '2026-10-23'))
  })
})

describe('decidirAlertaFusion (alerta interno ao dono, 60 min sem sucesso entre 05h e 21h)', () => {
  const caindo = rodar([{ situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 }, { situacao: 'erro', em: brt('05:50'), erro: FALHA_21_10 }])

  it('21/10: 50 min sem resposta ainda nao alerta', () => {
    expect(decidirAlertaFusion(caindo, Date.parse(brt('05:50')))).toBeNull()
  })

  it('21/10 06:00: 60 min sem resposta alerta, com a hora de Brasilia e o erro', () => {
    const s = proximoStatusFusion(caindo, { situacao: 'erro', em: brt('06:00'), erro: FALHA_21_10 })
    const texto = decidirAlertaFusion(s, Date.parse(brt('06:00')))
    expect(texto).toContain('05:00')
    expect(texto).toContain(FALHA_21_10)
    expect(texto).toContain('Rio Quality')
  })

  it('ja alertado nesta queda: nao repete', () => {
    const s = marcarAlertaFusion(proximoStatusFusion(caindo, { situacao: 'erro', em: brt('06:00'), erro: FALHA_21_10 }), brt('06:00'))
    expect(decidirAlertaFusion(proximoStatusFusion(s, { situacao: 'erro', em: brt('06:10'), erro: FALHA_21_10 }), Date.parse(brt('06:10')))).toBeNull()
  })

  it('nova queda depois de a Fusion voltar alerta de novo', () => {
    let s = marcarAlertaFusion(proximoStatusFusion(caindo, { situacao: 'erro', em: brt('06:00'), erro: FALHA_21_10 }), brt('06:00'))
    s = proximoStatusFusion(s, { situacao: 'ok', em: brt('15:01') })
    s = proximoStatusFusion(s, { situacao: 'erro', em: brt('16:00'), erro: FALHA_21_10 })
    s = proximoStatusFusion(s, { situacao: 'erro', em: brt('17:00'), erro: FALHA_21_10 })
    expect(decidirAlertaFusion(s, Date.parse(brt('17:00')))).toContain('16:00')
  })

  it('fora de 05h-21h nao alerta', () => {
    const s = rodar([{ situacao: 'erro', em: brt('19:50'), erro: FALHA_21_10 }, { situacao: 'erro', em: brt('21:00'), erro: FALHA_21_10 }])
    expect(decidirAlertaFusion(s, Date.parse(brt('21:00')))).toBeNull()
  })

  it('dia manual ou Fusion respondendo: nao alerta', () => {
    expect(decidirAlertaFusion(rodar([{ situacao: 'manual', em: brt('08:00') }]), Date.parse(brt('12:00')))).toBeNull()
    expect(decidirAlertaFusion(rodar([{ situacao: 'ok', em: brt('08:00') }]), Date.parse(brt('12:00')))).toBeNull()
  })
})

describe('bannerFusion (Ao vivo da RQ)', () => {
  it('Fusion caida (21/10): "Fusion sem responder desde 05:00"', () => {
    const s = rodar([{ situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 }, { situacao: 'erro', em: brt('05:10'), erro: FALHA_21_10 }])
    const b = bannerFusion(s, null)!
    expect(b.tipo).toBe('sem_resposta')
    expect(b.texto).toContain('Fusion sem responder desde 05:00')
    expect(b.acao).toBeNull()
  })

  it('dia subido a mao (23/10 09:10): travado no envio manual, com o botao de voltar a puxar da Fusion', () => {
    const b = bannerFusion(null, { fonte: 'manual', enviadoEm: brt('09:10', '2026-10-23') })!
    expect(b.tipo).toBe('manual')
    expect(b.texto).toContain('Dia travado no envio manual de 09:10')
    expect(b.acao).toBe('voltar_fusion')
  })

  it('Fusion respondendo e dia da Fusion: sem banner', () => {
    expect(bannerFusion(rodar([{ situacao: 'ok', em: brt('08:00') }]), { fonte: 'fusion', enviadoEm: brt('08:00') })).toBeNull()
    expect(bannerFusion(null, null)).toBeNull()
  })
})

// Gravacao em kpi_cache_dia (tabela que ja' existe, 7 dias, sem migration).
function clienteFalso() {
  const linhas = new Map<string, { chave: string; data: string; valor: unknown; gravado_em: string }>()
  const cliente = {
    from: () => {
      let chave = ''
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => { chave = v; return q },
        maybeSingle: async () => ({ data: linhas.get(chave) ?? null, error: null }),
        upsert: async (l: { chave: string; data: string; valor: unknown; gravado_em: string }) => { linhas.set(l.chave, l); return { error: null } },
      }
      return q
    },
  }
  return { linhas, cliente: () => cliente as never }
}

describe('registrarSyncFusion / lerStatusFusion', () => {
  it('grava por dia em kpi_cache_dia e le de volta', async () => {
    const f = clienteFalso()
    await registrarSyncFusion('2026-10-21', { situacao: 'erro', em: brt('05:00'), erro: FALHA_21_10 }, { cliente: f.cliente })
    await registrarSyncFusion('2026-10-21', { situacao: 'erro', em: brt('05:10'), erro: FALHA_21_10 }, { cliente: f.cliente })
    const linha = f.linhas.get(chaveStatusFusion('2026-10-21'))!
    expect(linha.data).toBe('2026-10-21')
    const s = await lerStatusFusion('2026-10-21', { cliente: f.cliente })
    expect(s?.falhandoDesde).toBe(brt('05:00'))
    expect(s?.ultimoErro).toBe(FALHA_21_10)
  })

  it('falha do banco nao derruba o tick (fail-open)', async () => {
    const quebrado = () => ({ from: () => { throw new Error('banco fora') } }) as never
    await expect(registrarSyncFusion('2026-10-21', { situacao: 'ok', em: brt('05:00') }, { cliente: quebrado })).resolves.toBeNull()
    await expect(lerStatusFusion('2026-10-21', { cliente: quebrado })).resolves.toBeNull()
  })
})
