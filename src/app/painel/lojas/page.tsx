import { createServiceClient } from '@/lib/supabase/service'
import { LojasList } from './lista'

export default async function LojasPage() {
  const svc = createServiceClient()

  const [{ count: total }, { count: orfas }] = await Promise.all([
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true),
    svc.from('lojas').select('*', { count: 'exact', head: true }).eq('ativo', true).is('codigo_unitrac', null),
  ])

  return (
    <div className="max-w-6xl">
      <div className="border-b border-border pb-5 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Catálogo de Lojas</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {total ?? 0} lojas ativas · {orfas ?? 0} órfãs (sem código Unitrac)
          </p>
        </div>
      </div>

      <LojasList />
    </div>
  )
}
