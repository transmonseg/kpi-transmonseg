# Análise consolidada Unitrac — padrões + cadastros (dias 19/20/25)

## Padrões identificados

### Padrões base já mapeados:
1. Só BASE (não saiu)
2. Só FORA_BASE/ROTA (outro contrato)
3. SEM-RASTRE (1 parada o dia)
4. 1 cliente único
5. BASE+LOJA sobreposto (cliente engole base)
6. 2+ LOJAs sobrepostas (vizinhos)

### Padrões NOVOS confirmados nos 3 dias:
7. **Placa visita loja fora da escala** (desvio) — KRW-8E86, INW-8A51, KXR-7F27, KXA-7C24, QSU-6I54, MSK-3752, RJN-9F68
8. **Placa NÃO atende todas as lojas da escala** — LSN-6I72, TML-3B11, UDC-6I03, TML-9I75, LQE-5E01, KPT-5B20, QSZ-9A20
9. **Sendas/Assai compartilham cod_unitrac** — mesmas lojas físicas
10. **MUNDIAL como rede sem cadastro** — 113194, 113918
11. **NATURCON como base secundária** (cod 25414000)
12. **GUANABARA padrão limpo** (1 cod por placa)
13. **PAX padrão limpo** (cods 202xxx)
14. **Mesma placa, redes diferentes entre dias** — KMZ-7057, KOP-4978, LFJ-8442, TML-6D96, KMY-5561 (mesma rede mas diferentes lojas)
15. **Escala "DESCONHECIDO GPA" no banco** — SFG-2F72 dia 20, TML-5I70 dia 20 (escala mal cadastrada)
16. **Placas sem escala mas fazendo entrega** — CPI-4C84 (Sendas Mendanha), GBG-5C11 (Sendas Mesquita) — placas substitutas?
17. **Lojas vizinhas dentro do mesmo geofence** — QSW-3B65 cod 131000 REAL ÉDEN BARROS + Sendas Carioca / QSZ-9A20 cod 21468000 EMANUEL JM + Princesa Maricá
18. **Dia 25 SEM ESCALAS no banco** — todas as 213 placas dia 25 sem escala carregada

## Cadastros problemáticos (consolidado 3 dias)

### Cadastros INEXISTENTES (precisam cadastrar):
- cod=**13156084** MATRIZ CD DUQUE → SENDAS (KRB-2J76, SFG-2F72)
- cod=**15755000** MERCADO ITAGIBA COSMOS → SUPERCOMPRAS (EYL-8B91)
- cod=**25414000** NATURCON GELADOS → SUPERPRIX/base secundária (TML-7D61)
- cod=**113194** MUNDIAL RIACHUELO (KQR-2J11 dia 19)
- cod=**113918** MUNDIAL ERICO VERISSIMO (KXA-5966 dia 19)
- cod=**9966101** loja não identificada (LQH-3F19)
- cod=**131000** REAL DE ÉDEN BARROS FILHO (QSW-3B65 dia 25)
- cod=**2019003** loja não identificada (CPI-4C84 dia 20)
- cod=**5353005** Armazém Capela (TML-1D82 dia 25)
- cod=**21468000** EMANUEL JARDIM MARAVILHA (QSZ-9A20 dia 25)
- cod=**71029** GB São João (KTZ-2055 dia 25)
- cod=**71006** GB Itaguai (LGX-1J41 dia 25)
- cod=**71038** GB (placa LIA-7G83) — não sei qual filial
- cod=**2018007** ROTA Cantagalo (geofence rota)
- cod=**9039099** ZS Loja desconhecida (LKW-2B80 dia 25)
- cod=**9039114** ZS Loja desconhecida (LKR-5990 dia 25)
- cod=**9039116** ZS Loja desconhecida (AFY-7J99 dia 25)
- cod=**9039118** ZS Loja desconhecida (LTH-4J15 dia 25)

### Cadastros ERRADOS:
- cod=**7012010** CAB Petrópolis — lat/lng errado (-22.68 ≠ -22.50 real)
- cod=**23080000** Mercado Santo Agostinho — rede SENDAS errada (deveria ser FEIRA_NOVA)

### Cadastros COM geofence GIGANTE (cliente cadastrou área enorme):
- cod=**11139000** EMANUEL PEDRA GUARATIBA
- cod=**17659000** O BOM ATACADISTA
- cod=**17659001** O BOM CAMPO GRANDE
- cod=**17659002** EMANUEL CACHAMORRA
- cod=**17659003** EMANUEL VARGEM GRANDE
- cod=**17659004** REDE ECONOMIA SANTA MARIA
- cod=**21469000** EMANUEL ALHAMBRA
- cod=**25140000** EMANUEL- REDE ECONOMIA SANTA MARIA
- cod=**5353012** REGINA BARRA DO IMBUY (engole 4 lojas REGINA + BASE)

### Cadastros CONFIRMADOS DURANTE A ANÁLISE:
- cod=9006159 Carrefour Campos Goytacazes
- cod=9006156 Carrefour Juiz de Fora
- cod=9006007 Carrefour Sulacap
- cod=9006158 Carrefour Macaé
- cod=23843003 Atacadão Belford Roxo
- cod=5353011 Armazém Barra Tijuca
- cod=7000716 Prezunic Cidade de Deus
- cod=7000713 Prezunic Caxias Centenário
- cod=9039121 ZS Loja 48 Recreio
- cod=9039008 ZS L08
- cod=9039009 ZS L09
- cod=9039101 ZS L14
- cod=6018000, 6018001 MEGA BOX
- cod=560024 Sendas Campinho
- cod=560030 Sendas Pilares
- cod=560033 Sendas Sabão
- cod=560046 Sendas Cordovil
- cod=202003 PAX Inhauma
- cod=202004 PAX Del Castilho
- cod=202012 PAX Sepetiba
- cod=4568001 Sams Niterói
- cod=4568002 Sams Linha Amarela
- cod=8590573, 8590570 Princesa Maricá variantes
- cod=71034 GB Cordovil

## Estatística por dia

| Dia | Total veículos | Sem escala | Sem rastre | Só BASE | 1 cliente | Multi/Mix |
|-----|---------------|------------|------------|---------|-----------|-----------|
| 19  | 207           | ~77        | 15         | 65      | 48        | ~50       |
| 20  | 208           | ~80        | ~10        | ~65     | 50        | ~50       |
| 25  | 213           | TODAS (escala não carregada) | 9 | ~80 | 50 | ~70 |

## Análise das abas das escalas (descoberta CRÍTICA)

### Arquivos de escala (4 por dia):
- ESCALA ZONA SUL - MAIO (vX).xlsx
- ESCALA DO ARMAZÉM DO GRÃO MAIO (vX).xlsx
- ESCALA GERAL DE MAIO (vX).xlsx
- ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (vX).xlsx

### Abas comuns:
- **Abas por dia (01, 02, 04, 05, ..., 25, 26)** — escala diária com placa/motorista/loja
- **MATRIZ** — escala mensal consolidada
- **MOTORISTAS** — cruzamento placa↔motorista↔código (670 linhas na geral)

### ESCALA ZONA SUL tem abas EXTRAS valiosíssimas:
- **TABELA FRETE** — valor frete por tipo
- **MATRIZ** — escala mensal
- **CTRL+C** — copy/paste workspace
- **ENDEREÇO - FILIAIS** ⭐ — **lista oficial das 48 lojas + bases + garagem com endereço**
- **CONTATOS** — contatos das lojas
- **TONELAGEM** — peso por loja
- **RELAÇÃO (CARROS - DOCAS)** — relacionamento doca/carro
- **DIÁRIA (MOTORISTAS)** — diária por motorista

### Fonte da verdade: aba ENDEREÇO - FILIAIS (Zona Sul)
Lista oficial das lojas (Loja 01 a Loja 48, pula 47):
- Loja 01-30 (col A): Ipanema, Copa, Gávea, Leblon, Recreio, Leme, Angra, Botafogo, Flamengo, S.Conrado, Penha, JD.Botânico
- Loja 27-48 + bases (col D): Ipanema, Urca, Flamengo, Laranjeiras, JD.Botânico, Humaitá, Barra, Botafogo, Copacabana, Centro, Penha
- **MEGA BOX - OLARIA** = BASE Benassi (Av Brasil 9561 + Vergueiro da Cruz 380)
- **MEGA BOX 2 - RECREIO** (Av Américas 13700)
- **CENTRAL (CD) - OLARIA** (Vergueiro da Cruz 226)
- **GARAGEM - PENHA** (Rua da Batata 132)
- **LOJA 1129-0 - OLARIA** ⚠️ codificação diferente — Vergueiro da Cruz 380 (mesmo endereço entrada 2 MEGA BOX) — pode ser ID antigo

### 🚨 DESCOBERTA CRÍTICA dia 25
A escala dia 25 EXISTE no arquivo `ESCALA GERAL DE MAIO 0 (2).xlsx` na aba "25" — **não foi importada pro banco**. Por isso todas as 213 placas apareceram "sem escala" no PDF Unitrac dia 25. Conteúdo confirma:
- Linha 5: Assaí Alcântara I → QSO-8D04 / RODRIGO
- Linha 7: Assaí Araruama → KZU-4C37 / ADILSON
- Linha 16: Assaí Carioca Shopping → QSW-3B65 / MARCUS VINICIUS (confirma cod 131000 era desvio)
- Linha 37: Assaí Sabão Rio → QSU-6I54 (confirma cod 560033 cadastrado)
- Linha 33: Assaí Nova Iguaçu → KPR-9E13 (confirma 17 paradas do cliente fixo)

**AÇÃO**: rodar `processar_xlsx_escala` para o arquivo dia 25 antes de processar Unitrac.

### Aba MOTORISTAS (ESCALA GERAL)
670 linhas com cruzamento `tipo_carro | motorista | codigo_motorista | placa | paletes`.
Padrão: códigos motorista repetem (91, 104, 184xxx, etc) → mesmo dono/empresa de várias placas.

⚠️ **Placas duplicadas/divergentes entre MOTORISTAS e abas diárias** — algumas placas têm grafia diferente (KMZ-7075 vs KMZ-7057, KOP-4J78 vs KOP-4978, KWI-3421 vs KWI-3461, DDI-6990 vs DDI-6J90). Pode ser typo do operador ou ID OCR errado.

## Próximos passos
- [x] Importar escala dia 25 — **261 linhas (GERAL 145 + PAX 32 + ARMAZEM 14 + ZS 70)**
- [x] Importar Unitrac dia 25 — **213 veículos, 2079 paradas**
- [x] Cadastrar lojas faltantes — **14 INSERTs OK** (2 ROTAs viraram DESCONHECIDO)
- [x] Corrigir cadastros errados — **14 UPDATEs OK** (Santo Agostinho rede, CAB lat/lng, MEGA BOX, SAMS, ZS L47, família O Bom/Emanuel/Regina)
- [x] Reprocessar 3 dias com base atualizada

## Resultado final (após cadastros + reprocessamento + paginação)

| Dia | Rotas | Anomalias | % anomalia | sem_entrega | pendente |
|-----|-------|-----------|------------|-------------|----------|
| 19  | 298   | 107       | 36%        | 68          | 230      |
| 20  | 282   | 123       | 44%        | 42          | 240      |
| 25  | 245   | 78        | 32%        | 45          | 200      |

> **Bug crítico corrigido na sessão**: o script de reprocessamento usava o limite
> default 1000 do PostgREST. Resultado: 84 placas dia 19 ficaram com 0 paradas
> mesmo tendo paradas no Unitrac. Agora pagina em chunks de 1000.

- **Lojas cadastradas no banco**: 259 → **273** (+14)
- **Cadastros problemáticos**: 28 → **3** não-bloqueantes
  - 5353012 REGINA (cod cobre N lojas físicas — limitação de modelagem)
  - 2018023 + 2018007 (ROTAs — vão pra FORA_BASE naturalmente)
- **Dia 25 agora funciona** — antes 100% das placas "sem escala", agora KPI gerado normalmente

## Pendente (aguardando Tia Erica)
- Resposta dela sobre placas que fazem 2 redes no mesmo lugar
- Quando placa não passa pela BASE Benassi (rota direta?)
- Confirmar cadastro real das lojas O BOM, Emanuel, Regina (coords aproximadas pelo GPS médio)
