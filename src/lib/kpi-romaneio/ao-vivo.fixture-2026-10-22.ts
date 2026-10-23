// Fixture real (só leitura) do Ao vivo da Nutry Max de 22/10/2026, usada pelos
// testes do F1-09 (planilha que fecha com a taxa) e do F1-10 ("Baixar
// pendentes" separado). Resumo gravado no dia: taxa 96,9 = 2.183 / 2.253,
// 2.272 NFs, 19 de carga sem placa fora da conta, 1 sem rastreador (LLD4202).
import fixture from './ao-vivo.fixture-2026-10-22.json'
import { categoriaPendencia, type CargaResumo, type NfResumo } from './resumo-dashboard'

export function nfsDe2210(): { nfs: NfResumo[]; cargas: CargaResumo[] } {
  const nfs: NfResumo[] = []
  const cargas: CargaResumo[] = []
  for (const p of fixture.placas) {
    const vistas = new Set<string>()
    for (const linha of p.nfs) {
      const [carga, nf, status] = linha as [string, string, string?]
      nfs.push({
        placa: p.placa, carga, nf, cliente: `CLIENTE ${nf}`, endereco: '', chegada: null, saida: null, tempoMin: null,
        status: status ?? 'ENTREGUE', categoria: status ? categoriaPendencia(status) : null,
      })
      if (vistas.has(carga)) continue
      vistas.add(carga)
      cargas.push({ carga, placa: p.placa, destino: p.destino, motorista: '', nfPlanejado: null, nfConfirmadas: null, km: null, saida: null, chegada: null, tempoOperacaoMin: null, tempoMedioMin: null })
    }
  }
  return { nfs, cargas }
}
