// Envio do dia no Ao vivo (08/10, Erica: "se esquecer de colocar um arquivo nao
// consegue depois" / "fui la e coloquei e nao gerou"): cada envio SUBSTITUIA o dia
// inteiro (escala/pao ausentes viravam vazios) e o romaneio era obrigatorio, entao
// nem dava pra mandar so' o arquivo esquecido, e mandar o romaneio de novo apagava o
// pao. Agora so' o que veio troca; o resto do dia fica.
import type { LinhaEscala, LinhaRomaneio } from './types'

export type DiaGuardado = {
  romaneio: LinhaRomaneio[]
  escala: LinhaEscala[]
  pao: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] }
  escalaEnviada: boolean
  paoEnviado: boolean
}
export type EnvioNovo = { romaneio?: LinhaRomaneio[]; escala?: LinhaEscala[]; pao?: { linhas: LinhaRomaneio[]; escala: LinhaEscala[] } }

export function mesclarEnvio(guardado: DiaGuardado | null, novo: EnvioNovo): DiaGuardado | { erro: string } {
  if (!novo.romaneio && !novo.escala && !novo.pao) return { erro: 'Escolha pelo menos um arquivo.' }
  if (!guardado && !novo.romaneio) return { erro: 'Envie o Romaneio de Entrega (PDF).' }
  const base: DiaGuardado = guardado ?? { romaneio: [], escala: [], pao: { linhas: [], escala: [] }, escalaEnviada: false, paoEnviado: false }
  return {
    romaneio: novo.romaneio ?? base.romaneio,
    escala: novo.escala ?? base.escala,
    pao: novo.pao ?? base.pao,
    escalaEnviada: novo.escala ? true : base.escalaEnviada,
    paoEnviado: novo.pao ? true : base.paoEnviado,
  }
}
