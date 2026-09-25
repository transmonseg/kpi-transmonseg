import ExcelJS from 'exceljs'
import type { AvisoDescasamento, LinhaKpiRomaneio, LinhaDetalheEntrega, StatusEntrega, ResolucaoNf, EvidenciaNf } from './types'
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
// Task 4 (plano 24/09, requisito P0 da Ana: "persistir status automático
// ORIGINAL, resolução manual, responsável..."): STATUS virou "STATUS
// AUTOMÁTICO" (mesmo cálculo de sempre, sem mudar de posição -- continua
// coluna H, nenhum teste/leitor existente que olha esse índice quebra) +
// duas colunas novas no fim com o que a operação registrou por cima
// (resolucoes.ts/aplicarResolucoes). NF sem nenhuma resolução manual = célula
// vazia nas duas, igual sempre foi antes desta task.
// Task 5 (plano 24/09, requisito P0 da Ana: "expor origem, método e
// distância; não equiparar parada em rua semelhante a entrega"): EVIDÊNCIA
// (rótulo legível do EvidenciaNf calculado em agregacao.ts) + DIST. PARADA
// (M) (distância real medida, nunca `Visita.distanciaMetrosDoPonto`) --
// depois das colunas da Task 4, nunca antes (nenhum índice existente
// muda de posição).
export const COLUNAS_DETALHE_PLACA = [
  'CARGA', 'NF', 'CLIENTE', 'ENDEREÇO',
  'CHEGADA NA LOJA', 'SAÍDA DA LOJA', 'TEMPO NA LOJA', 'STATUS AUTOMÁTICO',
  'RESOLUÇÃO OPERAÇÃO', 'RESPONSÁVEL', 'EVIDÊNCIA', 'DIST. PARADA (m)',
] as const

export const COLUNAS_AVISOS = ['CARGA', 'PLACA', 'PROBLEMA'] as const

const LABEL_MOTIVO: Record<AvisoDescasamento['motivo'], string> = {
  sem_romaneio: 'sem romaneio',
  sem_escala: 'sem escala',
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
function textoStatus(d: LinhaDetalheEntrega): string {
  if (d.observacao) return d.observacao
  // Placa sem CV (codigo de rastreador) no nosso cadastro nunca vai
  // confirmar -- e "SEM CONFIRMACAO" escondia o motivo (achado 05/09: 1294
  // das 3062 entregas da Rio Quality caiam nesse balde). Mas o texto NAO
  // pode afirmar que o veiculo nao tem rastreador: no caso da Rio Quality o
  // portal lista ~102 veiculos e nos so' cadastramos 59, entao a maioria
  // dessas placas provavelmente TEM rastreador e o buraco e' nosso. O rotulo
  // diz o que sabemos de verdade: falta o codigo no cadastro.
  if (!d.temRastreador && d.status === 'pendente') return 'PLACA SEM RASTREADOR CADASTRADO - COMPLETAR FROTA'
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

// Task 5 (plano 24/09): rotulo legivel de cada valor de EvidenciaNf
// (agregacao.ts) -- MAIUSCULO, mesmo padrao do resto do relatorio (Global
// Constraint do plano). Ver comentario completo de EvidenciaNf em types.ts
// pra precedencia/significado de cada valor.
const LABEL_EVIDENCIA_NF: Record<EvidenciaNf, string> = {
  parada_no_endereco: 'PARADA NO ENDEREÇO',
  parada_no_cadastro_unitrac: 'PARADA NO CADASTRO UNITRAC',
  raio_ampliado: 'RAIO AMPLIADO (500-800m)',
  vizinhanca: 'PARADA DE ENDEREÇO VIZINHO',
  parada_curta_compartilhada: 'PARADA CURTA COMPARTILHADA',
  outra_placa: 'PARADA DE OUTRA PLACA',
  alvo_feito_unitrac: 'ALVO FEITO NA UNITRAC (SEM GPS)',
  sem_evidencia: 'SEM EVIDÊNCIA',
  sem_rastreador: 'SEM RASTREADOR',
  // Task 9 (plano 24/09): rótulos por distância própria (`distPropria`,
  // agregacao.ts) que antes caiam em SEM EVIDÊNCIA sem distância nenhuma.
  passagem_sem_parada: 'PASSAGEM SEM PARADA',
  parada_proxima_fora_raio: 'PARADA PRÓXIMA FORA DO RAIO',
}

function textoEvidencia(d: LinhaDetalheEntrega): string {
  return LABEL_EVIDENCIA_NF[d.evidencia]
}

// Task 5: distancia em METROS, arredondada -- `null` (nao medida, nunca
// inventada) fica em branco, igual ao resto do relatorio quando falta dado.
function textoDistParada(d: LinhaDetalheEntrega): string | number {
  return d.distParadaM != null ? Math.round(d.distParadaM) : ''
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

function ehSemRastreador(d: LinhaDetalheEntrega): boolean {
  return d.observacao?.startsWith(PREFIXO_OBS_SEM_RASTREADOR) ?? false
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
function entraNoDenominadorPosConferencia(d: LinhaDetalheEntrega): boolean {
  if (d.resolucaoManual === 'desatualizado') return false
  if (ehSemRastreador(d) && !d.resolucaoManual) return false
  return true
}

function calcularResumoConfirmacao(detalhe: LinhaDetalheEntrega[]): {
  taxaPct: number
  taxaPosConferenciaPct: number
  confirmadas: number
  confirmadasPosConferencia: number
  denominador: number
  denominadorPosConferencia: number
  semRastreador: number
} {
  const semRastreador = detalhe.filter(ehSemRastreador).length
  const base = detalhe.filter(d => !ehSemRastreador(d))
  const denominador = base.length
  // Confirmada = status diferente de 'pendente'; NF sem rastreador SEMPRE
  // fica pendente (nunca confirma), entao ja sai naturalmente do numerador.
  const confirmadas = base.filter(d => d.status !== 'pendente').length
  const taxaPct = denominador > 0 ? Math.round((100 * confirmadas) / denominador) : 0

  const basePosConferencia = detalhe.filter(entraNoDenominadorPosConferencia)
  const denominadorPosConferencia = basePosConferencia.length
  const confirmadasPosConferencia = basePosConferencia.filter(confirmadaAposConferencia).length
  const taxaPosConferenciaPct = denominadorPosConferencia > 0
    ? Math.round((100 * confirmadasPosConferencia) / denominadorPosConferencia) : 0

  return { taxaPct, taxaPosConferenciaPct, confirmadas, confirmadasPosConferencia, denominador, denominadorPosConferencia, semRastreador }
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
function escreverResumoPlaca(ws: ExcelJS.Worksheet, linhaResumo: number, qtdColunas: number, resumo: LinhaKpiRomaneio | undefined, data: string, hoje: string, qtdNotas: number, cargasNaoRelacionadas: boolean = false): void {
  const emAndamento = data === hoje
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
    ? `MOTORISTA: ${resumo.motorista || '-'}    |    SAÍDA CD: ${celulaHora(resumo.saidaCd, resumo.temRastreador, emAndamento) || '-'}    |    CHEGADA CD: ${celulaHora(resumo.chegadaCd, resumo.temRastreador, emAndamento) || '-'}    |    TEMPO OPERAÇÃO: ${formatarMinutos(resumo.tempoOperacaoMin) || '-'}    |    KM PERCORRIDO: ${resumo.kmPercorrido != null ? `${Math.round(resumo.kmPercorrido * 10) / 10} km` : '-'}    |    NOTAS: ${qtdNotas}`
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

  linhas.forEach((l, i) => {
    ws.addRow([
      l.carga, l.placa, l.destino, l.motorista, l.ajudante1 ?? '', l.ajudante2 ?? '',
      l.pesoKg ?? '', l.clientesPlanejados ?? '', l.nfPlanejado ?? '', l.paradasReais, l.paradasForaBase,
      l.kmPercorrido != null ? Math.round(l.kmPercorrido * 10) / 10 : '',
      celulaHora(l.saidaCd, l.temRastreador, data === hoje), celulaHora(l.chegadaCd, l.temRastreador, data === hoje),
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
  if (detalhe.length > 0) {
    const resumo = calcularResumoConfirmacao(detalhe)
    const linhaResumoGeral = ws.addRow([
      `TAXA DE CONFIRMAÇÃO: ${resumo.taxaPct}%    |    TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: ${resumo.taxaPosConferenciaPct}%    |    NFs sem rastreador: ${resumo.semRastreador}`,
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

  for (const placa of placasEmOrdem) {
    const wsPlaca = wb.addWorksheet(nomeAbaPlaca(placa))
    const tituloPlaca = `RELATÓRIO KPI - ${nomeCliente} - PLACA ${placa}\n${formatarTituloData(data)}`
    estilizarTitulo(wsPlaca, 1, COLUNAS_DETALHE_PLACA.length, tituloPlaca)
    await adicionarLogo(wb, wsPlaca, 1)
    const linhasDaPlaca = detalhePorPlaca.get(placa) ?? []
    // Pedido do usuario 06/09: mostrar quantas notas (NFs) a placa levou
    // no dia junto com o resto do resumo (motorista/saida/chegada/tempo/km),
    // que ja' e' tudo igual em qualquer parte do relatorio -- so' isso
    // faltava.
    const cargasNaoRelacionadas = placa === '' && qtdCargasSemPlaca > 1
    escreverResumoPlaca(wsPlaca, 2, COLUNAS_DETALHE_PLACA.length, resumoPorPlaca.get(placa), data, hoje, linhasDaPlaca.length, cargasNaoRelacionadas)
    wsPlaca.addRow([...COLUNAS_DETALHE_PLACA])
    estilizarHeader(wsPlaca, 3, COLUNAS_DETALHE_PLACA.length)
    wsPlaca.columns = [
      { width: 10 }, { width: 14 }, { width: 32 }, { width: 36 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 36 },
      { width: 36 }, { width: 20 }, { width: 28 }, { width: 16 },
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
        textoStatus(d), textoResolucaoManual(d), d.responsavelResolucao ?? '',
        textoEvidencia(d), textoDistParada(d),
      ])
      estilizarLinhaDado(wsPlaca, 3 + 1 + i, COLUNAS_DETALHE_PLACA.length, i)
    })
    wsPlaca.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + linhasDaPlaca.length, column: COLUNAS_DETALHE_PLACA.length },
    }
  }

  if (avisos.length > 0) {
    const wsAvisos = wb.addWorksheet('Avisos')
    wsAvisos.addRow([...COLUNAS_AVISOS])
    for (const a of avisos) {
      wsAvisos.addRow([a.carga, a.placa, LABEL_MOTIVO[a.motivo]])
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}
