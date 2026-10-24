// F3-06 (ING-10): regras da área "Solte os arquivos do dia" (sem React, testáveis).
import type { ArquivoNoRecibo } from '@/lib/kpi-romaneio/reconhecer-arquivo'

export type ClienteTela = 'nutrimax' | 'rioquality'
export type EscolhaCliente = 'nutrimax' | 'rioquality' | 'portofrio' | 'outro'
export type ItemArquivo = { id: string; file: File; info: ArquivoNoRecibo | null; erro?: string; escolha?: EscolhaCliente; substituido?: boolean }

export const DOCUMENTOS_DO_CLIENTE: Record<ClienteTela, string> = {
  nutrimax: 'Romaneio de Entrega (8012), Escala de Rota (8081) e Romaneio do Pão (Programação JAC)',
  rioquality: 'Relatório de Entregas (planilha xlsx)',
}
const NOME: Record<ClienteTela, string> = { nutrimax: 'Nutry Max', rioquality: 'Rio Quality' }

/** Resposta à pergunta "de qual cliente é?" para arquivo que o sistema não reconheceu. */
export function respostaArquivoDesconhecido(escolha: EscolhaCliente, cliente: ClienteTela): string {
  if (escolha === cliente) return `Não é nenhum dos documentos da ${NOME[cliente]} que o sistema lê (${DOCUMENTOS_DO_CLIENTE[cliente]}). Confira o arquivo: ele não será enviado.`
  if (escolha === 'nutrimax' || escolha === 'rioquality') return `Então suba no Ao vivo da ${NOME[escolha]}. Aqui ele não será enviado.`
  return 'Esse cliente ainda não entra no Ao vivo: o arquivo não será enviado.'
}

/** Junta os arquivos recém-reconhecidos aos que já estavam: um documento do
 *  mesmo tipo troca o anterior (vale o último solto). */
export function juntarReconhecidos(atuais: ItemArquivo[], novos: ItemArquivo[]): ItemArquivo[] {
  const camposNovos = new Set(novos.filter(n => n.info?.serve && n.info.campo).map(n => n.info!.campo))
  const antigos = atuais.map(a => (a.info?.serve && a.info.campo && camposNovos.has(a.info.campo) ? { ...a, substituido: true } : a))
  // dentro do próprio lote, o último do mesmo tipo vence
  const vistos = new Set<string>()
  const lote = [...novos].reverse().map(n => {
    const c = n.info?.serve ? n.info.campo : null
    if (!c) return n
    if (vistos.has(c)) return { ...n, substituido: true }
    vistos.add(c)
    return n
  }).reverse()
  return [...antigos.filter(a => !a.substituido), ...lote.filter(n => !n.substituido)]
}

/** Campos do envio ao Ao vivo (só o que serve) e o que falta para enviar. */
export function montarEnvio(itens: ItemArquivo[], cliente: ClienteTela, diaJaEnviado: boolean): { campos: { campo: string; file: File }[]; podeEnviar: boolean; falta: string | null } {
  const campos = itens.filter(i => i.info?.serve && i.info.campo).map(i => ({ campo: i.info!.campo as string, file: i.file }))
  const tem = (c: string) => campos.some(x => x.campo === c)
  if (cliente === 'rioquality') {
    return tem('completo') ? { campos, podeEnviar: true, falta: null } : { campos, podeEnviar: false, falta: 'Falta o Relatório de Entregas da Rio Quality.' }
  }
  if (campos.length === 0) return { campos, podeEnviar: false, falta: itens.length > 0 ? 'Nenhum arquivo do dia da Nutry Max reconhecido.' : null }
  if (!diaJaEnviado && !tem('romaneio')) return { campos, podeEnviar: false, falta: 'Falta o Romaneio de Entrega (8012) — sem ele o dia não começa.' }
  return { campos, podeEnviar: true, falta: null }
}
