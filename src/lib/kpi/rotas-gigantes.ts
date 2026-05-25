/**
 * Códigos Unitrac classificados como "rota gigante" (raio ≥ 5km).
 *
 * Origem: análise das 1.036 placas dos relatórios Unitrac de 18-22/05/2026.
 * Geofences com raio grande cobrem múltiplas lojas, portanto NÃO podem ser
 * usados como match exato — o matcher deve descartar esses códigos e cair
 * em matching geo da loja-alvo (lat/lng + raio cadastrado).
 *
 * Ver `docs/correcao-sistema/ANALISE-COMPLETA-1039-PLACAS.md` (seção Padrões problemáticos).
 */
export const ROTAS_GIGANTES_UNITRAC: ReadonlySet<string> = new Set([
  '2018001', // ROTA BARRA (43km, 294 paradas)
  '2018002', // ROTA BOTAFOGO (28km, 206 paradas)
  '2018005', // ROTA CAMPOS (124km, 41 paradas)
  '2018006', // ROTA CAMPO GRANDE (39km, 186 paradas)
  '2018007', // ROTA CANTAGALO (86km, 44 paradas)
  '2018008', // ROTA CAXIAS (22km, 60 paradas)
  '2018009', // ROTA CENTRO (23km, 103 paradas)
  '2018013', // ROTA GAVEA (19km, 60 paradas)
  '2018014', // ROTA ILHA (19km, 88 paradas)
  '2018016', // ROTA MACAE (18km, 23 paradas)
  '2018018', // ROTA NITEROI (67km, 22 paradas)
  '2018019', // ROTA NOVA IGUACU (31km, 125 paradas)
  '2018022', // ROTA ZONA SUL (15km, 13 paradas)
  '2018023', // ROTA ZONA NORTE (37km, 180 paradas)
  '2018035', // ROTA REGIÃO DOS LAGOS (71km, 59 paradas)
  '2018038', // ROTA NITEROI / MARICA (37km, 87 paradas)
  '2018040', // ROTA NOVA FRIBURGO / PETRÓPOLIS (41km, 31 paradas)
  '5353012', // REGINA BARRA DO IMBUY (50km, mesmo CD que 5353014/16/17)
  '5353014', // REGINA 1 DE MAIO (50km)
  '5353016', // REGINA LUCIO MEIRA (50km)
  '5353017', // ABASTECEDORA GRÃO DA SERRA (50km — mesmo geofence que REGINA)
  '7012010', // CAB - PETROPOLIS (34km, 72 paradas)
  '9039124', // 47- ZONA SUL (21km — geofence agregado, não loja)
  '11139000', // EMANUEL COMÉRCIO PEDRA DE GUARATIBA (73km)
  '13156084', // MATRIZ CD DUQUE (12km)
  '15755000', // MERCADO ITAGIBA DE COSMOS LTDA (26km)
  '17659000', // O BOM ATACADISTA (72km)
  '17659001', // O BOM CAMPO GRANDE (37km)
  '17659002', // EMANUEL CACHAMORRA (50km)
  '17659003', // EMANUEL VARGEM GRANDE (25km)
  '17659004', // REDE ECONOMIA SANTA MARIA (28km)
  '20577000', // INDUSTRIAS DE BEBIDAS JOAQUIM THOMAS DE AQUINO (12km)
  '21468000', // EMANUEL JARDIM MARAVILHA (67km)
  '21469000', // EMANUEL ALHAMBRA (18km)
  '23080000', // MERCADO SANTO AGOSTINHO - BARRA DA TIJUCA (29km)
  '25140000', // EMANUEL- REDE ECONOMIA SANTA MARIA (28km)
  '25414000', // NATURCONGELADOS (28km)
  '28023000', // ESG MERCADO COMERCIO JACAREPAGUA (7.5km)
])

export function isRotaGigante(codigoUnitrac: string | null | undefined): boolean {
  if (!codigoUnitrac) return false
  return ROTAS_GIGANTES_UNITRAC.has(codigoUnitrac.trim())
}
