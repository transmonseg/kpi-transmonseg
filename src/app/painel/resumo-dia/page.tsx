import { ResumoDiaTela, type Cliente } from './resumo-dia-tela'

// F3-02 (ACH-03) / F3-09: Resumo do dia. F3-R09: cliente e data saem do
// searchParams aqui no servidor, para o HTML inicial já vir com o cliente certo.
export default async function ResumoDiaPage({ searchParams }: { searchParams: Promise<{ [chave: string]: string | string[] | undefined }> }) {
  const sp = await searchParams
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const cliente: Cliente = um(sp.cliente) === 'rioquality' ? 'rioquality' : 'nutrimax'
  const data = um(sp.data)
  return <ResumoDiaTela clienteInicial={cliente} dataInicial={data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null} />
}
