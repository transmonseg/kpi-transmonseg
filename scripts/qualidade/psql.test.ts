// F1-01/F1-16: consultas do placar e do diagnostico sao so' leitura. A trava
// fica no proprio comando: transacao read-only e timeout, sempre.
import { comandoPsql, comandoPsqlEscrita, sqlGravarPlacar, sqlLiteral } from './psql'

describe('comandoPsql', () => {
  it('no servidor: sudo -u postgres psql com transacao read-only e timeout', () => {
    const [cmd, args] = comandoPsql('kpi_transmonseg', 'select 1')
    expect(cmd).toBe('sudo')
    expect(args.slice(0, 4)).toEqual(['-n', '-u', 'postgres', 'env'])
    expect(args).toContain('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000')
    expect(args).toContain('psql')
    expect(args).toContain('kpi_transmonseg')
    expect(args[args.length - 1]).toBe('select 1')
  })

  it('pelo Mac (PLACAR_SSH): o mesmo comando dentro do ssh, com a SQL escapada', () => {
    const [cmd, args] = comandoPsql('transmonseg', "select 'a'", 'transmonseg-vps')
    expect(cmd).toBe('ssh')
    expect(args[0]).toBe('transmonseg-vps')
    expect(args[1]).toContain('default_transaction_read_only=on')
    expect(args[1]).toContain(`'select '"'"'a'"'"''`)
  })
})

describe('sqlLiteral', () => {
  it('aceita so\' data AAAA-MM-DD', () => {
    expect(sqlLiteral('2026-10-22')).toBe("'2026-10-22'")
    expect(() => sqlLiteral("2026-10-22'; drop table x; --")).toThrow()
  })
})

// F1-01 (23/10, OK do dono): o placar tambem grava em qualidade_diaria. A
// escrita e' a UNICA sessao sem read-only, e a SQL vai pelo stdin.
describe('sqlGravarPlacar / comandoPsqlEscrita', () => {
  const linhas = [
    { dia: '2026-10-22', cliente: 'nutrimax', metrica: 'taxa', valor: 96.9, detalhe: null },
    { dia: '2026-10-22', cliente: 'geral', metrica: 'ollama_ativo', valor: 0, detalhe: { estado: "inactive $q$ o'k" } },
  ]
  it('upsert por (dia, cliente, metrica) com o JSON num dollar-quote que nao aparece no texto', () => {
    const sql = sqlGravarPlacar(linhas)
    expect(sql).toMatch(/insert into public\.qualidade_diaria/)
    expect(sql).toMatch(/on conflict \(dia, cliente, metrica\) do update/)
    const tag = sql.match(/(\$[a-z_0-9]*\$)\[/)![1]
    expect(JSON.stringify(linhas)).not.toContain(tag)
    const corpo = sql.slice(sql.indexOf(tag) + tag.length, sql.lastIndexOf(tag))
    expect(JSON.parse(corpo)).toEqual(linhas)
  })
  it('sem linhas: nada a gravar', () => {
    expect(sqlGravarPlacar([])).toBeNull()
  })
  it('a sessao de escrita nao tem read-only e le a SQL do stdin', () => {
    const [cmd, args] = comandoPsqlEscrita('kpi_transmonseg')
    expect(cmd).toBe('sudo')
    expect(args.join(' ')).not.toContain('read_only')
    expect(args).toContain('PGOPTIONS=-c statement_timeout=120000')
    expect(args.slice(-2)).toEqual(['-f', '-'])
  })
})
