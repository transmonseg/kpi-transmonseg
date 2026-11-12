// 12/11: a ordem da roteirização direto da Fusion, sem ninguém exportar.
// Achado em 12/11 em "3.1. Gestão das Cargas" (track/gestaoromaneio/
// gestaoromaneio.html -> Relatórios -> Relatório de Entregas ->
// gerarRelatorioEntregas() em js/track/gestaoromaneio/gestaoromaneio.js): a
// página relatorio_monitoramento_cargas_entregas.php tem o link "RELATÓRIO
// EXCEL" (..._excel.php), que é o mesmo arquivo que a Ana sobe à mão
// (blocos CARGA / ENTREGAS DETALHADAS, coluna ORDEM). r = romaneios por
// página: 1.000 cobre o dia da RQ (~100) com folga.
import { fusionBaixar } from '@/lib/fusion/client'
import { parseOrdemRota, type OrdemRotaLinha } from './parse-ordem-rota'

export const PATH_ORDEM_ROTA = '/html/track/gestaoromaneio/relatorio_monitoramento_cargas_entregas_excel.php'

export function urlOrdemRotaFusion(data: string): string {
  const br = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
  return `${PATH_ORDEM_ROTA}?di=${br}&df=${br}&n=&v=&p=1&r=1000`
}

export async function buscarOrdemRotaFusion(data: string): Promise<OrdemRotaLinha[]> {
  return parseOrdemRota(await fusionBaixar(urlOrdemRotaFusion(data)))
}
