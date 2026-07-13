'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redeValida, type Perfil } from '@/lib/perfil'

async function perfilAtual(): Promise<{ userId: string; perfil: Perfil }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const perfil = await getPerfil(user.id)
  if (perfil.papel === 'visualizador') redirect('/painel')
  return { userId: user.id, perfil }
}

export async function criarConvite(formData: FormData) {
  const { userId, perfil } = await perfilAtual()

  const papelPedido = String(formData.get('papel') ?? 'visualizador')
  const redesPedidas = formData.getAll('redes').map(String).filter(redeValida)

  // Gerente só cria Visualizador, e só dentro das próprias redes — nunca confia no
  // que vier do form (poderia ser adulterado).
  const papel: 'gerente' | 'visualizador' =
    perfil.papel === 'gerente' ? 'visualizador' : (papelPedido === 'gerente' ? 'gerente' : 'visualizador')
  const redes = perfil.papel === 'gerente' ? redesPedidas.filter(r => perfil.redes.includes(r)) : redesPedidas

  if (redes.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma rede (dentro do seu próprio acesso).'))
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('convites')
    .insert({ papel, redes, criado_por: userId })
    .select('token')
    .single()

  if (error || !data) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent(error?.message ?? 'Erro ao gerar convite.'))
  }

  revalidatePath('/painel/usuarios')
  redirect(`/painel/usuarios?link=${data.token}`)
}

export async function revogarConvite(token: string) {
  const { userId, perfil } = await perfilAtual()
  const svc = createServiceClient()

  if (perfil.papel === 'gerente') {
    const { data: c } = await svc.from('convites').select('criado_por').eq('token', token).maybeSingle()
    if (!c || c.criado_por !== userId) redirect('/painel/usuarios?erro=' + encodeURIComponent('Sem permissão.'))
  }

  await svc.from('convites').delete().eq('token', token)
  revalidatePath('/painel/usuarios')
  redirect('/painel/usuarios')
}

export async function revogarAcesso(userIdAlvo: string) {
  const { userId, perfil } = await perfilAtual()
  const svc = createServiceClient()

  if (perfil.papel === 'gerente') {
    const { data: alvo } = await svc.from('perfis').select('criado_por').eq('user_id', userIdAlvo).maybeSingle()
    if (!alvo || alvo.criado_por !== userId) redirect('/painel/usuarios?erro=' + encodeURIComponent('Sem permissão.'))
  }

  await svc.auth.admin.deleteUser(userIdAlvo)
  revalidatePath('/painel/usuarios')
  redirect('/painel/usuarios')
}
