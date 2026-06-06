type DeleteMesClient = {
  from(table: 'kpi_manual_entradas'): {
    delete(): {
      eq(column: 'rede_id', value: string): {
        gte(column: 'data', value: string): {
          lte(column: 'data', value: string): PromiseLike<{ error: { message: string } | null }>
        }
      }
    }
  }
}

type RpcMesClient = {
  rpc(
    fn: 'replace_kpi_manual_mes',
    args: {
      p_rede_id: string
      p_mes: string
      p_entradas: unknown[]
      p_uploaded_by: string
    },
  ): PromiseLike<{ error: { message: string } | null }>
}

export function ultimoDiaDoMes(mes: string): string {
  const [anoRaw, mesRaw] = mes.split('-')
  const ano = Number(anoRaw)
  const mesNum = Number(mesRaw)
  const ultimo = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, '0')}`
}

export async function replaceEntradasManualMes(
  svc: RpcMesClient,
  redeId: string,
  mes: string,
  entradas: unknown[],
  uploadedBy: string,
): Promise<void> {
  const { error } = await svc.rpc('replace_kpi_manual_mes', {
    p_rede_id: redeId,
    p_mes: mes,
    p_entradas: entradas,
    p_uploaded_by: uploadedBy,
  })

  if (error) {
    throw new Error(`Erro ao importar KPI manual do mês: ${error.message}`)
  }
}

export async function deleteEntradasManualMes(
  svc: DeleteMesClient,
  redeId: string,
  mes: string,
): Promise<void> {
  const { error } = await svc
    .from('kpi_manual_entradas')
    .delete()
    .eq('rede_id', redeId)
    .gte('data', `${mes}-01`)
    .lte('data', ultimoDiaDoMes(mes))

  if (error) {
    throw new Error(`Erro ao limpar KPI manual do mês: ${error.message}`)
  }
}
