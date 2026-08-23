'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPerfil, redeValida, mesValido, empresaValida, type Perfil } from '@/lib/perfil'

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
  const mesesPedidos = formData.getAll('meses').map(String).filter(mesValido)
  const empresasPedidas = formData.getAll('empresas').map(String).filter(empresaValida)

  // Gerente só cria Visualizador, e só dentro das próprias redes/meses/empresas —
  // nunca confia no que vier do form (poderia ser adulterado).
  const papel: 'gerente' | 'visualizador' =
    perfil.papel === 'gerente' ? 'visualizador' : (papelPedido === 'gerente' ? 'gerente' : 'visualizador')
  const redes = perfil.papel === 'gerente' ? redesPedidas.filter(r => perfil.redes.includes(r)) : redesPedidas
  const meses = perfil.papel === 'gerente' ? mesesPedidos.filter(m => perfil.meses.includes(m)) : mesesPedidos
  const empresas = perfil.papel === 'gerente' ? empresasPedidas.filter(e => perfil.empresas.includes(e)) : empresasPedidas

  if (empresas.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma empresa.'))
  }
  if (empresas.includes('benassi') && redes.length === 0) {
    redirect('/painel/usuarios?erro=' + encodeURIComponent('Escolha ao menos uma rede da Benassi (dentro do seu próprio acesso).'))
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('convites')
    .insert({ papel, redes, meses, empresas, criado_por: userId })
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

export async function atualizarMeses(userIdAlvo: string, formData: FormData) {
  const { userId, perfil } = await perfilAtual()
  const svc = createServiceClient()

  if (perfil.papel === 'gerente') {
    const { data: alvo } = await svc.from('perfis').select('criado_por').eq('user_id', userIdAlvo).maybeSingle()
    if (!alvo || alvo.criado_por !== userId) redirect('/painel/usuarios?erro=' + encodeURIComponent('Sem permissão.'))
  }

  const mesesPedidos = formData.getAll('meses').map(String).filter(mesValido)
  // Mesma regra do convite: gerente só libera meses dentro do próprio acesso.
  const meses = perfil.papel === 'gerente' ? mesesPedidos.filter(m => perfil.meses.includes(m)) : mesesPedidos

  await svc.from('perfis').update({ meses }).eq('user_id', userIdAlvo)
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
