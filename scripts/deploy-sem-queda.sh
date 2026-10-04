#!/usr/bin/env bash
# Deploy sem queda (achado 04/10: `npm run build` direto em .next deixava o site
# sem CSS / com 500 no /login durante o build). Compila em .next-build
# (NEXT_DIST_DIR, ver next.config.ts) enquanto o servidor segue servindo .next;
# so' troca depois do build OK. Se o site nao responder 200 apos o restart,
# volta o .next anterior.
set -euo pipefail
APP=/srv/kpi-transmonseg
LOG=/tmp/kpi-build.log
cd "$APP"
git pull -q --ff-only
rm -rf .next-build
if ! NEXT_DIST_DIR=.next-build npm run build > "$LOG" 2>&1; then echo "BUILD FALHOU -- producao intacta (ver $LOG)"; rm -rf .next-build; exit 1; fi
rm -rf .next-anterior
mv .next .next-anterior
mv .next-build .next
pm2 restart kpi-transmonseg > /dev/null
for i in $(seq 1 30); do
  c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/login || true)
  [ "$c" = 200 ] && { echo "DEPLOY OK $(git log --oneline -1)"; exit 0; }
  sleep 2
done
echo "SITE NAO RESPONDEU -- voltando o .next anterior"
rm -rf .next && mv .next-anterior .next && pm2 restart kpi-transmonseg > /dev/null
exit 1
