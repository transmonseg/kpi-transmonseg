import { NextRequest, NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { parseEscala, dataImpressaEscala } from '@/lib/kpi-romaneio/parse-escala'
import { mensagemEscalaRecusada } from '@/lib/kpi-romaneio/validar-escala'
import { parseRomaneioComData } from '@/lib/kpi-romaneio/parse-romaneio'
import { parsePao } from '@/lib/kpi-romaneio/parse-pao'
import { guardarDiaAoVivo, calcularAoVivo } from '@/lib/kpi-romaneio/ao-vivo-servico'
import { parseEntregasCompletas } from '@/lib/kpi-rioquality/parse-planilhas'
import { enviarAoMonitoramento } from '@/lib/kpi-romaneio/enviar-monitoramento'
import { enviarRioQualityAoMonitoramento, linhasComCoordenadasRQ } from '@/lib/kpi-rioquality/enviar-monitoramento-rq'
import { mesclarEnvio, type DiaGuardado, type EnvioNovo } from '@/lib/kpi-romaneio/mesclar-envio'
import { createServiceClient } from '@/lib/supabase/service'
import { acessoAoVivo } from '../acesso'

export const runtime = 'nodejs'

// Romaneio do dia (manhã): lê os PDFs com os MESMOS leitores da geração
// normal, guarda só o que foi lido e dispara o primeiro cálculo em segundo
// plano (a resposta não espera os ~3 min do KPI).
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const a = await acessoAoVivo(String(form.get('cliente') ?? ''))
  if (!a.ok) return a.resp
  const data = hojeBR()
  // Rio Quality: um arquivo só, o Relatório de Entregas (xlsx) do dia.
  if (a.cliente === 'rioquality') {
    const arq = form.get('completo')
    if (!(arq instanceof File)) return new NextResponse('Envie o Relatório de Entregas (xlsx).', { status: 400 })
    let entregas: ReturnType<typeof parseEntregasCompletas>
    try { entregas = parseEntregasCompletas(Buffer.from(await arq.arrayBuffer())) } catch (err) {
      return new NextResponse(err instanceof Error ? err.message : 'Não consegui ler a planilha.', { status: 422 })
    }
    if (entregas.length === 0) return new NextResponse('Nenhuma entrega reconhecida — confira se é o Relatório de Entregas da Rio Quality (colunas Razão Social, Cidade, Placa, Endereço…).', { status: 422 })
    await guardarDiaAoVivo({ cliente: a.cliente, data, escala: [], romaneio: entregas, pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false, enviadoPor: a.email })
    void calcularAoVivo(a.cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
    // F2-04 (KRQ-03, AC-04): a planilha substitui a versão da Fusion também no
    // monitoramento (21/10: subida às 15:01, o mapa ficou o dia todo sem a RQ),
    // com o e-mail de quem subiu e a coordenada que o KPI já resolveu.
    const mon = await enviarRioQualityAoMonitoramento(data, await linhasComCoordenadasRQ(entregas), { enviadoPor: a.email })
    if (!mon.ok) console.error(`[kpi/ao-vivo] envio da RQ ao monitoramento falhou: ${mon.erro}`)
    return NextResponse.json({
      ok: true, nfs: entregas.length, placas: new Set(entregas.map(e => e.placaNorm)).size,
      monitoramento: [{ origem: 'romaneio' as const, ok: mon.ok, ...(mon.linhasDoDia != null ? { linhas: mon.linhasDoDia } : {}), ...(mon.erro ? { erro: mon.erro } : {}) }],
    })
  }
  const romaneioFile = form.get('romaneio')
  const escalaFile = form.get('escala')
  const paoFile = form.get('romaneioPao')
  // Mesclagem (08/10): so' o que veio troca; o resto do dia fica (ver mesclar-envio.ts).
  const svc = createServiceClient()
  const { data: ja } = await svc.from('kpi_ao_vivo_dia').select('romaneio, escala, pao, escala_enviada, pao_enviado').eq('cliente', a.cliente).eq('data', data).maybeSingle()
  const guardado: DiaGuardado | null = ja ? {
    romaneio: ja.romaneio as DiaGuardado['romaneio'], escala: (ja.escala as DiaGuardado['escala']) ?? [],
    pao: (ja.pao as DiaGuardado['pao']) ?? { linhas: [], escala: [] }, escalaEnviada: !!ja.escala_enviada, paoEnviado: !!ja.pao_enviado,
  } : null
  const escalaBuf = escalaFile instanceof File ? Buffer.from(await escalaFile.arrayBuffer()) : null
  const romaneioBuf = romaneioFile instanceof File ? Buffer.from(await romaneioFile.arrayBuffer()) : null
  const paoBuf = paoFile instanceof File ? Buffer.from(await paoFile.arrayBuffer()) : null
  let novo: EnvioNovo = {}
  try {
    const [escala, romaneioLido, pao] = await Promise.all([
      escalaBuf ? parseEscala(escalaBuf) : Promise.resolve(undefined),
      romaneioBuf ? parseRomaneioComData(romaneioBuf) : Promise.resolve(undefined),
      paoBuf ? parsePao(paoBuf, data) : Promise.resolve(undefined),
    ])
    // KP-03 (auditoria 15/10): romaneio de OUTRO dia nao vira o de hoje. Em
    // 11/10 (domingo) a copia do PDF de 10/10 gerou taxa oficial de 93% sobre
    // 359 de 2094 NFs. Sem data legivel no PDF continua aceito (nao bloqueia).
    if (romaneioLido?.data && romaneioLido.data !== data) {
      const br = (iso: string) => iso.split('-').reverse().join('/')
      return new NextResponse(`O Romaneio de Entrega enviado é do dia ${br(romaneioLido.data)}, mas hoje é ${br(data)}. Confira se subiu o arquivo certo.`, { status: 422 })
    }
    novo = { escala, romaneio: romaneioLido?.linhas, pao }
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : 'Não consegui ler os PDFs.', { status: 422 })
  }
  if (novo.romaneio && novo.romaneio.length === 0) {
    return new NextResponse('Nenhuma linha reconhecida no Romaneio de Entrega — confira se o PDF é o "Romaneio de Entrega" da Nutry Max.', { status: 422 })
  }
  const dia = mesclarEnvio(guardado, novo)
  if ('erro' in dia) {
    // F1-13 (ING-07): escala recusada -> 422 com a data impressa no PDF.
    if (dia.escalaRecusada) return new NextResponse(mensagemEscalaRecusada(dia.escalaRecusada, escalaBuf ? await dataImpressaEscala(escalaBuf) : null), { status: 422 })
    return new NextResponse(dia.erro, { status: 400 })
  }
  await guardarDiaAoVivo({ cliente: a.cliente, data, escala: dia.escala, romaneio: dia.romaneio, pao: dia.pao, escalaEnviada: dia.escalaEnviada, paoEnviado: dia.paoEnviado, enviadoPor: a.email })
  void calcularAoVivo(a.cliente, data, m => console.log(`[kpi/ao-vivo] ${m}`)).catch(err => console.error('[kpi/ao-vivo] calculo falhou:', err))
  // O que foi enviado agora vai pro Monitoramento -- a operação não sobe duas vezes.
  const monitoramento = await enviarAoMonitoramento([
    ...(romaneioBuf && romaneioFile instanceof File ? [{ buf: romaneioBuf, nome: romaneioFile.name || 'romaneio.pdf', origem: 'romaneio' as const }] : []),
    ...(paoBuf && paoFile instanceof File ? [{ buf: paoBuf, nome: paoFile.name || 'pao.pdf', origem: 'escala_pao' as const }] : []),
  ], a.email)
  for (const m of monitoramento) if (!m.ok) console.error(`[kpi/ao-vivo] envio ao monitoramento (${m.origem}) falhou: ${m.erro}`)
  const linhasDia = [...(dia.romaneio as { placa: string }[]), ...dia.pao.linhas]
  const nfs = linhasDia.length
  const placas = new Set(linhasDia.map(l => l.placa)).size
  return NextResponse.json({ ok: true, nfs, placas, monitoramento })
}
