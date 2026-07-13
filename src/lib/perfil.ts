import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'

export type Papel = 'admin' | 'gerente' | 'visualizador'
export type Perfil = { papel: Papel; redes: string[] }

// Sem linha em `perfis` fora do backfill inicial é estado defensivo (não deveria
// acontecer em uso normal — /cadastro fechado, toda conta nova nasce de um convite
// que já grava a linha junto). Trata como zero acesso, nunca como admin.
const SEM_ACESSO: Perfil = { papel: 'visualizador', redes: [] }

export async function getPerfil(userId: string): Promise<Perfil> {
  const svc = createServiceClient()
  const { data } = await svc.from('perfis').select('papel, redes').eq('user_id', userId).maybeSingle()
  if (!data) return SEM_ACESSO
  return { papel: data.papel as Papel, redes: (data.redes as string[] | null) ?? [] }
}

/** Redes efetivas de uma consulta: admin passa livre; gerente/visualizador só
 *  enxergam a interseção do que pediram com o que o perfil permite (pediu nada =
 *  "todas que o perfil permite", não todas as 18). Defesa em profundidade — não
 *  confia só no filtro client-side da tela. */
export function redesEfetivas(perfil: Perfil, redesPedidas: string[]): string[] {
  if (perfil.papel === 'admin') return redesPedidas
  if (redesPedidas.length === 0) return perfil.redes
  return redesPedidas.filter(r => perfil.redes.includes(r))
}

export function redeValida(r: string): r is (typeof REDES)[number] {
  return (REDES as readonly string[]).includes(r)
}
