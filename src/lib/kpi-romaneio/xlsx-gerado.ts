// Item 1 (auditoria 01/10): o xlsx GERADO nunca era guardado
// (kpi_romaneio_geracoes.arquivo_storage_path sempre NULL). Agora sobe pro
// mesmo bucket dos inputs, ao lado deles (`<prefixo>-kpi.xlsx`), e a tela
// de historico permite baixar o arquivo salvo sem regenerar.
//
// Falha no upload NUNCA derruba a geracao -- o xlsx ja' esta' pronto pra
// ser devolvido; so' loga e devolve null (mesmo padrao do PDF do Pao).

export const BUCKET_KPI_ROMANEIO = 'kpi-romaneio-inputs'
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type StorageUploader = {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Buffer, opts: { contentType: string }) => Promise<{ error: { message: string } | null }>
    }
  }
}

/** `<cliente>/<data>/<uuid>` -- mesmo formato usado pros inputs. */
export function novoPrefixoGeracao(cliente: string, data: string): string {
  return `${cliente}/${data}/${crypto.randomUUID()}`
}

export function caminhoXlsxGerado(prefixo: string): string {
  return `${prefixo}-kpi.xlsx`
}

/** Sobe o xlsx gerado. Devolve o caminho salvo, ou null se falhou (loga). */
export async function guardarXlsxGerado(svc: StorageUploader, prefixo: string, xlsx: Buffer): Promise<string | null> {
  const caminho = caminhoXlsxGerado(prefixo)
  try {
    const r = await svc.storage.from(BUCKET_KPI_ROMANEIO).upload(caminho, xlsx, { contentType: TIPO_XLSX })
    if (r.error) {
      console.error('Erro ao guardar xlsx gerado no Storage:', r.error.message)
      return null
    }
    return caminho
  } catch (err) {
    console.error('Erro ao guardar xlsx gerado no Storage:', err)
    return null
  }
}
