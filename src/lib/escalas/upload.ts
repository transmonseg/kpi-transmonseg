type DeleteEscalaClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

export async function deleteEscalaUploadExistente(
  svc: DeleteEscalaClient,
  uploadId: string,
): Promise<void> {
  const { error } = await svc.from('escala_uploads').delete().eq('id', uploadId)
  if (error) {
    throw new Error(`Erro ao remover escala anterior: ${error.message}`)
  }
}
