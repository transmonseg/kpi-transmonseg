type CadastroPlacasClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

export async function carregarCadastroPlacasPdf(
  svc: CadastroPlacasClient,
  historicoLimit = 20000,
): Promise<Set<string>> {
  const [frotaRes, histRes] = await Promise.all([
    svc.from('veiculos').select('placa_norm').eq('ativo', true),
    svc.from('unitrac_paradas').select('placa_norm').not('placa_norm', 'is', null).limit(historicoLimit),
  ])

  const placas = new Set<string>()
  for (const row of [...(frotaRes.data ?? []), ...(histRes.data ?? [])]) {
    if (row.placa_norm) placas.add(String(row.placa_norm))
  }
  return placas
}
