import ExcelJS from 'exceljs';
import fs from 'fs';

const files = [
    ['C:\Users\media\Downloads\ESCALA COZINHA 14.05.xlsx', 'COZINHA'],
    ['C:\Users\media\Downloads\ESCALA DO ARMAZÉM DO GRÃO MAIO.xlsx', 'ARMAZÉM'],
    ['C:\Users\media\Downloads\ESCALA GERAL DE MAIO 1.xlsx', 'GERAL'],
    ['C:\Users\media\Downloads\ESCALA PAX, FEIRA NOVA E REDE EMANUEL - MAIO.xlsx', 'PAX'],
    ['C:\Users\media\Downloads\ESCALA ZONA SUL - MAIO.xlsx', 'ZONA_SUL']
];

async function inspectFile(filepath, label) {
  if (!fs.existsSync(filepath)) {
    console.log(`\nNOT FOUND: ${label}\n`);
    return;
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}: ${filepath.split('\').pop()}`);
  console.log(`${'='.repeat(80)}`);

  try {
    const wb = new ExcelJS.Workbook();
    const buf = fs.readFileSync(filepath);
    await wb.xlsx.load(buf);

    console.log(`Sheets: ${wb.worksheets.map(s => `"${s.name}"`).join(', ')}`);

    for (const ws of wb.worksheets) {
      console.log(`\nSheet "${ws.name}" (${ws.actualRowCount} rows, ${ws.actualColumnCount} cols):`);
      
      for (let r = 1; r <= Math.min(5, ws.actualRowCount); r++) {
        const row = ws.getRow(r);
        const cells = [];
        for (let c = 1; c <= 10; c++) {
          const cell = row.getCell(c);
          let val = cell.value;
          
          if (val === null || val === undefined) {
            cells.push('');
          } else if (val instanceof Date) {
            cells.push(val.toISOString().split('T')[0]);
          } else if (typeof val === 'object') {
            if ('richText' in val) {
              cells.push(val.richText.map(r => r.text).join(''));
            } else if ('text' in val) {
              cells.push(val.text);
            } else if ('result' in val) {
              cells.push(`[${val.result}]`);
            } else {
              cells.push('OBJ');
            }
          } else {
            cells.push(String(val).substring(0, 40));
          }
        }
        console.log(`  R${r}: ${cells.map((c, i) => `${i+1}:${c}`).join(' | ')}`);
      }
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
}

for (const [fp, label] of files) {
  await inspectFile(fp, label);
}
