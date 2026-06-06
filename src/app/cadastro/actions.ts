'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Allowlist de cadastro: só emails do domínio da empresa (ou emails explícitos)
// podem criar conta. Sem isso, qualquer um se registrava e — com o RLS
// permissivo (authenticated → tudo) — via/alterava todos os dados do cliente.
// Configurável por env; default = domínio da TRANSMONSEG.
// OBS: isto protege o fluxo da tela. O lock definitivo é desligar "Allow new
// users to sign up" no painel do Supabase (Auth), senão dá pra chamar a API direto.
const DOMINIOS_PERMITIDOS = (process.env.ALLOWED_SIGNUP_DOMAINS ?? 'transmonseg.com.br')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const EMAILS_PERMITIDOS = (process.env.ALLOWED_SIGNUP_EMAILS ?? '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

function cadastroPermitido(email: string): boolean {
  const e = email.toLowerCase()
  if (EMAILS_PERMITIDOS.includes(e)) return true
  const dominio = e.split('@')[1] ?? ''
  return DOMINIOS_PERMITIDOS.includes(dominio)
}

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
  if (!cadastroPermitido(email)) {
    redirect(
      '/cadastro?erro=' +
        encodeURIComponent('Cadastro restrito à equipe autorizada. Peça acesso ao administrador.')
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
