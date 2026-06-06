'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function cadastrar(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')

  if (!email || !senha) {
    redirect('/cadastro?erro=' + encodeURIComponent('Preencha email e senha.'))
  }
  if (senha.length < 6) {
    redirect(
      '/cadastro?erro=' +
        encodeURIComponent('Senha deve ter pelo menos 6 caracteres.')
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
  })

  if (error) {
    redirect('/cadastro?erro=' + encodeURIComponent(error.message))
  }

  if (data.session) {
    redirect('/painel')
  }

  redirect(
    '/cadastro?sucesso=' +
      encodeURIComponent(
        'Conta criada. Verifique seu email para confirmar o cadastro.'
      )
  )
}
