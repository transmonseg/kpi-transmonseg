// 03/11/2026: a Nutry mandou a carga 101465 (RBI1E10) com o campo da NF vazio
// no romaneio. Em vez de descartar a linha, a NF vira um id sintetico estavel,
// unico por carga+cliente, que nunca colide com NF real (so' digitos).
// Mesmo formato no monitoramento (src/lib/romaneio.ts) pros dois sistemas
// falarem da mesma nota.
export function nfSemNumero(carga: string, codigoCliente: string): string {
  return `SEMNF-${carga}-${codigoCliente}`
}

export function ehNfSemNumero(nf: string): boolean {
  return nf.startsWith('SEMNF-')
}
