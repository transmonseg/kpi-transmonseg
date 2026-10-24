// Sessão vencida não vira erro cru (F3-11, AC-03). Antes, /api/* sem usuário
// recebia 307 para o /login; o fetch seguia o redirect, lia o HTML do /login
// como JSON e o Ao vivo mostrava "Unexpected token <" e tentava de novo a cada
// 10 s, para sempre. Agora o servidor responde 401 em JSON e as telas usam este
// helper: 401 (ou uma resposta que acabou no /login) leva a pessoa para
// /login?volta=<onde estava>.

/** Erro lançado depois de mandar a pessoa para o login. A tela não mostra nada nem tenta de novo. */
export class SessaoVencida extends Error {
  constructor() {
    super('Sua sessão venceu. Abrindo a tela de entrar…')
    this.name = 'SessaoVencida'
  }
}

function caminhoInterno(v: string): boolean {
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return false
  if (v === '/login' || v.startsWith('/login?') || v.startsWith('/login/')) return false
  if (v === '/api' || v.startsWith('/api/')) return false
  return true
}

/**
 * Só caminho interno de tela: nada de outro site, do próprio /login nem de /api.
 * F3-R02: o parser de URL apaga TAB/CR/LF ('/\t/evil.com' vira '//evil.com'),
 * então caractere de controle é recusado e o caminho devolvido é o já
 * normalizado pelo próprio parser, conferido de novo.
 */
export function voltaSegura(v: string | null | undefined): string | null {
  if (!v || /[\u0000-\u001F\u007F]/.test(v) || !caminhoInterno(v)) return null
  let u: URL
  try { u = new URL(v, 'http://x') } catch { return null }
  if (u.origin !== 'http://x') return null
  const n = u.pathname + u.search + u.hash
  return caminhoInterno(n) ? n : null
}

export function urlLogin(atual: string): string {
  const volta = voltaSegura(atual)
  return volta ? `/login?volta=${encodeURIComponent(volta)}` : '/login'
}

type RespostaMin = { status: number; redirected: boolean; url: string }

/** 401, ou um fetch que seguiu redirect e terminou no /login (servidor ainda sem o 401). */
export function respostaDeSessaoVencida(r: RespostaMin): boolean {
  if (r.status === 401) return true
  if (!r.redirected) return false
  try { return new URL(r.url, 'http://x').pathname === '/login' } catch { return false }
}

type Opcoes = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  irPara?: (url: string) => void
  atual?: string
}

/** fetch das telas: sessão vencida leva ao login e lança SessaoVencida; o resto devolve a resposta. */
export async function buscarComSessao(input: RequestInfo | URL, init?: RequestInit, opcoes: Opcoes = {}): Promise<Response> {
  const f = opcoes.fetch ?? ((i: RequestInfo | URL, o?: RequestInit) => fetch(i, o))
  const r = await f(input, init)
  if (respostaDeSessaoVencida(r)) {
    const atual = opcoes.atual ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/painel')
    const irPara = opcoes.irPara ?? ((url: string) => { window.location.href = url })
    irPara(urlLogin(atual))
    throw new SessaoVencida()
  }
  return r
}

/** r.json() que nunca mostra "Unexpected token <": página HTML no lugar de dados vira texto claro. */
export async function lerJson<T = unknown>(r: Response): Promise<T> {
  const texto = await r.text()
  try {
    return JSON.parse(texto) as T
  } catch {
    throw new Error('O servidor respondeu uma página em vez dos dados. Recarregue a tela; se continuar, entre de novo.')
  }
}
