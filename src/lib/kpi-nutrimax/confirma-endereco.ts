import { haversine } from '@/lib/utils/geo'
import type { ParadaUnitrac } from '@/lib/types/unitrac'

/** Uma linha de nutrimax_clientes_geo — cadastro próprio geocodificado a
 *  partir da "Relação clientes.xlsx" (577 lojas), reforço pra quando a
 *  Unitrac não confirma via /alvos. Ver scripts/geocodificar-clientes-nutrimax.ts. */
export type ClienteGeo = {
  nomeFantasia: string
  lat: number
  lng: number
  raioM: number
}

/** Maiúsculas, sem acento, só letras/números/espaço — pra comparar nomes
 *  vindos de fontes diferentes (Unitrac x planilha do cliente) sem colidir
 *  por causa de pontuação/acentuação diferente. */
export function normalizaNome(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Acha o cliente geocodificado cujo nome mais se aproxima do nome que a
 *  Unitrac tem pra aquele alvo — exato primeiro, depois um contém o outro.
 *  Nome curto demais (≤3 caracteres normalizados) não entra na comparação
 *  por conteúdo pra não colidir com qualquer nome que o contenha por acaso. */
export function achaClienteGeo(nomeAlvo: string, clientes: ClienteGeo[]): ClienteGeo | null {
  const alvoNorm = normalizaNome(nomeAlvo)
  if (!alvoNorm) return null

  const exato = clientes.find(c => normalizaNome(c.nomeFantasia) === alvoNorm)
  if (exato) return exato

  if (alvoNorm.length <= 3) return null
  return clientes.find(c => {
    const cNorm = normalizaNome(c.nomeFantasia)
    if (cNorm.length <= 3) return false
    return cNorm.includes(alvoNorm) || alvoNorm.includes(cNorm)
  }) ?? null
}

/** Confere se alguma parada FORA_BASE da placa caiu dentro do raio do
 *  endereço geocodificado do cliente — reforço independente do cadastro de
 *  pontos da própria Unitrac (que pode estar incompleto/errado pra algum
 *  cliente). Retorna a parada mais cedo que bateu, ou null. */
export function confirmaViaEndereco(paradas: ParadaUnitrac[], clienteGeo: ClienteGeo): ParadaUnitrac | null {
  const candidatas = paradas
    .filter(p => p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)
    .sort((a, b) => a.chegada.getTime() - b.chegada.getTime())
  for (const p of candidatas) {
    const dist = haversine(p.lat as number, p.lng as number, clienteGeo.lat, clienteGeo.lng)
    if (dist <= clienteGeo.raioM) return p
  }
  return null
}
