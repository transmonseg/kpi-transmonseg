import { contextBridge, ipcRenderer } from 'electron'

type GerarReq = { escalaPaths: string[]; unitracPaths: string[]; data: string }

const api = {
  escolherArquivos: (): Promise<string[]> => ipcRenderer.invoke('escolher-arquivos'),
  gerar: (req: GerarReq) => ipcRenderer.invoke('gerar', req),
  cadastroStatus: () => ipcRenderer.invoke('cadastro-status'),
  cadastroAtualizar: () => ipcRenderer.invoke('cadastro-atualizar'),
  filaListar: () => ipcRenderer.invoke('fila-listar'),
  filaSincronizar: () => ipcRenderer.invoke('fila-sincronizar'),
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
