const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const escalasDir = 'C:\Users\media\OneDrive\Desktop\EMPRESA TRIFORCE AUTO\clientes\tia-erica\CONVERSAS COM ERICA\escalas';
const files = [
  'ESCALA COZINHA 14.05.xlsx',
  'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx',
  'ESCALA GERAL DE MAIO 1.xlsx',
  'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx',
  'ESCALA ZONA SUL - MAIO.xlsx'
];

function cellValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null) {
    if (v instanceof Date) return v.toISOString();
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}

async function inspect(file) {
  const wb = new ExcelJS.Workbook();
  const fullPath = path.join(escalasDir, file);
  
  try {
    await wb.xlsx.readFile(fullPath);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`FILE: ${file}`);
    console.log(`Sheets: ${wb.worksheets.map(w => w.name).join(' | ')}`);
    
    const ws = wb.worksheets[0];
    console.log(`\nFirst sheet: "${ws.name}" (rows: ${ws.rowCount})`);
    
    for (let i = 1; i <= Math.min(6, ws.rowCount); i++) {
      const row = ws.getRow(i);
      const cells = [];
      for (let j = 1; j <= 20; j++) {
        const val = cellValue(row.getCell(j));
        const str = (val === null ? '[∅]' : String(val).substring(0, 25));
        cells.push(str);
      }
      console.log(`R${i}: ${cells.map((c, i) => `${i+1}="${c}"`).join(' | ')}`);
    }
  } catch (err) {
    console.error(`ERROR ${file}: ${err.message}`);
  }
}

(async () => {
  for (const file of files) {
    await inspect(file);
  }
})();
