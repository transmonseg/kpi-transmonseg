import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil } from '@/lib/perfil'
import { LojasList } from './lista'

export default async function LojasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin') redirect('/painel')

  const svc = createServiceClient()

  const [{ count: total }, { count: orfas }] = await Promise.all([
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true),
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null),
  ])

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-fg)]">
            Catálogo de Lojas
          </h1>
          <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
            Cadastro de lojas, códigos de escala/Unitrac e coordenadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">{total ?? 0} ativas</Badge>
          {(orfas ?? 0) > 0 && (
            <Badge variant="warning">{orfas} órfãs</Badge>
          )}
        </div>
      </div>

      <LojasList />
    </div>
  )
}
