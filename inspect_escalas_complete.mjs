import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const escalaDir = 'C:\Users\media\Downloads';
const files = [
  'ESCALA COZINHA 14.05.xlsx',
  'ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx',
  'ESCALA GERAL DE MAIO 1.xlsx',
  'ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx',
  'ESCALA ZONA SUL - MAIO.xlsx'
];

async function inspectFile(filename) {
  const filepath = path.join(escalaDir, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`FILE NOT FOUND: ${filepath}\n`);
    return;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`FILE: ${filename}`);
  console.log(`${'='.repeat(80)}`);

  try {
    const wb = new ExcelJS.Workbook();
    const buf = fs.readFileSync(filepath);
    await wb.xlsx.load(buf);

    console.log(`Total sheets: ${wb.worksheets.length}`);
    console.log(`Sheet names: ${wb.worksheets.map(s => `"${s.name}"`).join(', ')}\n`);

    for (const ws of wb.worksheets) {
      console.log(`\nSheet: "${ws.name}"`);
      console.log(`Rows: ${ws.actualRowCount}, Cols: ${ws.actualColumnCount}`);
      console.log('-'.repeat(80));

      // Read first 8 rows
      for (let rowNum = 1; rowNum <= Math.min(8, ws.actualRowCount); rowNum++) {
        const row = ws.getRow(rowNum);
        const cells = [];
        for (let colNum = 1; colNum <= Math.min(12, ws.actualColumnCount); colNum++) {
          const cell = row.getCell(colNum);
          let val = cell.value;
          
          // Handle different value types
          if (val === null || val === undefined) {
            cells.push(null);
          } else if (val instanceof Date) {
            cells.push(`DATE[${val.toISOString().split('T')[0]}]`);
          } else if (typeof val === 'object') {
            if ('richText' in val) {
              cells.push(val.richText.map(r => r.text).join(''));
            } else if ('text' in val) {
              cells.push(val.text);
            } else if ('result' in val) {
              cells.push(`FORMULA[${val.result}]`);
            } else {
              cells.push(JSON.stringify(val).substring(0, 50));
            }
          } else {
            cells.push(String(val).substring(0, 50));
          }
        }
        console.log(`Row ${rowNum}: [${cells.map((c, i) => `${i+1}:${c === null ? 'NULL' : c}`).join(' | ')}]`);
      }
    }
  } catch (err) {
    console.error(`ERROR reading ${filename}: ${err.message}`);
  }
}

for (const file of files) {
  await inspectFile(file);
}

console.log(`\n${'='.repeat(80)}`);
console.log('INSPECTION COMPLETE');
