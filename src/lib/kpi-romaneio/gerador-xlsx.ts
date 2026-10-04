import ExcelJS from 'exceljs'
import { OBS_NAO_SAIU_DA_BASE, textoConsultaPosicoesSuspeita, chegadaCdExibivel } from './types'
import type { TrocaProvavel } from './troca-placa'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, ResolucaoNf } from './types'
// Reusa a MESMA paleta/fonte/logo ja validados no relatorio da Benassi
// (pedido do usuario 25/08: "deixar esse relatorio nivel o da Benassi") --
// nunca duplica cor/asset, um unico lugar de verdade pros dois clientes.
import { KPI_COLORS, KPI_FONTS, KPI_BORDER_THIN } from '@/lib/kpi/kpi-styles'
import { getLogoBuffer } from '@/lib/kpi/template-loader'
import { hojeBR } from '@/lib/data-br'

// STATUS (OK/INCOMPLETO) removido da tela principal (pedido do usuario
// 25/08: "tira esse status de concluido ou incompleto") -- o campo `status`
// continua calculado em LinhaKpiRomaneio (agregacao.ts), so nao aparece
// mais aqui.
// Task 9 (plano 24/09, achado da Ana: "PARADAS REAIS" contava NF confirmada,
// não parada física -- confundiu a operação, "KPI 3 x relatório 4").
// "PARADAS REAIS" -> "NF CONFIRMADAS" (mesmo valor, `paradasReais` no
// código -- nome do campo mantido de propósito, ver comentário em
// types.ts) + nova coluna "PARADAS FORA DA BASE" logo depois, com a
// contagem de paradas FÍSICAS (`paradasForaBase`).
export const COLUNAS_KPI_ROMANEIO = [
  'CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)',
  'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'NF CONFIRMADAS', 'PARADAS FORA DA BASE', 'KM PERCORRIDO',
  'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'TEMPO MÉDIO POR ENTREGA',
] as const

// Achado real 27/08 (Tia Erica, audio no privado -- "na capa interna acho
// que não seria necessário, porque fica muito repetitivo... eu não sei
// também se eu deixo aqui a chegada na loja [base], porque fica muita
// coluna repetida"): MOTORISTA/COD/PLACA/SAÍDA DA BASE/CHEGADA NA
// BASE/TEMPO DE OPERAÇÃO sao valores por VEICULO/dia -- repetem o
// EXATO mesmo texto em toda linha da aba (a aba ja e' so' dessa placa, e
// esses 4 primeiros ja aparecem na linha de resumo acima da tabela, ver
// escreverResumoPlaca). Removidos daqui -- ficam so' uma vez, no resumo.
// Mantido o que varia por ENTREGA de verdade: carga, NF, cliente,
// endereco, chegada/saida na loja, tempo na loja, status. Ordem
// confirmada no mesmo audio ("vou deixar apenas a tabela com o endereço,
// chegar na loja, sair da loja e tempo na loja e a nota fiscal").
// Ajuste de layout (pedido do usuario, 26/09): volta ao layout original
// (ver be2739f, antes da Task 4/5 de 24/09 e do rodizio/MOTIVO-CONFIANÇA de
// 26/09) -- 8 colunas fixas, STATUS (nao "STATUS AUTOMÁTICO"). EVIDÊNCIA,
// DIST. PARADA (m), PLACA EXECUTORA, MOTIVO e CONFIANÇA saem do xlsx (pros
// dois clientes, Nutry Max E Rio Quality) -- os campos continuam SEMPRE
// calculados em LinhaDetalheEntrega (agregacao.ts), so' pararam de virar
// coluna.
export const COLUNAS_DETALHE_PLACA = [
  'CARGA', 'NF', 'CLIENTE', 'ENDEREÇO',
  'CHEGADA NA LOJA', 'SAÍDA DA LOJA', 'TEMPO NA LOJA', 'STATUS',
] as const

// Task 4 (plano 24/09, requisito P0 da Ana: "persistir status automático
// ORIGINAL, resolução manual, responsável..."): duas colunas com o que a
// operação registrou por cima (resolucoes.ts/aplicarResolucoes). Ajuste
// 26/09 (pedido do usuario): deixaram de ser sempre presentes -- so' entram
// no header (e em TODAS as abas do dia, pra manter o mesmo cabecalho em
// qualquer placa) quando pelo menos uma NF do dia tem resolucaoManual
// registrada; NF sem resolução manual = célula vazia nas duas colunas
// quando elas existem.
export const COLUNAS_RESOLUCAO = ['RESOLUÇÃO OPERAÇÃO', 'RESPONSÁVEL'] as const

export const COLUNAS_AVISOS = ['CARGA', 'PLACA', 'PROBLEMA'] as const

const LABEL_MOTIVO: Record<AvisoDescasamento['motivo'], string> = {
  sem_romaneio: 'sem romaneio',
  sem_escala: 'sem escala',
  nf_divergente: 'NFs da Escala diferentes do Romaneio',
  consulta_posicoes_suspeita: 'Consulta de posições suspeita — não concluído',
  consulta_unitrac_falhou: 'Consulta ao rastreador falhou — placa não concluída, conferir',
  rq_sem_rota_custos: 'Placa sem rota no Relatório de Custos',
  rq_rota_sem_entregas: 'Rota sem nenhuma entrega no Relatório de Entregas',
  ponte_falhou: 'Monitoramento não respondeu — gere novamente',
  rq_relatorio_sem_checkin: 'Relatório de Entregas sem nenhum check-in — gere com o relatório completo do dia',
  rq_placa_sem_cv: 'Placa sem CV — rode descobrir-cv (scripts/descobrir-cv-rq.ts) e confira a frota',
  rq_sem_snapshot: 'Sem dado do snapshot de paradas — consulta ao rastreador falhou, conferir',
  geocode_parcial: 'Geocode parcial — gere novamente',
  motorista_multiplas_placas: 'Motorista em múltiplas placas',
  carga_multiregiao: 'Carga com NFs em regiões distantes',
}

// Task 2 (plano 2026-09-30, item 2): "Escala X × Romaneio Y (Z NFs a
// menos/mais no romaneio)" -- so' texto, nao mexe em taxa nem denominador.
function textoDiferencaNf(nfEscala: number, nfRomaneio: number): string {
  const diff = nfEscala - nfRomaneio
  const n = Math.abs(diff)
  return `${n} NF${n === 1 ? '' : 's'} a ${diff > 0 ? 'menos' : 'mais'} no romaneio`
}
function textoAviso(a: AvisoDescasamento): string {
  if (a.motivo === 'ponte_falhou') {
    return `Monitoramento não respondeu para ${a.placasSemPonte ?? '?'} placa(s) mesmo após novas tentativas — entregas dessas placas podem estar faltando. Gere novamente`
  }
  if (a.motivo === 'rq_relatorio_sem_checkin') {
    return `Relatório de Entregas com ${a.placasNoArquivo ?? '?'} placa(s) e nenhum check-in — provavelmente exportado antes do fim do dia ou filtrado; a taxa sai errada. Gere de novo com o relatório completo do dia (modelo combinado)`
  }
  if (a.motivo === 'nf_divergente' && a.nfEscala != null && a.nfRomaneio != null) {
    return `NFs: Escala ${a.nfEscala} × Romaneio ${a.nfRomaneio} (${textoDiferencaNf(a.nfEscala, a.nfRomaneio)})`
  }
  if (a.motivo === 'consulta_posicoes_suspeita' && a.semSinal != null && a.totalPlacas != null) {
    return textoConsultaPosicoesSuspeita(a.semSinal, a.totalPlacas)
  }
  if (a.motivo === 'rq_sem_snapshot' && a.placasSemSnapshot != null) {
    const n = a.placasSemSnapshot
    return `Sem dado do snapshot para ${n} placa${n === 1 ? '' : 's'} — consulta ao rastreador falhou, fora da taxa, conferir`
  }
  if (a.motivo === 'geocode_parcial' && a.enderecosParciais != null) {
    const n = a.enderecosParciais
    return `Geocode parcial: ${n} endereço${n === 1 ? '' : 's'} sem a busca completa (banco sobrecarregado) — gere novamente`
  }
  if (a.motivo === 'motorista_multiplas_placas' && a.motorista && a.placas) {
    return `MOTORISTA EM MÚLTIPLAS PLACAS: ${a.motorista} aparece nas placas ${a.placas.join(', ')} — conferir escala`
  }
  if (a.motivo === 'carga_multiregiao' && a.distanciaKm != null) {
    return `CARGA COM NFs EM REGIÕES DISTANTES: carga ${a.carga} tem entregas separadas por ${a.distanciaKm} km — conferir rota`
  }
  return LABEL_MOTIVO[a.motivo]
}
function notaAvisoNfDivergente(avisos: AvisoDescasamento[]): string {
  const div = avisos.filter(a => a.motivo === 'nf_divergente' && a.nfEscala != null && a.nfRomaneio != null)
  if (div.length === 0) return ''
  const escalaTotal = div.reduce((s, a) => s + (a.nfEscala as number), 0)
  const romaneioTotal = div.reduce((s, a) => s + (a.nfRomaneio as number), 0)
  const cargas = `${div.length} carga${div.length === 1 ? '' : 's'}`
  return `    |    AVISO: ${cargas} com NFs da Escala ≠ Romaneio (Escala ${formatarInteiroPtBr(escalaTotal)} × Romaneio ${formatarInteiroPtBr(romaneioTotal)}; ${textoDiferencaNf(escalaTotal, romaneioTotal)}${escalaTotal > romaneioTotal ? ', fora da conta' : ''}) — ver aba Avisos`
}

// Pedido do usuario (grupo KPI AJUSTES, 22/09): "tirar da nossa kpi as
// informacoes com nome da unitrac e gps" -- o cliente nao deve ver o nome
// das ferramentas internas de confirmacao. confirmado_unitrac e
// confirmado_gps continuam distintos no motor (StatusEntrega, calculo de
// taxa) -- so' o rotulo exibido no xlsx virou o mesmo "ENTREGUE" pros dois.
const LABEL_STATUS_ENTREGA: Record<StatusEntrega, string> = {
  confirmado_unitrac: 'ENTREGUE',
  confirmado_gps: 'ENTREGUE',
  // Pedido do usuario 05/09: "PENDENTE" soa como "o motorista nao entregou",
  // quando na maioria dos casos e' o nosso lado que nao conseguiu confirmar
  // (geocodificacao, raio, rastreador). O rotulo generico fica neutro; quando
  // ha evidencia de GPS, a observacao de agregacao.ts diz o que aconteceu
  // ("PASSOU NO ENDERECO MAS NAO REGISTROU PARADA", "NAO FOI AO CLIENTE").
  pendente: 'SEM CONFIRMAÇÃO',
}

// Paleta/fonte de KPI_COLORS/KPI_FONTS (kpi-styles.ts) -- mesmo "nivel"
// visual do relatorio da Benassi: titulo branco em negrito sobre azul-
// marinho da marca, cabecalho de coluna em azul mais claro com texto
// branco, Calibri em vez da fonte padrao do Excel.
const COR_TITULO_FUNDO = KPI_COLORS.BRAND_BLUE
const COR_TITULO_TEXTO = KPI_COLORS.HEADER_TEXT
const COR_HEADER_FUNDO = KPI_COLORS.BRAND_BLUE_LIGHT
const COR_HEADER_TEXTO = KPI_COLORS.HEADER_TEXT
const FONTE = KPI_FONTS.BODY.name

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** "2026-08-24" -> "Segunda-feira, 24 de Agosto de 2026" -- mesmo estilo do
 *  banner de título da amostra de referência. Usa meio-dia UTC pra nunca
 *  cruzar fronteira de dia por fuso (a data já vem como "hoje" no calendário
 *  BRT, não precisa de conversão de fuso aqui). */
function formatarTituloData(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12))
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${String(dia).padStart(2, '0')} de ${MESES[mes - 1]} de ${ano}`
}

// Achado real 25/08 (dado real da Nutry Max, reclamação "horários errados,
// tudo errado"): todo horário que chega aqui (saidaCd/chegadaCd de
// agregacao.ts, chegada/saida de Visita em visitas.ts) tem origem em
// consolidaParadasApi (unitrac-api/consolida.ts), cujo comentário já
// documenta que `_data` "já vem em BRT mascarado como UTC" -- os dígitos do
// ISO já SÃO o horário de Brasília certo, só com sufixo 'Z' mentiroso.
// Formatar com `timeZone: 'America/Sao_Paulo'` aplicava uma SEGUNDA
// conversão de fuso em cima de um valor que já não precisava de nenhuma --
// todo horário exibido no KPI saía 3h ATRASADO do real (mesmo problema que
// formatarTituloData já evita, comentário dela mesma acima). Fix: ler os
// dígitos como UTC (sem conversão), igual o resto do arquivo já faz.
function formatarHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
}

// Pedido do usuario 25/08 ("nada mais no quesito informacoes?" -> nivel
// Benassi): celula de horario vazia sempre teve UM motivo real (sem
// rastreador, dia ainda em andamento, ou de fato nunca aconteceu) -- em vez
// de deixar em branco toda vez (o que gerou a reclamacao "praticamente tudo
// branco"), mostra o motivo quando ele e' conhecido. `null` = nenhum motivo
// conhecido, fica em branco mesmo (nunca inventa).
// Achado real 15/09 (grupo KPI AJUSTES): `data === hoje` sozinho confundia
// "o DIA CALENDÁRIO é hoje" com "ESTA LINHA ainda está em andamento" -- uma
// placa que já voltou pra base (ou uma NF já julgada com veredito final,
// tipo "PASSOU NO ENDEREÇO...CONFERIR") no MEIO do dia de hoje continuava
// mostrando "EM ROTA" na célula de horário, contradizendo o STATUS final ao
// lado ("CONFERIR" já é um veredito, não uma espera). `aindaEmAndamento`
// substitui a comparação de data: cada chamador decide o que "em andamento"
// significa pra aquela coluna (resumo por placa: `chegadaCd` nulo E dia de
// hoje; detalhe por NF: a própria linha caiu no ramo AGUARDANDO).
function motivoAusencia(temRastreador: boolean, aindaEmAndamento: boolean): string | null {
  // "SEM CADASTRO", nao "SEM RASTREADOR": a placa pode ter rastreador e faltar
  // o CV no nosso banco (Rio Quality, 05/09: portal lista ~102 veiculos, nos
  // cadastramos 59). Nao afirmar sobre o veiculo o que e' falha nossa.
  if (!temRastreador) return 'SEM CADASTRO'
  if (aindaEmAndamento) return 'EM ROTA'
  return null
}

// Envolve formatarHora: quando o horario e' null, tenta explicar o motivo
// em vez de deixar a celula muda.
function celulaHora(iso: string | null, temRastreador: boolean, aindaEmAndamento: boolean): string {
  const hora = formatarHora(iso)
  if (hora) return hora
  return motivoAusencia(temRastreador, aindaEmAndamento) ?? ''
}

// STATUS da entrega: observacao concreta (troca de carro/tempo excessivo,
// ver agregacao.ts) e' sempre mais informativa que o rotulo generico.
//
// Bug real 26/09 (segunda rodada, achado da Ana): `status !== 'pendente'`
// e' SEMPRE fato positivo (Unitrac ou GPS confirmaram independentemente) --
// nenhuma observacao pode fazer o STATUS exibido deixar de comecar com
// "ENTREGUE" (trava exigida: nº de linhas com STATUS iniciando em
// "ENTREGUE" == soma de NF CONFIRMADAS do resumo == numerador da TAXA).
// "TEMPO EM LOJA ACIMA DE 4H" e' o unico rotulo que por design continua
// sendo anexado a uma NF JA CONFIRMADA (sinal de dado suspeito que vale a
// pena conferir mesmo confirmada, ver LIMITE_TEMPO_LOJA_MIN em
// agregacao.ts) -- vira ressalva com prefixo, nunca esconde o ENTREGUE. Os
// outros rotulos residuais que hoje coexistem com confirmado (ex.
// "ENTREGUE POR OUTRA PLACA...") ja' comecam com "ENTREGUE" por conta
// propria; qualquer outro texto que algum dia colar num status confirmado
// (defesa, nao esperado -- agregacao.ts guarda status==='pendente' antes de
// anexar qualquer rotulo de ressalva que nao seja este) ganha o mesmo
// prefixo generico, nunca aparece sozinho.
function textoStatus(d: LinhaDetalheEntrega): string {
  if (d.status !== 'pendente') {
    if (d.observacao == null || d.observacao.startsWith('ENTREGUE')) return d.observacao ?? LABEL_STATUS_ENTREGA[d.status]
    if (d.observacao.startsWith('TEMPO EM LOJA ACIMA DE 4H')) return 'ENTREGUE - TEMPO EM LOJA ACIMA DE 4H'
    return `ENTREGUE - ${d.observacao}`
  }
  // Placa sem CV (codigo de rastreador) no nosso cadastro nunca vai
  // confirmar -- e "SEM CONFIRMACAO" escondia o motivo (achado 05/09: 1294
  // das 3062 entregas da Rio Quality caiam nesse balde). Mas o texto NAO
  // pode afirmar que o veiculo nao tem rastreador: no caso da Rio Quality o
  // portal lista ~102 veiculos e nos so' cadastramos 59, entao a maioria
  // dessas placas provavelmente TEM rastreador e o buraco e' nosso. O rotulo
  // diz o que sabemos de verdade: falta o codigo no cadastro.
  // Task 2 (item 3): carga sem placa nunca e' rotulada "sem rastreador".
  if (ehCargaSemPlaca(d) && (d.observacao == null || d.observacao.startsWith(PREFIXO_OBS_SEM_RASTREADOR))) return ROTULO_CARGA_SEM_PLACA
  if (d.observacao) return d.observacao
  if (!d.temRastreador) return 'PLACA SEM RASTREADOR CADASTRADO - COMPLETAR FROTA'
  return LABEL_STATUS_ENTREGA[d.status]
}

// Task 1 (plano 24/09, pedido da Ana 23/09): NF cuja observacao e' "sem
// rastreador" (placa sem cv NENHUM, ou cv cadastrado mas zero posicoes o dia
// INTEIRO ja encerrado -- ver agregacao.ts/semRastreadorNoDia) sai do
// NUMERADOR e do DENOMINADOR da taxa de confirmacao -- caso contrario ela
// conta como "falha" e derruba a taxa por um problema de EQUIPAMENTO/
// CADASTRO, nao de entrega. A contagem aparece a parte ("NFs sem
// rastreador: N") pra nao esconder o problema, so' tira ele do calculo da
// taxa. Opera sobre `detalhe` (uma linha por NF), nao `linhas` (por carga).
const PREFIXO_OBS_SEM_RASTREADOR = 'SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO'
const ROTULO_CARGA_SEM_PLACA = 'CARGA SEM PLACA - NÃO CONTABILIZADO'

// Task 4 (plano 24/09): rotulo exibido pra cada valor do enum de resolucao
// manual (kpi_nf_resolucao.resolucao) -- MAIUSCULO, mesmo padrao visivel do
// resto do relatorio (Global Constraint do plano). `entregue_outra_placa`
// ganha a placa executora ao lado (ver COLUNA_RESOLUCAO abaixo) porque o
// texto sozinho nao diz QUAL placa entregou de fato.
const LABEL_RESOLUCAO_NF: Record<ResolucaoNf, string> = {
  entregue: 'ENTREGUE',
  entregue_tempo_conferido: 'ENTREGUE - TEMPO DE LOJA CONFERIDO',
  entregue_rastro_oscilante: 'ENTREGUE - RASTRO OSCILANTE',
  entregue_outra_placa: 'ENTREGUE POR OUTRA PLACA',
  nao_esteve_no_local: 'NÃO ESTEVE NO LOCAL',
  desatualizado: 'DESATUALIZADO',
}

// Resolucoes que a operacao registra como "de fato aconteceu" -- contam pra
// taxa "apos conferencia da operacao" mesmo quando o automatico ficou
// pendente. `nao_esteve_no_local`/`desatualizado` NUNCA contam (mesmo se o
// automatico tivesse confirmado por engano -- a palavra da operacao vale
// mais que o GPS/Unitrac nesses dois casos).
const RESOLUCOES_CONFIRMATORIAS = new Set<ResolucaoNf>([
  'entregue', 'entregue_tempo_conferido', 'entregue_rastro_oscilante', 'entregue_outra_placa',
])

function textoResolucaoManual(d: LinhaDetalheEntrega): string {
  if (!d.resolucaoManual) return ''
  const base = LABEL_RESOLUCAO_NF[d.resolucaoManual]
  return d.resolucaoManual === 'entregue_outra_placa' && d.placaExecutoraResolucao
    ? `${base} (${d.placaExecutoraResolucao})`
    : base
}

// Task 4: "após conferência da operação" NUNCA muda o automático (Global
// Constraint: "Resolução manual NUNCA é sobrescrita por regeração;
// automático original sempre preservado") -- e' uma segunda leitura, feita
// so' pro resumo do dia. NF sem resolucao manual continua usando o
// automatico puro.
function confirmadaAposConferencia(d: LinhaDetalheEntrega): boolean {
  if (d.resolucaoManual) return RESOLUCOES_CONFIRMATORIAS.has(d.resolucaoManual)
  return d.status !== 'pendente'
}

// Revisao final pre-deploy (24/09, item 2): excluir so' a NF PENDENTE com
// o rotulo SEM RASTREADOR enviesava a taxa -- as NFs da MESMA placa sem
// rastreador que confirmaram (ex. alvo feito da Unitrac) ficavam no
// denominador E no numerador, entao a placa so' "contava" quando dava
// certo. Placa com temRastreador=false no dia -> TODAS as NFs dela saem do
// denominador, EXCETO as confirmadas por OUTRA placa (`evidencia ===
// 'outra_placa'`: evidencia independente do rastreador desta placa, conta
// normalmente). O prefixo continua cobrindo o caso (b) de
// semRastreadorNoDia (tem CV mas zero posicoes no dia, temRastreador=true).
// Task 2 (plano 2026-09-30, item 3 -- PAO-11 29/09): carga SEM PLACA no
// documento (romaneio do pao com CARRO em branco/"-") nao e' veiculo sem
// rastreador -- nao ha' veiculo identificado. Categoria propria, fora da
// taxa (num e denom), contada a parte no rodape.
function ehCargaSemPlaca(d: LinhaDetalheEntrega): boolean {
  return d.placa === ''
}

function ehSemRastreador(d: LinhaDetalheEntrega): boolean {
  if (ehCargaSemPlaca(d)) return false
  if (d.observacao?.startsWith(PREFIXO_OBS_SEM_RASTREADOR)) return true
  return d.temRastreador === false && d.evidencia !== 'outra_placa' && d.evidencia !== 'rota_outra_placa'
}

// 29/09 (pedido Ana/dono, Nutry Max): NF de placa que nao saiu da base o dia
// todo ('VEÍCULO NÃO SAIU DA BASE') sai da taxa como a sem rastreador (num e
// denom); com resolucao manual conta pela resolucao (ver
// entraNoDenominadorPosConferencia). Sem rastreador prevalece na contagem.
function ehNaoSaiuDaBase(d: LinhaDetalheEntrega): boolean {
  return (d.observacao?.startsWith(OBS_NAO_SAIU_DA_BASE) ?? false) && !ehSemRastreador(d) && !ehCargaSemPlaca(d)
}

// Auditoria Ana 02/10 (RQO1B27 01/10, "SUBSTITUICAO NAO INFORMADA, VEICULO
// EM OFICINA"): a placa da escala nao passou em NENHUM cliente e outra placa
// fez a carga -- falha de associacao escala/carga, nao de entrega. Sai da
// taxa (num e denom) como a sem rastreador, contada a parte; com resolucao
// manual conta pela resolucao. Nunca confirma a NF (so' separa).
// Medicao 25/09: o rotulo aparece em NFs soltas de cargas que rodaram
// normalmente (93 NFs) -- so' sai da taxa a carga+placa em que TODAS as NFs
// tem o rotulo (a placa da escala nao passou em cliente nenhum = troca de
// veiculo); NF solta continua contando como falha.
const PREFIXO_OBS_ESCALA_DIVERGENTE = 'PLACA DA ESCALA NÃO PASSOU NO CLIENTE'
function temRotuloEscalaDivergente(d: LinhaDetalheEntrega): boolean {
  return d.status === 'pendente'
    && (d.observacao?.startsWith(PREFIXO_OBS_ESCALA_DIVERGENTE) ?? false)
    && !ehSemRastreador(d) && !ehCargaSemPlaca(d) && !ehNaoSaiuDaBase(d)
}
export function cargasEscalaDivergenteInteira(detalhe: LinhaDetalheEntrega[]): Set<string> {
  const total = new Map<string, number>()
  const comRotulo = new Map<string, number>()
  for (const d of detalhe) {
    const chave = `${d.carga}::${d.placa}`
    total.set(chave, (total.get(chave) ?? 0) + 1)
    if (temRotuloEscalaDivergente(d)) comRotulo.set(chave, (comRotulo.get(chave) ?? 0) + 1)
  }
  return new Set([...comRotulo].filter(([k, n]) => n === total.get(k)).map(([k]) => k))
}
function ehEscalaDivergente(d: LinhaDetalheEntrega, inteiras: Set<string>): boolean {
  return temRotuloEscalaDivergente(d) && inteiras.has(`${d.carga}::${d.placa}`)
}

function avisosDeFrota(detalhe: LinhaDetalheEntrega[], trocas: Map<string, TrocaProvavel> = new Map()): { carga: string; placa: string; texto: string }[] {
  const inteiras = cargasEscalaDivergenteInteira(detalhe)
  const grupos = new Map<string, { carga: string; placa: string; semRastreador: number; escalaDivergente: number; foraDaFrota: boolean }>()
  for (const d of detalhe) {
    if (ehCargaSemPlaca(d)) continue
    const semRastreador = ehSemRastreador(d)
    const escalaDivergente = ehEscalaDivergente(d, inteiras)
    if (!semRastreador && !escalaDivergente) continue
    const chave = `${d.carga}::${d.placa}`
    const g = grupos.get(chave) ?? { carga: d.carga, placa: d.placa, semRastreador: 0, escalaDivergente: 0, foraDaFrota: false }
    // temRastreador=false = placa sem CV na frota rastreada (LLD4202 02/10:
    // placa provisoria que o Nelson poe quando ainda nao sabe o carro).
    if (semRastreador && d.temRastreador === false) g.foraDaFrota = true
    if (semRastreador) g.semRastreador++
    else g.escalaDivergente++
    grupos.set(chave, g)
  }
  const out: { carga: string; placa: string; texto: string }[] = []
  for (const g of grupos.values()) {
    if (g.semRastreador > 0) out.push({ carga: g.carga, placa: g.placa, texto: g.foraDaFrota
      ? `placa não cadastrada na frota rastreada (placa provisória ou veículo novo?) -- ${g.semRastreador} NF(s) fora da taxa (informar a placa real que fez a carga)`
      : `veículo sem rastreamento no dia -- ${g.semRastreador} NF(s) fora da taxa (conferir equipamento/placa da escala)` })
    if (g.escalaDivergente > 0) {
      const t = trocas.get(`${g.carga}::${g.placa}`)
      out.push({ carga: g.carga, placa: g.placa, texto: t
        ? `PROVÁVEL TROCA DE VEÍCULO: a placa ${t.outraPlaca} parou em ${t.nfsPerto} de ${t.nfsComCoord} clientes desta carga e a ${g.placa} (da escala) em nenhum -- ${g.escalaDivergente} NF(s) fora da taxa; corrigir a placa na escala e gerar de novo`
        : `placa da escala não passou nos clientes -- ${g.escalaDivergente} NF(s) fora da taxa (substituição de veículo não informada?)` })
    }
  }
  // Pedido da Ana 03/10: cadastro do cliente divergente do romaneio vira
  // lista pra correcao (uma linha por NF, com o cliente).
  for (const d of detalhe) {
    if (d.status === 'pendente' && d.observacao?.startsWith('CADASTRO DO CLIENTE NA UNITRAC DIVERGE')) {
      const km = d.observacao.match(/\(([^)]+ km)\)/)?.[1] ?? ''
      out.push({ carga: d.carga, placa: d.placa, texto: `NF ${d.nf} ${d.clienteNome}: cadastro na Unitrac a ${km} do endereço do romaneio -- corrigir cadastro` })
    }
  }
  return out.sort((a, b) => a.carga.localeCompare(b.carga) || a.placa.localeCompare(b.placa))
}

// 29/09 (P0 da Ana): rotulo do resumo (aba 1 + cabecalho da aba da placa)
// pra placa sem rastreador no dia -- mesma familia do STATUS do detalhe.
const ROTULO_RESUMO_SEM_RASTREADOR = 'SEM RASTREADOR'
// Task 2 (plano 2026-09-30, item 1 -- RQO9H37 rastreador congelado): fonte
// unica = `ehSemRastreador` do detalhe (a mesma do total "NFs sem
// rastreador: N"). A marca e' da PLACA (semRastreadorNoDia/temRastreador em
// agregacao.ts), entao basta UMA NF marcada: exigir TODAS fazia uma NF
// confirmada pela Unitrac na mesma placa derrubar o resumo pra "EM ROTA".
function placasSemRastreadorNoDetalhe(detalhe: LinhaDetalheEntrega[]): Set<string> {
  const placas = new Set<string>()
  for (const d of detalhe) {
    if (d.placa === '') continue
    if (ehSemRastreador(d)) placas.add(d.placa)
  }
  return placas
}

// Revisao final pre-deploy (24/09, item 4): NF "AGUARDANDO" (relatorio do
// dia de hoje, rota ainda nao voltou) nao e' sucesso nem falha ainda --
// contá-la no denominador derrubava a taxa de um dia em andamento. Sai do
// denominador das duas taxas e aparece contada a parte ("NFs aguardando
// fim da rota: N"). Mesmo prefixo gravado em agregacao.ts.
const PREFIXO_OBS_AGUARDANDO = 'AGUARDANDO - ROTA EM ANDAMENTO'
function ehAguardando(d: LinhaDetalheEntrega): boolean {
  return (d.observacao?.startsWith(PREFIXO_OBS_AGUARDANDO) ?? false) && !ehSemRastreador(d) && !ehNaoSaiuDaBase(d) && !ehCargaSemPlaca(d)
}

// Task 2 (plano 2026-09-30, Rio Quality): placa cuja consulta ao rastreador
// FALHOU (erro/timeout, ver OBS_CONSULTA_FALHOU em kpi-rioquality/pipeline.ts)
// nao e' sucesso nem falha -- sai das duas taxas (num e denom) e aparece
// contada a parte. A Nutry Max nunca gera esse rotulo (nada muda nela).
// Revisao 30/09: 'CONSULTA AO RASTREADOR SUSPEITA' (RQ, trava de sem sinal em
// massa disparou) segue a mesma regra -- tambem nunca gerado pela Nutry Max.
const PREFIXO_OBS_CONSULTA_FALHOU = 'CONSULTA AO RASTREADOR FALHOU'
const PREFIXO_OBS_CONSULTA_SUSPEITA = 'CONSULTA AO RASTREADOR SUSPEITA'
function ehConsultaFalhou(d: LinhaDetalheEntrega): boolean {
  const obs = d.observacao ?? ''
  return (obs.startsWith(PREFIXO_OBS_CONSULTA_FALHOU) || obs.startsWith(PREFIXO_OBS_CONSULTA_SUSPEITA)) && !ehCargaSemPlaca(d) && d.status === 'pendente'
}

// Fix round 1, item 4 (decisao de negocio da Ana): a taxa "apos conferencia
// da operacao" tem um denominador PROPRIO, diferente do automatico:
// - SEM RASTREADOR sem nenhuma resolucao manual ainda fica de fora (a NF
//   esta' "aguardando confirmacao operacional" -- e' exatamente essa
//   confirmacao que falta pra ela poder entrar no calculo).
// - SEM RASTREADOR COM resolucao manual (qualquer uma, EXCETO
//   'desatualizado') ENTRA no denominador e conta conforme a resolucao --
//   a palavra da operacao e' a confirmacao que o automatico nao conseguiu
//   dar.
// - 'desatualizado' (com ou sem rastreador) SAI do denominador -- fica
//   pendente de atualizacao, nao e' nem sucesso nem falha ainda.
// A taxa AUTOMATICA (taxaPct) nunca muda com isso -- continua excluindo so'
// SEM RASTREADOR, do jeito que a Task 1 (24/09) implementou.
function entraNoDenominadorPosConferencia(d: LinhaDetalheEntrega, inteiras: Set<string>): boolean {
  if (d.resolucaoManual === 'desatualizado') return false
  if (ehSemRastreador(d) && !d.resolucaoManual) return false
  if (ehCargaSemPlaca(d) && !d.resolucaoManual) return false
  if (ehNaoSaiuDaBase(d) && !d.resolucaoManual) return false
  if (ehEscalaDivergente(d, inteiras) && !d.resolucaoManual) return false
  // Item 4 (revisao final): AGUARDANDO segue a mesma regra de SEM
  // RASTREADOR aqui -- fora ate' a operacao registrar uma resolucao (que e'
  // exatamente a confirmacao que falta); com resolucao, conta conforme ela.
  if (ehAguardando(d) && !d.resolucaoManual) return false
  if (ehConsultaFalhou(d) && !d.resolucaoManual) return false
  return true
}

// Item 2 (revisao final 26/09): a contagem "REVISAR: N" do resumo bate com
// `LinhaDetalheEntrega.confianca` (calcularConfianca em agregacao.ts, ja'
// classifica REVISAR tanto o sufixo "- REVISAR" do modoPrecisao quanto
// outros rotulos pendente com CONFERIR/PASSOU, ex. "PARADA PRÓXIMA
// (500m-2km)...CONFERIR", "PLACA DA ESCALA...CONFERIR ESCALA") -- unico
// criterio desde que a coluna CONFIANÇA deixou de ser opt-in (ajuste 26/09,
// antes so' valia quando `opcoes.motivoConfianca` estava ligado, que era
// sempre o caso na Nutry Max, unico chamador de resumoConfirmacao).
function calcularResumoConfirmacao(detalhe: LinhaDetalheEntrega[]): {
  taxaPct: number
  taxaPosConferenciaPct: number
  confirmadas: number
  confirmadasPosConferencia: number
  denominador: number
  denominadorPosConferencia: number
  semRastreador: number
  naoSaiuDaBase: number
  escalaDivergente: number
  cargaSemPlaca: number
  consultaFalhou: number
  aguardando: number
  revisar: number
} {
  const semRastreador = detalhe.filter(ehSemRastreador).length
  const naoSaiuDaBase = detalhe.filter(ehNaoSaiuDaBase).length
  const inteiras = cargasEscalaDivergenteInteira(detalhe)
  const escalaDivergente = detalhe.filter(d => ehEscalaDivergente(d, inteiras)).length
  const cargaSemPlaca = detalhe.filter(ehCargaSemPlaca).length
  const revisar = detalhe.filter(d => d.confianca === 'REVISAR' && !ehSemRastreador(d) && !ehCargaSemPlaca(d) && !ehConsultaFalhou(d)).length
  const aguardando = detalhe.filter(ehAguardando).length
  const consultaFalhou = detalhe.filter(d => ehConsultaFalhou(d) && !ehSemRastreador(d)).length
  const base = detalhe.filter(d => !ehSemRastreador(d) && !ehNaoSaiuDaBase(d) && !ehEscalaDivergente(d, inteiras) && !ehAguardando(d) && !ehCargaSemPlaca(d) && !ehConsultaFalhou(d))
  const denominador = base.length
  // Confirmada = status diferente de 'pendente' (so' ENTREGUE confirmado);
  // NF sem rastreador e REVISAR SEMPRE ficam pendente (nunca confirmam),
  // entao ja saem naturalmente do numerador.
  const confirmadas = base.filter(d => d.status !== 'pendente').length
  // Bug real 25/09 (achado da Ana, KPI-Nutry-Max-2026-09-25-TESTE.xlsx):
  // taxa arredondada pro inteiro escondia a diferença de poucos décimos que
  // batia contra a conta manual dela -- 1 casa decimal (ver
  // `formatarPctUmaCasa`) + denominador explícito na própria linha (pedido
  // do usuário 26/09) deixam a conta auditável sem abrir o xlsx inteiro.
  const taxaPct = denominador > 0 ? Math.round((1000 * confirmadas) / denominador) / 10 : 0

  const basePosConferencia = detalhe.filter(d => entraNoDenominadorPosConferencia(d, inteiras))
  const denominadorPosConferencia = basePosConferencia.length
  const confirmadasPosConferencia = basePosConferencia.filter(confirmadaAposConferencia).length
  const taxaPosConferenciaPct = denominadorPosConferencia > 0
    ? Math.round((1000 * confirmadasPosConferencia) / denominadorPosConferencia) / 10 : 0

  return { taxaPct, taxaPosConferenciaPct, confirmadas, confirmadasPosConferencia, denominador, denominadorPosConferencia, semRastreador, naoSaiuDaBase, escalaDivergente, cargaSemPlaca, consultaFalhou, aguardando, revisar }
}

// Pedido do usuário 26/09 (linha de TAXA auditável): inteiro com separador
// de milhar PT-BR, sem depender de `toLocaleString`/ICU do ambiente Node
// (Contabo/Vercel podem rodar build sem full-icu) -- regex pura.
function formatarInteiroPtBr(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Pedido do usuário 26/09: 1 casa decimal, vírgula PT-BR (ex. "94,7").
// `n` já vem arredondado a 1 casa em `calcularResumoConfirmacao` -- toFixed
// aqui é só formatação, nunca um segundo arredondamento.
function formatarPctUmaCasa(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

function formatarMinutos(min: number | null): string {
  // Achado real 24/08: minutos negativos (chegada antes da saída, por bug de
  // dado upstream) geravam "-1h-1min" via Math.floor/`%` com sinal em JS --
  // a defesa real é nunca deixar tempoOperacaoMin ficar negativo na origem
  // (ver agregacao.ts), mas o formatador tambem nunca deve fingir que sabe
  // formatar um valor que nao devia existir.
  if (min == null || min < 0) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2, '0')}min`
}

// Logo Transmonseg no canto esquerdo do banner de titulo -- mesmo asset
// (src/assets/transmonseg-logo.png) que o template da Benassi ja usa,
// so' que la' vem embutido no arquivo .xlsx modelo e aqui e' adicionado
// via API do ExcelJS (o gerador da Nutry Max monta o workbook do zero,
// nao carrega um template existente). Tamanho pequeno de proposito (nao
// pode competir com o titulo, que carrega informacao real -- cliente e
// data -- que a Benassi nao precisa repetir no mesmo lugar).
async function adicionarLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, linha: number): Promise<void> {
  try {
    const buffer = await getLogoBuffer()
    const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'png' })
    ws.addImage(imageId, {
      tl: { col: 0.15, row: linha - 1 + 0.15 },
      ext: { width: 42, height: 30 },
    })
  } catch {
    // Fail-open: logo e' puramente decorativo -- se o asset nao carregar
    // por algum motivo, o relatorio sai sem logo em vez de quebrar a
    // geracao inteira.
  }
}

function estilizarTitulo(ws: ExcelJS.Worksheet, tituloLinha: number, qtdColunas: number, titulo: string): void {
  ws.mergeCells(tituloLinha, 1, tituloLinha, qtdColunas)
  const cell = ws.getCell(tituloLinha, 1)
  cell.value = titulo
  cell.font = { name: FONTE, bold: true, size: 14, color: { argb: COR_TITULO_TEXTO } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TITULO_FUNDO } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getRow(tituloLinha).height = 32
}

// Nome de aba do Excel: máx 31 caracteres, proíbe : \ / ? * [ ]. Placa
// normalizada (ex. "TTJ9I18") já é curta e alfanumérica, mas o guard fica
// aqui pra nunca gerar um workbook corrompido se algum dia vier diferente.
const CARACTERES_PROIBIDOS_ABA = /[:\\/?*[\]]/g
function nomeAbaPlaca(placa: string): string {
  // Fix incidental (achado ao testar Task 3 com PDF real do romaneio do
  // pão 14/09): algumas cargas (PAO-9/10/12) não têm placa atribuída no
  // documento ainda (campo CARRO em branco) -- ExcelJS lança "The name
  // can't be empty" se a aba receber string vazia, derrubando a geração
  // inteira do relatório. `placasEmOrdem` já é um Set, então todas as
  // cargas sem placa caem numa única aba "SEM PLACA" (best-effort, mesmo
  // espírito de "ajudante colado" documentado como heurística em parse-pao.ts).
  const nome = placa.replace(CARACTERES_PROIBIDOS_ABA, '-').slice(0, 31)
  return nome || 'SEM PLACA'
}

// Linha de resumo do dia da placa (pedido do usuário 25/08: a aba por placa
// tem que ter "as informações do arquivo que mandei de exemplo" -- no
// modelo de referência MOTORISTA/SAÍDA CD/CHEGADA CD/TEMPO OPERAÇÃO são
// colunas fixas por veículo; aqui viram uma linha de resumo, já que a aba
// inteira já é dessa placa. `resumo` pode ser undefined (placa sem nenhuma
// linha agregada, caso que não deveria acontecer na prática -- toda placa
// da lista de abas vem de `linhas` -- mas o tipo permite, então trata).
function escreverResumoPlaca(ws: ExcelJS.Worksheet, linhaResumo: number, qtdColunas: number, resumo: LinhaKpiRomaneio | undefined, data: string, hoje: string, qtdNotas: number, cargasNaoRelacionadas: boolean = false, semRastreador: boolean = false): void {
  const emAndamento = data === hoje
  const horaCd = (iso: string | null, temRastreador: boolean) =>
    semRastreador ? ROTULO_RESUMO_SEM_RASTREADOR : celulaHora(iso, temRastreador, emAndamento)
  // Fix incidental (code review da Task 3, achado 1): a aba "SEM PLACA"
  // pode juntar 2+ cargas de romaneios diferentes (ex. PAO-9/PAO-10/PAO-12)
  // sem NENHUMA relação entre si -- motorista/horário de UMA delas não
  // descreve a aba inteira, ao contrário do caso legítimo de "mesma placa,
  // 2 viagens" (mesmo veículo, resumo aproximado ainda é plausível). Quando
  // `cargasNaoRelacionadas` é true, mostra "MÚLTIPLOS"/"-" em vez de
  // reusar o dado da primeira carga -- NOTAS continua contando certo,
  // porque conta entregas de `detalhe`, não depende de `resumo`.
  const texto = cargasNaoRelacionadas
    ? `MOTORISTA: MÚLTIPLOS    |    SAÍDA CD: -    |    CHEGADA CD: -    |    TEMPO OPERAÇÃO: -    |    KM PERCORRIDO: -    |    NOTAS: ${qtdNotas}`
    : resumo
    ? `MOTORISTA: ${resumo.motorista || '-'}    |    SAÍDA CD: ${horaCd(resumo.saidaCd, resumo.temRastreador) || '-'}    |    CHEGADA CD: ${horaCd(chegadaCdExibivel(resumo), resumo.temRastreador) || '-'}    |    TEMPO OPERAÇÃO: ${formatarMinutos(resumo.tempoOperacaoMin) || '-'}    |    KM PERCORRIDO: ${resumo.kmPercorrido != null ? `${Math.round(resumo.kmPercorrido * 10) / 10} km` : '-'}    |    NOTAS: ${qtdNotas}`
    : ''
  ws.mergeCells(linhaResumo, 1, linhaResumo, qtdColunas)
  const cell = ws.getCell(linhaResumo, 1)
  cell.value = texto
  cell.font = { bold: true, size: 11 }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(linhaResumo).height = 20
}

function estilizarHeader(ws: ExcelJS.Worksheet, headerLinha: number, qtdColunas: number): void {
  const row = ws.getRow(headerLinha)
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { name: FONTE, bold: true, color: { argb: COR_HEADER_TEXTO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_FUNDO } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }
  ws.views = [{ state: 'frozen', ySplit: headerLinha }]
}

// Zebra + fonte Calibri + borda inferior sutil nas linhas de dado --
// mesma paleta BG_ZEBRA/BORDER/TEXT_DEFAULT do relatorio da Benassi
// (kpi-styles.ts), aplicada linha a linha depois do addRow (ExcelJS nao
// tem "estilo de linha alternada" nativo).
function estilizarLinhaDado(ws: ExcelJS.Worksheet, linha: number, qtdColunas: number, indice: number): void {
  const row = ws.getRow(linha)
  const zebra = indice % 2 === 1
  for (let c = 1; c <= qtdColunas; c++) {
    const cell = row.getCell(c)
    cell.font = { name: FONTE, color: { argb: KPI_COLORS.TEXT_DEFAULT } }
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_COLORS.BG_ZEBRA } }
    cell.border = KPI_BORDER_THIN
  }
}

/** Terceiro parametro e' aditivo -- avisos de descasamento Escala<->Romaneio
 *  (ver spec, secao "Tratamento de erro/ambiguidade"). Lista vazia (default)
 *  nao cria a aba "Avisos": decisao de nao poluir o arquivo com uma aba
 *  vazia todo dia em que nao houve nenhum descasamento -- so aparece
 *  quando ha algo pra avisar.
 *
 *  Quarto parametro (pedido do usuario 24/08, referencia
 *  KPI-GUANABARA-2026-08-23-com-chegada-cd.xlsx): alem do resumo por carga,
 *  uma aba "Detalhamento" com uma linha por NF/entrega -- lista vazia
 *  (default) ainda cria a aba, só sem linhas de dado (diferente de Avisos:
 *  o usuario quer essa aba sempre visivel, mesmo dia sem nenhuma entrega
 *  detalhavel). */
export async function gerarKpiRomaneioXlsx(
  linhas: LinhaKpiRomaneio[],
  data: string,
  avisos: AvisoDescasamento[] = [],
  detalhe: LinhaDetalheEntrega[] = [],
  // Injetavel pra teste determinístico (motivoAusencia compara `data` contra
  // "hoje" pra distinguir "ainda em rota" de "nunca aconteceu") -- produção
  // sempre usa o default real.
  hoje: string = hojeBR(),
  // Nome do cliente no titulo das abas -- o gerador nasceu pra Nutry Max e o
  // KPI Rio Quality (05/09) reaproveita ele inteiro.
  nomeCliente: string = 'NUTRY MAX',
  // Revisao final pre-deploy (24/09, item 1): a linha de resumo do dia (TAXA
  // DE CONFIRMAÇÃO / APÓS CONFERÊNCIA / NFs sem rastreador / aguardando) e'
  // da Nutry Max -- o Rio Quality (pipeline.ts) reusa este gerador e nao a
  // tinha em 108b4bb. Opt-in, mesmo padrao de `verificarAcessoIlha`.
  // Ajuste 26/09 (pedido do usuario): `placaExecutora` e `motivoConfianca`
  // removidas -- as colunas PLACA EXECUTORA/MOTIVO/CONFIANÇA que elas
  // ligavam saíram do xlsx (pros dois clientes). Os campos correspondentes
  // (`placaExecutora`/`motivo`/`confianca` em LinhaDetalheEntrega) continuam
  // sempre calculados em agregacao.ts, so' pararam de ter opcao de exibicao.
  opcoes: { resumoConfirmacao?: boolean; trocasProvaveis?: Map<string, TrocaProvavel> } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TRANSMONSEG'
  wb.created = new Date()
  const titulo = `RELATÓRIO KPI - ${nomeCliente}\n${formatarTituloData(data)}`

  const ws = wb.addWorksheet(`KPI ${data}`)
  estilizarTitulo(ws, 1, COLUNAS_KPI_ROMANEIO.length, titulo)
  await adicionarLogo(wb, ws, 1)
  ws.addRow([...COLUNAS_KPI_ROMANEIO])
  estilizarHeader(ws, 2, COLUNAS_KPI_ROMANEIO.length)
  ws.columns = [
    { width: 10 }, { width: 12 }, { width: 20 }, { width: 28 }, { width: 22 }, { width: 22 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 14 },
    { width: 10 }, { width: 10 }, { width: 14 }, { width: 18 },
  ]

  // 29/09 (P0 da Ana, RQO9H37: "SEM RASTREADOR" no detalhe e "EM ROTA" no
  // resumo): placa com NF sem rastreador no detalhe (mesmo
  // criterio de "NFs sem rastreador: N", `ehSemRastreador`) mostra o MESMO
  // rotulo nas celulas SAIDA/CHEGADA CD da aba 1 e no cabecalho da aba da
  // placa -- nunca "EM ROTA"/"SEM CADASTRO". So' com `resumoConfirmacao`
  // (Nutry Max); Rio Quality segue com "SEM CADASTRO".
  const placasSemRastreadorNoResumo = opcoes.resumoConfirmacao
    ? placasSemRastreadorNoDetalhe(detalhe)
    : new Set<string>()

  linhas.forEach((l, i) => {
    ws.addRow([
      l.carga, l.placa, l.destino, l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      l.pesoKg ?? '', l.clientesPlanejados ?? '', l.nfPlanejado ?? '', l.paradasReais, l.paradasForaBase,
      l.kmPercorrido != null ? Math.round(l.kmPercorrido * 10) / 10 : '',
      placasSemRastreadorNoResumo.has(l.placa) ? ROTULO_RESUMO_SEM_RASTREADOR : celulaHora(l.saidaCd, l.temRastreador, data === hoje),
      placasSemRastreadorNoResumo.has(l.placa) ? ROTULO_RESUMO_SEM_RASTREADOR : celulaHora(chegadaCdExibivel(l), l.temRastreador, data === hoje),
      formatarMinutos(l.tempoOperacaoMin), formatarMinutos(l.tempoMedioParadaMin),
    ])
    estilizarLinhaDado(ws, 2 + 1 + i, COLUNAS_KPI_ROMANEIO.length, i)
  })
  // Filtro nativo do Excel (pedido do usuário 24/08: "filtrável por placa")
  // -- dropdown em toda coluna, não só PLACA, é o comportamento padrão do
  // recurso e o mais útil (também dá pra filtrar por STATUS, DESTINO etc).
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2 + linhas.length, column: COLUNAS_KPI_ROMANEIO.length },
  }

  // Linha de resumo geral do dia (Task 1, 24/09): taxa de confirmacao ja
  // excluindo "sem rastreador" do denominador, com a contagem delas a
  // parte -- so' escreve quando ha' `detalhe` pra calcular (lista vazia,
  // default, nao adiciona linha nenhuma -- comportamento antigo intacto pra
  // quem nao passa o 4o parametro).
  if (opcoes.resumoConfirmacao && detalhe.length > 0) {
    const resumo = calcularResumoConfirmacao(detalhe)
    // Pedido do usuário 26/09: denominador explícito ao lado de cada taxa,
    // pra dar pra auditar a conta sem abrir a aba de Detalhamento. A
    // automática exclui SEM RASTREADOR do denominador (rótulo literal, ver
    // `resumo.semRastreador`); AGUARDANDO (dia em andamento) continua
    // reportado à parte no fim da linha, como já era. Pós-conferência tem
    // exclusões próprias (SEM RASTREADOR/AGUARDANDO sem resolução,
    // 'desatualizado' -- ver `entraNoDenominadorPosConferencia`), por isso
    // usa `total - denominador` genérico em vez do rótulo "sem rastreador".
    const foraDaContaPosConferencia = detalhe.length - resumo.denominadorPosConferencia
    const partesFora = [
      `${formatarInteiroPtBr(resumo.semRastreador)} sem rastreador`,
      ...(resumo.naoSaiuDaBase > 0 ? [`${formatarInteiroPtBr(resumo.naoSaiuDaBase)} que não saíram da base`] : []),
      ...(resumo.escalaDivergente > 0 ? [`${formatarInteiroPtBr(resumo.escalaDivergente)} de placa da escala divergente`] : []),
      ...(resumo.cargaSemPlaca > 0 ? [`${formatarInteiroPtBr(resumo.cargaSemPlaca)} de carga sem placa`] : []),
      ...(resumo.consultaFalhou > 0 ? [`${formatarInteiroPtBr(resumo.consultaFalhou)} com consulta ao rastreador falha`] : []),
    ]
    const foraTexto = `${partesFora.length > 1 ? `${partesFora.slice(0, -1).join(', ')} e ${partesFora[partesFora.length - 1]}` : partesFora[0]} fora da conta`
    const taxaTexto = `${formatarPctUmaCasa(resumo.taxaPct)}% (${formatarInteiroPtBr(resumo.confirmadas)} de ${formatarInteiroPtBr(resumo.denominador)} NFs; ${foraTexto})`
    const naoSaiuTexto = (resumo.naoSaiuDaBase > 0 ? `    |    NFs sem saída da base: ${resumo.naoSaiuDaBase} (fora da conta)` : '')
      + (resumo.escalaDivergente > 0 ? `    |    NFs com placa da escala divergente: ${resumo.escalaDivergente} (fora da conta)` : '')
      + (resumo.cargaSemPlaca > 0 ? `    |    NFs de carga sem placa: ${resumo.cargaSemPlaca} (fora da conta)` : '')
    const taxaPosTexto = `${formatarPctUmaCasa(resumo.taxaPosConferenciaPct)}% (${formatarInteiroPtBr(resumo.confirmadasPosConferencia)} de ${formatarInteiroPtBr(resumo.denominadorPosConferencia)} NFs; ${formatarInteiroPtBr(foraDaContaPosConferencia)} fora da conta)`
    // Pedido da Ana 02/10: tres niveis -- ENTREGUE confirmado, PENDENTE pra
    // auditoria e NAO ENTREGUE confirmado pela conferencia da operacao.
    const naoEntregueConfirmado = detalhe.filter(d => d.resolucaoManual === 'nao_esteve_no_local').length
    const pendenteAuditoria = resumo.denominadorPosConferencia - resumo.confirmadasPosConferencia - naoEntregueConfirmado
    const niveisTexto = `    |    ENTREGUE: ${formatarInteiroPtBr(resumo.confirmadasPosConferencia)} / PENDENTE DE AUDITORIA: ${formatarInteiroPtBr(Math.max(0, pendenteAuditoria))} / NÃO ENTREGUE CONFIRMADO: ${formatarInteiroPtBr(naoEntregueConfirmado)}`
    const linhaResumoGeral = ws.addRow([
      `TAXA DE CONFIRMAÇÃO: ${taxaTexto}    |    TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: ${taxaPosTexto}    |    REVISAR: ${resumo.revisar}    |    NFs sem rastreador: ${resumo.semRastreador}${naoSaiuTexto}    |    NFs aguardando fim da rota: ${resumo.aguardando}${niveisTexto}${notaAvisoNfDivergente(avisos)}`,
    ])
    ws.mergeCells(linhaResumoGeral.number, 1, linhaResumoGeral.number, COLUNAS_KPI_ROMANEIO.length)
    const cell = linhaResumoGeral.getCell(1)
    cell.font = { name: FONTE, bold: true, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    linhaResumoGeral.height = 20
  }

  // Uma aba por placa (pedido do usuário 25/08) -- ordem = ordem de
  // aparição na aba principal (já ordenada por carga+placa), não a ordem
  // alfabética de NF de `detalhe`. Placa sem NENHUMA entrega detalhável
  // (romaneio vazio pra ela, caso raro) ainda ganha aba, só sem linha de
  // dado -- mesmo espírito de "Avisos vazio não cria aba, mas detalhe
  // sempre existe" já usado no resto do gerador.
  const placasEmOrdem = [...new Set(linhas.map(l => l.placa))]
  // Resumo por placa: pega a PRIMEIRA linha agregada dessa placa. Caso raro
  // (placa com 2 cargas no mesmo dia) mostra só o resumo operacional da
  // primeira -- mesma simplificação já usada pra destino/motorista em
  // agregacao.ts quando falta Escala.
  const resumoPorPlaca = new Map<string, LinhaKpiRomaneio>()
  for (const l of linhas) {
    if (!resumoPorPlaca.has(l.placa)) resumoPorPlaca.set(l.placa, l)
  }
  // Achado 1 (code review Task 3): placa vazia ("SEM PLACA") não é "a mesma
  // placa com 2 viagens" -- é 1+ cargas de romaneios diferentes sem relação
  // nenhuma entre si. Só nesse caso, e só quando há mais de uma carga,
  // a linha de resumo não pode fingir que descreve a aba inteira.
  const qtdCargasSemPlaca = linhas.filter(l => l.placa === '').length
  const detalhePorPlaca = new Map<string, LinhaDetalheEntrega[]>()
  for (const d of detalhe) {
    const lista = detalhePorPlaca.get(d.placa) ?? []
    lista.push(d)
    detalhePorPlaca.set(d.placa, lista)
  }

  // Ajuste 26/09 (pedido do usuario): RESOLUÇÃO OPERAÇÃO/RESPONSÁVEL so'
  // entram no header quando pelo menos uma NF do DIA INTEIRO (todas as
  // placas, nao so' a desta aba) tem resolucaoManual registrada -- garante o
  // MESMO cabecalho em toda aba do arquivo (nenhuma placa fica com 8
  // colunas enquanto outra tem 10 no mesmo dia).
  const temResolucaoManual = detalhe.some(d => d.resolucaoManual != null)
  const colunasDetalhe: readonly string[] = [
    ...COLUNAS_DETALHE_PLACA,
    ...(temResolucaoManual ? COLUNAS_RESOLUCAO : []),
  ]
  for (const placa of placasEmOrdem) {
    const wsPlaca = wb.addWorksheet(nomeAbaPlaca(placa))
    const tituloPlaca = `RELATÓRIO KPI - ${nomeCliente} - PLACA ${placa}\n${formatarTituloData(data)}`
    estilizarTitulo(wsPlaca, 1, colunasDetalhe.length, tituloPlaca)
    await adicionarLogo(wb, wsPlaca, 1)
    const linhasDaPlaca = detalhePorPlaca.get(placa) ?? []
    // Pedido do usuario 06/09: mostrar quantas notas (NFs) a placa levou
    // no dia junto com o resto do resumo (motorista/saida/chegada/tempo/km),
    // que ja' e' tudo igual em qualquer parte do relatorio -- so' isso
    // faltava.
    const cargasNaoRelacionadas = placa === '' && qtdCargasSemPlaca > 1
    escreverResumoPlaca(wsPlaca, 2, colunasDetalhe.length, resumoPorPlaca.get(placa), data, hoje, linhasDaPlaca.length, cargasNaoRelacionadas, placasSemRastreadorNoResumo.has(placa))
    wsPlaca.addRow([...colunasDetalhe])
    estilizarHeader(wsPlaca, 3, colunasDetalhe.length)
    wsPlaca.columns = [
      { width: 10 }, { width: 14 }, { width: 32 }, { width: 36 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 36 },
      ...(temResolucaoManual ? [{ width: 36 }, { width: 20 }] : []),
    ]
    linhasDaPlaca.forEach((d, i) => {
      // CHEGADA/SAÍDA NA LOJA: motivo só faz sentido quando 'pendente'
      // (confirmado_unitrac já tem explicação própria via STATUS -- sabemos
      // que aconteceu, só não temos o horário exato de GPS; confirmado_gps
      // sempre tem os dois preenchidos).
      //
      // Achado real 15/09: usar `data === hoje` aqui (em vez de checar se
      // ESTA linha está genuinamente em andamento) mostrava "EM ROTA" numa
      // NF que já recebeu veredito final ("PASSOU NO ENDEREÇO...CONFERIR",
      // "NÃO FOI AO CLIENTE") só porque o dia calendário ainda não acabou --
      // status final ao lado dizendo "CONFERIR" contradizendo o horário
      // dizendo "ainda em rota" na mesma linha. `observacao` só vira o
      // sentinel AGUARDANDO quando a linha realmente não tem veredito nenhum
      // ainda (ver agregacao.ts) -- é o sinal certo de "em andamento" por NF.
      const aindaEmAndamento = d.observacao === 'AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO'
      const chegadaLoja = d.status === 'pendente' ? celulaHora(d.chegada, d.temRastreador, aindaEmAndamento) : formatarHora(d.chegada)
      const saidaLoja = d.status === 'pendente' ? celulaHora(d.saida, d.temRastreador, aindaEmAndamento) : formatarHora(d.saida)
      wsPlaca.addRow([
        d.carga, d.nf, d.clienteNome, d.endereco,
        chegadaLoja, saidaLoja, formatarMinutos(d.tempoParadaMin),
        textoStatus(d),
        ...(temResolucaoManual ? [textoResolucaoManual(d), d.responsavelResolucao ?? ''] : []),
      ])
      estilizarLinhaDado(wsPlaca, 3 + 1 + i, colunasDetalhe.length, i)
    })
    wsPlaca.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + linhasDaPlaca.length, column: colunasDetalhe.length },
    }
  }

  // Pedido da Ana 03/10: "preciso saber diario veiculos desatualizados e sem
  // rastreador na escala" -- uma linha por carga+placa com NFs fora da taxa
  // por falta de rastreamento ou por placa da escala divergente (substituicao
  // nao informada), so' quando ha' `detalhe` (Nutry Max).
  // Pedido da Ana 03/10: "historico de auditoria contendo status original,
  // regra utilizada para validacao, evidencia encontrada e status final da
  // NF". Uma linha por NF com a regra/evidencia que decidiu (motivo),
  // distancia da parada usada e a resolucao manual, quando houver -- so'
  // Nutry Max (resumoConfirmacao).
  if (opcoes.resumoConfirmacao && detalhe.length > 0) {
    const wsAud = wb.addWorksheet('Auditoria')
    wsAud.addRow(['CARGA', 'PLACA', 'NF', 'CLIENTE', 'STATUS ORIGINAL (KPI)', 'REGRA / EVIDÊNCIA', 'DISTÂNCIA DA PARADA (m)', 'TEMPO PARADO', 'STATUS FINAL (APÓS CONFERÊNCIA)'])
    for (const d of detalhe) {
      wsAud.addRow([
        d.carga, d.placa, d.nf, d.clienteNome, textoStatus(d), d.motivo,
        d.distParadaM ?? '', formatarMinutos(d.tempoParadaMin), textoResolucaoManual(d) || textoStatus(d),
      ])
    }
    wsAud.getRow(1).font = { name: FONTE, bold: true }
    wsAud.columns.forEach((c, i) => { c.width = [8, 10, 10, 34, 46, 60, 14, 12, 24][i] })
    wsAud.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + detalhe.length, column: 9 } }
  }

  const avisosFrota = opcoes.resumoConfirmacao ? avisosDeFrota(detalhe, opcoes.trocasProvaveis) : []
  if (avisos.length > 0 || avisosFrota.length > 0) {
    const wsAvisos = wb.addWorksheet('Avisos')
    wsAvisos.addRow([...COLUNAS_AVISOS])
    for (const a of avisos) {
      wsAvisos.addRow([a.carga, a.placa, textoAviso(a)])
    }
    for (const a of avisosFrota) {
      wsAvisos.addRow([a.carga, a.placa, a.texto])
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
