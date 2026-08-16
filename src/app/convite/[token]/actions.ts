'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { conviteExpirado } from '@/lib/perfil'

export async function resgatar(token: string, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const confirmar = String(formData.get('confirmar') ?? '')

  if (!email) redirect(`/convite/${token}?erro=` + encodeURIComponent('Informe um email.'))
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
  if (conviteExpirado(convite.expira_em as string | null)) {
    redirect('/login?erro=' + encodeURIComponent('Esse convite expirou. Peça um link novo.'))
  }

  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error || !created.user) {
    redirect(`/convite/${token}?erro=` + encodeURIComponent(error?.message ?? 'Erro ao criar a conta.'))
  }

  await svc.from('perfis').insert({
    user_id: created.user.id,
    email,
    papel: convite.papel,
    redes: convite.redes,
    meses: convite.meses,
    criado_por: convite.criado_por,
  })
  await svc.from('convites')
    .update({ usado_em: new Date().toISOString(), usado_por: created.user.id })
    .eq('token', token)

  // Quem resgata o convite pode já estar logado (o próprio admin/gerente testando
  // o link no mesmo navegador) — sem isso, o /login barra a entrada de volta pra
  // sessão antiga e a conta nova nunca é usada de verdade.
  const supabase = await createClient()
  await supabase.auth.signOut()

  redirect('/login?sucesso=' + encodeURIComponent('Conta criada! Entre com o email e a senha que você acabou de definir.'))
}
