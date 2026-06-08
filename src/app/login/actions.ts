'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')

  if (!email || !senha) {
    redirect('/login?erro=' + encodeURIComponent('Preencha email e senha.'))
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
    redirect('/login?erro=' + encodeURIComponent(msg))
  }

  // No app desktop, cai direto na tela que funciona offline (Gerar KPI). No site, /painel.
  redirect(process.env.DESKTOP_APP === '1' ? '/painel/kpi/simples' : '/painel')
}
