// src/lib/fusion/http.ts
// A Fusion fica atrás de um WAF que bloqueia por IP: datacenter fora do BR
// recebe 403 até num GET simples. Quando FUSION_PROXY está setado, o fetch
// sai por esse proxy (um IP brasileiro, ex.: túnel reverso para a máquina da
// operação). Sem FUSION_PROXY, usa o fetch direto (dev no Mac BR).
import { ProxyAgent, type Dispatcher } from 'undici'

let agent: Dispatcher | undefined
let agentUrl: string | undefined

function dispatcher(): Dispatcher | undefined {
  const url = process.env.FUSION_PROXY
  if (!url) return undefined
  if (!agent || agentUrl !== url) {
    agent = new ProxyAgent(url)
    agentUrl = url
  }
  return agent
}

type InitComDispatcher = RequestInit & { dispatcher?: Dispatcher }

/** fetch da Fusion: injeta o ProxyAgent quando FUSION_PROXY está presente. */
export function fusionFetch(url: string, init: RequestInit): Promise<Response> {
  const d = dispatcher()
  const i: InitComDispatcher = d ? { ...init, dispatcher: d } : init
  return fetch(url, i as RequestInit)
}
