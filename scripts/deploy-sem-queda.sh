#!/usr/bin/env bash
# Deploy sem queda (achado 04/10: `npm run build` dentro do app em uso deixava
# o site sem CSS / com 500 no /login durante os minutos do build). Compila numa
# copia separada e so' troca o .next depois do build OK; se o site nao responder
# 200 depois do restart, volta o .next anterior.
set -euo pipefail
APP=/srv/kpi-transmonseg
B=/srv/kpi-build
LOG=/tmp/kpi-build.log
cd "$APP"
git pull -q --ff-only
rm -rf "$B" && mkdir -p "$B"
git archive HEAD | tar -x -C "$B"
cp "$APP"/.env* "$B"/ 2>/dev/null || true
ln -s "$APP/node_modules" "$B/node_modules"
cd "$B"
if ! npm run build > "$LOG" 2>&1; then echo "BUILD FALHOU -- producao intacta (ver $LOG)"; exit 1; fi
sed -i "s#$B#$APP#g" .next/required-server-files.json .next/required-server-files.js 2>/dev/null || true
rm -rf "$APP/.next-anterior"
mv "$APP/.next" "$APP/.next-anterior"
mv "$B/.next" "$APP/.next"
pm2 restart kpi-transmonseg > /dev/null
for i in $(seq 1 30); do
  c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/login || true)
  [ "$c" = 200 ] && { echo "DEPLOY OK $(git -C "$APP" log --oneline -1)"; rm -rf "$B"; exit 0; }
  sleep 2
done
echo "SITE NAO RESPONDEU -- voltando o .next anterior"
rm -rf "$APP/.next" && mv "$APP/.next-anterior" "$APP/.next" && pm2 restart kpi-transmonseg > /dev/null
exit 1
