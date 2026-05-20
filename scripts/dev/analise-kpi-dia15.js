// analise-kpi-dia15.js — Análise completa KPIs dia 15 vs escalas
// Rodar com: node scripts/analise-kpi-dia15.js

'use strict';

const ExcelJS = require('C:/Users/media/dev/kpi-transmonseg/node_modules/exceljs');
const fs = require('fs');
const path = require('path');

// ─── Paths ─────────────────────────────────────────────────────────────────────

const KPI_DIR = 'C:/Users/media/Downloads/KPIS GERADAS';
const ESCALA_DIR = 'C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS';
const OUTPUT_FILE = 'C:/Users/media/dev/kpi-transmonseg/docs/analise-kpi-dia15.md';

// KPIs sem número entre parênteses (exceto ZONA_SUL que é "(3)")
const KPI_FILES = {
  'ARMAZEM_GRAO': 'KPI-ARMAZEM_GRAO-2026-05-15.xlsx',
  'ASSAI':        'KPI-ASSAI-2026-05-15.xlsx',
  'ATACADAO':     'KPI-ATACADAO-2026-05-15.xlsx',
  'CAB_PETROPOLIS':'KPI-CAB_PETROPOLIS-2026-05-15.xlsx',
  'CARREFOUR':    'KPI-CARREFOUR-2026-05-15.xlsx',
  'DESCONHECIDO': 'KPI-DESCONHECIDO-2026-05-15.xlsx',
  'EMANUEL':      'KPI-EMANUEL-2026-05-15.xlsx',
  'FEIRA_NOVA':   'KPI-FEIRA_NOVA-2026-05-15.xlsx',
  'GUANABARA':    'KPI-GUANABARA-2026-05-15.xlsx',
  'PREZUNIC':     'KPI-PREZUNIC-2026-05-15.xlsx',
  'PRINCESA':     'KPI-PRINCESA-2026-05-15.xlsx',
  'SAMS_CLUB':    'KPI-SAMS_CLUB-2026-05-15.xlsx',
  'SENDAS':       'KPI-SENDAS-2026-05-15.xlsx',
  'SUPERPRIX':    'KPI-SUPERPRIX-2026-05-15.xlsx',
  'SUPER_PAX':    'KPI-SUPER_PAX-2026-05-15.xlsx',
  'VIANENSE':     'KPI-VIANENSE-2026-05-15.xlsx',
  'ZONA_SUL':     'KPI-ZONA_SUL-2026-05-15 (3).xlsx',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cellVal(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if ('text' in v) return v.text;
    if ('result' in v) return v.result;
  }
  return v;
}

function asStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function asNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function normText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizaPlaca(raw) {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 6 ? s : null;
}

// ─── KPI Reader ────────────────────────────────────────────────────────────────

async function lerKPI(rede, filename) {
  const fullPath = path.join(KPI_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    return { rede, erro: 'ARQUIVO_NAO_ENCONTRADO', lojas: [] };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fullPath);

  const ws = wb.worksheets[0];
  if (!ws) return { rede, erro: 'SEM_PLANILHA', lojas: [] };

  // Detectar colunas lendo as linhas 1-4 para encontrar headers
  // KPIs gerados têm: linha 1=título, linha 2=cabeçalho, linha 3=subheader, linha 4=unidades
  // Dados começam na linha 5

  // Primeiro, vamos mapear os headers
  let headerRow = null;
  let headerRowNum = 0;

  // Procurar linha de header (tem "LOJA" ou "FILIAL" ou "ROTA")
  for (let r = 1; r <= 6; r++) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= 30; c++) {
      cells.push(asStr(cellVal(row.getCell(c))));
    }
    const joined = cells.filter(Boolean).join('|').toUpperCase();
    if (joined.includes('LOJA') || joined.includes('FILIAL') || joined.includes('ROTA') || joined.includes('MOTORISTA') || joined.includes('PLACA')) {
      headerRow = cells;
      headerRowNum = r;
      break;
    }
  }

  const lojas = [];
  const dataStart = headerRowNum > 0 ? headerRowNum + 1 : 5;

  ws.eachRow((row, rowNum) => {
    if (rowNum < dataStart) return;

    // Ler todas as células
    const vals = [];
    for (let c = 1; c <= 30; c++) {
      vals.push(cellVal(row.getCell(c)));
    }

    // Verificar se tem algum dado útil (pelo menos uma célula não-nula nas primeiras 20)
    const hasData = vals.slice(0, 20).some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasData) return;

    // Pegar strings de todas as células
    const strs = vals.map(v => asStr(v));

    lojas.push({
      rowNum,
      cells: strs,
      raw: vals,
    });
  });

  return { rede, filename, headerRow, headerRowNum, dataStart, lojas, ws_name: ws.name };
}

async function analisarKPI(rede, filename) {
  const data = await lerKPI(rede, filename);
  if (data.erro) return { rede, erro: data.erro, total: 0, comDados: 0, lojas: [] };

  const result = {
    rede,
    filename,
    total: 0,
    comMotorista: 0,
    comPlaca: 0,
    comDados: 0,
    comTempo: 0,
    comSaidaCD: 0,
    tempoSuspeito: [],
    lojas: [],
    headerRow: data.headerRow,
  };

  // Tentar identificar colunas chave: loja, motorista, placa, tempo, saída CD
  let colLoja = -1, colMotorista = -1, colPlaca = -1, colTempo = -1, colSaidaCD = -1;

  if (data.headerRow) {
    data.headerRow.forEach((h, i) => {
      if (!h) return;
      const n = normText(h);
      if (colLoja < 0 && (n.includes('LOJA') || n.includes('FILIAL') || n.includes('ROTA'))) colLoja = i;
      if (colMotorista < 0 && n.includes('MOTORISTA')) colMotorista = i;
      if (colPlaca < 0 && n.includes('PLACA')) colPlaca = i;
      if (colTempo < 0 && (n.includes('TEMPO') && n.includes('LOJA'))) colTempo = i;
      if (colSaidaCD < 0 && (n.includes('SAIDA') || n.includes('SAÍDA')) && (n.includes('CD') || n.includes('DEP'))) colSaidaCD = i;
    });
  }

  for (const row of data.lojas) {
    const cells = row.cells;

    // Pular linhas de total/rodapé
    const firstCell = cells[0] ? normText(cells[0]) : '';
    if (firstCell.startsWith('TOTAL') || firstCell === 'TOTAL') continue;

    // Verificar se é linha de dados real (tem alguma coisa nas primeiras 5 colunas)
    const hasAnyData = cells.slice(0, 15).some(c => c !== null && c !== undefined);
    if (!hasAnyData) continue;

    result.total++;

    const motorista = colMotorista >= 0 ? cells[colMotorista] :
      cells.find((c, i) => i > 0 && c && c.match(/^[A-ZÁÉÍÓÚ][a-záéíóú]/) && c.length > 3);

    const placa = colPlaca >= 0 ? cells[colPlaca] :
      cells.find(c => c && /^[A-Z]{3}\d/.test(c.replace(/[^A-Z0-9]/g, '')));

    const temMotorista = !!(motorista);
    const temPlaca = !!(placa);

    if (temMotorista) result.comMotorista++;
    if (temPlaca) result.comPlaca++;
    if (temMotorista || temPlaca) result.comDados++;

    // Tempo em loja
    if (colTempo >= 0) {
      const tempo = row.raw[colTempo];
      if (tempo !== null && tempo !== undefined) {
        result.comTempo++;
        // Verificar anomalias
        let tempoHoras = null;
        if (tempo instanceof Date) {
          tempoHoras = tempo.getHours() + tempo.getMinutes()/60;
        } else if (typeof tempo === 'number') {
          // Excel time fraction: 1.0 = 24h
          tempoHoras = tempo * 24;
        }
        if (tempoHoras !== null) {
          if (tempoHoras === 0) result.tempoSuspeito.push({ row: row.rowNum, loja: cells[0], tempo: '0:00', tipo: 'ZERO' });
          else if (tempoHoras > 8) result.tempoSuspeito.push({ row: row.rowNum, loja: cells[0], tempo: `${Math.floor(tempoHoras)}:${String(Math.round((tempoHoras%1)*60)).padStart(2,'0')}`, tipo: 'ALTO' });
        }
      }
    }

    // Saída CD
    if (colSaidaCD >= 0) {
      const saida = row.raw[colSaidaCD];
      if (saida !== null && saida !== undefined) {
        result.comSaidaCD++;
      }
    }

    // Capturar nome da loja para comparação
    const lojaNome = colLoja >= 0 ? cells[colLoja] : cells[0];
    result.lojas.push({
      nome: lojaNome,
      motorista: temMotorista ? motorista : null,
      placa: temPlaca ? placa : null,
    });
  }

  return result;
}

// ─── Escala Geral Parser (Day 15) ──────────────────────────────────────────────

function inferRedeFromLoja(nome) {
  const n = normText(nome);
  if (n.includes('ASSAI') || n.includes('ASSAI')) return 'ASSAI';
  if (n.includes('ATACADAO') || n.includes('ATACADAO')) return 'ATACADAO';
  if (n.includes('CARREFOUR')) return 'CARREFOUR';
  if (n.includes('PREZUNIC')) return 'PREZUNIC';
  if (n.includes('PRINCESA')) return 'PRINCESA';
  if (n.includes('GUANABARA')) return 'GUANABARA';
  if (n.includes("SAM'S") || n.includes('SAMS')) return 'SAMS_CLUB';
  if (n.includes('VIANENSE')) return 'VIANENSE';
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS';
  if (n.includes('SENDAS')) return 'SENDAS';
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA';
  if (n.includes('EMANUEL')) return 'EMANUEL';
  if (n.includes('ARMAZEM') && n.includes('GRAO')) return 'ARMAZEM_GRAO';
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX';
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX';
  if (n.includes('MUNDIAL')) return 'MUNDIAL';
  return 'DESCONHECIDO';
}

function inferRedeFromSeparator(sep) {
  const n = normText(sep);
  if (n.includes('ASSAI')) return 'ASSAI';
  if (n.includes('ATACADAO')) return 'ATACADAO';
  if (n.includes('CARREFOUR')) return 'CARREFOUR';
  if (n.includes('SUPER PRIX') || n.includes('SUPERPRIX')) return 'SUPERPRIX';
  if (n.includes('PREZUNIC') || n.includes('LOJAS DO PREZUNIC')) return 'PREZUNIC';
  if (n.includes('PRINCESA')) return 'PRINCESA';
  if (n.includes('GUANABARA')) return 'GUANABARA';
  if (n.includes("SAM'S") || n.includes('SAMS CLUB') || n.includes('SAM S CLUB')) return 'SAMS_CLUB';
  if (n.includes('VIANENSE')) return 'VIANENSE';
  if (n.includes('CAB') && n.includes('PETROPOLIS')) return 'CAB_PETROPOLIS';
  if (n.includes('SENDAS')) return 'SENDAS';
  if (n.includes('FEIRA NOVA')) return 'FEIRA_NOVA';
  if (n.includes('GRUPO EMANUEL') || (n.includes('EMANUEL') && !n.includes('ATACADAO'))) return 'EMANUEL';
  if ((n.includes('ARMAZEM') || n.includes('ARMAZEM')) && (n.includes('GRAO') || n.includes('GRAO'))) return 'ARMAZEM_GRAO';
  if (n.includes('SUPER PAX') || n.includes('SUPERPAX')) return 'SUPER_PAX';
  if (n.includes('MUNDIAL')) return 'MUNDIAL';
  return null;
}

async function parseEscalaGeralDia15(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ABAS_SKIP = new Set(['2° ENTREGA ', 'ARMAZÉM ', 'MOTORISTAS', 'MATRIZ']);
  const RE_DIA_ABA = /^\d{1,2}\s*$/;

  const allLinhas = [];
  const sheetNames = [];

  for (const ws of wb.worksheets) {
    sheetNames.push(ws.name);
    const trimmed = ws.name.trim();
    if (ABAS_SKIP.has(ws.name)) continue;
    if (!RE_DIA_ABA.test(trimmed)) continue;
    if (trimmed !== '15') continue; // Only day 15

    let redeAtual = 'DESCONHECIDO';
    let modoBenassi = false;
    let modoForaEscala = false;

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 4) return;

      const v1 = cellVal(row.getCell(1));
      const v2 = cellVal(row.getCell(2));
      const v3 = cellVal(row.getCell(3));
      const v4 = cellVal(row.getCell(4));
      const v5 = cellVal(row.getCell(5));
      const v6 = cellVal(row.getCell(6));
      const v7 = cellVal(row.getCell(7));
      const v8 = cellVal(row.getCell(8));

      const s1 = asStr(v1);
      if (!s1) return;

      const n0 = normText(s1);
      if (n0.includes('REDES') && (n0.includes('FILIAI') || n0.includes('FILIAL'))) return;
      if (n0.startsWith('TOTAL')) return;

      const v4str = asStr(v4);
      const isMergedHeader = v4str !== null && v4str === s1;
      const isSeparator = isMergedHeader || v4 === null || v4 === undefined || v4str === null;

      if (isSeparator) {
        const hasWeight = !isMergedHeader && asNum(v2) !== null;
        if (!hasWeight) {
          // True separator
          const n = normText(s1);
          if (n.includes('TOTAL =') || n.startsWith('TOTAL')) return;
          if (n.includes('CARREGAMENTO DIARIO') && n.includes('BENASSI')) {
            modoBenassi = true; modoForaEscala = false; redeAtual = 'SENDAS'; return;
          }
          if (n.includes('CARREGAMENTO DIARIO') && n.includes('FORA ESCALA')) {
            modoForaEscala = true; modoBenassi = false; return;
          }
          const rede = inferRedeFromSeparator(s1);
          if (rede !== null) redeAtual = rede;
          return;
        }
      }

      // Data row
      const nomeLoja = s1.replace(/●/g, '').trim();
      const redeFromLoja = inferRedeFromLoja(nomeLoja);
      const redeId = modoBenassi ? 'SENDAS'
        : modoForaEscala ? redeFromLoja
        : redeFromLoja !== 'DESCONHECIDO' ? redeFromLoja : redeAtual;

      const motorista = asStr(v6);
      const placa = normalizaPlaca(asStr(v8));

      allLinhas.push({
        loja: nomeLoja,
        rede: redeId,
        motorista,
        placa,
        rowNum,
      });
    });
  }

  return { linhas: allLinhas, sheetNames };
}

async function parseEscalaPaxDia15(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const SECTION_HEADERS = new Set(['SUPER PAX', 'FEIRA NOVA', 'REDE EMANUEL']);
  const HEADER_TO_REDE = { 'SUPER PAX': 'SUPER_PAX', 'FEIRA NOVA': 'FEIRA_NOVA', 'REDE EMANUEL': 'EMANUEL' };
  const SKIP_VALUES = new Set(['FILIAL', 'FILIAIS COM A MESMA COR, PODEM SER COMPARTILHADAS']);

  const allLinhas = [];
  const sheetNames = [];

  for (const ws of wb.worksheets) {
    sheetNames.push(ws.name);
    const trimmed = ws.name.trim();
    if (!/^\d{1,2}\s*$/.test(trimmed)) continue;
    if (trimmed !== '15') continue;

    let currentRede = null;

    ws.eachRow((row, rowNum) => {
      const raw4 = asStr(cellVal(row.getCell(4)));
      if (raw4 === null) return;

      if (SECTION_HEADERS.has(raw4)) {
        currentRede = HEADER_TO_REDE[raw4];
        return;
      }

      if (!currentRede) return;
      if (SKIP_VALUES.has(raw4)) return;

      const raw5 = asStr(cellVal(row.getCell(5)));
      if (raw5 === 'TOTAL') return;
      if (raw4.toUpperCase().startsWith('TOTAL')) return;

      const placaRaw = asStr(cellVal(row.getCell(7)));
      const motoristaNome = asStr(cellVal(row.getCell(9)));

      const isSemPedido = raw5 && raw5.toUpperCase().includes('SEM PEDIDO');

      allLinhas.push({
        loja: raw4,
        rede: currentRede,
        motorista: isSemPedido ? null : motoristaNome,
        placa: isSemPedido ? null : normalizaPlaca(placaRaw),
        rowNum,
      });
    });
  }

  return { linhas: allLinhas, sheetNames };
}

async function parseArmazemGraoDia15(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const allLinhas = [];
  const sheetNames = [];

  for (const ws of wb.worksheets) {
    sheetNames.push(ws.name);
    const trimmed = ws.name.trim();
    if (!/^\d{1,2}\s*$/.test(trimmed)) continue;
    if (trimmed !== '15') continue;

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // título

      const lojaRaw = asStr(cellVal(row.getCell(1)));
      if (!lojaRaw) return;

      // Pular header row do título
      const n = normText(lojaRaw);
      if (n.includes('ARMAZ') && /\d{1,2}\/\d{1,2}\/\d{4}/.test(lojaRaw)) return;
      if (lojaRaw.toUpperCase().startsWith('TOTAL')) return;

      const tipoCarro = asStr(cellVal(row.getCell(2)));
      const motorista = asStr(cellVal(row.getCell(3)));
      const codigoVal = cellVal(row.getCell(4));
      const placaRaw = asStr(cellVal(row.getCell(5)));

      if (!placaRaw && !motorista) return;

      allLinhas.push({
        loja: lojaRaw,
        rede: 'ARMAZEM_GRAO',
        motorista,
        placa: normalizaPlaca(placaRaw),
        tipoCarro,
        rowNum,
      });
    });
  }

  return { linhas: allLinhas, sheetNames };
}

async function parseZonaSulDia15(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const allLinhas = [];
  const ws = wb.getWorksheet('MATRIZ');
  if (!ws) return { linhas: [], sheetNames: wb.worksheets.map(w => w.name), erro: 'ABA_MATRIZ_NAO_ENCONTRADA' };

  let currentDate = null;

  ws.eachRow((row, rowNum) => {
    const r = [];
    for (let c = 1; c <= 22; c++) r.push(cellVal(row.getCell(c)));

    if (asStr(r[9]) === 'CARREGAMENTO DIÁRIO' || asStr(r[9]) === 'CARREGAMENTO DIARIO') {
      const dv = r[17];
      if (dv instanceof Date) {
        currentDate = new Date(dv.getUTCFullYear(), dv.getUTCMonth(), dv.getUTCDate());
      }
      return;
    }

    if (!currentDate) return;

    const dataISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
    if (dataISO !== '2026-05-15') return;

    // Check hora in col2
    const hora = r[1];
    let temHora = false;
    if (hora instanceof Date) temHora = true;
    else if (typeof hora === 'string' && /\d+:\d+/.test(hora)) temHora = true;
    else if (typeof hora === 'number') temHora = true;
    if (!temHora) return;

    const col4 = asStr(r[3]);
    if (!col4) return;
    const skip4 = new Set(['FILIAL', 'RESUMO:', 'TIPO', 'LEGENDA:', 'QTD.', 'INÍCIO DA OPERAÇÃO DE CARGA', 'CARREGAMENTO DIÁRIO', 'CARREGAMENTO DIARIO']);
    if (skip4.has(col4)) return;

    const loja1 = asStr(r[3]);
    const loja2 = asStr(r[5]);
    const loja3 = asStr(r[7]);
    const placaRaw = asStr(r[14]);
    const motorista = asStr(r[18]);

    const lojas = [loja1, loja2, loja3].filter(Boolean);
    for (const loja of lojas) {
      allLinhas.push({
        loja,
        rede: 'ZONA_SUL',
        motorista: motorista ? motorista.split('/').pop().trim() : null,
        placa: normalizaPlaca(placaRaw),
        rowNum,
      });
    }
  });

  return { linhas: allLinhas, sheetNames: wb.worksheets.map(w => w.name) };
}

// ─── Inspect all XLSX files for Guanabara ─────────────────────────────────────

async function procurarGuanabara() {
  const resultados = [];
  const allXlsxInDownloads = [
    path.join(ESCALA_DIR, 'ESCALA GERAL DE MAIO 1 (2).xlsx'),
    path.join(ESCALA_DIR, 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (3).xlsx'),
    path.join(ESCALA_DIR, 'ESCALA ZONA SUL - MAIO (4).xlsx'),
    path.join(ESCALA_DIR, 'ESCALA DO ARMAZÉM DO GRÃO MAIO (3).xlsx'),
  ];

  for (const fp of allXlsxInDownloads) {
    if (!fs.existsSync(fp)) { resultados.push({ file: path.basename(fp), erro: 'NAO_EXISTE' }); continue; }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fp);

    const encontrado = [];
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        for (let c = 1; c <= 15; c++) {
          const v = asStr(cellVal(row.getCell(c)));
          if (v && normText(v).includes('GUANABARA')) {
            encontrado.push({ aba: ws.name, linha: row.number, col: c, valor: v });
          }
        }
      });
    }
    resultados.push({ file: path.basename(fp), encontrado });
  }
  return resultados;
}

// ─── Inspect KPI file structure ───────────────────────────────────────────────

async function inspecionarEstrutraKPI(rede, filename) {
  const fullPath = path.join(KPI_DIR, filename);
  if (!fs.existsSync(fullPath)) return { rede, erro: 'NAO_EXISTE' };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fullPath);
  const ws = wb.worksheets[0];
  if (!ws) return { rede, erro: 'SEM_PLANILHA' };

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum > 8) return;
    const cells = [];
    for (let c = 1; c <= 25; c++) {
      cells.push(asStr(cellVal(row.getCell(c))));
    }
    rows.push({ rowNum, cells: cells.filter(Boolean) });
  });

  return { rede, rows };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Iniciando análise...\n');

  // 1. Analisar KPIs
  console.log('Analisando KPIs...');
  const kpiResults = {};
  for (const [rede, filename] of Object.entries(KPI_FILES)) {
    process.stdout.write(`  ${rede}... `);
    kpiResults[rede] = await analisarKPI(rede, filename);
    console.log(`${kpiResults[rede].total} linhas, ${kpiResults[rede].comDados} com dados`);
  }

  // 2. Inspecionar primeiras linhas de alguns KPIs para entender estrutura
  console.log('\nInspecionando estrutura dos KPIs...');
  const estruturas = {};
  for (const [rede, filename] of Object.entries(KPI_FILES)) {
    estruturas[rede] = await inspecionarEstrutraKPI(rede, filename);
  }

  // 3. Parsear escalas
  console.log('\nParsando escalas...');

  const escalaGeralFile = path.join(ESCALA_DIR, 'ESCALA GERAL DE MAIO 1 (2).xlsx');
  const escalaPaxFile = path.join(ESCALA_DIR, 'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO (3).xlsx');
  const escalaArmazemFile = path.join(ESCALA_DIR, 'ESCALA DO ARMAZÉM DO GRÃO MAIO (3).xlsx');
  const escalaZonaSulFile = path.join(ESCALA_DIR, 'ESCALA ZONA SUL - MAIO (4).xlsx');

  const geralResult = await parseEscalaGeralDia15(escalaGeralFile);
  console.log(`  Escala Geral (dia 15): ${geralResult.linhas.length} linhas`);
  console.log(`    Abas: ${geralResult.sheetNames.join(', ')}`);

  const paxResult = await parseEscalaPaxDia15(escalaPaxFile);
  console.log(`  Escala PAX (dia 15): ${paxResult.linhas.length} linhas`);
  console.log(`    Abas: ${paxResult.sheetNames.join(', ')}`);

  const armazemResult = await parseArmazemGraoDia15(escalaArmazemFile);
  console.log(`  Escala Armazém Grão (dia 15): ${armazemResult.linhas.length} linhas`);
  console.log(`    Abas: ${armazemResult.sheetNames.join(', ')}`);

  const zonaSulResult = await parseZonaSulDia15(escalaZonaSulFile);
  console.log(`  Escala Zona Sul (dia 15): ${zonaSulResult.linhas.length} linhas`);
  if (zonaSulResult.erro) console.log(`    ERRO: ${zonaSulResult.erro}`);
  console.log(`    Abas: ${(zonaSulResult.sheetNames||[]).join(', ')}`);

  // 4. Buscar Guanabara
  console.log('\nProcurando Guanabara nas escalas...');
  const guanabaraSearch = await procurarGuanabara();

  // 5. Consolidar por rede: escala vs KPI
  const todasLinhasEscala = [
    ...geralResult.linhas,
    ...paxResult.linhas,
    ...armazemResult.linhas,
    ...zonaSulResult.linhas,
  ];

  console.log(`\nTotal linhas escala dia 15: ${todasLinhasEscala.length}`);

  // Agrupar por rede
  const escalaPorRede = {};
  for (const l of todasLinhasEscala) {
    if (!escalaPorRede[l.rede]) escalaPorRede[l.rede] = [];
    escalaPorRede[l.rede].push(l);
  }

  // Lojas únicas por rede
  const lojasUnicasPorRede = {};
  for (const [rede, linhas] of Object.entries(escalaPorRede)) {
    lojasUnicasPorRede[rede] = [...new Set(linhas.map(l => l.loja))];
  }

  // 6. Analisar armazém separadamente: tentar com parser geral
  console.log('\nTestando parser GERAL no arquivo ARMAZÉM...');
  const armazemComParserGeral = await parseEscalaGeralDia15(escalaArmazemFile);
  console.log(`  Parser geral no armazém: ${armazemComParserGeral.linhas.length} linhas`);
  console.log(`    Abas encontradas: ${armazemComParserGeral.sheetNames.join(', ')}`);

  // 7. Ver estrutura crua das primeiras linhas do armazem
  console.log('\nInspecionando estrutura ARMAZEM (primeiras 20 linhas aba 15):');
  const armazemWb = new ExcelJS.Workbook();
  await armazemWb.xlsx.readFile(escalaArmazemFile);
  const armazemWs15 = armazemWb.getWorksheet('15');
  const armazemRows = [];
  if (armazemWs15) {
    armazemWs15.eachRow((row, rowNum) => {
      if (rowNum > 25) return;
      const cells = [];
      for (let c = 1; c <= 8; c++) {
        cells.push(asStr(cellVal(row.getCell(c))));
      }
      armazemRows.push({ rowNum, cells });
    });
  }

  // 8. Ver estrutura crua da escala geral aba 15 primeiras linhas
  console.log('\nInspecionando estrutura ESCALA GERAL aba 15:');
  const geralWb = new ExcelJS.Workbook();
  await geralWb.xlsx.readFile(escalaGeralFile);
  const geral15 = geralWb.getWorksheet('15');
  const geralRows = [];
  if (geral15) {
    geral15.eachRow((row, rowNum) => {
      if (rowNum > 20) return;
      const cells = [];
      for (let c = 1; c <= 12; c++) {
        cells.push(asStr(cellVal(row.getCell(c))));
      }
      geralRows.push({ rowNum, cells });
    });
  }

  // 9. Ver estrutura KPI para entender colunas
  console.log('\nInspecionando estrutura KPI (ASSAI):');
  const assaiWb = new ExcelJS.Workbook();
  const assaiPath = path.join(KPI_DIR, KPI_FILES['ASSAI']);
  await assaiWb.xlsx.readFile(assaiPath);
  const assaiWs = assaiWb.worksheets[0];
  const assaiRows = [];
  if (assaiWs) {
    assaiWs.eachRow((row, rowNum) => {
      if (rowNum > 10) return;
      const cells = [];
      for (let c = 1; c <= 20; c++) {
        cells.push(asStr(cellVal(row.getCell(c))));
      }
      assaiRows.push({ rowNum, cells });
    });
  }

  // ─── Gerar relatório ──────────────────────────────────────────────────────

  // Re-analisar KPIs com estrutura correta baseada na inspeção
  console.log('\nRe-analisando KPIs com detecção de colunas melhorada...');
  const kpiDetalhado = {};
  for (const [rede, filename] of Object.entries(KPI_FILES)) {
    kpiDetalhado[rede] = await analisarKPIV2(rede, filename);
  }

  // Gerar markdown
  const md = gerarRelatorio({
    kpiDetalhado,
    escalaPorRede,
    lojasUnicasPorRede,
    geralResult,
    paxResult,
    armazemResult,
    zonaSulResult,
    armazemComParserGeral,
    guanabaraSearch,
    armazemRows,
    geralRows,
    assaiRows,
    estruturas,
  });

  fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
  console.log(`\nRelatório salvo em: ${OUTPUT_FILE}`);
}

// ─── Análise KPI V2 (com leitura de headers melhorada) ────────────────────────

async function analisarKPIV2(rede, filename) {
  const fullPath = path.join(KPI_DIR, filename);
  if (!fs.existsSync(fullPath)) return { rede, erro: 'NAO_EXISTE', total: 0, comDados: 0, lojas: [], colunas: {} };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fullPath);
  const ws = wb.worksheets[0];
  if (!ws) return { rede, erro: 'SEM_PLANILHA', total: 0, comDados: 0, lojas: [], colunas: {} };

  // Ler todas as linhas
  const allRows = [];
  ws.eachRow((row, rowNum) => {
    const cells = [];
    for (let c = 1; c <= 30; c++) {
      cells.push({ str: asStr(cellVal(row.getCell(c))), raw: cellVal(row.getCell(c)) });
    }
    allRows.push({ rowNum, cells });
  });

  // Detectar linha de header (row com mais texto nas primeiras 20 colunas)
  let headerRowIdx = -1;
  let maxHeaderCells = 0;
  for (let i = 0; i < Math.min(6, allRows.length); i++) {
    const count = allRows[i].cells.slice(0, 20).filter(c => c.str).length;
    if (count > maxHeaderCells) { maxHeaderCells = count; headerRowIdx = i; }
  }

  const colunas = {};
  if (headerRowIdx >= 0) {
    allRows[headerRowIdx].cells.forEach((c, i) => {
      if (!c.str) return;
      const n = normText(c.str);
      // Mapear colunas chave
      if (n.includes('LOJA') || n.includes('FILIAL')) colunas.loja = i;
      if (n.includes('MOTORISTA')) colunas.motorista = i;
      if (n.includes('PLACA')) colunas.placa = i;
      if (n.includes('SAIDA') && n.includes('CD')) colunas.saidaCD = i;
      if (n.includes('CHEGADA') && n.includes('LOJA')) colunas.chegadaLoja = i;
      if (n.includes('SAIDA') && n.includes('LOJA')) colunas.saidaLoja = i;
      if (n.includes('TEMPO') && (n.includes('LOJA') || n.includes('NA LOJA') || n.includes('EM LOJA'))) colunas.tempoLoja = i;
      if (n.includes('TEMPO') && n.includes('VIAGEM')) colunas.tempoViagem = i;
      if (n.includes('PESO') || n.includes('TONELAGEM') || n.includes('KG')) colunas.peso = i;
    });
  }

  const dataStart = headerRowIdx >= 0 ? headerRowIdx + 2 : 5; // +2 porque pode ter sub-header

  const result = {
    rede, filename,
    total: 0, comMotorista: 0, comPlaca: 0, comDados: 0,
    comTempo: 0, comSaidaCD: 0,
    tempoSuspeito: [],
    lojas: [],
    colunas,
    headerRowIdx: headerRowIdx + 1,
    headerCells: headerRowIdx >= 0 ? allRows[headerRowIdx].cells.map(c => c.str).filter(Boolean) : [],
  };

  for (let i = dataStart - 1; i < allRows.length; i++) {
    const row = allRows[i];
    const firstCell = row.cells[0].str;
    if (!firstCell) continue;
    const fn = normText(firstCell);
    if (fn.startsWith('TOTAL') || fn === 'TOTAL') continue;

    // Verificar se tem qualquer dado
    const hasAny = row.cells.slice(0, 20).some(c => c.str);
    if (!hasAny) continue;

    result.total++;

    const motoristaStr = colunas.motorista !== undefined ? row.cells[colunas.motorista]?.str : null;
    const placaStr = colunas.placa !== undefined ? row.cells[colunas.placa]?.str : null;

    if (motoristaStr) result.comMotorista++;
    if (placaStr) result.comPlaca++;
    if (motoristaStr || placaStr) result.comDados++;

    // Saída CD
    if (colunas.saidaCD !== undefined) {
      const saidaRaw = row.cells[colunas.saidaCD]?.raw;
      if (saidaRaw !== null && saidaRaw !== undefined) result.comSaidaCD++;
    }

    // Tempo em loja
    if (colunas.tempoLoja !== undefined) {
      const tempoRaw = row.cells[colunas.tempoLoja]?.raw;
      if (tempoRaw !== null && tempoRaw !== undefined) {
        result.comTempo++;
        let tempoHoras = null;
        if (tempoRaw instanceof Date) {
          tempoHoras = tempoRaw.getUTCHours() + tempoRaw.getUTCMinutes()/60;
        } else if (typeof tempoRaw === 'number') {
          tempoHoras = tempoRaw * 24;
        }
        if (tempoHoras !== null) {
          if (tempoHoras === 0) result.tempoSuspeito.push({ row: row.rowNum, loja: firstCell, tempo: '0:00', tipo: 'ZERO' });
          else if (tempoHoras > 8) result.tempoSuspeito.push({ row: row.rowNum, loja: firstCell, tempo: `${Math.floor(tempoHoras)}:${String(Math.round((tempoHoras%1)*60)).padStart(2,'0')}`, tipo: 'ALTO' });
        }
      }
    }

    const lojaNome = colunas.loja !== undefined ? row.cells[colunas.loja]?.str : firstCell;
    result.lojas.push({
      nome: lojaNome || firstCell,
      motorista: motoristaStr,
      placa: placaStr,
    });
  }

  return result;
}

// ─── Gerador de relatório Markdown ────────────────────────────────────────────

function pct(num, den) {
  if (!den) return '—';
  return `${Math.round(num/den*100)}%`;
}

function gerarRelatorio(data) {
  const {
    kpiDetalhado, escalaPorRede, lojasUnicasPorRede,
    geralResult, paxResult, armazemResult, zonaSulResult,
    armazemComParserGeral, guanabaraSearch,
    armazemRows, geralRows, assaiRows,
  } = data;

  const now = new Date();
  const dataHora = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;

  const linhas = [];
  linhas.push(`# Análise KPI vs Escalas — Dia 15/05/2026`);
  linhas.push(`\n> Gerado em: ${dataHora}\n`);

  // ── Resumo executivo ──
  linhas.push(`## 1. Resumo Executivo\n`);

  const totalKpiLinhas = Object.values(kpiDetalhado).reduce((s, k) => s + k.total, 0);
  const totalKpiComDados = Object.values(kpiDetalhado).reduce((s, k) => s + k.comDados, 0);
  const totalEscala = Object.values(escalaPorRede).reduce((s, l) => s + l.length, 0);

  // Encontrar redes com discrepância
  const todasRedes = new Set([...Object.keys(escalaPorRede), ...Object.keys(kpiDetalhado)]);
  const problemasCount = [...todasRedes].filter(r => {
    const escalaCount = (lojasUnicasPorRede[r] || []).length;
    const kpiCount = (kpiDetalhado[r] || {}).total || 0;
    return Math.abs(escalaCount - kpiCount) > 2;
  }).length;

  // Guanabara
  const guanabaraEmGeral = guanabaraSearch.find(g => g.file.includes('GERAL'))?.encontrado?.length > 0;
  const guanabaraEmPax = guanabaraSearch.find(g => g.file.includes('PAX'))?.encontrado?.length > 0;

  linhas.push(`- Total de **${totalKpiLinhas} linhas** nos KPIs gerados; **${totalKpiComDados} com motorista ou placa** preenchidos (${pct(totalKpiComDados, totalKpiLinhas)} de cobertura)`);
  linhas.push(`- Total de **${totalEscala} entregas** parseadas nas escalas do dia 15 (${Object.values(lojasUnicasPorRede).reduce((s,l)=>s+l.length,0)} lojas únicas)`);
  linhas.push(`- **${problemasCount} redes** com diferença maior que 2 lojas entre escala e KPI`);

  if (!guanabaraEmGeral && !guanabaraEmPax) {
    linhas.push(`- **GUANABARA**: NÃO encontrada nas escalas XLSX — lojas vêm de fonte externa (PDF ou escala própria não incluída no teste)`);
  } else {
    linhas.push(`- **GUANABARA**: encontrada ${guanabaraEmGeral ? 'na Escala Geral' : ''}${guanabaraEmPax ? ' na Escala PAX' : ''}`);
  }

  const armazemKpiTotal = (kpiDetalhado['ARMAZEM_GRAO'] || {}).total || 0;
  const armazemEscalaTotal = (lojasUnicasPorRede['ARMAZEM_GRAO'] || []).length;
  linhas.push(`- **ARMAZEM_GRAO**: escala tem ${armazemEscalaTotal} lojas únicas, KPI tem ${armazemKpiTotal} linhas — existe parser dedicado (\`escala-armazem-grao.ts\`)`);

  // ── Contagem por rede ──
  linhas.push(`\n## 2. Contagem por Rede\n`);
  linhas.push(`| Rede | Linhas Escala | Lojas Únicas Escala | Lojas KPI c/ Dados | Lojas KPI Total | Status |`);
  linhas.push(`|------|:---:|:---:|:---:|:---:|:---:|`);

  const redeOrder = [
    'ASSAI','ATACADAO','CARREFOUR','PREZUNIC','PRINCESA','GUANABARA',
    'SAMS_CLUB','VIANENSE','CAB_PETROPOLIS','SENDAS','FEIRA_NOVA',
    'EMANUEL','ARMAZEM_GRAO','SUPER_PAX','SUPERPRIX','ZONA_SUL','DESCONHECIDO'
  ];

  for (const rede of redeOrder) {
    const escLinhas = (escalaPorRede[rede] || []).length;
    const escUnicas = (lojasUnicasPorRede[rede] || []).length;
    const kpi = kpiDetalhado[rede] || { total: 0, comDados: 0 };
    const kpiTotal = kpi.total;
    const kpiComDados = kpi.comDados;

    let status = '—';
    if (escUnicas === 0 && kpiTotal === 0) status = '—';
    else if (escUnicas === 0 && kpiTotal > 0) status = '⚠️ SEM_ESCALA';
    else if (escUnicas > 0 && kpiTotal === 0) status = '❌ KPI_VAZIO';
    else if (Math.abs(escUnicas - kpiTotal) <= 2) status = '✅ OK';
    else if (kpiTotal > escUnicas) status = '⚠️ SOBRANDO';
    else status = '⚠️ FALTA_LOJAS';

    linhas.push(`| ${rede} | ${escLinhas} | ${escUnicas} | ${kpiComDados} | ${kpiTotal} | ${status} |`);
  }

  // Redes não previstas (na escala mas sem KPI planejado)
  const redesNaoListadas = Object.keys(escalaPorRede).filter(r => !redeOrder.includes(r));
  for (const rede of redesNaoListadas) {
    const escLinhas = (escalaPorRede[rede] || []).length;
    const escUnicas = (lojasUnicasPorRede[rede] || []).length;
    linhas.push(`| ${rede} | ${escLinhas} | ${escUnicas} | — | — | ⚠️ SEM_KPI |`);
  }

  // Detalhe de discrepâncias
  linhas.push(`\n### 2.1 Lojas na Escala sem correspondência no KPI\n`);

  for (const rede of redeOrder) {
    const escUnicas = lojasUnicasPorRede[rede] || [];
    const kpi = kpiDetalhado[rede];
    if (!kpi || escUnicas.length === 0) continue;

    const kpiLojas = new Set((kpi.lojas || []).map(l => l.nome ? normText(l.nome) : ''));
    const faltando = escUnicas.filter(l => {
      const n = normText(l);
      return ![...kpiLojas].some(k => k && (k.includes(n.substring(0,8)) || n.includes(k.substring(0,8))));
    });

    if (faltando.length > 0) {
      linhas.push(`**${rede}** (${faltando.length} possivelmente ausentes no KPI):`);
      linhas.push(faltando.map(l => `- ${l}`).join('\n'));
      linhas.push('');
    }
  }

  // ── GUANABARA ──
  linhas.push(`\n## 3. GUANABARA\n`);

  for (const g of guanabaraSearch) {
    linhas.push(`### ${g.file}`);
    if (g.erro) { linhas.push(`- Erro: ${g.erro}`); continue; }
    if (g.encontrado.length === 0) {
      linhas.push(`- **Nenhuma ocorrência de "GUANABARA" encontrada**`);
    } else {
      linhas.push(`- **${g.encontrado.length} ocorrência(s) encontrada(s):**`);
      for (const e of g.encontrado.slice(0, 20)) {
        linhas.push(`  - Aba: \`${e.aba}\`, Linha: ${e.linha}, Col: ${e.col} → \`${e.valor}\``);
      }
      if (g.encontrado.length > 20) linhas.push(`  - ... e mais ${g.encontrado.length - 20} ocorrências`);
    }
    linhas.push('');
  }

  // Verificar KPI GUANABARA
  const kpiGuanabara = kpiDetalhado['GUANABARA'];
  linhas.push(`### KPI GUANABARA gerado`);
  if (kpiGuanabara) {
    linhas.push(`- Total de linhas no KPI: **${kpiGuanabara.total}**`);
    linhas.push(`- Com motorista/placa: **${kpiGuanabara.comDados}**`);
    if (kpiGuanabara.lojas.length > 0) {
      linhas.push(`- Lojas listadas:`);
      kpiGuanabara.lojas.slice(0, 30).forEach(l => linhas.push(`  - ${l.nome || '(sem nome)'} | motorista: ${l.motorista || '—'} | placa: ${l.placa || '—'}`));
    }
  } else {
    linhas.push(`- KPI não encontrado`);
  }

  linhas.push(`\n### Conclusão GUANABARA`);
  const guanabaraGeral = guanabaraSearch.find(g => g.file.includes('GERAL'));
  const guanabaraEncontradoGeral = guanabaraGeral?.encontrado?.filter(e => e.aba === '15');
  if (guanabaraEncontradoGeral && guanabaraEncontradoGeral.length > 0) {
    linhas.push(`- Guanabara está na **Escala Geral**, aba 15, em ${guanabaraEncontradoGeral.length} linha(s)`);
    linhas.push(`- O parser Escala Geral deveria capturar essas lojas com rede = 'GUANABARA'`);
    const guanabaraEscala = (escalaPorRede['GUANABARA'] || []).length;
    linhas.push(`- Linhas parseadas com rede=GUANABARA na escala geral: **${guanabaraEscala}**`);
  } else {
    linhas.push(`- Guanabara **não aparece** no arquivo ESCALA GERAL aba 15 — origem dos dados do KPI é desconhecida ou vem de aba diferente`);
    const outrasAbas = guanabaraGeral?.encontrado?.map(e => e.aba);
    if (outrasAbas && outrasAbas.length > 0) {
      linhas.push(`- Guanabara encontrada em outras abas: ${[...new Set(outrasAbas)].join(', ')}`);
    }
  }

  // ── ARMAZEM_GRAO ──
  linhas.push(`\n## 4. ARMAZEM_GRAO\n`);
  linhas.push(`### Estrutura do arquivo (aba 15, primeiras 25 linhas)`);
  linhas.push('');
  linhas.push('```');
  for (const r of armazemRows) {
    const celsFilt = r.cells.filter(c => c);
    if (celsFilt.length > 0) linhas.push(`Linha ${r.rowNum}: ${celsFilt.join(' | ')}`);
  }
  linhas.push('```');
  linhas.push('');

  linhas.push(`### Parser dedicado (escala-armazem-grao.ts)`);
  linhas.push(`- Existe: **SIM** — o arquivo \`src/lib/parsers/escala-armazem-grao.ts\` está implementado`);
  linhas.push(`- Linhas parseadas com parser dedicado: **${armazemResult.linhas.length}**`);
  linhas.push(`- Linhas parseadas com parser GERAL (teste): **${armazemComParserGeral.linhas.length}**`);
  linhas.push('');
  linhas.push(`### Lojas na escala (dia 15)`);
  const armazemLojas = (lojasUnicasPorRede['ARMAZEM_GRAO'] || []);
  if (armazemLojas.length > 0) {
    armazemLojas.forEach(l => linhas.push(`- ${l}`));
  } else {
    linhas.push(`- Nenhuma loja parseada (verificar se aba "15" existe no arquivo)`);
    // Mostrar abas disponíveis
    linhas.push(`- Abas disponíveis: ${armazemResult.sheetNames.join(', ')}`);
  }

  const kpiArmazem = kpiDetalhado['ARMAZEM_GRAO'];
  linhas.push(`\n### KPI ARMAZEM_GRAO`);
  linhas.push(`- Total linhas KPI: **${kpiArmazem?.total || 0}**`);
  linhas.push(`- Com dados (motorista/placa): **${kpiArmazem?.comDados || 0}**`);
  if (kpiArmazem?.lojas?.length > 0) {
    linhas.push(`- Lojas no KPI:`);
    kpiArmazem.lojas.forEach(l => linhas.push(`  - ${l.nome} | mot: ${l.motorista || '—'} | placa: ${l.placa || '—'}`));
  }

  // ── Problemas encontrados ──
  linhas.push(`\n## 5. Problemas Encontrados\n`);

  const problemas = [];

  // KPIs vazios
  for (const [rede, kpi] of Object.entries(kpiDetalhado)) {
    if (kpi.total === 0 && kpi.erro !== 'NAO_EXISTE') {
      problemas.push({ tipo: 'KPI_VAZIO', rede, detalhe: `KPI com 0 linhas de dados` });
    }
    if (kpi.comDados === 0 && kpi.total > 0) {
      problemas.push({ tipo: 'KPI_SEM_DADOS', rede, detalhe: `${kpi.total} linhas mas nenhuma com motorista ou placa` });
    }
  }

  // Discrepâncias grandes
  for (const rede of redeOrder) {
    const escUnicas = (lojasUnicasPorRede[rede] || []).length;
    const kpiTotal = (kpiDetalhado[rede] || {}).total || 0;
    if (escUnicas > 0 && kpiTotal === 0 && rede !== 'DESCONHECIDO') {
      problemas.push({ tipo: 'REDE_SEM_KPI', rede, detalhe: `${escUnicas} lojas na escala, KPI vazio` });
    }
    if (escUnicas === 0 && kpiTotal > 0 && rede !== 'DESCONHECIDO') {
      problemas.push({ tipo: 'KPI_SEM_ESCALA', rede, detalhe: `${kpiTotal} linhas no KPI mas rede não aparece na escala do dia 15` });
    }
  }

  // DESCONHECIDO na escala
  const desconhecidoEscala = (escalaPorRede['DESCONHECIDO'] || []);
  if (desconhecidoEscala.length > 0) {
    problemas.push({ tipo: 'REDE_DESCONHECIDA', rede: 'DESCONHECIDO', detalhe: `${desconhecidoEscala.length} entregas sem rede identificada na escala geral` });
    linhas.push(`### Entregas sem rede (DESCONHECIDO na escala geral)`);
    const uniqueDesconhecido = [...new Set(desconhecidoEscala.map(l => l.loja))];
    uniqueDesconhecido.slice(0, 20).forEach(l => linhas.push(`- ${l}`));
    linhas.push('');
  }

  // Lojas no KPI DESCONHECIDO
  const kpiDesconhecido = kpiDetalhado['DESCONHECIDO'];
  if (kpiDesconhecido && kpiDesconhecido.total > 0) {
    problemas.push({ tipo: 'KPI_DESCONHECIDO', rede: 'DESCONHECIDO', detalhe: `${kpiDesconhecido.total} lojas no KPI-DESCONHECIDO (sem rede identificada no Unitrac)` });
    linhas.push(`### Lojas no KPI-DESCONHECIDO`);
    kpiDesconhecido.lojas.forEach(l => linhas.push(`- ${l.nome} | mot: ${l.motorista || '—'} | placa: ${l.placa || '—'}`));
    linhas.push('');
  }

  if (problemas.length > 0) {
    linhas.push(`### Lista de Problemas`);
    linhas.push('');
    for (const p of problemas) {
      linhas.push(`**[${p.tipo}]** \`${p.rede}\`: ${p.detalhe}`);
    }
    linhas.push('');
  } else {
    linhas.push(`_Nenhum problema estrutural crítico detectado._`);
  }

  // ── Qualidade GPS/Tempo ──
  linhas.push(`\n## 6. Qualidade GPS / Tempo por Rede\n`);
  linhas.push(`| Rede | Total Lojas KPI | Com Saída CD | % Saída CD | Com Tempo em Loja | % Tempo | Anomalias Tempo |`);
  linhas.push(`|------|:---:|:---:|:---:|:---:|:---:|:---:|`);

  for (const rede of redeOrder) {
    const kpi = kpiDetalhado[rede];
    if (!kpi || kpi.total === 0) continue;
    const anomalias = kpi.tempoSuspeito.length;
    linhas.push(`| ${rede} | ${kpi.total} | ${kpi.comSaidaCD} | ${pct(kpi.comSaidaCD, kpi.total)} | ${kpi.comTempo} | ${pct(kpi.comTempo, kpi.total)} | ${anomalias > 0 ? `⚠️ ${anomalias}` : '✅ 0'} |`);
  }

  // Detalhes de anomalias de tempo
  const redesComAnomalias = redeOrder.filter(r => kpiDetalhado[r] && kpiDetalhado[r].tempoSuspeito.length > 0);
  if (redesComAnomalias.length > 0) {
    linhas.push(`\n### Anomalias de Tempo Detalhadas\n`);
    for (const rede of redesComAnomalias) {
      const anomalias = kpiDetalhado[rede].tempoSuspeito;
      linhas.push(`**${rede}** (${anomalias.length} anomalias):`);
      anomalias.forEach(a => linhas.push(`- Linha ${a.row}: \`${a.loja}\` tempo=${a.tempo} [${a.tipo}]`));
      linhas.push('');
    }
  }

  // ── Próximos passos ──
  linhas.push(`\n## 7. Próximos Passos\n`);

  const steps = [];

  // Guanabara
  const guanabaraEscalaCount = (escalaPorRede['GUANABARA'] || []).length;
  if (guanabaraEscalaCount === 0) {
    const guanabaraAbas = [...new Set(guanabaraSearch.find(g=>g.file.includes('GERAL'))?.encontrado?.map(e=>e.aba) || [])];
    if (guanabaraAbas.length > 0 && !guanabaraAbas.includes('15')) {
      steps.push(`**GUANABARA**: Verificar se a aba do dia 15 na escala geral contém lojas Guanabara ou se existem abas separadas (encontradas em: ${guanabaraAbas.join(', ')})`);
    } else {
      steps.push(`**GUANABARA**: Identificar fonte dos dados — escala própria não incluída no teste ou escala em PDF`);
    }
  }

  // Armazem
  if (armazemResult.linhas.length === 0) {
    steps.push(`**ARMAZEM_GRAO**: Verificar se o arquivo de escala tem aba "15" — abas encontradas: ${armazemResult.sheetNames.join(', ')}`);
  }

  // Desconhecido
  const desconhecidoCount = (escalaPorRede['DESCONHECIDO'] || []).length;
  if (desconhecidoCount > 0) {
    const desconhUniq = [...new Set((escalaPorRede['DESCONHECIDO']||[]).map(l=>l.loja))];
    steps.push(`**inferRedeFromLoja**: Adicionar ${desconhUniq.length} lojas não reconhecidas ao mapa de detecção de rede: ${desconhUniq.slice(0,5).join(', ')}...`);
  }

  // Redes com baixo %  saída CD
  for (const rede of redeOrder) {
    const kpi = kpiDetalhado[rede];
    if (!kpi || kpi.total < 3) continue;
    const pctSaida = kpi.comSaidaCD / kpi.total;
    if (pctSaida < 0.3 && kpi.colunas.saidaCD === undefined) {
      steps.push(`**${rede}**: Coluna "Saída CD" não detectada nos headers do KPI — verificar estrutura do XLSX`);
    }
  }

  // Tempo suspeito
  for (const rede of redesComAnomalias) {
    const kpi = kpiDetalhado[rede];
    if (kpi.tempoSuspeito.some(a => a.tipo === 'ZERO')) {
      steps.push(`**${rede}**: ${kpi.tempoSuspeito.filter(a=>a.tipo==='ZERO').length} lojas com tempo=0 — verificar cálculo no gerador de KPI`);
    }
    if (kpi.tempoSuspeito.some(a => a.tipo === 'ALTO')) {
      steps.push(`**${rede}**: ${kpi.tempoSuspeito.filter(a=>a.tipo==='ALTO').length} lojas com tempo >8h — verificar se chegada/saída estão corretos`);
    }
  }

  // KPIs sem dados
  for (const [rede, kpi] of Object.entries(kpiDetalhado)) {
    if (kpi.comDados === 0 && kpi.total > 0) {
      steps.push(`**${rede}**: KPI com ${kpi.total} linhas mas sem motorista/placa — verificar cruzamento Unitrac`);
    }
  }

  steps.forEach((s, i) => linhas.push(`${i+1}. ${s}`));

  // ── Apêndice: Estrutura das primeiras linhas dos KPIs ──
  linhas.push(`\n## Apêndice A: Estrutura KPI (primeiras 8 linhas — ASSAI de exemplo)\n`);
  linhas.push('```');
  for (const r of assaiRows) {
    const filtered = r.cells.filter(c => c);
    if (filtered.length > 0) linhas.push(`L${r.rowNum}: ${filtered.join(' | ')}`);
  }
  linhas.push('```');

  linhas.push(`\n## Apêndice B: Estrutura Escala Geral (primeiras 20 linhas aba 15)\n`);
  linhas.push('```');
  for (const r of geralRows) {
    const filtered = r.cells.filter(c => c);
    if (filtered.length > 0) linhas.push(`L${r.rowNum}: ${filtered.join(' | ')}`);
  }
  linhas.push('```');

  linhas.push(`\n## Apêndice C: Colunas detectadas por KPI\n`);
  linhas.push(`| Rede | Header Row | Loja Col | Motorista Col | Placa Col | Saída CD Col | Tempo Loja Col |`);
  linhas.push(`|------|:---:|:---:|:---:|:---:|:---:|:---:|`);
  for (const [rede, kpi] of Object.entries(kpiDetalhado)) {
    const c = kpi.colunas || {};
    const coln = (n) => n !== undefined ? n + 1 : '—';
    linhas.push(`| ${rede} | ${kpi.headerRowIdx || '—'} | ${coln(c.loja)} | ${coln(c.motorista)} | ${coln(c.placa)} | ${coln(c.saidaCD)} | ${coln(c.tempoLoja)} |`);
  }

  linhas.push(`\n## Apêndice D: Lojas DESCONHECIDO na escala geral\n`);
  const descLojas = [...new Set((escalaPorRede['DESCONHECIDO']||[]).map(l=>l.loja))];
  descLojas.forEach(l => linhas.push(`- \`${l}\``));

  linhas.push(`\n---\n_Análise automatizada via ExcelJS — ${dataHora}_`);

  return linhas.join('\n');
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
