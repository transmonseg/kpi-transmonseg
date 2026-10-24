import { ClientesFalhaTela } from './clientes-falha-tela'

// F4-07 (GEO-24, ACH-07): "Clientes que sempre falham" e "Corrigir ponto".
// O cliente aberto vem do searchParams (?codigo=), lido aqui no servidor.
export default async function ClientesFalhaPage({ searchParams }: { searchParams: Promise<{ [chave: string]: string | string[] | undefined }> }) {
  const sp = await searchParams
  const c = Array.isArray(sp.codigo) ? sp.codigo[0] : sp.codigo
  return <ClientesFalhaTela codigoInicial={c && /^[0-9A-Za-z_-]{1,40}$/.test(c) ? c : null} />
}
