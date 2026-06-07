import { contextBridge, ipcRenderer } from 'electron'
import type { GerarOfflineReq, RedeResultOffline } from './gerar-offline'

type GerarOfflineResp = { ok: true; redes: RedeResultOffline[] } | { ok: false; error: string }

const api = {
  /** Modo desktop: a tela usa isso pra decidir o caminho offline. */
  isDesktop: true,
  // Geração 100% offline (mesmo motor do site) — devolve RedeResult[] + preview.
  gerarOffline: (req: GerarOfflineReq): Promise<GerarOfflineResp> =>
    ipcRenderer.invoke('gerar-offline', req),
  cadastroStatus: () => ipcRenderer.invoke('cadastro-status'),
  cadastroAtualizar: () => ipcRenderer.invoke('cadastro-atualizar'),
  filaListar: () => ipcRenderer.invoke('fila-listar'),
  filaSincronizar: () => ipcRenderer.invoke('fila-sincronizar'),
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
