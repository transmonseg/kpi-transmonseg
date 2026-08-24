import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPerfil, empresaLiberada } from '@/lib/perfil'
import { geocodificarEnderecos } from '@/lib/kpi-romaneio/geocode'
import { salvarGeracao } from '@/lib/kpi-romaneio/historico'
import { parseRomaneioPortefrio } from '@/lib/kpi-portefrio/parse-romaneio'
import { resolverIdVeiculo, buscarHistoricoVeiculo } from '@/lib/kpi-portefrio/ravex-api'
import { montarVisitas } from '@/lib/kpi-portefrio/visitas'
import { agregarPorCliente } from '@/lib/kpi-portefrio/agregacao'
import { gerarKpiPortefrioXlsx } from '@/lib/kpi-portefrio/gerador-xlsx'
import type { LinhaGeocodificada, LinhaKpiPortefrio } from '@/lib/kpi-portefrio/types'

export const runtime = 'nodejs'
export const maxDuration = 60

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    const arr = mapa.get(k)
    if (arr) arr.push(item)
    else mapa.set(k, [item])
  }
  return mapa
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Não autenticado', { status: 401 })

  const perfil = await getPerfil(user.id)
  if (perfil.papel !== 'admin' || !empresaLiberada(perfil, 'portefrio')) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }

  const form = await req.formData()
  const data = String(form.get('data') ?? '')
  const romaneioFile = form.get('romaneio')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return new NextResponse('Data inválida (YYYY-MM-DD)', { status: 400 })
  }
  if (!(romaneioFile instanceof File)) {
    return new NextResponse('Romaneio (PDF) obrigatório', { status: 400 })
  }

  const romaneioBuf = Buffer.from(await romaneioFile.arrayBuffer())
  const romaneio = await parseRomaneioPortefrio(romaneioBuf)

  if (romaneio.length === 0) {
    return new NextResponse(
      'Nenhuma linha reconhecida no romaneio — confira se o PDF é o romaneio da Portefrio.',
      { status: 422 },
    )
  }

  const enderecosUnicos = [...new Set(romaneio.map(l => `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`))]
  const resultadosGeo = await geocodificarEnderecos(enderecosUnicos)
  const geoPorEndereco = new Map(enderecosUnicos.map((e, i) => [e, resultadosGeo[i]]))

  const romaneioGeo: LinhaGeocodificada[] = romaneio.map(l => {
    const chave = `${l.endereco}, ${l.numero} - ${l.bairro}, ${l.cidade} - ${l.uf}`
    const g = geoPorEndereco.get(chave) ?? null
    return { ...l, lat: g?.lat ?? null, lng: g?.lng ?? null }
  })

  const linhasPorPlaca = agrupar(romaneioGeo, l => l.placa)

  // Auth Ravex acontece via obterTokenRavex, chamado dentro de
  // resolverIdVeiculo/buscarHistoricoVeiculo -- se a credencial estiver
  // quebrada, a chamada abaixo lanca e a geracao inteira falha com 500
  // (nunca fail-open pra autenticacao, ver Global Constraints do plano).
  const inicioDoDia = Math.floor(new Date(`${data}T00:00:00-03:00`).getTime() / 1000)
  const fimDoDia = Math.floor(new Date(`${data}T23:59:59-03:00`).getTime() / 1000)

  const linhasKpi: LinhaKpiPortefrio[] = []
  try {
    for (const [placa, linhasDaPlaca] of linhasPorPlaca) {
      const idVeiculo = await resolverIdVeiculo(placa)
      const eventos = idVeiculo ? await buscarHistoricoVeiculo(idVeiculo, inicioDoDia, fimDoDia) : []
      const clientesParaVisita = linhasDaPlaca.map(l => ({ codigoCliente: l.codigoCliente, lat: l.lat, lng: l.lng }))
      const visitas = montarVisitas(eventos, clientesParaVisita)

      const linhasOrdenadas = [...linhasDaPlaca].sort((a, b) => a.ordem - b.ordem)
      // ordemReal = posicao do cliente na sequencia de visitas confirmadas,
      // ordenadas por horario de chegada real (nao pela ordem planejada).
      const visitasOrdenadas = [...visitas.values()].sort((a, b) => new Date(a.chegada).getTime() - new Date(b.chegada).getTime())
      const ordemRealPorCliente = new Map(visitasOrdenadas.map((v, i) => [v.codigoCliente, i + 1]))

      for (const linha of linhasOrdenadas) {
        const visita = visitas.get(linha.codigoCliente)
        const ordemReal = ordemRealPorCliente.get(linha.codigoCliente) ?? null
        linhasKpi.push(agregarPorCliente(linha, visita, ordemReal))
      }
    }
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : 'Erro ao consultar a Ravex.',
      { status: 500 },
    )
  }

  const xlsxBuf = await gerarKpiPortefrioXlsx(linhasKpi, data)

  try {
    await salvarGeracao({
      cliente: 'portefrio',
      dataReferencia: data,
      geradoPor: user.email ?? null,
      qtdCargas: linhasKpi.length,
      arquivoStoragePath: null,
    })
  } catch (err) {
    console.error('Erro ao salvar histórico de geração:', err)
  }

  return new NextResponse(xlsxBuf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="KPI-Portefrio-${data}.xlsx"`,
    },
  })
}
