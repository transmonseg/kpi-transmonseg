'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { voltaSegura } from '@/lib/sessao-fetch'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')
  // Tela onde a sessão venceu (F3-11): depois de entrar, volta para ela.
  const volta = voltaSegura(String(formData.get('volta') ?? ''))
  const comVolta = volta ? '&volta=' + encodeURIComponent(volta) : ''

  if (!email || !senha) {
    redirect('/login?erro=' + encodeURIComponent('Preencha email e senha.') + comVolta)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  })

  if (error) {
    const msg =
      error.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos.'
        : error.message
    redirect('/login?erro=' + encodeURIComponent(msg) + comVolta)
  }

  // No app desktop, cai direto na tela que funciona offline (Gerar KPI). No site,
  // a tela onde a sessão venceu ou /painel.
  if (process.env.DESKTOP_APP === '1') redirect('/painel/kpi/simples')
  redirect(volta ?? '/painel')
}
