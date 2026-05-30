// Dados do Fechamento Mensal logístico (consolidado dos KPIs operacionais por rede).
//
// Por enquanto os números são BAKED por mês (a fonte completa — ex: 8.390 entregas
// de abril — vem de um consolidado que ainda não está inteiro no banco). A estrutura
// é tipada e indexada por mês ('YYYY-MM') justamente pra virar dinâmica depois: basta
// um endpoint preencher `FechamentoData` a partir de kpi_rotas/kpi_linhas e cair aqui.

export interface FechamentoKpis {
  total_entregas: number
  total_clientes: number
  total_lojas: number
  total_motoristas: number
  total_dias: number
  sem_rastreador: number
  pct_sem_rastreador: number
  tempo_rota_medio: number   // minutos, CD → Loja
  tempo_loja_medio: number   // minutos, chegada → saída da loja
  tempo_total_medio: number  // minutos, saída CD → saída Loja
}

export interface ClienteRow {
  cliente: string
  entregas: number
  lojas: number
  tempo_rota: number
  tempo_loja: number
  tempo_total: number
  sem_rast: number
}

export interface DiaRow {
  dia: number
  entregas: number
  tempo_rota: number
  tempo_loja: number
  tempo_total: number
}

export interface RotaRow {
  cliente: string
  loja: string
  n: number
  tempo_rota: number
  tempo_total: number
}

export interface LojaTempoRow {
  cliente: string
  loja: string
  n: number
  tempo_loja: number
  tempo_total: number
}

export interface TotalRow {
  cliente: string
  loja: string
  n: number
  tempo_rota: number
  tempo_loja: number
  tempo_total: number
}

export interface HoraRow {
  hora_saida: number
  entregas: number
}

export interface MotoristaRow {
  motorista: string
  entregas: number
  tempo_rota: number
  tempo_loja: number
}

export interface FechamentoData {
  mes: string      // 'YYYY-MM'
  rotulo: string   // 'Abril de 2026'
  kpis: FechamentoKpis
  por_cliente: ClienteRow[]
  por_dia: DiaRow[]
  top_rotas_demoradas: RotaRow[]
  top_tempo_loja: LojaTempoRow[]
  top_tempo_total: TotalRow[]
  distribuicao_horario_saida: HoraRow[]
  top_motoristas: MotoristaRow[]
}

const ABRIL_2026: FechamentoData = {
  mes: '2026-04',
  rotulo: 'Abril de 2026',
  kpis: {
    total_entregas: 8390,
    total_clientes: 10,
    total_lojas: 363,
    total_motoristas: 419,
    total_dias: 30,
    sem_rastreador: 720,
    pct_sem_rastreador: 8.6,
    tempo_rota_medio: 73.8,
    tempo_loja_medio: 90.4,
    tempo_total_medio: 170.6,
  },
  por_cliente: [
    { cliente: 'Armazem Do Grao', entregas: 631, lojas: 48, tempo_rota: 102.1, tempo_loja: 28.9, tempo_total: 130.7, sem_rast: 26 },
    { cliente: 'Assai', entregas: 1060, lojas: 41, tempo_rota: 74.1, tempo_loja: 216.3, tempo_total: 290.5, sem_rast: 174 },
    { cliente: 'Atacadao', entregas: 52, lojas: 3, tempo_rota: 46.0, tempo_loja: 127.9, tempo_total: 173.8, sem_rast: 1 },
    { cliente: 'Carrefour', entregas: 231, lojas: 11, tempo_rota: 92.3, tempo_loja: 87.0, tempo_total: 176.7, sem_rast: 20 },
    { cliente: 'Guanabara', entregas: 981, lojas: 28, tempo_rota: 63.4, tempo_loja: 91.0, tempo_total: 151.6, sem_rast: 274 },
    { cliente: 'Prezunic', entregas: 1339, lojas: 57, tempo_rota: 67.0, tempo_loja: 79.1, tempo_total: 156.2, sem_rast: 32 },
    { cliente: 'Princesa', entregas: 867, lojas: 26, tempo_rota: 110.6, tempo_loja: 61.4, tempo_total: 167.9, sem_rast: 23 },
    { cliente: 'Superpax', entregas: 518, lojas: 48, tempo_rota: 58.8, tempo_loja: 56.8, tempo_total: 114.4, sem_rast: 2 },
    { cliente: 'Superprix', entregas: 52, lojas: 9, tempo_rota: 89.5, tempo_loja: 71.8, tempo_total: 161.4, sem_rast: 0 },
    { cliente: 'Zona Sul', entregas: 2659, lojas: 92, tempo_rota: 68.1, tempo_loja: 58.5, tempo_total: 126.9, sem_rast: 168 },
  ],
  por_dia: [
    { dia: 1, entregas: 239, tempo_rota: 72.2, tempo_loja: 107.3, tempo_total: 189.6 },
    { dia: 2, entregas: 329, tempo_rota: 72.6, tempo_loja: 91.4, tempo_total: 174.1 },
    { dia: 3, entregas: 132, tempo_rota: 86.5, tempo_loja: 53.6, tempo_total: 144.6 },
    { dia: 4, entregas: 278, tempo_rota: 63.3, tempo_loja: 95.1, tempo_total: 168.3 },
    { dia: 5, entregas: 8, tempo_rota: 43.8, tempo_loja: 92.5, tempo_total: 136.2 },
    { dia: 6, entregas: 342, tempo_rota: 68.0, tempo_loja: 87.1, tempo_total: 166.0 },
    { dia: 7, entregas: 330, tempo_rota: 66.6, tempo_loja: 91.3, tempo_total: 171.8 },
    { dia: 8, entregas: 331, tempo_rota: 76.8, tempo_loja: 84.4, tempo_total: 162.5 },
    { dia: 9, entregas: 312, tempo_rota: 71.1, tempo_loja: 105.0, tempo_total: 192.4 },
    { dia: 10, entregas: 287, tempo_rota: 78.5, tempo_loja: 93.2, tempo_total: 185.4 },
    { dia: 11, entregas: 334, tempo_rota: 64.6, tempo_loja: 85.0, tempo_total: 159.8 },
    { dia: 12, entregas: 16, tempo_rota: 45.7, tempo_loja: 77.9, tempo_total: 123.6 },
    { dia: 13, entregas: 339, tempo_rota: 85.9, tempo_loja: 96.6, tempo_total: 175.2 },
    { dia: 14, entregas: 363, tempo_rota: 61.2, tempo_loja: 98.1, tempo_total: 174.5 },
    { dia: 15, entregas: 306, tempo_rota: 65.3, tempo_loja: 96.9, tempo_total: 172.0 },
    { dia: 16, entregas: 328, tempo_rota: 76.1, tempo_loja: 91.8, tempo_total: 178.5 },
    { dia: 17, entregas: 289, tempo_rota: 78.6, tempo_loja: 112.7, tempo_total: 195.5 },
    { dia: 18, entregas: 334, tempo_rota: 65.3, tempo_loja: 103.8, tempo_total: 170.2 },
    { dia: 19, entregas: 92, tempo_rota: 58.2, tempo_loja: 68.9, tempo_total: 95.9 },
    { dia: 20, entregas: 340, tempo_rota: 62.8, tempo_loja: 90.2, tempo_total: 164.2 },
    { dia: 21, entregas: 149, tempo_rota: 65.8, tempo_loja: 60.5, tempo_total: 132.7 },
    { dia: 22, entregas: 362, tempo_rota: 86.0, tempo_loja: 93.3, tempo_total: 177.2 },
    { dia: 23, entregas: 307, tempo_rota: 56.1, tempo_loja: 88.3, tempo_total: 158.6 },
    { dia: 24, entregas: 322, tempo_rota: 68.8, tempo_loja: 84.0, tempo_total: 166.6 },
    { dia: 25, entregas: 333, tempo_rota: 69.4, tempo_loja: 91.1, tempo_total: 169.5 },
    { dia: 26, entregas: 24, tempo_rota: 54.4, tempo_loja: 71.2, tempo_total: 125.6 },
    { dia: 27, entregas: 340, tempo_rota: 73.9, tempo_loja: 80.0, tempo_total: 159.4 },
    { dia: 28, entregas: 366, tempo_rota: 87.4, tempo_loja: 90.3, tempo_total: 171.8 },
    { dia: 29, entregas: 381, tempo_rota: 85.3, tempo_loja: 82.0, tempo_total: 167.3 },
    { dia: 30, entregas: 477, tempo_rota: 97.5, tempo_loja: 80.8, tempo_total: 178.3 },
  ],
  top_rotas_demoradas: [
    { cliente: 'Carrefour', loja: 'Carrefour - Macaé', n: 15, tempo_rota: 428.3, tempo_total: 568.3 },
    { cliente: 'Carrefour', loja: 'Carrefour - Juiz de Fora', n: 14, tempo_rota: 358.6, tempo_total: 432.5 },
    { cliente: 'Carrefour', loja: 'Carrefour - Campos dos Goytacazes', n: 15, tempo_rota: 318.6, tempo_total: 373.2 },
    { cliente: 'Princesa', loja: 'Princesa - Barra de São João (1ª Entrega)', n: 33, tempo_rota: 310.4, tempo_total: 454.6 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Meier', n: 15, tempo_rota: 302.5, tempo_total: 345.0 },
    { cliente: 'Princesa', loja: 'Princesa - Cabo Frio 2 (3ª Entrega)', n: 33, tempo_rota: 300.0, tempo_total: 343.3 },
    { cliente: 'Assai', loja: 'Assaí - Campos dos Goytacazes- Loja 188', n: 28, tempo_rota: 281.3, tempo_total: 453.7 },
    { cliente: 'Princesa', loja: 'Princesa - Cabo Frio 3 (2ª Entrega)', n: 33, tempo_rota: 253.3, tempo_total: 278.3 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Farme de Amoedo', n: 15, tempo_rota: 247.5, tempo_total: 255.0 },
    { cliente: 'Zona Sul', loja: 'Zona Sul Loja 13 - Angra', n: 37, tempo_rota: 244.3, tempo_total: 308.6 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Vila Isabel', n: 15, tempo_rota: 242.5, tempo_total: 275.0 },
    { cliente: 'Princesa', loja: 'Princesa - Arraial 2 (2ª Entrega)', n: 33, tempo_rota: 238.3, tempo_total: 371.7 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Visconde de Pirajá (Ipanema)', n: 15, tempo_rota: 235.0, tempo_total: 230.0 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Copacabana', n: 15, tempo_rota: 232.5, tempo_total: 270.0 },
    { cliente: 'Princesa', loja: 'Princesa - Buzios 2 (3ª Entrega)', n: 33, tempo_rota: 220.0, tempo_total: 271.7 },
  ],
  top_tempo_loja: [
    { cliente: 'Assai', loja: 'Assaí - Macaé - Loja 232', n: 29, tempo_loja: 359.3, tempo_total: 535.2 },
    { cliente: 'Assai', loja: 'Assaí - Galeão - Loja 302', n: 24, tempo_loja: 352.8, tempo_total: 390.6 },
    { cliente: 'Assai', loja: 'Assaí - São João do Meriti  - Loja 217', n: 25, tempo_loja: 312.8, tempo_total: 341.1 },
    { cliente: 'Assai', loja: 'Assaí - Cabo Frio - Loja 82', n: 26, tempo_loja: 305.6, tempo_total: 484.2 },
    { cliente: 'Assai', loja: 'Assaí - Nova Iguaçu 2 - Loja 291', n: 24, tempo_loja: 294.3, tempo_total: 322.9 },
    { cliente: 'Assai', loja: 'Assaí - Mesquita (Dutra) - Loja 142', n: 24, tempo_loja: 293.0, tempo_total: 320.5 },
    { cliente: 'Assai', loja: 'Assaí - Taquara   - Loja 340', n: 29, tempo_loja: 291.5, tempo_total: 337.4 },
    { cliente: 'Assai', loja: 'Assaí - Niterói - Loja 41', n: 24, tempo_loja: 291.2, tempo_total: 347.2 },
    { cliente: 'Assai', loja: 'Assaí - Carioca Shopping - Loja 316', n: 28, tempo_loja: 285.0, tempo_total: 309.8 },
    { cliente: 'Assai', loja: 'Assaí - Sabão Rio (Benfica) - Loja 136', n: 24, tempo_loja: 284.0, tempo_total: 316.0 },
    { cliente: 'Assai', loja: 'Assaí - Mendanha (Campo Grande) - Loja 65', n: 24, tempo_loja: 278.9, tempo_total: 347.5 },
    { cliente: 'Assai', loja: 'AssaÍ - Ilha do Governador - Loja 29', n: 25, tempo_loja: 278.8, tempo_total: 322.6 },
    { cliente: 'Assai', loja: 'Assaí - Boulevard (Vila Isabel) - Loja 294', n: 28, tempo_loja: 278.4, tempo_total: 343.7 },
    { cliente: 'Assai', loja: 'Assaí - Araruama - Loja 221', n: 26, tempo_loja: 272.5, tempo_total: 423.3 },
    { cliente: 'Assai', loja: 'Assaí - Caxias I - Loja 131', n: 24, tempo_loja: 266.7, tempo_total: 296.7 },
  ],
  top_tempo_total: [
    { cliente: 'Carrefour', loja: 'Carrefour - Macaé', n: 15, tempo_rota: 428.3, tempo_loja: 76.3, tempo_total: 568.3 },
    { cliente: 'Assai', loja: 'Assaí - Macaé - Loja 232', n: 29, tempo_rota: 175.9, tempo_loja: 359.3, tempo_total: 535.2 },
    { cliente: 'Assai', loja: 'Assaí - Cabo Frio - Loja 82', n: 26, tempo_rota: 178.6, tempo_loja: 305.6, tempo_total: 484.2 },
    { cliente: 'Princesa', loja: 'Princesa - Barra de São João (1ª Entrega)', n: 33, tempo_rota: 310.4, tempo_loja: 144.2, tempo_total: 454.6 },
    { cliente: 'Assai', loja: 'Assaí - Campos dos Goytacazes- Loja 188', n: 28, tempo_rota: 281.3, tempo_loja: 172.4, tempo_total: 453.7 },
    { cliente: 'Carrefour', loja: 'Carrefour - Juiz de Fora', n: 14, tempo_rota: 358.6, tempo_loja: 73.9, tempo_total: 432.5 },
    { cliente: 'Assai', loja: 'Assaí - Araruama - Loja 221', n: 26, tempo_rota: 150.8, tempo_loja: 272.5, tempo_total: 423.3 },
    { cliente: 'Assai', loja: 'Assaí - Galeão - Loja 302', n: 24, tempo_rota: 37.8, tempo_loja: 352.8, tempo_total: 390.6 },
    { cliente: 'Carrefour', loja: 'Carrefour - Campos dos Goytacazes', n: 15, tempo_rota: 318.6, tempo_loja: 54.6, tempo_total: 373.2 },
    { cliente: 'Princesa', loja: 'Princesa - Arraial 2 (2ª Entrega)', n: 33, tempo_rota: 238.3, tempo_loja: 100.0, tempo_total: 371.7 },
    { cliente: 'Princesa', loja: 'Princesa - Rio das Ostras (2ª Entrega)', n: 33, tempo_rota: 163.3, tempo_loja: 131.3, tempo_total: 363.3 },
    { cliente: 'Assai', loja: 'Assaí - Petrópolis- Loja 181', n: 24, tempo_rota: 108.0, tempo_loja: 246.3, tempo_total: 354.3 },
    { cliente: 'Assai', loja: 'Assaí - Mendanha (Campo Grande) - Loja 65', n: 24, tempo_rota: 50.6, tempo_loja: 278.9, tempo_total: 347.5 },
    { cliente: 'Assai', loja: 'Assaí - Niterói - Loja 41', n: 24, tempo_rota: 56.0, tempo_loja: 291.2, tempo_total: 347.2 },
    { cliente: 'Prezunic', loja: 'Prezunic SPID - Meier', n: 15, tempo_rota: 302.5, tempo_loja: 34.3, tempo_total: 345.0 },
  ],
  distribuicao_horario_saida: [
    { hora_saida: 0, entregas: 49 }, { hora_saida: 1, entregas: 48 }, { hora_saida: 2, entregas: 94 },
    { hora_saida: 3, entregas: 228 }, { hora_saida: 4, entregas: 660 }, { hora_saida: 5, entregas: 1190 },
    { hora_saida: 6, entregas: 481 }, { hora_saida: 7, entregas: 215 }, { hora_saida: 8, entregas: 77 },
    { hora_saida: 9, entregas: 194 }, { hora_saida: 10, entregas: 176 }, { hora_saida: 11, entregas: 117 },
    { hora_saida: 12, entregas: 228 }, { hora_saida: 13, entregas: 313 }, { hora_saida: 14, entregas: 353 },
    { hora_saida: 15, entregas: 287 }, { hora_saida: 16, entregas: 165 }, { hora_saida: 17, entregas: 120 },
    { hora_saida: 18, entregas: 305 }, { hora_saida: 19, entregas: 140 }, { hora_saida: 20, entregas: 23 },
    { hora_saida: 21, entregas: 6 }, { hora_saida: 22, entregas: 4 }, { hora_saida: 23, entregas: 7 },
  ],
  top_motoristas: [
    { motorista: 'RAFAEL', entregas: 268, tempo_rota: 84.4, tempo_loja: 51.1 },
    { motorista: 'ROBERTO', entregas: 183, tempo_rota: 154.8, tempo_loja: 44.8 },
    { motorista: 'DOUGLAS', entregas: 174, tempo_rota: 85.0, tempo_loja: 42.8 },
    { motorista: 'ALEX', entregas: 130, tempo_rota: 55.5, tempo_loja: 53.1 },
    { motorista: 'MILTON', entregas: 127, tempo_rota: 49.8, tempo_loja: 96.7 },
    { motorista: 'FRANCISCO IRAN', entregas: 123, tempo_rota: 56.0, tempo_loja: 94.3 },
    { motorista: 'ANTÔNIO', entregas: 120, tempo_rota: 114.1, tempo_loja: 79.6 },
    { motorista: 'LEONARDO', entregas: 116, tempo_rota: 195.5, tempo_loja: 32.9 },
    { motorista: 'RENATO', entregas: 115, tempo_rota: 205.1, tempo_loja: 104.2 },
    { motorista: 'MARCIO', entregas: 112, tempo_rota: 57.2, tempo_loja: 49.1 },
    { motorista: 'GILSON', entregas: 110, tempo_rota: 117.3, tempo_loja: 32.6 },
    { motorista: 'EVERTON', entregas: 103, tempo_rota: 49.5, tempo_loja: 40.3 },
    { motorista: 'ABEL', entregas: 96, tempo_rota: 216.0, tempo_loja: 51.5 },
    { motorista: 'JOSUE DOS SANTOS', entregas: 94, tempo_rota: 44.9, tempo_loja: 67.9 },
    { motorista: 'MOBRICI', entregas: 87, tempo_rota: 61.8, tempo_loja: 50.7 },
  ],
}

/** Fechamentos disponíveis, indexados por mês ('YYYY-MM'). Adicionar novos meses aqui. */
export const FECHAMENTOS: Record<string, FechamentoData> = {
  '2026-04': ABRIL_2026,
}

/** Meses disponíveis, do mais recente pro mais antigo. */
export const MESES_FECHAMENTO: string[] = Object.keys(FECHAMENTOS).sort().reverse()

export function getFechamento(mes?: string): FechamentoData {
  if (mes && FECHAMENTOS[mes]) return FECHAMENTOS[mes]
  return FECHAMENTOS[MESES_FECHAMENTO[0]]
}
