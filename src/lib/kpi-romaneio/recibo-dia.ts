// F3-06 (ING-16, ING-12): avisos do recibo do envio do dia, SEM bloquear.
// Mesma regra da aba Avisos da planilha (detectarDescasamentos, cada escala
// contra a sua origem e só quando o documento veio), mais a placa marcada
// "VEICULO" na coluna DUPLICADO da 8081 (mesma placa em 2 cargas).
import { detectarDescasamentos } from './avisos'
import { veiculosEmDuasCargas } from './escala-duplicado'
import { PAO_PREFIXO } from './constants'
import { normPlaca } from '@/lib/unitrac-api'
import type { DiaGuardado } from './mesclar-envio'
import type { LinhaEscala, LinhaRomaneio } from './types'

export type AvisoRecibo = { tipo: 'sem_romaneio' | 'sem_escala' | 'nf_divergente' | 'veiculo_duas_cargas'; texto: string }

function cargasDoRomaneio(linhas: LinhaRomaneio[]) {
  const m = new Map<string, { carga: string; placaNorm: string; nfs: Set<string> }>()
  for (const l of linhas) {
    const placaNorm = normPlaca(l.placa)
    const k = `${l.carga}::${placaNorm}`
    const c = m.get(k) ?? { carga: l.carga, placaNorm, nfs: new Set<string>() }
    c.nfs.add(l.nf)
    m.set(k, c)
  }
  return [...m.values()].map(c => ({ carga: c.carga, placaNorm: c.placaNorm, nfsRomaneio: c.nfs.size }))
}

function descasamentos(escala: LinhaEscala[], linhas: LinhaRomaneio[]): AvisoRecibo[] {
  const destino = new Map(escala.map(e => [`${e.carga}::${e.placaNorm}`, e.destino]))
  const quem = (carga: string, placa: string) => {
    const d = destino.get(`${carga}::${placa}`)
    return `${placa}${d ? `, ${d}` : ''}`
  }
  const out: AvisoRecibo[] = []
  for (const a of detectarDescasamentos(escala, cargasDoRomaneio(linhas))) {
    if (a.motivo === 'sem_romaneio') out.push({ tipo: a.motivo, texto: `Carga ${a.carga} (${quem(a.carga, a.placa)}) está na escala e não veio no romaneio.` })
    else if (a.motivo === 'sem_escala') out.push({ tipo: a.motivo, texto: `Carga ${a.carga} (${a.placa}) está no romaneio e não está na escala.` })
    else if (a.motivo === 'nf_divergente') out.push({ tipo: a.motivo, texto: `Carga ${a.carga} (${quem(a.carga, a.placa)}): ${a.nfEscala} notas na escala e ${a.nfRomaneio} no romaneio.` })
  }
  return out
}

export function avisosDoRecibo(dia: DiaGuardado): AvisoRecibo[] {
  const ehPao = (l: { carga?: string }) => String(l.carga ?? '').startsWith(PAO_PREFIXO)
  const avisos: AvisoRecibo[] = [
    ...(dia.escalaEnviada ? descasamentos(dia.escala, dia.romaneio.filter(l => !ehPao(l))) : []),
    ...(dia.paoEnviado ? descasamentos(dia.pao.escala, dia.pao.linhas.filter(ehPao)) : []),
  ]
  if (dia.escalaEnviada) {
    for (const v of veiculosEmDuasCargas(dia.escala)) {
      avisos.push({ tipo: 'veiculo_duas_cargas', texto: `Placa ${v.placa} em ${v.cargas.length} cargas na escala (${v.cargas.join(' e ')}).` })
    }
  }
  return avisos
}
