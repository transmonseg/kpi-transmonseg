import { createServiceClient } from '@/lib/supabase/service'
import { REDES } from '@/lib/kpi/redes'
import { EMPRESAS } from '@/lib/kpi/empresas'

export type Papel = 'admin' | 'gerente' | 'visualizador'
export type Perfil = { papel: Papel; redes: string[]; meses: string[]; empresas: string[] }

// Sem linha em `perfis` fora do backfill inicial é estado defensivo (não deveria
// acontecer em uso normal — /cadastro fechado, toda conta nova nasce de um convite
// que já grava a linha junto). Trata como zero acesso, nunca como admin.
const SEM_ACESSO: Perfil = { papel: 'visualizador', redes: [], meses: [], empresas: [] }

export async function getPerfil(userId: string): Promise<Perfil> {
  const svc = createServiceClient()
  const { data } = await svc.from('perfis').select('papel, redes, meses, empresas').eq('user_id', userId).maybeSingle()
  if (!data) return SEM_ACESSO
  return {
    papel: data.papel as Papel,
    redes: (data.redes as string[] | null) ?? [],
    meses: (data.meses as string[] | null) ?? [],
    empresas: (data.empresas as string[] | null) ?? [],
  }
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

/** Mês (YYYY-MM) liberado pro perfil: admin sempre pode; gerente/visualizador só
 *  se o mês estiver em perfil.meses. Sem catálogo fixo de meses (diferente de
 *  redes) — a liberação é feita mês a mês pelo admin em Logins ativos. */
export function mesLiberado(perfil: Perfil, mes: string): boolean {
  return perfil.papel === 'admin' || perfil.meses.includes(mes)
}

export function mesValido(m: string): boolean {
  return /^\d{4}-\d{2}$/.test(m)
}

export function empresaValida(e: string): e is (typeof EMPRESAS)[number] {
  return (EMPRESAS as readonly string[]).includes(e)
}

export function empresaLiberada(perfil: Perfil, empresa: string): boolean {
  return perfil.papel === 'admin' || perfil.empresas.includes(empresa)
}

/** null = convite sem prazo (nunca expira). Só é expirado se tiver uma
 *  data e ela já tiver passado. */
export function conviteExpirado(expiraEm: string | null): boolean {
  return expiraEm !== null && new Date(expiraEm) < new Date()
}
