// Validação ponta-a-ponta FASE 1 - verifica os 6 fixes implementados
// Execução: npx tsx scripts/validate-fase1.mjs

import { parseEscalaZonaSul, normalizaFilialCod } from '../src/lib/parsers/escala-zona-sul.ts';
import { parseUnitracPdf } from '../src/lib/parsers/unitrac-pdf.ts';
import { parseEscalaGeral } from '../src/lib/parsers/escala-geral.ts';
import fs from 'fs';

const ZONA_SUL_PATH = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/ESCALA ZONA SUL - MAIO (7).xlsx';
const UNITRAC_PDF_PATH = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/relatorio_9553.pdf';
const GERAL_PATH = 'C:/Users/media/OneDrive/Desktop/EMPRESA TRIFORCE AUTO/clientes/tia-erica/CONVERSAS COM ERICA/ESCALA DIA 20/ESCALA GERAL DE MAIO 1 (7).xlsx';

const PLACAS_CONHECIDAS = new Set(['LCO0978', 'LQE5401', 'LJS2172', 'EFU5704']);

const resultado = {
  zonasul_mega_box_count: 0,
  zonasul_zona_sul_count: 0,
  zonasul_normalizacao_funciona: false,
  unitrac_ocr_lco_corrigida: false,
  unitrac_ocr_lqe_corrigida: false,
  unitrac_ocr_ljs_corrigida: false,
  unitrac_ocr_efu_corrigida: false,
  geral_cabecalhos_eliminados: false,
  veredicto: 'REJEITADO',
  issues: [],
};

// ─── PARTE A: Escala Zona Sul ─────────────────────────────────────────────────
console.log('\n=== ZONA SUL ===');
try {
  if (!fs.existsSync(ZONA_SUL_PATH)) throw new Error('Arquivo não encontrado: ' + ZONA_SUL_PATH);
  const buf = fs.readFileSync(ZONA_SUL_PATH);
  const linhas = await parseEscalaZonaSul(buf, '2026-05-20');

  const megaBoxLinhas = linhas.filter(l => l.sub_rede === 'MEGA_BOX');
  const zonaSulLinhas = linhas.filter(l => l.sub_rede === null);

  resultado.zonasul_mega_box_count = megaBoxLinhas.length;
  resultado.zonasul_zona_sul_count = zonaSulLinhas.length;

  console.log(`Total linhas dia 20: ${linhas.length}`);
  console.log(`sub_rede=MEGA_BOX: ${megaBoxLinhas.length} (esperado: 5)`);
  console.log(`sub_rede=null: ${zonaSulLinhas.length} (esperado: 47)`);

  // Verifica normalizacao: "MEGA BOX 01 - Olaria" e "MEGA BOX 1 - Olaria" -> mesmo loja_codigo_raw
  const cod01 = normalizaFilialCod('MEGA BOX 01 - Olaria');
  const cod1  = normalizaFilialCod('MEGA BOX 1 - Olaria');
  resultado.zonasul_normalizacao_funciona = (cod01 === cod1);
  console.log(`normalizaFilialCod('MEGA BOX 01 - Olaria') = '${cod01}'`);
  console.log(`normalizaFilialCod('MEGA BOX 1 - Olaria')  = '${cod1}'`);
  console.log(`Normalizacao funciona: ${resultado.zonasul_normalizacao_funciona}`);

  if (megaBoxLinhas.length !== 5) {
    resultado.issues.push(`MEGA_BOX count: esperado 5, obtido ${megaBoxLinhas.length}`);
  }
  if (zonaSulLinhas.length !== 47) {
    resultado.issues.push(`sub_rede=null count: esperado 47, obtido ${zonaSulLinhas.length}`);
  }
  if (!resultado.zonasul_normalizacao_funciona) {
    resultado.issues.push(`Normalizacao MEGA BOX falhou: '${cod01}' != '${cod1}'`);
  }
} catch (err) {
  resultado.issues.push(`ZONA_SUL ERROR: ${err.message}`);
  console.error('ERRO Zona Sul:', err.message);
}

// ─── PARTE B: Unitrac PDF (OCR) ────────────────────────────────────────────────
console.log('\n=== UNITRAC PDF (OCR) ===');
try {
  if (!fs.existsSync(UNITRAC_PDF_PATH)) throw new Error('PDF não encontrado: ' + UNITRAC_PDF_PATH);
  const buf = fs.readFileSync(UNITRAC_PDF_PATH);
  const resumos = await parseUnitracPdf(buf, PLACAS_CONHECIDAS);

  const placasEncontradas = new Set(resumos.map(r => r.placa_norm));
  console.log(`Total veiculos parseados: ${resumos.length}`);
  console.log(`Placas encontradas (norm): ${[...placasEncontradas].join(', ')}`);

  resultado.unitrac_ocr_lco_corrigida = placasEncontradas.has('LCO0978');
  resultado.unitrac_ocr_lqe_corrigida = placasEncontradas.has('LQE5401');
  resultado.unitrac_ocr_ljs_corrigida = placasEncontradas.has('LJS2172');
  resultado.unitrac_ocr_efu_corrigida = placasEncontradas.has('EFU5704');

  console.log(`LCO0978 corrigida: ${resultado.unitrac_ocr_lco_corrigida}`);
  console.log(`LQE5401 corrigida: ${resultado.unitrac_ocr_lqe_corrigida}`);
  console.log(`LJS2172 corrigida: ${resultado.unitrac_ocr_ljs_corrigida}`);
  console.log(`EFU5704 corrigida: ${resultado.unitrac_ocr_efu_corrigida}`);

  // Verifica que as formas OCR erradas nao aparecem
  const ocrErradas = { 'LCO0J78': 'LCO0978', 'LQE5E01': 'LQE5401', 'LJS2B72': 'LJS2172', 'EFU5H04': 'EFU5704' };
  for (const [errada, correta] of Object.entries(ocrErradas)) {
    if (placasEncontradas.has(errada)) {
      resultado.issues.push(`OCR: placa errada '${errada}' ainda aparece (deveria ser '${correta}')`);
    }
  }

  for (const [placa, ok] of [
    ['LCO0978', resultado.unitrac_ocr_lco_corrigida],
    ['LQE5401', resultado.unitrac_ocr_lqe_corrigida],
    ['LJS2172', resultado.unitrac_ocr_ljs_corrigida],
    ['EFU5704', resultado.unitrac_ocr_efu_corrigida],
  ]) {
    if (!ok) resultado.issues.push(`OCR: placa '${placa}' nao encontrada apos correcao`);
  }
} catch (err) {
  resultado.issues.push(`UNITRAC_PDF ERROR: ${err.message}`);
  console.error('ERRO Unitrac PDF:', err.message);
}

// ─── PARTE C: Escala Geral (cabecalhos eliminados) ────────────────────────────
console.log('\n=== ESCALA GERAL (dia 18) ===');
try {
  if (!fs.existsSync(GERAL_PATH)) throw new Error('XLSX não encontrado: ' + GERAL_PATH);
  const buf = fs.readFileSync(GERAL_PATH);
  const linhas = await parseEscalaGeral(buf, '2026-05-18');

  const TOKENS_CABECALHO = new Set(['PLACAS', 'PLACA', 'FORNECEDOR', 'FORNECEDORES']);
  const linhaCabecalho = linhas.filter(l => {
    const placaUp = (l.placa_norm || l.placa_raw || '').toUpperCase().trim();
    return TOKENS_CABECALHO.has(placaUp);
  });

  resultado.geral_cabecalhos_eliminados = linhaCabecalho.length === 0;
  console.log(`Total linhas dia 18: ${linhas.length}`);
  console.log(`Linhas com placa em {PLACAS,FORNECEDOR,...}: ${linhaCabecalho.length} (esperado: 0)`);
  console.log(`Cabecalhos eliminados: ${resultado.geral_cabecalhos_eliminados}`);

  if (linhaCabecalho.length > 0) {
    resultado.issues.push(`GERAL: ${linhaCabecalho.length} linhas-cabecalho vazaram como dado`);
    for (const l of linhaCabecalho.slice(0, 3)) {
      console.log(`  -> row ${l.raw_row_num}: placa_raw='${l.placa_raw}' loja='${l.loja_nome_raw}'`);
    }
  }
} catch (err) {
  resultado.issues.push(`ESCALA_GERAL ERROR: ${err.message}`);
  console.error('ERRO Escala Geral:', err.message);
}

// ─── VEREDICTO FINAL ──────────────────────────────────────────────────────────
const todosOk = (
  resultado.zonasul_mega_box_count === 5 &&
  resultado.zonasul_zona_sul_count === 47 &&
  resultado.zonasul_normalizacao_funciona &&
  resultado.unitrac_ocr_lco_corrigida &&
  resultado.unitrac_ocr_lqe_corrigida &&
  resultado.unitrac_ocr_ljs_corrigida &&
  resultado.unitrac_ocr_efu_corrigida &&
  resultado.geral_cabecalhos_eliminados &&
  resultado.issues.length === 0
);
resultado.veredicto = todosOk ? 'APROVADO' : 'REJEITADO';

console.log('\n=== RESULTADO FINAL ===');
console.log(JSON.stringify(resultado, null, 2));
