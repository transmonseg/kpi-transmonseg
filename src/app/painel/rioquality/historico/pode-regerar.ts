// Regerar precisa do arquivo de entregas guardado (romaneio_storage_path). O
// formato antigo tambem guarda o Custos (escala_storage_path); o de arquivo
// unico nao -- a rota /api/kpi/rioquality/gerar regera so' com o romaneio
// nesse caso (completaBuf).
export function podeRegerar(g: { escala_storage_path: string | null; romaneio_storage_path: string | null }): boolean {
  return Boolean(g.romaneio_storage_path)
}
