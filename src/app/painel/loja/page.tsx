import { hojeBR } from '@/lib/data-br'
import LojaClient from './loja-client'

// Auth vem do layout do /painel.
export default async function LojaPage({
  searchParams,
}: {
  searchParams: Promise<{ rede?: string; loja?: string; periodo?: string; data?: string }>
}) {
  const sp = await searchParams
  return (
    <LojaClient
      rede={sp.rede ?? ''}
      loja={sp.loja ?? ''}
      periodoInicial={sp.periodo ?? 'mes'}
      dataInicial={sp.data ?? hojeBR()}
    />
  )
}
