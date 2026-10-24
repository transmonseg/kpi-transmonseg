'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { voltaSegura } from '@/lib/sessao-fetch'
import { destinoAposLogin } from '@/lib/destino-login'
import { getPerfil } from '@/lib/perfil'

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
  const { data, error } = await supabase.auth.signInWithPassword({
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
  // a tela onde a sessão venceu; sem ela, operador no Ao vivo (F3-12) e o resto no /painel.
  const desktop = process.env.DESKTOP_APP === '1'
  const perfil = !desktop && !volta && data.user ? await getPerfil(data.user.id) : null
  redirect(destinoAposLogin(perfil, volta, desktop))
}
