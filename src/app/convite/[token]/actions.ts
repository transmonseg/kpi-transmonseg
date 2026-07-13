'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

export async function resgatar(token: string, formData: FormData) {
  const senha = String(formData.get('senha') ?? '')
  const confirmar = String(formData.get('confirmar') ?? '')

  if (senha.length < 6) {
    redirect(`/convite/${token}?erro=` + encodeURIComponent('Senha deve ter pelo menos 6 caracteres.'))
  }
  if (senha !== confirmar) {
    redirect(`/convite/${token}?erro=` + encodeURIComponent('As senhas não coincidem.'))
  }

  const svc = createServiceClient()
  const { data: convite } = await svc.from('convites').select('*').eq('token', token).maybeSingle()

  if (!convite) redirect('/login?erro=' + encodeURIComponent('Convite inválido.'))
  if (convite.usado_em) redirect('/login?erro=' + encodeURIComponent('Esse convite já foi usado.'))
  if (new Date(convite.expira_em as string) < new Date()) {
    redirect('/login?erro=' + encodeURIComponent('Esse convite expirou. Peça um link novo.'))
  }

  const { data: created, error } = await svc.auth.admin.createUser({
    email: convite.email as string,
    password: senha,
    email_confirm: true,
  })
  if (error || !created.user) {
    redirect(`/convite/${token}?erro=` + encodeURIComponent(error?.message ?? 'Erro ao criar a conta.'))
  }

  await svc.from('perfis').insert({
    user_id: created.user.id,
    email: convite.email,
    papel: convite.papel,
    redes: convite.redes,
    criado_por: convite.criado_por,
  })
  await svc.from('convites')
    .update({ usado_em: new Date().toISOString(), usado_por: created.user.id })
    .eq('token', token)

  redirect('/login?sucesso=' + encodeURIComponent('Conta criada! Entre com o email e a senha que você acabou de definir.'))
}
