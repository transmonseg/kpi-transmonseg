// F1-16 (plano mestre 23/10): causa provavel de cada NF pendente, para o
// diagnostico das prioridades da Erica. So' leitura e so' para o dono: nao
// muda rotulo nem taxa do KPI. Quatro causas do plano + "em andamento" para a
// rota que ainda roda. "forte" = ha' evidencia de GPS que sustenta a causa;
// "fraca" = so' o rotulo do KPI (ou evidencia indireta).
import { haversine } from '@/lib/utils/geo'
import { categoriaPendencia, CATEGORIA_PLACA_PROVISORIA } from '@/lib/kpi-romaneio/resumo-dashboard'

export type Causa = 'ponto_cadastro' | 'rastreador_sinal' | 'troca_placa' | 'operacao_real' | 'em_andamento'
export type Forca = 'forte' | 'fraca'

export type Buraco = { inicio: string; fim: string; minutos: number; a: { lat: number; lng: number }; b: { lat: number; lng: number } }
export type EvidenciaNf = {
  situacao: string
  status: string
  investigacao: { categoria: string; distM: number | null } | null
  /** Parada (>= 2 min, fora da base) de OUTRA placa da frota a <= 150 m do ponto no dia. */
  outraPlaca: { placa: string; distM: number; hora: string; minutos: number; cobreCarga: boolean } | null
  /** Buraco de sinal da propria placa em que o cliente cabe (KN-05). */
  buraco: { inicio: string; fim: string; minutos: number; desvioM: number } | null
  /** Leituras da propria placa na janela de operacao (05-21 h) e quantas com atraso > 15 min. */
  rastreador: { leituras: number; atrasadas: number } | null
}
export type ResultadoCausa = { causa: Causa; forca: Forca; motivo: string }

/** KN-06: mais de 30% das leituras da operacao atrasadas, ou nenhuma leitura. */
export function rastreadorComFalha(r: { leituras: number; atrasadas: number } | null): boolean {
  if (!r) return false
  if (r.leituras === 0) return true
  return r.atrasadas / r.leituras > 0.3
}

/** KN-05: o cliente cabe no buraco se o desvio A->P->B for <= 3 km, ou se
 *  ir de A a P e a B a 40 km/h + 5 min de entrega couber na duracao. */
export function buracoCompativel(buracos: Buraco[], lat: number, lng: number): { inicio: string; fim: string; minutos: number; desvioM: number } | null {
  let melhor: { inicio: string; fim: string; minutos: number; desvioM: number } | null = null
  for (const b of buracos) {
    if (b.minutos < 15) continue
    const ap = haversine(b.a.lat, b.a.lng, lat, lng), pb = haversine(lat, lng, b.b.lat, b.b.lng), ab = haversine(b.a.lat, b.a.lng, b.b.lat, b.b.lng)
    const desvio = ap + pb - ab
    const tempo = ((ap + pb) / 1000 / 40) * 60 + 5
    if (desvio <= 3000 || tempo <= b.minutos) {
      if (!melhor || desvio < melhor.desvioM) melhor = { inicio: b.inicio, fim: b.fim, minutos: b.minutos, desvioM: Math.round(desvio) }
    }
  }
  return melhor
}

const minDoDia = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Tira os buracos que sao apagao do coletor na frota inteira (20/10
 *  08:00-09:30): a cadeia de paradas da Unitrac seguiu continua, entao nao e'
 *  falha do rastreador desta placa. Sai o buraco com >= 50% dentro do apagao. */
export function descontarApagoes(buracos: Buraco[], apagoes: { inicio: string; fim: string }[]): Buraco[] {
  return buracos.filter(b => {
    const i = minDoDia(b.inicio), f = minDoDia(b.fim)
    if (f <= i) return true
    const dentro = apagoes.reduce((s, a) => s + Math.max(0, Math.min(f, minDoDia(a.fim)) - Math.max(i, minDoDia(a.inicio))), 0)
    return dentro * 2 < f - i
  })
}

const pct = (r: { leituras: number; atrasadas: number }) => (r.leituras ? Math.round((100 * r.atrasadas) / r.leituras) : 100)
const dist = (e: EvidenciaNf) => (e.investigacao?.distM != null ? `${e.investigacao.distM} m` : 'distancia desconhecida')

export function classificarCausa(e: EvidenciaNf): ResultadoCausa {
  // categoriaPendencia compara "PASSOU A 500m-2km" com o texto em maiusculas e
  // nunca casa (cai em "Outros"); aqui o rotulo e' lido direto.
  const cat = /^ENTREGUE/.test(e.status) ? null : /^PASSOU A 500M-2KM/i.test(e.status) ? 'Passou perto sem parar' : categoriaPendencia(e.status)
  const inv = e.investigacao?.categoria ?? null
  const outra = e.outraPlaca
  const descOutra = outra ? `${outra.placa} parou a ${outra.distM} m as ${outra.hora} por ${outra.minutos} min` : ''

  if (e.situacao === 'pendente') return { causa: 'em_andamento', forca: 'fraca', motivo: 'rota ainda rodando no ultimo calculo (dia em curso)' }
  if (e.situacao === 'sem_rastreador' || cat === 'Sem rastreador') return { causa: 'rastreador_sinal', forca: 'forte', motivo: 'KPI: sem rastreador no dia' }
  // D-04 (plano mestre 23/10): placa provisoria/ficticia nao identifica o carro.
  if (cat === CATEGORIA_PLACA_PROVISORIA) return { causa: 'troca_placa', forca: 'forte', motivo: 'placa provisória ou fictícia: falta a operação informar o carro que fez a carga' }
  if (outra?.cobreCarga) return { causa: 'troca_placa', forca: 'forte', motivo: `${descOutra}; a mesma placa parou nos outros clientes desta carga` }
  if (rastreadorComFalha(e.rastreador)) {
    const r = e.rastreador!
    return { causa: 'rastreador_sinal', forca: 'forte', motivo: r.leituras === 0 ? 'nenhuma leitura do rastreador no dia (05-21 h)' : `rastreador com falha no dia: ${pct(r)}% das leituras de 05-21 h com atraso > 15 min` }
  }
  if (cat === 'Carga sem placa') return { causa: 'troca_placa', forca: outra ? 'forte' : 'fraca', motivo: outra ? `carga sem placa; ${descOutra}` : 'carga sem placa no romaneio; nenhum carro da frota parou no cliente' }
  if (inv === 'parou_no_cliente') return { causa: 'ponto_cadastro', forca: 'forte', motivo: `o carro parou a ${dist(e)} do ponto e o KPI nao contou (${cat ?? 'sem rotulo'})` }

  const negativa = cat === 'Não foi ao cliente' || cat === 'Placa da escala divergente' || cat === 'Passou sem registrar' || cat === 'Parada de outro endereço' || cat === 'Parada compartilhada (revisar)' || cat === 'Não saiu da base'
  if (negativa && e.buraco) {
    return { causa: 'rastreador_sinal', forca: e.buraco.desvioM <= 3000 ? 'forte' : 'fraca', motivo: `buraco de sinal ${e.buraco.inicio}-${e.buraco.fim} (${e.buraco.minutos} min) com o cliente no caminho (desvio ${e.buraco.desvioM} m)` }
  }
  if (outra) return { causa: 'troca_placa', forca: 'fraca', motivo: `${descOutra} (so' esta NF da carga)` }
  if (cat === 'Placa da escala divergente') return { causa: 'troca_placa', forca: 'fraca', motivo: 'KPI: placa da escala nao passou; nenhum carro da frota parou no cliente' }

  if (cat === 'Endereço não localizado') return { causa: 'ponto_cadastro', forca: 'forte', motivo: 'endereco sem coordenada' }
  if (cat === 'Cadastro divergente' || cat === 'Coordenada imprecisa' || cat === 'Parada próxima' || cat === 'Passou perto sem parar' || cat === 'Ilha (sem estrada)' || /^CLIENTE NA BASE/i.test(e.status)) {
    return { causa: 'ponto_cadastro', forca: inv === 'parou_perto' ? 'forte' : 'fraca', motivo: `${cat === 'Outros' ? 'cliente na base' : cat}; parada mais perto a ${dist(e)}` }
  }
  if (cat === 'Passou sem registrar') return { causa: 'rastreador_sinal', forca: 'fraca', motivo: 'passou no endereco sem parada registrada (parada curta ou leitura espacada)' }
  if (inv === 'parou_perto' || inv === 'passou_sem_parar') return { causa: 'ponto_cadastro', forca: 'fraca', motivo: `o carro chegou a ${dist(e)} do ponto (${cat})` }
  if (cat === 'Não foi ao cliente') return { causa: 'operacao_real', forca: inv === 'nao_chegou_perto' ? 'forte' : 'fraca', motivo: `GPS bom e nenhum carro da frota no cliente; parada mais perto a ${dist(e)}` }
  return { causa: 'operacao_real', forca: 'fraca', motivo: `${cat ?? 'sem rotulo'}; parada mais perto a ${dist(e)}, nenhum carro da frota no cliente` }
}

/** Prioridades da Erica (mensagem de 22-23/10): rotas pelo nome e placas. */
export const ROTAS_ERICA = ['ITAPERUNA 2', 'TRES RIOS', 'DUQUE DE CAXIAS 2', 'ZONA NORTE 2'] as const
export const PLACAS_ERICA = ['RQU2G47', 'RQV9B26', 'TOS2B69'] as const

const normRota = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** A placa-dia entra no diagnostico pela rota, pela placa ou pelas duas. */
export function prioridadeDaErica(destino: string, placa: string): { rota: string | null; placa: string | null } | null {
  const r = normRota(destino ?? '')
  const rota = (ROTAS_ERICA as readonly string[]).includes(r) ? r : null
  const p = (PLACAS_ERICA as readonly string[]).includes(placa) ? placa : null
  return rota || p ? { rota, placa: p } : null
}
