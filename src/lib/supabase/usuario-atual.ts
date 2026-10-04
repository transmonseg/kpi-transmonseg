import { cache } from 'react'
import { createClient } from './server'
import { resolveUserDesktopAware } from './desktop-auth'

// Lentidao do painel (04/10/2026): layout do /painel + layout da empresa +
// pagina validavam o login cada um (1 ida ao auth cada). cache() faz uma por
// requisicao. So' pra Server Components/Route Handlers -- o middleware tem o
// proprio cliente (cookies do request).
export const usuarioAtual = cache(async () => resolveUserDesktopAware(await createClient()))
