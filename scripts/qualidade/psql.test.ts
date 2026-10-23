// F1-01/F1-16: consultas do placar e do diagnostico sao so' leitura. A trava
// fica no proprio comando: transacao read-only e timeout, sempre.
import { comandoPsql, sqlLiteral } from './psql'

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
