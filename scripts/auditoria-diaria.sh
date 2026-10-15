#!/bin/bash
# Auditoria diaria (09/10): roda scripts/auditar-dia.ts no dia anterior (BRT) e manda
# WhatsApp pro dono SO' se algo fugir do normal. Medido em 07/10 (dia fechado):
# 10 horarios divergentes, 1 falso negativo suspeito, 4 sem GPS, ~0 falso positivo.
#   scripts/auditoria-diaria.sh [AAAA-MM-DD]      DRY=1 so' imprime
cd /srv/kpi-transmonseg || exit 1
DIA=${1:-$(TZ=America/Sao_Paulo date -d yesterday +%F)}
[[ "$DIA" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "data invalida: $DIA"; exit 1; }
SAIDA=$(nice -n 10 npx tsx --env-file=.env.production --tsconfig tsconfig.json scripts/auditar-dia.ts "$DIA" 2>&1 | grep -E '^ *[0-9]+ [A-Z_]+$|^NFs com') 
echo "[auditoria $DIA]"; echo "$SAIDA"
# 10/10: dia sem romaneio carregado no monitoramento = motor de desvio cego (aconteceu
# em 09/10 e 10/10). Conta romaneio_pontos real (modo_teste=false, origem romaneio)
# SO' DA NUTRY (15/10, KP-04: somada com a Rio Quality nunca dava zero).
# Fail-open: se a consulta falhar, ROM_N fica vazio e o aviso e' so' pulado.
# ROM_N=<n> no ambiente pula a consulta (teste em DRY).
if [ -z "${ROM_N+x}" ]; then
  ROM_N=$(sudo -n -u postgres psql -d transmonseg -tAc "SELECT count(*) FROM romaneio_pontos r JOIN veiculos v ON v.id = r.veiculo_id JOIN clientes c ON c.id = v.cliente_id WHERE r.romaneio_data = '$DIA' AND r.modo_teste = false AND r.origem = 'romaneio' AND c.cod_user_unitrac = '4096'" 2>/dev/null | tr -d '[:space:]')
fi
case "$ROM_N" in ''|*[!0-9]*) ROM_N="";; esac
echo "romaneio no monitoramento: ${ROM_N:-?}"
# 15/10 (DR-05): linhas do romaneio sem veiculo no cadastro ficam invisiveis ao
# motor (sem desvio, sem parada). Lista as placas pra alguem cadastrar/corrigir.
# ORF=<n>|<placas> no ambiente pula a consulta (teste em DRY). Fail-open.
if [ -z "${ORF+x}" ]; then
  ORF=$(sudo -n -u postgres psql -d transmonseg -tAc "SELECT count(*) || '|' || coalesce(string_agg(DISTINCT placa, ','), '') FROM romaneio_pontos WHERE romaneio_data = '$DIA' AND modo_teste = false AND origem = 'romaneio' AND veiculo_id IS NULL" 2>/dev/null | tr -d '[:space:]')
fi
case "$ORF" in [0-9]*\|*) ;; *) ORF="";; esac
echo "romaneio sem veiculo no cadastro: ${ORF:-?}"
TEXTO=$(DIA="$DIA" SAIDA="$SAIDA" ROM_N="$ROM_N" ORF="$ORF" python3 - <<'PY'
import os,re
d={}
for l in os.environ["SAIDA"].splitlines():
    m=re.match(r"\s*(\d+)\s+([A-Z_]+)\s*$",l)
    if m: d[m.group(2)]=int(m.group(1))
fn=d.get("SUSPEITA_FALSO_NEGATIVO",0); fp=d.get("SUSPEITA_FALSO_POSITIVO",0); hd=d.get("HORARIO_DIVERGE",0); sg=d.get("SEM_GPS",0)
tot=sum(d.values())
motivos=[]
if os.environ.get("ROM_N")=="0": motivos.append("o monitoramento ficou SEM romaneio nesse dia (o motor de desvio ficou cego)")
orf=os.environ.get("ORF","")
if "|" in orf:
    n,placas=orf.split("|",1)
    # >=20 linhas: placas sem cadastro da Rio Quality aparecem quase todo dia e nao viram alerta diario
    if n.isdigit() and int(n)>=20:
        motivos.append(f"{n} linhas do romaneio estao sem veiculo no cadastro (placas: {placas}) -- o motor de desvio nao enxerga essas rotas")
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
