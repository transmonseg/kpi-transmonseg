'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function resgatar(slug: string, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const confirmar = String(formData.get('confirmar') ?? '')

  if (!email) redirect(`/acesso/${slug}?erro=` + encodeURIComponent('Informe um email.'))
  if (senha.length < 6) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent('Senha deve ter pelo menos 6 caracteres.'))
  }
  if (senha !== confirmar) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent('As senhas não coincidem.'))
  }

  const svc = createServiceClient()
  const { data: link } = await svc.from('links_acesso').select('*').eq('slug', slug).maybeSingle()

  if (!link) redirect('/login?erro=' + encodeURIComponent('Link de acesso inválido.'))
  if (!link.ativo) redirect('/login?erro=' + encodeURIComponent('Esse link não está mais disponível.'))

  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error || !created.user) {
    redirect(`/acesso/${slug}?erro=` + encodeURIComponent(error?.message ?? 'Erro ao criar a conta.'))
  }

  await svc.from('perfis').insert({
    user_id: created.user.id,
    email,
    papel: link.papel,
    redes: link.redes,
    meses: link.meses,
    criado_por: link.criado_por,
  })

  // Mesmo motivo do /convite: quem resgata pode já estar logado testando
  // no mesmo navegador — sem isso o /login barra a volta pra sessão antiga.
  const supabase = await createClient()
  await supabase.auth.signOut()

  redirect('/login?sucesso=' + encodeURIComponent('Conta criada! Entre com o email e a senha que você acabou de definir.'))
}
