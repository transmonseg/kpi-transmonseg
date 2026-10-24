import { voltaSegura } from '@/lib/sessao-fetch'

// F3-12 (AC-07): para onde a pessoa vai depois de entrar.
// - App desktop: Gerar KPI (funciona offline), como sempre.
// - Tela onde a sessão venceu (?volta=, F3-11), se for caminho interno.
// - Operador com Nutry Max ou Rio Quality: direto no Ao vivo (a tela do dia dele).
// - Os demais: painel (Dashboard).
type PerfilMin = { papel: string; empresas: string[] }

export function destinoAposLogin(perfil: PerfilMin | null, volta: string | null | undefined, desktop: boolean): string {
  if (desktop) return '/painel/kpi/simples'
  const v = voltaSegura(volta)
  if (v) return v
  if (perfil?.papel === 'operador' && (perfil.empresas.includes('nutrimax') || perfil.empresas.includes('rioquality'))) {
    return '/painel/ao-vivo'
  }
  return '/painel'
}

/** Aviso discreto no envio do romaneio: a conta admin é compartilhada e o envio fica no nome dela. */
export function avisoContaAdmin(papel: string | null | undefined): string | null {
  return papel === 'admin'
    ? 'Você está na conta administrativa. O envio fica registrado no nome dela; a operação do dia vai melhor no seu login.'
    : null
}
