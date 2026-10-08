import { createHmac, randomUUID } from 'node:crypto'

// Login unico com o monitoramento (08/10, "to na conta da Erica e o monitoramento
// mostra Rio Quality"): o quadro do monitoramento usava a sessao que ja' estivesse
// aberta no navegador. O painel abre o quadro por /api/acessos/entrar-central de
// la' com este passe (60 s, uso unico, PASSE_CENTRAL_SECRET -- segredo so' disso,
// nunca o MOTOR_SECRET) e o monitoramento entra na conta do mesmo email.
// Formato conferido em MONITORAMENTO src/lib/passe-central.ts.
const VALIDADE_S = 60

export function assinarPasse(email: string, segredo: string, agoraS: number): string {
  const corpo = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: agoraS + VALIDADE_S, j: randomUUID() })).toString('base64url')
  return `${corpo}.${createHmac('sha256', segredo).update(`entrar-central:${corpo}`).digest('base64url')}`
}
