#!/usr/bin/env bash
# Deploy KPI Transmonseg com trava de regressão Python
# Uso: ./deploy.sh [--skip-tests] [--skip-build]
set -euo pipefail

SKIP_TESTS=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

echo "=== KPI Transmonseg Deploy ==="
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"

# 1. Git pull
echo ""
echo "[1/5] Atualizando código..."
git pull origin main

# 2. Instalar dependências (se necessário)
echo ""
echo "[2/5] Verificando dependências..."
npm install --production=false

# 3. Trava Python (regressão contra gabaritos reais)
if [ "$SKIP_TESTS" = false ]; then
  echo ""
  echo "[3/5] Rodando trava de regressão Python..."

  # Verificar se openpyxl está disponível
  if ! python3 -c "import openpyxl" 2>/dev/null; then
    echo "ERRO: openpyxl não instalado. Rode: pip3 install openpyxl"
    exit 1
  fi

  # A trava exige 3 xlsx posicionais (outputs do KPI, não escalas estáticas).
  # Uso manual: python3 scripts/verificar-kpi-gabaritos.py d22.xlsx d23.xlsx d24.xlsx \
  #   --casos scripts/gabaritos/casos-rotulados.csv \
  #   --excecoes scripts/gabaritos/excecoes-conhecidas.csv
  GABARITOS_DIR="${KPI_GABARITOS_DIR:-scripts/gabaritos}"
  XLSX_FILES=($(ls -t "$GABARITOS_DIR"/*.xlsx 2>/dev/null | head -3))

  if [ ${#XLSX_FILES[@]} -ge 3 ]; then
    echo "Usando arquivos: ${XLSX_FILES[*]}"
    if ! python3 scripts/verificar-kpi-gabaritos.py "${XLSX_FILES[@]}" \
        --casos scripts/gabaritos/casos-rotulados.csv \
        --excecoes scripts/gabaritos/excecoes-conhecidas.csv; then
      echo ""
      echo "❌ TRAVA FALHOU: regressão detectada nos gabaritos."
      echo "Corrija antes de fazer deploy ou use --skip-tests para forçar."
      exit 1
    fi
    echo "✅ Trava passou."
  else
    echo "⚠️  Menos de 3 xlsx em $GABARITOS_DIR/ (${#XLSX_FILES[@]} encontrados) — pulando trava."
    echo "   Para ativar: coloque 3+ xlsx de output do KPI nesse diretório ou"
    echo "   export KPI_GABARITOS_DIR=/caminho/para/xlsx antes de rodar."
  fi
else
  echo ""
  echo "[3/5] Trava pulada (--skip-tests)"
fi

# 4. Build
if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "[4/5] Building Next.js..."
  npm run build
else
  echo ""
  echo "[4/5] Build pulado (--skip-build)"
fi

# 5. Restart PM2
echo ""
echo "[5/5] Reiniciando serviço..."
pm2 restart kpi-transmonseg

echo ""
echo "✅ Deploy concluído com sucesso!"
pm2 list | grep kpi-transmonseg