#!/usr/bin/env python3
"""Analise (somente leitura) de geocode rural/rodovia/KM contra a parada real no horario do 'feito'.
Uso: python3 scripts/analise-geocode-rural.py <confirmacao-so-geocode.csv> [osm_milestones_rj.json]
Entradas: CSV gerado pela verificacao 'so geocode+GPS' de 22/09 e (opcional) marcos km do OSM (Overpass).
Nada e' gravado em producao."""
import csv, json, math, re, sys, collections, statistics as st

def f(x):
    try: return float(x)
    except: return None

def hav(a, b, c, d):
    R = 6371000; p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def tipo(e):
    u = e.upper()
    if re.search(r'\bKM\b|\bKM\s*\d', u) or re.search(r'\b(ROD|RODOVIA|RODOV|BR[- ]?\d{2,3}|RJ[- ]?\d{2,3}|ERJ|AMB)\b', u): return 'rodovia'
    if re.search(r'\b(ESTR|ESTRADA|EST|SITIO|FAZENDA|FAZ|RURAL|LINHA|ASSENTAMENTO|POVOADO|DISTRITO)\b', u): return 'estrada_rural'
    if re.search(r'S/?N\b|SEM NUMERO|\bSN\b', u): return 'sn'
    return 'urbano'

ALIAS = {'AMARAL PEIXOTO': 'RJ-106', 'PRES DUTRA': 'BR-116', 'PRESIDENTE DUTRA': 'BR-116', 'WASHINGTON LUIZ': 'BR-040',
         'RIO SANTOS': 'BR-101', 'RIO BAHIA': 'BR-116', 'SANTOS DUMONT': 'BR-116', 'LUCIO MEIRA': 'BR-393', 'RIO FRIBURGO': 'BR-116',
         'MARIO COVAS': 'BR-493'}

def via_km(e):
    u = e.upper()
    m = re.search(r'\b(BR|RJ|ERJ)[- ]?(\d{2,3})\b', u)
    ref = f"{m.group(1)}-{m.group(2)}" if m else None
    if not ref:
        for k, v in ALIAS.items():
            if k in u: ref = v; break
    k = re.search(r'\bKM\s*(\d+(?:[.,]\d+)?)', u)
    return ref, (float(k.group(1).replace(',', '.')) if k else None)

def resumo(nome, xs, ns=(500, 1000, 2000)):
    if not xs: print(f'  {nome}: n=0'); return
    print(f'  {nome}: n={len(xs)} mediana={round(st.median(xs))}m ' + ' '.join(f'<={n}m:{sum(v <= n for v in xs)}({100*sum(v <= n for v in xs)//len(xs)}%)' for n in ns))

rows = list(csv.DictReader(open(sys.argv[1])))
osm = json.load(open(sys.argv[2]))['elements'] if len(sys.argv) > 2 else []
E = []  # com parada real
for r in rows:
    real = (f(r['parada_no_horario_feito_lat']), f(r['parada_no_horario_feito_lng']))
    if None in real: continue
    nos = (f(r['nossa_lat']), f(r['nossa_lng'])); cad = (f(r['cadastro_lat']), f(r['cadastro_lng']))
    E.append(dict(end=r['endereco'], t=tipo(r['endereco']), real=real, nos=nos if None not in nos else None, cad=cad if None not in cad else None,
                  conf=r['geoConfiavel'], nf=r['nf']))
print('== 1) precisao vs parada real, por tipo (dedup por endereco+NF)')
for t in ('rodovia', 'estrada_rural', 'sn', 'urbano'):
    S = [e for e in E if e['t'] == t]
    print(t)
    resumo('nosso geocode', [hav(*e['nos'], *e['real']) for e in S if e['nos']])
    resumo('cadastro Unitrac', [hav(*e['cad'], *e['real']) for e in S if e['cad']])
    pol = []
    for e in S:
        if e['nos'] and e['cad'] and hav(*e['nos'], *e['cad']) > 500: p = e['cad']   # politica: cadastro quando diverge >500m do nosso
        else: p = e['nos'] or e['cad']
        if p: pol.append(hav(*p, *e['real']))
    resumo('politica cadastro-se-diverge', pol)

print('\n== 2) raio maior so ajuda quando o erro e pequeno (nosso geocode)')
for t in ('rodovia', 'estrada_rural', 'sn'):
    d = [hav(*e['nos'], *e['real']) for e in E if e['t'] == t and e['nos']]
    print(f'  {t}: ' + ' '.join(f'R={R}: {sum(v <= R for v in d)}/{len(d)}' for R in (500, 800, 1000, 1500, 2000)))

print('\n== 3) interpolacao por km entre ancoras de cadastro da mesma via (leave-one-out)')
anc = collections.defaultdict(dict)
for e in E:
    if e['t'] != 'rodovia' or not e['cad']: continue
    ref, km = via_km(e['end'])
    if ref and km is not None: anc[ref][(km, e['end'])] = e['cad']
erri, errn = [], []
for e in E:
    if e['t'] != 'rodovia' or not e['nos']: continue
    ref, km = via_km(e['end'])
    if not ref or km is None: continue
    outros = sorted((k, c) for (k, en), c in anc[ref].items() if en != e['end'])
    lo = [x for x in outros if x[0] <= km]; hi = [x for x in outros if x[0] >= km]
    if not lo or not hi: continue
    (k0, c0), (k1, c1) = lo[-1], hi[0]
    t_ = 0 if k1 == k0 else (km - k0) / (k1 - k0)
    p = (c0[0] + t_ * (c1[0] - c0[0]), c0[1] + t_ * (c1[1] - c0[1]))
    erri.append(hav(*p, *e['real'])); errn.append(hav(*e['nos'], *e['real']))
resumo('interpolacao', erri); resumo('nosso (mesmos casos)', errn)

if osm:
    print('\n== 4) marcos km do OSM (Overpass) como fonte')
    marcos = collections.defaultdict(list)
    for n in osm:
        tg = n['tags']; ref = (tg.get('ref') or '').upper().replace(' ', '-')
        m = re.search(r'(BR|RJ)-?(\d{2,3})', ref + ' ' + tg.get('name', '').upper())
        try: d = float(tg.get('distance', '').replace(',', '.'))
        except: continue
        marcos[(f"{m.group(1)}-{m.group(2)}" if m else None, d)].append((n['lat'], n['lon']))
    ach = ok = 0; er = []
    for e in E:
        if e['t'] != 'rodovia': continue
        ref, km = via_km(e['end'])
        if not ref or km is None or not e['nos']: continue
        c = marcos.get((ref, km))
        if not c: continue
        ach += 1
        p = min(c, key=lambda q: hav(*q, *e['real']))  # otimista: escolhe o marco certo se houver varios
        er.append(hav(*p, *e['real']))
    print(f'  enderecos com ref+km: casos com marco OSM correspondente: {ach}')
    resumo('marco OSM', er)
    print('  cobertura: marcos com ref =', sum(1 for k in marcos if k[0]), 'de', len(marcos), 'chaves distintas')
