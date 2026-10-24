import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement } from 'react'
import ResumoDiaPage from './page'
import { ResumoDiaTela } from './resumo-dia-tela'

// F3-R09: o link "Resumo do dia" do Ao vivo da RQ abre
// /painel/resumo-dia?cliente=rioquality&data=2026-10-22. A página lia
// window.location no useState: o HTML do servidor dizia "Nutry Max" e o
// navegador "Rio Quality" (erro de hidratação). Agora cliente e data vêm do
// searchParams da página (servidor) e o HTML já sai certo.

describe('Resumo do dia: cliente e data da URL no HTML do servidor (F3-R09)', () => {
  it('a página (servidor) passa cliente e data do searchParams', async () => {
    const el = await ResumoDiaPage({ searchParams: Promise.resolve({ cliente: 'rioquality', data: '2026-10-22' }) })
    expect(isValidElement(el)).toBe(true)
    expect((el as { props: Record<string, unknown> }).props).toMatchObject({ clienteInicial: 'rioquality', dataInicial: '2026-10-22' })
  })
  it('sem parâmetros (ou inválidos): Nutry Max e dia de hoje', async () => {
    const el = await ResumoDiaPage({ searchParams: Promise.resolve({ cliente: 'benassi', data: '22/10' }) })
    expect((el as { props: Record<string, unknown> }).props).toMatchObject({ clienteInicial: 'nutrimax', dataInicial: null })
  })
  it('o HTML do servidor já diz Rio Quality', () => {
    const html = renderToStaticMarkup(<ResumoDiaTela clienteInicial="rioquality" dataInicial="2026-10-22" />)
    expect(html).toContain('Rio Quality')
    expect(html).not.toContain('Nutry Max')
  })
})
