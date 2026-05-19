const ExcelJS = require('exceljs');

function norm(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
}
function normPlaca(s) {
  if (!s) return '';
  return String(s).toUpperCase().replace(/[-\s]/g,'').trim();
}

function getCellStr(cell) {
  if (cell.value === null || cell.value === undefined) return '';
  if (cell.value instanceof Date) return '';
  if (typeof cell.value === 'object' && cell.value.result !== undefined) return String(cell.value.result).trim();
  if (typeof cell.value === 'object' && cell.value.richText) return cell.value.richText.map(x=>x.text).join('').trim();
  return String(cell.value).trim();
}

async function readKPI(file, sheetName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return;
    const loja = getCellStr(row.getCell(1));
    if (!loja) return;
    rows.push({
      rowNum,
      loja,
      mot1: getCellStr(row.getCell(2)),
      cod1: getCellStr(row.getCell(3)),
      placa1: getCellStr(row.getCell(4)),
      mot2: getCellStr(row.getCell(8)),
      cod2: getCellStr(row.getCell(9)),
      placa2: getCellStr(row.getCell(10)),
    });
  });
  return rows;
}

async function readEscalaGeral(file, sheetName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return {};

  const networks = {};

  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return;
    const colA = getCellStr(row.getCell(1));
    const colD = getCellStr(row.getCell(4));

    if (!colA) return;

    // Section header detection: col A and col D have same text (merged cell pattern)
    const isSectionHeader = colA === colD && colD.length > 3 && isNaN(parseFloat(colD));
    if (isSectionHeader) return;

    // Skip total rows
    if (colA.toUpperCase().startsWith('TOTAL =') || colA.toUpperCase().startsWith('CARREGAMENTO')) return;

    const mot1 = getCellStr(row.getCell(6));
    const cod1 = getCellStr(row.getCell(7));
    const placa1 = getCellStr(row.getCell(8));
    const mot2 = getCellStr(row.getCell(10));
    const cod2 = getCellStr(row.getCell(11));
    const placa2 = getCellStr(row.getCell(12));

    const colAu = colA.toUpperCase();
    let net = 'OUTROS';
    if (colAu.startsWith('ASSAI') || colAu.startsWith('ASSAI')) net = 'ASSAI';
    else if (colAu.startsWith('ATACADAO') || colAu.startsWith('ATACAD')) net = 'ATACADAO';
    else if (colAu.startsWith('CARREFOUR')) net = 'CARREFOUR';
    else if (colAu.startsWith('SUPER PRIX') || colAu.startsWith('SUPERPRIX')) net = 'SUPER PRIX';
    else if (colAu.startsWith('PREZUNIC SPID')) net = 'PREZUNIC SPID';
    else if (colAu.startsWith('PREZUNIC')) net = 'PREZUNIC';
    else if (colAu.startsWith('PRINCESA')) net = 'PRINCESA';
    else if (colAu.startsWith("SAM'S") || colAu.startsWith('SAM')) net = 'SAMS';
    else if (colAu.startsWith('VIANENSE')) net = 'VIANENSE';
    else if (colAu.startsWith('GUANABARA')) net = 'GUANABARA';
    else if (colAu.startsWith('SENDAS')) net = 'SENDAS';
    else if (colAu.startsWith('CAB -') || colAu.startsWith('CAB-') || colAu.startsWith('CAB PETROPOLIS') || colAu.startsWith('CAB -')) net = 'CAB';
    else if (colAu.startsWith('FEIRA NOVA') || colAu.startsWith('MERCADO SAO AGOSTINHO') || colAu.startsWith('MERCADO DE SANTA') ) net = 'FEIRA NOVA';
    else if (colAu.startsWith('GRUPO EMANUEL') || colAu.startsWith('EMANUEL')) net = 'EMANUEL';
    else if (colAu.startsWith('ARMAZEM') || colAu.startsWith('ARMAZEM') || colAu.startsWith('ABASTECEDORA') || colAu.startsWith('REGINA')) net = 'ARMAZEM';
    else if (colAu.startsWith('SUPERPAX') || colAu.startsWith('SUPER PAX')) net = 'SUPER PAX';

    if (!networks[net]) networks[net] = [];
    networks[net].push({ loja: colA, mot1, cod1, placa1, mot2, cod2, placa2, rowNum });
  });

  return networks;
}

async function readZonaSul(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  // Find the sheet with dia 15 data - CTRL+C sheet or DIARIA
  const sheetNames = [];
  wb.eachSheet(s => sheetNames.push(s.name));
  console.log('  Zona Sul sheets:', sheetNames);

  // Try CTRL+C sheet - likely has current day data
  const ws = wb.getWorksheet('CTRL+C');
  if (!ws) return [];

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const loja = getCellStr(row.getCell(1));
    if (!loja || loja.toUpperCase().includes('FILIAL') || loja.toUpperCase().includes('REDES')) return;
    const mot1 = getCellStr(row.getCell(4));
    const placa1 = getCellStr(row.getCell(5));
    const mot2 = getCellStr(row.getCell(7));
    const placa2 = getCellStr(row.getCell(8));
    rows.push({ loja, mot1, cod1: '', placa1, mot2, cod2: '', placa2, rowNum });
  });
  return rows;
}

function compareNets(kpiRows, escalaRows, netName) {
  console.log('\n' + '='.repeat(60));
  console.log('REDE: ' + netName);
  console.log('='.repeat(60));
  console.log('KPI: ' + kpiRows.length + ' linhas | Escala: ' + escalaRows.length + ' lojas');

  // Check duplicates in KPI
  const kpiMap = {};
  const kpiDups = [];
  for (const r of kpiRows) {
    const k = norm(r.loja);
    if (kpiMap[k]) {
      kpiDups.push({ loja: r.loja, rows: [kpiMap[k].rowNum, r.rowNum] });
    } else {
      kpiMap[k] = r;
    }
  }
  if (kpiDups.length > 0) {
    console.log('\n  [DUPLICADAS NO KPI]:');
    kpiDups.forEach(d => console.log('    "' + d.loja + '" (linhas ' + d.rows.join(' e ') + ')'));
  }

  const escalaMap = {};
  for (const r of escalaRows) {
    escalaMap[norm(r.loja)] = r;
  }

  // Fuzzy match helper
  function findMatch(key, targetMap) {
    if (targetMap[key]) return key;
    const keys = Object.keys(targetMap);
    // try prefix 20 chars
    const pre = key.substring(0, 20);
    return keys.find(k => k.startsWith(pre) || (pre.length > 10 && k.includes(pre.substring(0,10))));
  }

  // Lojas na escala sem KPI
  const missing = [];
  for (const [k, r] of Object.entries(escalaMap)) {
    if (!findMatch(k, kpiMap)) {
      missing.push(r.loja);
    }
  }
  if (missing.length > 0) {
    console.log('\n  [FALTANDO NO KPI] (' + missing.length + ' lojas na escala sem KPI):');
    missing.forEach(l => console.log('    - ' + l));
  } else {
    console.log('\n  [OK] Todas as lojas da escala aparecem no KPI');
  }

  // Lojas extras no KPI
  const extras = [];
  for (const [k, r] of Object.entries(kpiMap)) {
    if (!findMatch(k, escalaMap)) {
      extras.push(r.loja);
    }
  }
  if (extras.length > 0) {
    console.log('\n  [EXTRAS NO KPI] (' + extras.length + ' lojas no KPI sem correspondencia na escala):');
    extras.forEach(l => console.log('    - ' + l));
  } else {
    console.log('  [OK] Nenhuma loja extra no KPI');
  }

  // Divergencias de motorista/placa
  const mismatches = [];
  for (const [k, kRow] of Object.entries(kpiMap)) {
    const matchKey = findMatch(k, escalaMap);
    if (!matchKey) continue;
    const eRow = escalaMap[matchKey];

    const kMot1 = norm(kRow.mot1);
    const eMot1 = norm(eRow.mot1);
    const kPlaca1 = normPlaca(kRow.placa1);
    const ePlaca1 = normPlaca(eRow.placa1);

    const issues = [];

    if (!kMot1.includes('SEM PEDIDO') && !eMot1.includes('SEM PEDIDO')) {
      if (kMot1 && eMot1 && !kMot1.includes(eMot1) && !eMot1.includes(kMot1) && kMot1.split(' ')[0] !== eMot1.split(' ')[0]) {
        issues.push('Motorista1: KPI="' + kRow.mot1 + '" vs Escala="' + eRow.mot1 + '"');
      }
      if (kPlaca1 && ePlaca1 && kPlaca1 !== ePlaca1) {
        issues.push('Placa1: KPI="' + kRow.placa1 + '" vs Escala="' + eRow.placa1 + '"');
      }
    }

    if (issues.length > 0) {
      mismatches.push({ loja: kRow.loja, issues });
    }
  }

  if (mismatches.length > 0) {
    console.log('\n  [DIVERGENCIAS MOTORISTA/PLACA] (' + mismatches.length + ' lojas):');
    mismatches.forEach(m => {
      console.log('    Loja: ' + m.loja);
      m.issues.forEach(i => console.log('      >> ' + i));
    });
  } else {
    console.log('  [OK] Motoristas/placas conferem para lojas em comum');
  }
}

(async () => {
  const ESCALA_GERAL = 'C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA GERAL DE MAIO 1 (2).xlsx';
  const KPI_DIR = 'C:/Users/media/Downloads/KPIS GERADAS/';

  console.log('Lendo escala geral (dia 15)...');
  const escala = await readEscalaGeral(ESCALA_GERAL, '15');

  console.log('Redes encontradas na escala geral:');
  for (const [net, rows] of Object.entries(escala)) {
    console.log('  ' + net + ': ' + rows.length + ' lojas');
  }

  // 1. ASSAI
  const kpiAssai = await readKPI(KPI_DIR + 'KPI-ASSAI-2026-05-15.xlsx', '15');
  compareNets(kpiAssai, escala['ASSAI'] || [], 'ASSAI');

  // 2. ATACADAO
  const kpiAtacadao = await readKPI(KPI_DIR + 'KPI-ATACADAO-2026-05-15.xlsx', '15');
  compareNets(kpiAtacadao, escala['ATACADAO'] || [], 'ATACADAO');

  // 3. CARREFOUR
  const kpiCarrefour = await readKPI(KPI_DIR + 'KPI-CARREFOUR-2026-05-15.xlsx', '15');
  compareNets(kpiCarrefour, escala['CARREFOUR'] || [], 'CARREFOUR');

  // 4. ZONA SUL (separate file)
  const ESCALA_ZONA_SUL = 'C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA ZONA SUL - MAIO (4).xlsx';
  const escalaZonaSul = await readZonaSul(ESCALA_ZONA_SUL);
  const kpiZonaSul = await readKPI(KPI_DIR + 'KPI-ZONA_SUL-2026-05-15 (3).xlsx', '15');
  compareNets(kpiZonaSul, escalaZonaSul, 'ZONA SUL');

})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); });
