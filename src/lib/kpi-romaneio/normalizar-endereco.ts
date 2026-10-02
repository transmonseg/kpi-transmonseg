// Normalizacao de enderecos truncados do Romaneio de Entrega (Nutry Max) e
// planilhas Rio Quality. Auditorias placa-a-placa (terco1/2/3) mostraram
// cidades truncadas em 15 caracteres ('SAO FRANCISCO D', 'CACHOEIRAS DE M'),
// ruas truncadas em 40 caracteres e lixo numerico no inicio ('10 RUA...').
// Essas truncagens quebram a cascata de geocodificacao: CNEFE/Nominatim nao
// acha cidade parcial e devolve ponto errado ou null.
//
// A normalizacao roda ANTES da chave de cache e da chamada a ponte -- assim
// grafias diferentes pro mesmo endereco colidem na mesma chave e o cache
// funciona. Pura, sem I/O, testavel isolada.

// Municipios do RJ (IBGE/CNEFE). Chave = prefixo truncado em maiusculas
// (sem acentos), valor = nome oficial completo. Cobertura dos casos reais
// das auditorias terco1/2/3 + todos os municipios que poderiam ser truncados
// em 15 caracteres (limite observado). Expandido pra cobrir qualquer prefixo
// ambiguo: se dois municipios compartilham o mesmo prefixo de N chars, o
// mapa so' entra quando o prefixo e' longo o bastante pra desambiguar.
const CIDADES_TRUNCADAS: Record<string, string> = {
  // --- Casos reais das auditorias ---
  'SAO FRANCISCO D': 'SÃO FRANCISCO DE ITABAPOANA',
  'CACHOEIRAS DE M': 'CACHOEIRAS DE MACACU',
  'COMENDADOR LEVY': 'COMENDADOR LEVY GASPARIAN',
  'SANTO ANTONIO D': 'SANTO ANTONIO DE PÁDUA',
  'NOVA IGUACU': 'NOVA IGUAÇU',
  'DUQUE DE CAXI': 'DUQUE DE CAXIAS',
  'SAO JOAO DE MER': 'SÃO JOÃO DE MERITI',
  'SAO GONCALO': 'SÃO GONÇALO',
  'RIO DE JANEIRO': 'RIO DE JANEIRO',
  'BELFORD ROXO': 'BELFORD ROXO',
  'CAMPOS DOS GOYT': 'CAMPOS DOS GOYTACAZES',
  'PETROPOLIS': 'PETRÓPOLIS',
  'VOLTA REDONDA': 'VOLTA REDONDA',
  'MAGE': 'MAGÉ',
  'ITABORAI': 'ITABORAÍ',
  'MESQUITA': 'MESQUITA',
  'NILÓPOLIS': 'NILÓPOLIS',
  'MARICA': 'MARICÁ',
  'TERESOPOLIS': 'TERESÓPOLIS',
  'CABO FRIO': 'CABO FRIO',
  'MACAE': 'MACAÉ',
  'ARARUAMA': 'ARARUAMA',
  'BARRA MANSA': 'BARRA MANSA',
  'RESENDE': 'RESENDE',
  'ITAPERUNA': 'ITAPERUNA',
  'NATIVIDADE': 'NATIVIDADE',
  'PORCIUNCULA': 'PORCIÚNCULA',
  'CARMO': 'CARMO',
  'CORDEIRO': 'CORDEIRO',
  'CANTAGALO': 'CANTAGALO',
  'BOM JARDIM': 'BOM JARDIM',
  'SUMIDOURO': 'SUMIDOURO',
  'SAPUCAIA': 'SAPUCAIA',
  'TRES RIOS': 'TRÊS RIOS',
  'PARAIBA DO SUL': 'PARAÍBA DO SUL',
  'VASSOURAS': 'VASSOURAS',
  'PATY DO ALFERES': 'PATY DO ALFERES',
  'MIGUEL PEREIRA': 'MIGUEL PEREIRA',
  'ENGENHEIRO PAUL': 'ENGENHEIRO PAULO DE FRONTIN',
  'VALENCA': 'VALENÇA',
  'RIO DAS FLORES': 'RIO DAS FLORES',
  'BARRA DO PIRAI': 'BARRA DO PIRAÍ',
  'PIRAI': 'PIRAÍ',
  'PINHEIRAL': 'PINHEIRAL',
  'PORTO REAL': 'PORTO REAL',
  'QUATIS': 'QUATIS',
  'ITATIAIA': 'ITATIAIA',
  'ANGRA DOS REIS': 'ANGRA DOS REIS',
  'PARATI': 'PARATY',
  'MANGARATIBA': 'MANGARATIBA',
  'ITUCAVA': 'ITUCAVA',
  'SEROPEDICA': 'SEROPÉDICA',
  'JAPERI': 'JAPERI',
  'GUAPIMIRIM': 'GUAPIMIRIM',
  'TANGUA': 'TANGUÁ',
  'RIO BONITO': 'RIO BONITO',
  'SILVA JARDIM': 'SILVA JARDIM',
  'CASIMIRO DE ABRE': 'CASIMIRO DE ABREU',
  'CONCEICAO DE MA': 'CONCEIÇÃO DE MACABU',
  'QUISSAMA': 'QUISSAMÃ',
  'CARAPEBUS': 'CARAPEBUS',
  'SAO FIDELIS': 'SÃO FIDÉLIS',
  'SAO JOSE DE UBA': 'SÃO JOSÉ DE UBÁ',
  'ITALVA': 'ITALVA',
  'CARDOSO MOREIRA': 'CARDOSO MOREIRA',
  'APERIBE': 'APERIBÉ',
  'LAJE DO MURIAE': 'LAJE DO MURIAÉ',
  'VARRE-SAI': 'VARRE-SAI',
  'BOM JESUS DO IT': 'BOM JESUS DO ITABAPOANA',
  'SANTO ANTONIO DE': 'SANTO ANTONIO DE PÁDUA',
  'SAO SEBASTIAO D': 'SÃO SEBASTIÃO DO ALTO',
  'SANTA MARIA MAD': 'SANTA MARIA MADALENA',
  'TRAJANO DE MORA': 'TRAJANO DE MORAIS',
  'MACUCO': 'MACUCO',
  'AREAL': 'AREAL',
  'COMENDADOR LEVY G': 'COMENDADOR LEVY GASPARIAN',
}

// Tipos de logradouro abreviados no romaneio -> forma expandida.
// Ordem importa: prefixos mais longos primeiro pra evitar match parcial.
const TIPOS_LOGRADOURO: [RegExp, string][] = [
  [/^AV\s+/i, 'AVENIDA '],
  [/^AV\.\s*/i, 'AVENIDA '],
  [/^EST\s+/i, 'ESTRADA '],
  [/^EST\.\s*/i, 'ESTRADA '],
  [/^R\s+/i, 'RUA '],
  [/^R\.\s*/i, 'RUA '],
  [/^TRAV\s+/i, 'TRAVESSA '],
  [/^TRAV\.\s*/i, 'TRAVESSA '],
  [/^AL\s+/i, 'ALAMEDA '],
  [/^AL\.\s*/i, 'ALAMEDA '],
  [/^PRACA\s+/i, 'PRAÇA '],
  [/^PC\s+/i, 'PRAÇA '],
  [/^PC\.\s*/i, 'PRAÇA '],
  [/^ROD\s+/i, 'RODOVIA '],
  [/^ROD\.\s*/i, 'RODOVIA '],
]

// Lixo no inicio do endereco: numeros/simbolos antes do tipo de logradouro.
// Exemplo real: '10 RUA DAS FLORES' -> 'RUA DAS FLORES'.
const LIXO_INICIO_RE = /^\d+[\s\-\.]*(?=[A-Z])/i

/** Expande cidade truncada usando dicionario de municipios do RJ.
 *  Se o texto (maiúsculas, sem acentos) bate com um prefixo conhecido,
 *  devolve o nome completo. Senao, devolve o original inalterado. */
export function expandirCidadeTruncada(cidade: string): string {
  if (!cidade || cidade.length === 0) return cidade
  const upper = cidade.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Tenta do prefixo mais longo ao mais curto (max 18 chars, min 3).
  for (let len = Math.min(upper.length, 18); len >= 3; len--) {
    const prefixo = upper.slice(0, len)
    const expandido = CIDADES_TRUNCADAS[prefixo]
    if (expandido) return expandido
  }
  return cidade
}

/** Remove numeros/simbolos antes do tipo de logradouro no inicio do texto. */
export function limparLixoInicio(endereco: string): string {
  if (!endereco) return endereco
  return endereco.replace(LIXO_INICIO_RE, '').trimStart()
}

/** Expande abreviacoes de tipo de logradouro no inicio do endereco. */
export function expandirTipoLogradouro(endereco: string): string {
  if (!endereco) return endereco
  for (const [re, expansao] of TIPOS_LOGRADOURO) {
    if (re.test(endereco)) {
      return endereco.replace(re, expansao)
    }
  }
  return endereco
}

/** Normaliza um endereco completo: limpa lixo, expande tipo de logradouro,
 *  expande cidade truncada. Aplicar nesta ordem: lixo primeiro (pra o tipo
 *  de logradouro ficar no inicio), depois tipo, depois cidade. */
export function normalizarEndereco(endereco: string): string {
  if (!endereco) return endereco
  let resultado = limparLixoInicio(endereco)
  resultado = expandirTipoLogradouro(resultado)
  // Cidade truncada: formatos observados:
  // NM: "RUA X, 10 - BAIRRO - CIDADE"
  // RQ: "RUA X, - BAIRRO, CIDADE - UF"
  // Estratégia: isola sufixo " - UF" se existir, depois tenta expandir a
  // última parte por " - " ou ", " (o que vier primeiro como separador de
  // cidade). Se nada funcionar, tenta o texto inteiro como cidade.
  let corpo = resultado
  let uf: string | null = null
  const ufMatch = corpo.match(/^(.+)\s+-\s*([A-Z]{2})\s*$/i)
  if (ufMatch) {
    corpo = ufMatch[1]
    uf = ufMatch[2].toUpperCase()
  }

  // Cidade truncada: tenta todos os separadores (" - " e ", ") do fim pro
  // inicio ate' achar um cujo segmento seguinte expande como cidade. Isso
  // evita o caso RQ onde " - " aparece antes do bairro ('RUA X, - CENTRO,
  // CIDADE') e lastIndexOf pega o separador errado.
  // IMPORTANTE: sufixos curtos como "- *", "- B", "- **" NAO sao cidades e
  // devem ser preservados. Quando encontrados, saltamos e buscamos a cidade
  // no segmento ANTERIOR, reconstruindo o corpo com o sufixo intacto.
  let expandiu = false
  const separadores = [' - ', ', ']
  for (const sep of separadores) {
    if (expandiu) break
    let busca = corpo.length
    // Sufixo curto pendente: quando o ultimo segmento tem <3 chars, ele
    // nao e' cidade -- guarda pra reanexar apos expandir o segmento anterior.
    let sufixoCurto: string | null = null
    while (!expandiu) {
      const idx = corpo.lastIndexOf(sep, busca - 1)
      if (idx < 0) break
      const candidata = corpo.slice(idx + sep.length).trim()
      if (candidata.length < 3) {
        // Guarda o sufixo curto (com seu separador) e busca no segmento anterior.
        if (sufixoCurto === null) {
          sufixoCurto = corpo.slice(idx)
        }
        busca = idx
        continue
      }
      const expandida = expandirCidadeTruncada(candidata)
      if (expandida !== candidata) {
        corpo = corpo.slice(0, idx + sep.length) + expandida + (sufixoCurto ?? '')
        expandiu = true
        break
      }
      busca = idx
    }
    if (expandiu) break
  }
  if (!expandiu) {
    // Sem separador: texto inteiro pode ser cidade pura (so' se 3+ chars).
    const trimCorpo = corpo.trim()
    if (trimCorpo.length >= 3) {
      const expandida = expandirCidadeTruncada(trimCorpo)
      if (expandida !== trimCorpo) {
        corpo = expandida
      }
    }
  }

  resultado = uf ? `${corpo} - ${uf}` : corpo
  return resultado
}