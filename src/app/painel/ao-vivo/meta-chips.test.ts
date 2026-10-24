import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

// F3-02 (AC-06): a tela do Ao vivo usa as mesmas regras do Resumo do dia
// (resumo-dia.ts, testadas com o caso de 22/10) -- aqui só confere a ligação.
describe('Ao vivo: linha da meta, piores primeiro e chips (F3-02)', () => {
  const pagina = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
  it('linha "X% · meta Y% · faltam N · K fora da conta" com a meta do cliente', () => {
    expect(pagina).toMatch(/linhaMeta\(r\.resumo, meta\)\.texto/)
    expect(pagina).toMatch(/const meta = metaDoCliente\(cliente\)/)
  })
  it('lista de placas em "piores primeiro" e chips Abaixo da meta / Sem horário da base', () => {
    expect(pagina).toMatch(/ordenarPioresPrimeiro\(/)
    expect(pagina).toContain("'Abaixo da meta'")
    expect(pagina).toContain("'Sem horário da base'")
    expect(pagina).toMatch(/placaSemHorarioBase/)
  })
  it('link para o Resumo do dia do mesmo cliente e dia', () => {
    expect(pagina).toContain('/painel/resumo-dia?cliente=${cliente}&data=${estado.data}')
  })
})
