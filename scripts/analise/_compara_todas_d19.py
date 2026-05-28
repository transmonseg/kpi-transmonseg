"""Comparar TODAS as 8 redes manual vs sistema dia 19."""
import sys, io, openpyxl, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REDES = [
    ('ASSAI', 'KPI ASSAI (1).xlsx', 'KPI-ASSAI-2026-05-19 (4).xlsx'),
    ('ATACADAO', 'KPI ATACADAO (1).xlsx', 'KPI-ATACADAO-2026-05-19 (5).xlsx'),
    ('CARREFOUR', 'KPI CARREFOUR (1).xlsx', 'KPI-CARREFOUR-2026-05-19 (4).xlsx'),
    ('GUANABARA', 'KPI GUANABARA (1).xlsx', 'KPI-GUANABARA-2026-05-19 (9).xlsx'),
    ('PREZUNIC', 'KPI PREZUNIC (3).xlsx', 'KPI-PREZUNIC-2026-05-19 (4).xlsx'),
    ('PRINCESA', 'KPI PRINCESA (8).xlsx', 'KPI-PRINCESA-2026-05-19 (11).xlsx'),
    ('SUPERPRIX', 'KPI SUPERPRIX (1).xlsx', 'KPI-SUPERPRIX-2026-05-19 (5).xlsx'),
    ('ZONA_SUL', 'KPI ZONA SUL.xlsx', 'KPI-ZONA_SUL-2026-05-19 (9).xlsx'),
    ('ARMAZEM_GRAO', 'KPI ARMAZEM DO GRAO.xlsx', 'KPI-ARMAZEM_GRAO-2026-05-19 (9).xlsx'),
]

def fmt(v):
    if hasattr(v, 'strftime'):
        return v.strftime('%H:%M')
    return str(v or '')[:8]

def hhmm_min(s):
    if not s or ':' not in str(s):
        return None
    try:
        h, m = s.split(':')
        return int(h) * 60 + int(m)
    except Exception:
        return None

def le(path, prefer):
    if not os.path.exists(path):
        return None
    wb = openpyxl.load_workbook(path, data_only=True)
    sheet = None
    for s in [prefer, '19', '19.05']:
        if s in wb.sheetnames:
            sheet = s
            break
    if sheet is None:
        sheet = wb.sheetnames[0]
    ws = wb[sheet]
    out = {}
    for r in range(5, ws.max_row + 1):
        loja = ws.cell(r, 1).value
        if not loja:
            continue
        out[str(loja).strip()] = {
            'mot1': str(ws.cell(r, 2).value or '').strip()[:18],
            'placa1': str(ws.cell(r, 4).value or '').replace('-', ''),
            'sd1': fmt(ws.cell(r, 5).value),
            'chd1': fmt(ws.cell(r, 6).value),
            'sl1': fmt(ws.cell(r, 7).value),
        }
    return out

TOL = 10
totais = {'ok': 0, 'medio': 0, 'grave': 0, 'sem_match': 0}

for rede, mname, sname in REDES:
    mpath = f'docs/conversas-tia-erica/dia-20/kpis-manuais/{mname}'
    spath = f'docs/conversas-tia-erica/dia-19/kpis-sistema-pos-fixes/{sname}'
    ma = le(mpath, '19')
    si = le(spath, '19.05')
    if not ma or not si:
        print(f'\n[{rede}] MISSING — manual={bool(ma)} sistema={bool(si)}')
        continue

    bugs_graves = []
    bugs_medios = []
    iguais = 0
    sem_match = 0

    for loja in set(list(ma.keys()) + list(si.keys())):
        me = ma.get(loja)
        se = si.get(loja)
        if not me or not se:
            sem_match += 1
            continue
        max_diff = 0
        worst_k = None
        for k in ['sd1', 'chd1', 'sl1']:
            m = hhmm_min(me[k])
            s = hhmm_min(se[k])
            if m is None or s is None:
                continue
            diff = abs(m - s)
            if diff > max_diff:
                max_diff = diff
                worst_k = k
        if max_diff > 60:
            bugs_graves.append((loja, worst_k, me[worst_k], se[worst_k], max_diff))
        elif max_diff > TOL:
            bugs_medios.append((loja, worst_k, me[worst_k], se[worst_k], max_diff))
        else:
            iguais += 1

    print(f'\n=== {rede} (manual={len(ma)} sistema={len(si)} lojas) ===')
    print(f'  OK (tol {TOL}min)            : {iguais}')
    print(f'  Diff medio ({TOL}-60min)    : {len(bugs_medios)}')
    print(f'  Diff GRAVE (>60min)        : {len(bugs_graves)}')
    print(f'  Sem match m vs s            : {sem_match}')
    if bugs_graves:
        print(f'\n  >>> GRAVES (>60min):')
        for loja, k, m, s, d in bugs_graves:
            print(f'    {loja[:45]:<45} {k}: M={m} S={s} (diff {d}min)')

    totais['ok'] += iguais
    totais['medio'] += len(bugs_medios)
    totais['grave'] += len(bugs_graves)
    totais['sem_match'] += sem_match

print(f"\n\n=== TOTAL ===")
print(f"OK: {totais['ok']} | Medio: {totais['medio']} | GRAVE: {totais['grave']} | Sem match: {totais['sem_match']}")
