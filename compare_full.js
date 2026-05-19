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

async function readEscalaGeralNet(file, sheetName, netPrefix) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return;
    const colA = getCellStr(row.getCell(1));
    if (!colA) return;
    const n = norm(colA);
    for (const prefix of netPrefix) {
      if (n.startsWith(prefix)) {
        rows.push({
          loja: colA,
          mot1: getCellStr(row.getCell(6)),
          cod1: getCellStr(row.getCell(7)),
          placa1: getCellStr(row.getCell(8)),
          mot2: getCellStr(row.getCell(10)),
          cod2: getCellStr(row.getCell(11)),
          placa2: getCellStr(row.getCell(12)),
          rowNum
        });
        break;
      }
    }
  });
  return rows;
}

// Zona Sul: escala has motoristas by code, KPI has loja names + motoristas
// Comparison approach: match by COD (motorist code) between KPI and escala DIARIA sheet
async function readZonaSulDiaria(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('DIÁRIA (MOTORISTAS)');
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return;
    const mot = getCellStr(row.getCell(3)); // Proprietario/Motorista
    const cod = getCellStr(row.getCell(4));
    const placa = getCellStr(row.getCell(11));
    if (!cod || isNaN(parseInt(cod))) return;
    rows.push({ mot, cod: cod.trim(), placa: placa.trim(), rowNum });
  });
  return rows;
}

function compareNets(kpiRows, escalaRows, netName) {
  console.log('\n' + '='.repeat(70));
  console.log('REDE: ' + netName);
  console.log('='.repeat(70));
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
    kpiDups.forEach(d => console.log('    - "' + d.loja + '" (linhas ' + d.rows.join(' e ') + ')'));
  } else {
    console.log('  Duplicatas no KPI: nenhuma');
  }

  const escalaMap = {};
  for (const r of escalaRows) {
    escalaMap[norm(r.loja)] = r;
  }

  // Match: exact norm, then prefix 25chars
  function findMatch(key, targetMap) {
    if (targetMap[key]) return key;
    const pre25 = key.substring(0, 25);
    const keys = Object.keys(targetMap);
    let found = keys.find(k => k === key);
    if (found) return found;
    found = keys.find(k => k.startsWith(pre25) || pre25.length > 15 && (k.includes(pre25.substring(0,15))));
    return found || null;
  }

  // Lojas na escala sem KPI
  const missing = [];
  for (const [k, r] of Object.entries(escalaMap)) {
    if (!findMatch(k, kpiMap)) missing.push(r.loja);
  }
  if (missing.length > 0) {
    console.log('\n  [FALTANDO NO KPI] (' + missing.length + ' lojas da escala sem entrada no KPI):');
    missing.forEach(l => console.log('    - ' + l));
  } else {
    console.log('  Cobertura: todas as lojas da escala aparecem no KPI');
  }

  // Lojas extras no KPI
  const extras = [];
  for (const [k, r] of Object.entries(kpiMap)) {
    if (!findMatch(k, escalaMap)) extras.push(r.loja);
  }
  if (extras.length > 0) {
    console.log('\n  [EXTRAS NO KPI] (' + extras.length + ' lojas no KPI sem correspondencia na escala):');
    extras.forEach(l => console.log('    - ' + l));
  } else {
    console.log('  Extras: nenhuma loja extra no KPI');
  }

  // Divergencias motorista/placa
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
      // First word compare (handles "JOSE" vs "JOSE SILVA")
      const kFirst = kMot1.split(' ')[0];
      const eFirst = eMot1.split(' ')[0];
      if (kMot1 && eMot1 && kFirst !== eFirst && kFirst.length > 2 && eFirst.length > 2) {
        issues.push('Motorista1: KPI="' + kRow.mot1 + '" vs Escala="' + eRow.mot1 + '"');
      }
      if (kPlaca1 && ePlaca1 && kPlaca1 !== ePlaca1 && kPlaca1 !== 'SEMPEDIDO') {
        issues.push('Placa1: KPI="' + kRow.placa1 + '" vs Escala="' + eRow.placa1 + '"');
      }
    }
    if (issues.length > 0) mismatches.push({ loja: kRow.loja, issues });
  }
  if (mismatches.length > 0) {
    console.log('\n  [DIVERGENCIAS MOTORISTA/PLACA] (' + mismatches.length + ' lojas):');
    mismatches.forEach(m => {
      console.log('    Loja: ' + m.loja);
      m.issues.forEach(i => console.log('      >> ' + i));
    });
  } else {
    console.log('  Motoristas/Placas: sem divergencias nas lojas em comum');
  }
}

async function readZonaSulKPIvsEscala(kpiFile, escalaFile) {
  console.log('\n' + '='.repeat(70));
  console.log('REDE: ZONA SUL');
  console.log('='.repeat(70));

  const kpi = await readKPI(kpiFile, '15');
  const diaria = await readZonaSulDiaria(escalaFile);
  console.log('KPI: ' + kpi.length + ' lojas | Escala DIARIA: ' + diaria.length + ' veiculos/motoristas');

  // Build maps by COD
  const diariaMap = {};
  for (const r of diaria) {
    if (!diariaMap[r.cod]) diariaMap[r.cod] = [];
    diariaMap[r.cod].push(r);
  }

  // Check duplicates in KPI
  const kpiMap = {};
  const kpiDups = [];
  for (const r of kpi) {
    const k = norm(r.loja);
    if (kpiMap[k]) kpiDups.push({ loja: r.loja, rows: [kpiMap[k].rowNum, r.rowNum] });
    else kpiMap[k] = r;
  }
  if (kpiDups.length > 0) {
    console.log('\n  [DUPLICADAS NO KPI]:');
    kpiDups.forEach(d => console.log('    - "' + d.loja + '" (linhas ' + d.rows.join(' e ') + ')'));
  } else {
    console.log('  Duplicatas: nenhuma');
  }

  // For each KPI entry, check if motorista COD exists in escala DIARIA
  const codsNotInDiaria = [];
  const placaMismatches = [];
  for (const r of kpi) {
    const cod = r.cod1.trim();
    if (!cod || cod === '') { codsNotInDiaria.push({ loja: r.loja, cod: '(vazio)' }); continue; }
    const diariaEntries = diariaMap[cod];
    if (!diariaEntries) {
      codsNotInDiaria.push({ loja: r.loja, cod });
      continue;
    }
    // Check if placa matches any diaria entry for that cod
    const kPlaca = normPlaca(r.placa1);
    const matchPlaca = diariaEntries.find(d => normPlaca(d.placa) === kPlaca);
    if (!matchPlaca && kPlaca && kPlaca !== 'SEMPEDIDO') {
      const placasInDiaria = diariaEntries.map(d => d.placa).join(', ');
      placaMismatches.push({ loja: r.loja, cod, kpiPlaca: r.placa1, diariaPlacas: placasInDiaria, kpiMot: r.mot1 });
    }
  }

  if (codsNotInDiaria.length > 0) {
    console.log('\n  [COD DE MOTORISTA NAO ENCONTRADO NA ESCALA DIARIA] (' + codsNotInDiaria.length + ' lojas):');
    codsNotInDiaria.forEach(r => console.log('    - Loja "' + r.loja + '" COD=' + r.cod));
  }
  if (placaMismatches.length > 0) {
    console.log('\n  [PLACA NO KPI NAO BATE COM ESCALA DIARIA] (' + placaMismatches.length + ' lojas):');
    placaMismatches.forEach(r => console.log('    - ' + r.loja + ' | Motorista=' + r.kpiMot + ' COD=' + r.cod + ' | KPI_Placa=' + r.kpiPlaca + ' | Diaria_Placas=[' + r.diariaPlacas + ']'));
  }
  if (!codsNotInDiaria.length && !placaMismatches.length) {
    console.log('  Motoristas/Placas: todos os CODs encontrados na escala diaria, placas conferem');
  }

  // Motoristas na escala diaria mas nenhum KPI correspondente
  const allKpiCods = new Set(kpi.map(r => r.cod1.trim()));
  const diariaCodsMissing = Object.keys(diariaMap).filter(c => !allKpiCods.has(c));
  if (diariaCodsMissing.length > 0) {
    console.log('\n  [MOTORISTAS DA ESCALA DIARIA NAO APARECEM NO KPI] (CODs ' + diariaCodsMissing.join(', ') + ')');
    diariaCodsMissing.forEach(c => {
      const mots = diariaMap[c].map(d => d.mot + '/' + d.placa).join(', ');
      console.log('    COD ' + c + ': ' + mots);
    });
  }
}

async function readAndCheckDesconhecido(file) {
  console.log('\n' + '='.repeat(70));
  console.log('KPI-DESCONHECIDO');
  console.log('='.repeat(70));
  const rows = await readKPI(file, '15');
  console.log('Total de lojas: ' + rows.length);
  rows.forEach(r => {
    console.log('  Loja: "' + r.loja + '" | Mot1: ' + r.mot1 + ' | Placa1: ' + r.placa1);
  });
}

async function checkAllDuplicates() {
  console.log('\n' + '='.repeat(70));
  console.log('VERIFICACAO DE DUPLICATAS EM TODOS OS KPIs');
  console.log('='.repeat(70));
  const KPI_DIR = 'C:/Users/media/Downloads/KPIS GERADAS/';
  const files = [
    ['KPI-ASSAI-2026-05-15.xlsx', 'ASSAI'],
    ['KPI-ATACADAO-2026-05-15.xlsx', 'ATACADAO'],
    ['KPI-CARREFOUR-2026-05-15.xlsx', 'CARREFOUR'],
    ['KPI-GUANABARA-2026-05-15.xlsx', 'GUANABARA'],
    ['KPI-PREZUNIC-2026-05-15.xlsx', 'PREZUNIC'],
    ['KPI-SENDAS-2026-05-15.xlsx', 'SENDAS'],
    ['KPI-PRINCESA-2026-05-15.xlsx', 'PRINCESA'],
    ['KPI-SAMS_CLUB-2026-05-15.xlsx', 'SAMS'],
    ['KPI-VIANENSE-2026-05-15.xlsx', 'VIANENSE'],
    ['KPI-SUPER_PAX-2026-05-15.xlsx', 'SUPER_PAX'],
    ['KPI-SUPERPRIX-2026-05-15.xlsx', 'SUPERPRIX'],
    ['KPI-FEIRA_NOVA-2026-05-15.xlsx', 'FEIRA_NOVA'],
    ['KPI-EMANUEL-2026-05-15.xlsx', 'EMANUEL'],
    ['KPI-ARMAZEM_GRAO-2026-05-15.xlsx', 'ARMAZEM_GRAO'],
    ['KPI-ZONA_SUL-2026-05-15 (3).xlsx', 'ZONA_SUL'],
    ['KPI-CAB_PETROPOLIS-2026-05-15.xlsx', 'CAB_PETROPOLIS'],
    ['KPI-DESCONHECIDO-2026-05-15.xlsx', 'DESCONHECIDO'],
  ];
  for (const [fname, label] of files) {
    try {
      const rows = await readKPI(KPI_DIR + fname, '15');
      const seen = {};
      const dups = [];
      for (const r of rows) {
        const k = norm(r.loja);
        if (seen[k]) dups.push(r.loja);
        else seen[k] = true;
      }
      if (dups.length > 0) {
        console.log('  ' + label + ': DUPLICATAS: ' + dups.join(', '));
      } else {
        console.log('  ' + label + ': OK (' + rows.length + ' lojas, sem duplicatas)');
      }
    } catch(e) {
      console.log('  ' + label + ': ERRO ao ler - ' + e.message);
    }
  }
}

async function checkStructuralIssues() {
  console.log('\n' + '='.repeat(70));
  console.log('PROBLEMAS ESTRUTURAIS');
  console.log('='.repeat(70));
  const KPI_DIR = 'C:/Users/media/Downloads/KPIS GERADAS/';
  const files = [
    ['KPI-ASSAI-2026-05-15.xlsx', 'ASSAI'],
    ['KPI-ATACADAO-2026-05-15.xlsx', 'ATACADAO'],
    ['KPI-CARREFOUR-2026-05-15.xlsx', 'CARREFOUR'],
    ['KPI-GUANABARA-2026-05-15.xlsx', 'GUANABARA'],
    ['KPI-PREZUNIC-2026-05-15.xlsx', 'PREZUNIC'],
    ['KPI-SENDAS-2026-05-15.xlsx', 'SENDAS'],
    ['KPI-PRINCESA-2026-05-15.xlsx', 'PRINCESA'],
    ['KPI-SAMS_CLUB-2026-05-15.xlsx', 'SAMS'],
    ['KPI-VIANENSE-2026-05-15.xlsx', 'VIANENSE'],
    ['KPI-SUPER_PAX-2026-05-15.xlsx', 'SUPER_PAX'],
    ['KPI-SUPERPRIX-2026-05-15.xlsx', 'SUPERPRIX'],
    ['KPI-FEIRA_NOVA-2026-05-15.xlsx', 'FEIRA_NOVA'],
    ['KPI-EMANUEL-2026-05-15.xlsx', 'EMANUEL'],
    ['KPI-ARMAZEM_GRAO-2026-05-15.xlsx', 'ARMAZEM_GRAO'],
    ['KPI-ZONA_SUL-2026-05-15 (3).xlsx', 'ZONA_SUL'],
    ['KPI-CAB_PETROPOLIS-2026-05-15.xlsx', 'CAB_PETROPOLIS'],
    ['KPI-DESCONHECIDO-2026-05-15.xlsx', 'DESCONHECIDO'],
  ];
  for (const [fname, label] of files) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(KPI_DIR + fname);
      const ws = wb.getWorksheet('15');
      if (!ws) { console.log('  ' + label + ': FALTA ABA "15"'); continue; }

      let semMotorista = 0, semPlaca = 0, totalLojas = 0;
      ws.eachRow((row, rowNum) => {
        if (rowNum < 5) return;
        const loja = getCellStr(row.getCell(1));
        if (!loja) return;
        totalLojas++;
        const mot1 = getCellStr(row.getCell(2));
        const placa1 = getCellStr(row.getCell(4));
        if (!mot1 || mot1 === '') semMotorista++;
        if (!placa1 || placa1 === '') semPlaca++;
      });

      const issues = [];
      if (semMotorista > 0) issues.push(semMotorista + ' lojas sem motorista1');
      if (semPlaca > 0) issues.push(semPlaca + ' lojas sem placa1');

      if (issues.length > 0) {
        console.log('  ' + label + ' (' + totalLojas + ' lojas): ' + issues.join('; '));
      } else {
        console.log('  ' + label + ': OK (' + totalLojas + ' lojas, todos campos preenchidos)');
      }
    } catch(e) {
      console.log('  ' + label + ': ERRO - ' + e.message);
    }
  }
}

(async () => {
  const ESCALA_GERAL = 'C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA GERAL DE MAIO 1 (2).xlsx';
  const ESCALA_ZONA_SUL = 'C:/Users/media/Downloads/ESCALAS DIA 15 E RELATORIO (USADAS NO TESTE DAS KPIS GERADAS/ESCALA ZONA SUL - MAIO (4).xlsx';
  const KPI_DIR = 'C:/Users/media/Downloads/KPIS GERADAS/';

  // 1. ASSAI
  const escalaAssai = await readEscalaGeralNet(ESCALA_GERAL, '15', ['ASSAI', 'ASSAI']);
  const kpiAssai = await readKPI(KPI_DIR + 'KPI-ASSAI-2026-05-15.xlsx', '15');
  compareNets(kpiAssai, escalaAssai, 'ASSAI');

  // 2. ATACADAO
  const escalaAtacadao = await readEscalaGeralNet(ESCALA_GERAL, '15', ['ATACADAO', 'ATACAD']);
  const kpiAtacadao = await readKPI(KPI_DIR + 'KPI-ATACADAO-2026-05-15.xlsx', '15');
  compareNets(kpiAtacadao, escalaAtacadao, 'ATACADAO');

  // 3. CARREFOUR
  const escalaCarrefour = await readEscalaGeralNet(ESCALA_GERAL, '15', ['CARREFOUR']);
  const kpiCarrefour = await readKPI(KPI_DIR + 'KPI-CARREFOUR-2026-05-15.xlsx', '15');
  compareNets(kpiCarrefour, escalaCarrefour, 'CARREFOUR');

  // 4. ZONA SUL
  await readZonaSulKPIvsEscala(KPI_DIR + 'KPI-ZONA_SUL-2026-05-15 (3).xlsx', ESCALA_ZONA_SUL);

  // 5. DESCONHECIDO
  await readAndCheckDesconhecido(KPI_DIR + 'KPI-DESCONHECIDO-2026-05-15.xlsx');

  // 6. All duplicates
  await checkAllDuplicates();

  // 7. Structural issues
  await checkStructuralIssues();

})().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); });
