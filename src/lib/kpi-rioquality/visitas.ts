import type { LinhaGeocodificada, Visita } from '@/lib/kpi-romaneio/types'
import type { UnitracParadaRow } from '@/lib/kpi/matcher'
import { RAIO_ENTREGA_METROS } from '@/lib/kpi-romaneio/constants'
import { RAIO_VIZINHANCA_METROS, RAIO_CONFIRMACAO_AMPLIADO_METROS, RAIO_PARADA_CORREDOR_M, PERMANENCIA_MIN_CORREDOR_MIN } from './constants'

// Correcao 02/10 (falso positivo massivo no corredor): endereco SEM NUMERO em
// via longa geocodifica para o MESMO ponto generico e uma unica parada confirma
// dezenas de NFs em locais distintos. Endereco com numero (ou padrao de
// shopping/condominio) = legitimo; sem numero = NAO usar corredor.
// Formato do endereco exibido (parse-planilhas.ts): "RUA - BAIRRO, CIDADE" ou
// "RUA, CIDADE". Numero aparece como "RUA, 123" ou "RUA 123". S/N e SN sao
// tratados como sem numero.
export function enderecoTemNumero(endereco: string | undefined | null): boolean {
  if (!endereco) return false
  const s = endereco.trim()
  if (!s) return false
  // "S/N", "SN", "S.N." => sem numero
  if (/\bS[./]?\s*N\b/i.test(s)) return false
  // Numero apos virgula/traco: "RUA, 123", "RUA - 123", "RUA,123"
  if (/[,–\-]\s*\d+/.test(s)) return true
  // Numero no inicio: "123 RUA" (raro mas possivel)
  if (/^\d+\s/.test(s)) return true
  // Numero solto entre palavras: "RUA 123 X" -- evita falso positivo com
  // nomes proprios numericos ("RUA 25 DE MARCO", "AVENIDA 7 DE SETEMBRO")
  // verificando se o numeral e' seguido de " DE " (data/nome proprio).
  const m = s.match(/\b(\d+)\b/g)
  if (!m) return false
  for (let i = 0; i < m.length; i++) {
    const tok = m[i]
    const n = Number(tok)
    if (n >= 1 && n <= 99999) {
      // descarta tokens que parecem ano (19xx/20xx)
      if (n >= 1900 && n <= 2100) continue
      // descarta numeral seguido de " DE " (nome proprio: "25 DE MARCO")
      const apos = s.indexOf(tok) + tok.length
      const resto = s.slice(apos)
      if (/^\s+DE\s/i.test(resto)) continue
      return true
    }
  }
  return false
}

/** Limite proporcional de NFs por parada no corredor (correcao 02/10):
 *  max(1, ceil(duracaoMin / 3)). Parada de 5 min -> 2 NFs; 30 min -> 10 NFs. */
export function limiteNfsPorParadaNoCorredor(duracaoMs: number): number {
  const min = duracaoMs / 60_000
  if (!Number.isFinite(min) || min <= 0) return 0
  return Math.max(1, Math.ceil(min / 3))
}

// Casamento INCLUSIVO entrega x parada GPS -- achado real 05/09 (primeira
// geracao Rio Quality): montarVisitas da Nutry Max casa cada parada com UMA
// entrega (a mais proxima); na Rio Quality varias entregas da mesma placa
// caem na mesma rua/coordenada (romaneio sem numero) e so' uma confirmava.
// Aqui a pergunta e' feita por ENTREGA: "houve parada a <= 500m de mim?" --
// todas as que estao no raio confirmam, cada uma com a parada de maior
// permanencia. Depois, vizinhanca: entrega sem parada propria herda a visita
// de uma irma confirmada DIRETAMENTE a <= 800m (sem encadear), marcada
// viaVizinhanca pra sair diferente no relatorio.

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

const RAIO_PARADA_COLADA_M = 150
// F2-14 (RQ-05): a colada so' ganha da mais longa se esta estiver mais de
// 100 m mais longe do ponto (os 985 casos da auditoria estavam a >250 m).
const MARGEM_COLADA_M = 100
// RQ-02 (auditoria 20/10)
const RAIO_MAX_CORREDOR_SEM_BAIRRO_M = 2_000

/** Rua do endereco de exibicao da RQ ("RUA - BAIRRO, CIDADE" ou "RUA, CIDADE"). */
function ruaDoEnderecoRQ(endereco: string): string {
  return endereco.split(/ - |,/)[0].trim().toUpperCase()
}
/** F2-14 (RQ-02): rua como veio da planilha/Fusion quando o pipeline manda. */
function ruaDaLinha(l: LinhaGeocodificada): string {
  return l.ruaRQ ?? ruaDoEnderecoRQ(l.endereco)
}
/** F2-14 (RQ-02): "tem bairro" pelo formato "RUA - BAIRRO, CIDADE" -- com a
 *  rua conhecida, " - " DENTRO do nome (Fusion: "RUA X QUADRA - DE", sem
 *  bairro) nao conta como bairro. */
function linhaSemBairro(l: LinhaGeocodificada): boolean {
  return l.ruaRQ != null ? !l.endereco.startsWith(`${l.ruaRQ} - `) : !l.endereco.includes(' - ')
}

// F2-14 (RQ-02, revisao Fases 3-4): comparacao de rua por forma normalizada.
// Na RQ de 20-23/10, 94 pares placa+cidade tinham a mesma rua escrita de dois
// jeitos ("AV." x "AVENIDA", "EST" x "ESTRADA", "DO PEPE" x "PEPE", acento).
const TIPO_VIA: Record<string, string> = {
  R: 'RUA', RUA: 'RUA', AV: 'AVENIDA', AVEN: 'AVENIDA', AVENIDA: 'AVENIDA', EST: 'ESTRADA', ESTR: 'ESTRADA', ESTRADA: 'ESTRADA',
  TV: 'TRAVESSA', TRAV: 'TRAVESSA', TRAVESSA: 'TRAVESSA', AL: 'ALAMEDA', ALAMEDA: 'ALAMEDA', PCA: 'PRACA', PC: 'PRACA', PRACA: 'PRACA',
  ROD: 'RODOVIA', RODOVIA: 'RODOVIA', LGO: 'LARGO', LARGO: 'LARGO', BECO: 'BECO', VILA: 'VILA', VIELA: 'VIELA', SERVIDAO: 'SERVIDAO',
  LADEIRA: 'LADEIRA', LAD: 'LADEIRA', CAMINHO: 'CAMINHO', PRAIA: 'PRAIA', CAMPO: 'CAMPO',
}
// Titulos abreviados (so' com 2+ letras: "RUA D" e' rua generica, nao "DOM").
const TITULO: Record<string, string> = {
  DR: 'DOUTOR', PROF: 'PROFESSOR', PROFA: 'PROFESSORA', CEL: 'CORONEL', GAL: 'GENERAL', GEN: 'GENERAL', STA: 'SANTA', STO: 'SANTO',
  PRES: 'PRESIDENTE', MAL: 'MARECHAL', ENG: 'ENGENHEIRO', CAP: 'CAPITAO', VER: 'VEREADOR', SEN: 'SENADOR', DEP: 'DEPUTADO',
  DES: 'DESEMBARGADOR', MIN: 'MINISTRO', GOV: 'GOVERNADOR', PE: 'PADRE', SGT: 'SARGENTO', TEN: 'TENENTE', BRIG: 'BRIGADEIRO',
  ALM: 'ALMIRANTE', COM: 'COMENDADOR', CONS: 'CONSELHEIRO', VISC: 'VISCONDE',
}
const LIGACAO = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'])

/** Tipo de via (expandido, null se a rua nao comeca por um) e nome sem
 *  acento, pontuacao, preposicoes e com titulos expandidos. */
function partesRua(rua: string): { tipo: string | null; nome: string } {
  const tokens = rua.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Z0-9]+/).filter(Boolean)
  const tipo = tokens.length > 0 ? TIPO_VIA[tokens[0]] ?? null : null
  const resto = tipo ? tokens.slice(1) : tokens
  return { tipo, nome: resto.map(t => TITULO[t] ?? t).filter(t => !LIGACAO.has(t)).join(' ') }
}
/** Mesma rua: mesmo nome normalizado e mesmo tipo de via (quando os dois
 *  dizem o tipo -- RUA X e TRAVESSA X sao vias diferentes). */
function mesmaRua(a: string, b: string): boolean {
  if (a === b) return true
  const pa = partesRua(a), pb = partesRua(b)
  return pa.nome === pb.nome && (pa.tipo == null || pb.tipo == null || pa.tipo === pb.tipo)
}

// RQ-02 (auditoria 20/10) + F2-14: rua generica junta vias de bairros
// diferentes. Alem de "RUA A"/"RUA 2", na RQ de 20-23/10: RUA QUATRO (7),
// RUA CINCO (7), RUA DOIS (5), RUA PROJETADA B, TRAVESSA DOIS, RUA 05.
const NUMERO_POR_EXTENSO = new Set(['UM', 'UMA', 'DOIS', 'DUAS', 'TRES', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE', 'DEZ',
  'ONZE', 'DOZE', 'TREZE', 'QUATORZE', 'CATORZE', 'QUINZE', 'DEZESSEIS', 'DEZESSETE', 'DEZOITO', 'DEZENOVE', 'VINTE'])
export function ruaGenerica(rua: string): boolean {
  const { tipo, nome } = partesRua(rua)
  if (!tipo) return false
  if (nome === '') return true // "RUA E" (o E sai como ligacao)
  if (/^([A-Z]|\d+|[A-Z] ?\d+|\d+ ?[A-Z])$/.test(nome)) return true
  if (NUMERO_POR_EXTENSO.has(nome)) return true
  return /^(PROJETADA|SEM NOME|SEM DENOMINACAO)\b/.test(nome)
}
const PERMANENCIA_MIN_COLADA_MS = 3 * 60_000

export function montarVisitasInclusivas(linhas: LinhaGeocodificada[], paradas: UnitracParadaRow[]): Map<string, Visita> {
  const visitas = new Map<string, Visita>()
  const comCoord = linhas.filter((l): l is LinhaGeocodificada & { lat: number; lng: number } => l.lat != null && l.lng != null)
  const foraBase = paradas.filter((p): p is UnitracParadaRow & { lat: number; lng: number } =>
    p.classificacao === 'FORA_BASE' && p.lat != null && p.lng != null)

  // 1) direto: cada entrega pega a parada de maior permanencia dentro do raio.
  //    Duas faixas -- ate' RAIO_ENTREGA_METROS e' confirmacao normal; entre
  //    ele e RAIO_CONFIRMACAO_AMPLIADO_METROS confirma MARCADA (achado 05/09:
  //    romaneio sem numero, entregas com geocode certo ficavam pendentes por
  //    47m e 107m alem do raio). A faixa de dentro sempre ganha da de fora,
  //    mesmo que a de fora tenha permanencia maior.
  // RQ-02: parada que confirmou DIRETO uma NF -> ruas dessas NFs.
  const ruasPorParadaDireta = new Map<string, Set<string>>()
  for (const linha of comCoord) {
    type Cand = { parada: UnitracParadaRow; dist: number; dur: number; ampliado: boolean; colada: boolean }
    const cands: Cand[] = []
    for (const parada of foraBase) {
      const dist = haversine(parada.lat, parada.lng, linha.lat, linha.lng)
      if (dist > RAIO_CONFIRMACAO_AMPLIADO_METROS) continue
      const fim = parada.fim_real ?? parada.saida ?? parada.chegada
      const dur = new Date(fim).getTime() - new Date(parada.chegada).getTime()
      cands.push({ parada, dist, dur, ampliado: dist > RAIO_ENTREGA_METROS, colada: dist <= RAIO_PARADA_COLADA_M && dur >= PERMANENCIA_MIN_COLADA_MS })
    }
    // A faixa de dentro sempre ganha da de fora.
    const faixa = cands.some(c => !c.ampliado) ? cands.filter(c => !c.ampliado) : cands
    const maisLonga = (cs: Cand[]) => cs.reduce<Cand | null>((m, c) => (!m || c.dur > m.dur ? c : m), null)
    // RQ-05 (auditoria 20/10): parada >= 3 min a <= 150 m do ponto ganha da
    // mais longa mais longe (almoco/pernoite a 400 m levava o horario e o
    // "tempo em loja" -- 12,5% das entregas); entre coladas, maior permanencia.
    // F2-14 (RQ-05): so' quando a mais longa esta' MARGEM_COLADA_M mais longe
    // -- sem isso, uma curta a 149 m ganhava de uma longa a 151 m (degrau).
    const longa = maisLonga(faixa)
    const colada = maisLonga(faixa.filter(c => c.colada))
    const melhor = colada && longa && !longa.colada && longa.dist - colada.dist > MARGEM_COLADA_M ? colada : longa
    if (melhor) {
      const usadas = ruasPorParadaDireta.get(melhor.parada.id) ?? new Set<string>()
      usadas.add(ruaDaLinha(linha))
      ruasPorParadaDireta.set(melhor.parada.id, usadas)
      visitas.set(linha.nf, {
        nf: linha.nf,
        chegada: melhor.parada.chegada,
        saida: melhor.parada.fim_real ?? melhor.parada.saida ?? melhor.parada.chegada,
        distanciaMetrosDoPonto: melhor.dist,
        viaVizinhanca: false,
        viaRaioAmpliado: melhor.ampliado,
      })
      continue
    }

    // 1b) nao confirmou no ponto escolhido: rua comprida pode ter varios
    // trechos no CNEFE (a coerencia so' escolhe UM) -- pedido 06/09: se o
    // romaneio diz a rua e o caminhao parou nela (mesmo que em outro trecho),
    // conta como entrega. Testa contra os OUTROS candidatos da mesma rua na
    // zona, raio normal (sao enderecos reais do CNEFE, nao precisa ampliar).
    const alternativos = (linha.pontosAlternativos ?? []).filter(p => p.lat !== linha.lat || p.lng !== linha.lng)
    if (alternativos.length === 0) continue
    let melhorAlt: { parada: UnitracParadaRow; dist: number; dur: number } | null = null
    for (const parada of foraBase) {
      const dist = Math.min(...alternativos.map(p => haversine(parada.lat, parada.lng, p.lat, p.lng)))
      if (dist > RAIO_ENTREGA_METROS) continue
      const fim = parada.fim_real ?? parada.saida ?? parada.chegada
      const dur = new Date(fim).getTime() - new Date(parada.chegada).getTime()
      if (!melhorAlt || dur > melhorAlt.dur) melhorAlt = { parada, dist, dur }
    }
    if (!melhorAlt) continue
    visitas.set(linha.nf, {
      nf: linha.nf,
      chegada: melhorAlt.parada.chegada,
      saida: melhorAlt.parada.fim_real ?? melhorAlt.parada.saida ?? melhorAlt.parada.chegada,
      distanciaMetrosDoPonto: melhorAlt.dist,
      viaVizinhanca: false,
      viaRaioAmpliado: false,
      viaOutroPontoDaRua: true,
    })
  }

  // 2) vizinhanca: so' irmas confirmadas DIRETAMENTE emprestam (sem encadear).
  //    RQ-06 (auditoria 20/10): e so' as confirmadas no raio normal (<=500 m)
  //    -- irma pelo raio ampliado ou por outro trecho da rua levava a heranca
  //    a 1,6 km da parada (52% a >800 m do ponto validado de 02/10).
  const diretas = comCoord.filter(l => {
    const v = visitas.get(l.nf)
    return v != null && !v.viaRaioAmpliado && !v.viaOutroPontoDaRua
  })
  for (const linha of comCoord) {
    if (visitas.has(linha.nf)) continue
    let melhor: { irma: LinhaGeocodificada & { lat: number; lng: number }; dist: number } | null = null
    for (const irma of diretas) {
      const dist = haversine(irma.lat, irma.lng, linha.lat, linha.lng)
      if (dist > RAIO_VIZINHANCA_METROS) continue
      if (!melhor || dist < melhor.dist) melhor = { irma, dist }
    }
    if (!melhor) continue
    const v = visitas.get(melhor.irma.nf)!
    visitas.set(linha.nf, { nf: linha.nf, chegada: v.chegada, saida: v.saida, distanciaMetrosDoPonto: melhor.dist, viaVizinhanca: true, viaRaioAmpliado: false })
  }

  // 3) corredor da rua (endereco sem numero, relatorio 01/10): so' quem
  //    sobrou depois da vizinhanca (que segue como esta'). Parada PROPRIA
  //    (FORA_BASE) de >= PERMANENCIA_MIN_CORREDOR_MIN a <= RAIO_PARADA_
  //    CORREDOR_M de QUALQUER ponto da rua; ganha a de maior permanencia.
  //    Roda por ultimo de proposito: confirmada assim nao empresta horario
  //    por vizinhanca (a coordenada continua aproximada).
  //    Correcao 02/10: (a) endereco COM NUMERO nao usa corredor (cluster
  //    falso em via longa -- Av. das Americas etc.); (b) limite proporcional
  //    de NFs por parada (1 NF / 3 min), as mais proximas ganham quando
  //    excede. Shopping/condominio com mesmo endereco exato segue confirmando
  //    todas (mesmo endereco = legitimo, tratado no passo 1 direto).
  const candidatasCorredor = comCoord.filter(l => !visitas.has(l.nf) && (l.pontosCorredorRua?.length ?? 0) > 0)
  // Agrupa candidatas por parada: cada parada confirma ate' limiteNfsPorParadaNoCorredor(dur)
  // NFs, as mais proximas primeiro. Endereco com numero NAO entra aqui.
  type CandidataCorr = { linha: typeof candidatasCorredor[number]; melhorDist: number; melhorParada: UnitracParadaRow; dur: number }
  const candidatasPorParada = new Map<string, CandidataCorr[]>()
  for (const linha of candidatasCorredor) {
    // Endereco com numero: NAO usar corredor (correcao 02/10). O endereco
    // exibido vem de parse-planilhas.ts ("RUA - BAIRRO, CIDADE" ou "RUA, CIDADE").
    if (enderecoTemNumero(linha.endereco)) continue
    // RQ-02 (auditoria 20/10): rua generica ("RUA A", "AVENIDA 2") junta vias
    // de bairros diferentes; sem bairro, o corredor vai so' ate' 2 km.
    const rua = ruaDaLinha(linha)
    if (ruaGenerica(rua)) continue
    const semBairro = linhaSemBairro(linha)
    const corredor = linha.pontosCorredorRua!.filter(p => !semBairro || haversine(p.lat, p.lng, linha.lat, linha.lng) <= RAIO_MAX_CORREDOR_SEM_BAIRRO_M)
    if (corredor.length === 0) continue
    let melhorCorr: { parada: UnitracParadaRow; dist: number; dur: number } | null = null
    for (const parada of foraBase) {
      const fim = parada.fim_real ?? parada.saida ?? parada.chegada
      const dur = new Date(fim).getTime() - new Date(parada.chegada).getTime()
      if (!(dur >= PERMANENCIA_MIN_CORREDOR_MIN * 60_000)) continue
      // Parada que ja' foi entrega direta de cliente de OUTRA rua nao e' desta.
      const ruasDaParada = ruasPorParadaDireta.get(parada.id)
      if (ruasDaParada && [...ruasDaParada].some(r => !mesmaRua(r, rua))) continue
      const dist = Math.min(...corredor.map(p => haversine(parada.lat, parada.lng, p.lat, p.lng)))
      if (dist > RAIO_PARADA_CORREDOR_M) continue
      if (!melhorCorr || dur > melhorCorr.dur) melhorCorr = { parada, dist, dur }
    }
    if (!melhorCorr) continue
    const arr = candidatasPorParada.get(melhorCorr.parada.id) ?? []
    arr.push({ linha, melhorDist: melhorCorr.dist, melhorParada: melhorCorr.parada, dur: melhorCorr.dur })
    candidatasPorParada.set(melhorCorr.parada.id, arr)
  }
  for (const [, cands] of candidatasPorParada) {
    // Limite proporcional: 1 NF por 3 min de parada (ceil). Parada de 5 min -> 2; 30 min -> 10.
    const durRef = cands[0]?.dur ?? 0
    const limite = limiteNfsPorParadaNoCorredor(durRef)
    // Ordena por distancia (mais proximas primeiro); desempate por NF pra estabilidade.
    cands.sort((a, b) => a.melhorDist - b.melhorDist || a.linha.nf.localeCompare(b.linha.nf))
    for (let i = 0; i < Math.min(cands.length, limite); i++) {
      const c = cands[i]
      visitas.set(c.linha.nf, {
        nf: c.linha.nf,
        chegada: c.melhorParada.chegada,
        saida: c.melhorParada.fim_real ?? c.melhorParada.saida ?? c.melhorParada.chegada,
        distanciaMetrosDoPonto: c.melhorDist,
        viaVizinhanca: false,
        viaRaioAmpliado: false,
        viaCorredorDaRua: true,
      })
    }
  }
  return visitas
}
