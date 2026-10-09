#!/bin/bash
# Auditoria diaria (09/10): roda scripts/auditar-dia.ts no dia anterior (BRT) e manda
# WhatsApp pro dono SO' se algo fugir do normal. Medido em 07/10 (dia fechado):
# 10 horarios divergentes, 1 falso negativo suspeito, 4 sem GPS, ~0 falso positivo.
#   scripts/auditoria-diaria.sh [AAAA-MM-DD]      DRY=1 so' imprime
cd /srv/kpi-transmonseg || exit 1
DIA=${1:-$(TZ=America/Sao_Paulo date -d yesterday +%F)}
SAIDA=$(nice -n 10 npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts "$DIA" 2>&1 | grep -E '^ *[0-9]+ [A-Z_]+$|^NFs com') 
echo "[auditoria $DIA]"; echo "$SAIDA"
TEXTO=$(DIA="$DIA" SAIDA="$SAIDA" python3 - <<'PY'
import os,re
d={}
for l in os.environ["SAIDA"].splitlines():
    m=re.match(r"\s*(\d+)\s+([A-Z_]+)\s*$",l)
    if m: d[m.group(2)]=int(m.group(1))
fn=d.get("SUSPEITA_FALSO_NEGATIVO",0); fp=d.get("SUSPEITA_FALSO_POSITIVO",0); hd=d.get("HORARIO_DIVERGE",0); sg=d.get("SEM_GPS",0)
tot=sum(d.values())
motivos=[]
if tot==0: motivos.append("a auditoria nao leu nenhuma nota")
if fn>=10: motivos.append(f"{fn} notas NAO entregues mas o GPS parou no cliente")
if fp>=15: motivos.append(f"{fp} notas entregues sem o caminhao chegar perto")
if hd>=40: motivos.append(f"{hd} notas com horario muito diferente do GPS")
if sg>=40: motivos.append(f"{sg} notas sem GPS")
if motivos:
    print(f"Auditoria do KPI de {os.environ['DIA']}: " + "; ".join(motivos) + f". (Total {tot} notas.) Detalhe: ssh no servidor, scripts/auditar-dia.ts {os.environ['DIA']}.")
PY
)
if [ -n "$TEXTO" ]; then
  echo "ALERTA: $TEXTO"
  [ -n "$DRY" ] || node /srv/transmonseg/definitivo/scripts/alertar-dm.mjs "auditoria-$DIA" "$TEXTO"
else
  echo "dentro do normal"
fi
