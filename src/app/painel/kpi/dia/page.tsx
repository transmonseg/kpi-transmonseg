import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { DiaPage } from './DiaPage'

export const metadata = { title: 'Gestão do Dia — Transmonseg' }

const TODOS_TIPOS = ['GERAL', 'ZONA_SUL', 'PAX', 'ARMAZEM_GRAO', 'GUANABARA'] as const

type EscalaUpload = {
  id: string
  tipo: string
  qtd_linhas: number | null
  created_at: string
}

async function fetchEscalasDoDia(data: string): Promise<EscalaUpload[]> {
  const svc = createServiceClient()
  const { data: rows, error } = await svc
    .from('escala_uploads')
    .select('id, tipo, qtd_linhas, created_at')
    .eq('data_escala', data)
    .order('tipo')
  if (error) throw new Error(error.message)
  return (rows ?? []) as EscalaUpload[]
}

export default async function KpiDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  const data = params.data ?? hoje

  const escalas = await fetchEscalasDoDia(data)

  return (
    <DiaPage
      data={data}
      hoje={hoje}
      escalasIniciais={escalas}
      todosTipos={[...TODOS_TIPOS]}
    />
  )
}
