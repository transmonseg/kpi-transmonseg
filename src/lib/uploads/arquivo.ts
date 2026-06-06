export type ExtensaoUpload = 'pdf' | 'xlsx'

export function extensaoUploadSuportada(filename: string): ExtensaoUpload | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}
