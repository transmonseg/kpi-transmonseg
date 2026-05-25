from datetime import datetime, time

def fmt(t):
    if t is None: return '---'
    if not isinstance(t, time): return str(t)
    return t.strftime('%H:%M:%S')

def diff_min(t1, t2):
    dt1 = datetime.combine(datetime.today(), t1)
    dt2 = datetime.combine(datetime.today(), t2)
    return int((dt2 - dt1).total_seconds() / 60)

sistema = {}
sistema['MB01']    = dict(motorista='SIDNEI ANTONIO',          placa='LQE-5401', saida_cd=time(4,11),     chd=time(4,46),     saida_loja=time(5,32))
sistema['Loja 03'] = dict(motorista='WILIAN FERES',            placa='EFU-5704', saida_cd=time(12,37),    chd=time(12,42),    saida_loja=time(13,38))
sistema['Loja 04'] = dict(motorista='MARCIO',                  placa='KVH-9J42', saida_cd=time(4,32,4),   chd=time(5,28),     saida_loja=time(8,24,25))
sistema['Loja 06'] = dict(motorista='SIDNEI ANTONIO',          placa='LQE-5401', saida_cd=time(4,11),     chd=time(4,46),     saida_loja=time(5,32))
sistema['Loja 08'] = dict(motorista='INACIO ARAUJO',           placa='LQU-5546', saida_cd=time(3,47,30),  chd=time(4,33),     saida_loja=time(5,19,8))
sistema['Loja 09'] = dict(motorista='VLADIMIR',                placa='KQY-9E24', saida_cd=time(14,48,9),  chd=time(15,59),    saida_loja=time(16,52,5))
sistema['Loja 10'] = dict(motorista='ANDERSON',                placa='LVE-0688', saida_cd=time(17,46,23), chd=time(18,44,15), saida_loja=time(19,24,4))
sistema['Loja 11'] = dict(motorista='WILLIAM',                 placa='INW-8A51', saida_cd=time(15,17,15), chd=time(16,3),     saida_loja=time(16,53,32))
sistema['Loja 12'] = dict(motorista='MILTON',                  placa='KOP-4978', saida_cd=time(13,17,46), chd=time(14,23),    saida_loja=time(14,44,10))
sistema['Loja 14'] = dict(motorista='INACIO ARAUJO',           placa='LQU-5546', saida_cd=time(14,21,40), chd=time(15,33),    saida_loja=time(16,10,56))
sistema['Loja 15'] = dict(motorista='RODRIGO',                 placa='KQY-9E24', saida_cd=time(14,48,9),  chd=time(15,59),    saida_loja=time(16,52,5))
sistema['Loja 17'] = dict(motorista='RENATO',                  placa='JAJ-6B36', saida_cd=time(18,20,35), chd=time(19,6,42),  saida_loja=time(19,36,10))
sistema['Loja 18'] = dict(motorista='ALEX',                    placa='LKW-2B80', saida_cd=time(4,30,28),  chd=time(5,14),     saida_loja=time(6,50,29))
sistema['Loja 19'] = dict(motorista='EDUARDO',                 placa='LQA-5883', saida_cd=time(4,32,13),  chd=time(5,10,49),  saida_loja=time(5,19,47))
sistema['Loja 20'] = dict(motorista='AGNALDO',                 placa='LKR-5990', saida_cd=time(19,11,17), chd=time(19,50,43), saida_loja=time(20,28,53))
sistema['Loja 21'] = dict(motorista='SIDNEI ANTONIO MENDES',  placa='LQE-5401', saida_cd=time(4,11),     chd=time(4,46),     saida_loja=time(5,32))
sistema['Loja 22'] = dict(motorista='JOSENILDO ANISIO',        placa='KRK-3D12', saida_cd=time(17,59,11), chd=time(19,59,19), saida_loja=time(20,24,40))
sistema['Loja 23'] = dict(motorista='PAULO ROBERTO',           placa='MDV-3746', saida_cd=time(3,36,9),   chd=time(4,25,37),  saida_loja=time(5,49,13))
sistema['Loja 25'] = dict(motorista='JOSENILDO ANISIO',        placa='KRK-3D12', saida_cd=time(17,59,11), chd=time(19,5,16),  saida_loja=time(19,48,36))
sistema['Loja 27'] = dict(motorista='RODRIGO',                 placa='KQY-9E24', saida_cd=time(14,48,9),  chd=time(15,59),    saida_loja=time(16,52,5))
sistema['Loja 28'] = dict(motorista='PAULO HENRIQUE',          placa='DBB-8D19', saida_cd=time(12,38,31), chd=time(13,43),    saida_loja=time(14,9,44))
sistema['Loja 29'] = dict(motorista='PAULO HENRIQUE',          placa='DBB-8D19', saida_cd=time(12,38,31), chd=time(14,24),    saida_loja=time(14,53,37))
sistema['Loja 30'] = dict(motorista='SIDNEI ANTONIO MENDES',  placa='LQE-5401', saida_cd=time(4,11),     chd=time(4,46),     saida_loja=time(5,32))
sistema['Loja 31'] = dict(motorista='MARCIO',                  placa='LTH-4J15', saida_cd=time(18,40,39), chd=time(19,44,50), saida_loja=time(20,7,10))
sistema['Loja 33'] = dict(motorista='MOBRICI',                 placa='AOP-3C73', saida_cd=time(14,50,4),  chd=time(15,32,49), saida_loja=time(17,9,14))
sistema['Loja 35'] = dict(motorista='CARLOS GONCALVES',        placa='LNU-9595', saida_cd=time(3,36,9),   chd=time(4,3,56),   saida_loja=time(4,20,24))
sistema['Loja 36'] = dict(motorista='MOBRICI',                 placa='AOP-3C73', saida_cd=time(14,50,4),  chd=time(15,32,49), saida_loja=time(17,9,14))
sistema['Loja 38'] = dict(motorista='EDMILSON JOSE',           placa='LTQ-0783', saida_cd=time(14,51,34), chd=time(15,46),    saida_loja=time(16,17,58))
sistema['Loja 40'] = dict(motorista='LUIZ ALVES',              placa='LCO-0978', saida_cd=time(5,27),     chd=time(10,27),    saida_loja=time(15,31))
sistema['Loja 42'] = dict(motorista='EDUARDO',                 placa='QAH-2H50', saida_cd=time(5,7,10),   chd=time(5,44),     saida_loja=time(5,53))
sistema['Loja 43'] = dict(motorista='CARLOS GONCALVES',        placa='LNU-9595', saida_cd=time(3,36,9),   chd=time(4,25),     saida_loja=time(5,49))
sistema['Loja 44'] = dict(motorista='PAULO ROBERTO',           placa='MDV-3746', saida_cd=time(4,18,46),  chd=time(4,52),     saida_loja=time(4,58))
sistema['Loja 45'] = dict(motorista='MOBRICI',                 placa='AOP-3C73', saida_cd=time(14,50,4),  chd=time(15,32,49), saida_loja=time(17,9,14))
sistema['Loja 46'] = dict(motorista='MARCIO',                  placa='KVH-9J42', saida_cd=time(17,41,42), chd=time(18,27,43), saida_loja=time(18,53,27))
sistema['Loja 47'] = dict(motorista='JOSUE DOS SANTOS',        placa='BBH-1C94', saida_cd=time(12,37,39), chd=time(14,34,50), saida_loja=time(23,53,7))
sistema['Loja 48'] = dict(motorista='JOSUE DOS SANTOS',        placa='BBH-1C94', saida_cd=time(4,41,39),  chd=time(5,28),     saida_loja=time(6,55))

manual = {}
manual['Loja 33'] = dict(motorista='RAPHAEL/LUIZ ALVES',        placa='LCO-0978', saida_cd=time(5,30),  chd=time(8,5),   saida_loja=time(8,40))
manual['Loja 36'] = dict(motorista='RAPHAEL/LUIZ ALVES',        placa='LCO-0978', saida_cd=time(5,30),  chd=time(6,20),  saida_loja=time(7,55))
manual['Loja 30'] = dict(motorista='SIDNEI ANTONIO MENDES',     placa='LQE-5401', saida_cd=time(4,15),  chd=time(4,45),  saida_loja=time(5,30))
manual['Loja 21'] = dict(motorista='WILLIAM/EDMILSON',          placa='LTQ-0783', saida_cd=time(4,0),   chd=time(4,40),  saida_loja=time(8,40))
manual['Loja 04'] = dict(motorista='SANDRO EDUARDO/MARCIO',     placa='KVH-9J42', saida_cd=time(4,35),  chd=time(5,30),  saida_loja=time(8,25))
manual['Loja 18'] = dict(motorista='ALEX',                      placa='LKW-2B80', saida_cd=time(4,35),  chd=time(5,15),  saida_loja=time(6,50))
manual['Loja 27'] = dict(motorista='JULIO COUTO/INACIO ARAUJO', placa='LQU-5546', saida_cd=time(3,50),  chd=time(4,30),  saida_loja=time(5,20))
manual['Loja 15'] = dict(motorista='JULIO COUTO/INACIO ARAUJO', placa='LQU-5546', saida_cd=time(3,50),  chd=time(5,30),  saida_loja=time(6,30))
manual['Loja 48'] = dict(motorista='JOSUE DOS SANTOS',          placa='BBH-1C94', saida_cd=time(4,45),  chd=time(5,30),  saida_loja=time(6,55))
manual['Loja 28'] = dict(motorista='PAULO HENRIQUE',            placa='DBB-8D19', saida_cd=time(12,40), chd=time(13,45), saida_loja=time(14,10))
manual['Loja 29'] = dict(motorista='PAULO HENRIQUE',            placa='DBB-8D19', saida_cd=time(12,40), chd=time(14,25), saida_loja=time(14,55))
manual['MB01']    = dict(motorista='ALEX (tarde)',               placa='LKW-2B80', saida_cd=time(12,45), chd=time(13,10), saida_loja=time(13,30))
manual['Loja 11'] = dict(motorista='WILLIAM',                   placa='INW-8A51', saida_cd=time(15,15), chd=time(16,5),  saida_loja=time(16,55))
manual['Loja 14'] = dict(motorista='JULIO COUTO/INACIO ARAUJO', placa='LQU-5546', saida_cd=time(14,20), chd=time(15,35), saida_loja=time(16,10))
manual['Loja 12'] = dict(motorista='MILTON',                    placa='KOP-4978', saida_cd=time(13,15), chd=time(14,25), saida_loja=time(14,45))
manual['Loja 38'] = dict(motorista='WILLIAM/EDMILSON',          placa='LTQ-0783', saida_cd=time(14,50), chd=time(15,45), saida_loja=time(16,15))
manual['Loja 09'] = dict(motorista='FABIO/VLADIMIR',            placa='KQY-9E24', saida_cd=time(14,50), chd=time(16,0),  saida_loja=time(16,50))
manual['Loja 40'] = dict(motorista='RAPHAEL/LUIZ ALVES',        placa='LCO-0978', saida_cd=time(15,30), chd=time(17,5),  saida_loja=time(18,5))
manual['Loja 45'] = dict(motorista='MOBRICI',                   placa='AOP-3C73', saida_cd=time(14,50), chd=time(15,30), saida_loja=time(17,10))
manual['Loja 25'] = dict(motorista='EDUARDO/JOSENILDO',         placa='KRK-3D12', saida_cd=time(18,0),  chd=time(19,5),  saida_loja=time(19,50))
manual['Loja 22'] = dict(motorista='EDUARDO/JOSENILDO',         placa='KRK-3D12', saida_cd=time(18,0),  chd=time(20,0),  saida_loja=time(20,25))
manual['Loja 31'] = dict(motorista='MARCIO',                    placa='LTH-4J15', saida_cd=time(18,40), chd=time(19,45), saida_loja=time(20,5))
manual['Loja 17'] = dict(motorista='RENATO',                    placa='JAJ-6B36', saida_cd=time(18,20), chd=time(19,5),  saida_loja=time(19,35))
manual['Loja 10'] = dict(motorista='LUCIANO/ANDERSON',          placa='LVE-0688', saida_cd=time(17,45), chd=time(18,45), saida_loja=time(19,25))
manual['Loja 20'] = dict(motorista='SIDNEI/AGNALDO',            placa='LKR-5990', saida_cd=time(19,5),  chd=time(19,50), saida_loja=time(20,30))
manual['Loja 46'] = dict(motorista='SANDRO EDUARDO/MARCIO',     placa='KVH-9J42', saida_cd=time(17,40), chd=time(18,25), saida_loja=time(18,55))
manual['Loja 47'] = dict(motorista='JOSUE DOS SANTOS',          placa='BBH-1C94', saida_cd=time(19,15), chd=time(19,30), saida_loja=time(20,45))
manual['Loja 06'] = dict(motorista='SIDNEI ANTONIO (tarde)',    placa='LQE-5401', saida_cd=time(18,0),  chd=time(20,10), saida_loja=time(20,30))

# ============================================================
# BUG 1: GPS clonado
# ============================================================
print('='*70)
print('BUG 1 - GPS CLONADO (mesmos timestamps em multiplas lojas)')
print('='*70)

grupos = [
    ('LQE-5401', ['MB01','Loja 06','Loja 21','Loja 30']),
    ('KQY-9E24', ['Loja 09','Loja 15','Loja 27']),
    ('AOP-3C73', ['Loja 33','Loja 36','Loja 45']),
]

for placa, lojas in grupos:
    print('\nPlaca %s:' % placa)
    vals_cd = []
    vals_chd = []
    vals_sl = []
    for l in lojas:
        d = sistema.get(l, {})
        sc = d.get('saida_cd')
        chd = d.get('chd')
        sl = d.get('saida_loja')
        vals_cd.append(fmt(sc))
        vals_chd.append(fmt(chd))
        vals_sl.append(fmt(sl))
        print('  %-15s: saida_cd=%-10s chd=%-10s saida_loja=%s' % (l, fmt(sc), fmt(chd), fmt(sl)))
    cd_clone = len(set(vals_cd)) == 1
    chd_clone = len(set(vals_chd)) == 1
    sl_clone = len(set(vals_sl)) == 1
    if cd_clone and chd_clone and sl_clone:
        print('  *** BUG 1 AINDA EXISTE: todos os 3 timestamps identicos ***')
    else:
        print('  => saida_cd_clone=%s | chd_clone=%s | sl_clone=%s' % (cd_clone, chd_clone, sl_clone))

# ============================================================
# BUG 2/3: saida_cd = chd
# ============================================================
print('\n' + '='*70)
print('BUG 2/3 - saida_cd aprox igual CHD (viagem impossivel, < 5 min)')
print('='*70)
encontrou = False
for loja in sorted(sistema.keys()):
    d = sistema[loja]
    sc = d['saida_cd']
    chd = d['chd']
    if isinstance(sc, time) and isinstance(chd, time):
        diff = diff_min(sc, chd)
        if 0 <= diff < 5:
            print('  %-15s: saida_cd=%s | chd=%s | diff=%dmin  *** SUSPEITO ***' % (loja, fmt(sc), fmt(chd), diff))
            encontrou = True
if not encontrou:
    print('  Nenhum caso encontrado (bug resolvido).')
# Caso especial Loja 03
d3 = sistema['Loja 03']
diff03 = diff_min(d3['saida_cd'], d3['chd'])
print('  [Loja 03 especial]: saida_cd=%s | chd=%s | diff=%dmin' % (fmt(d3['saida_cd']), fmt(d3['chd']), diff03))

# ============================================================
# COMPARACAO DETALHADA
# ============================================================
print('\n' + '='*70)
print('COMPARACAO DETALHADA - FILIAIS CRITICAS')
print('='*70)

criticas = ['MB01','Loja 06','Loja 21','Loja 30','Loja 15','Loja 27',
            'Loja 33','Loja 36','Loja 45','Loja 47','Loja 40','Loja 09']

batem = []
divergem = []

for loja in criticas:
    s = sistema.get(loja)
    m = manual.get(loja)
    print('\n--- %s ---' % loja)
    if s:
        print('  SISTEMA: %-35s | %-10s | CD=%-10s CHD=%-10s SL=%s' % (
            s['motorista'], s['placa'], fmt(s['saida_cd']), fmt(s['chd']), fmt(s['saida_loja'])))
    else:
        print('  SISTEMA: sem dados')
    if m:
        print('  MANUAL : %-35s | %-10s | CD=%-10s CHD=%-10s SL=%s' % (
            m['motorista'], m['placa'], fmt(m['saida_cd']), fmt(m['chd']), fmt(m['saida_loja'])))
    else:
        print('  MANUAL : nao consta no manual para este horario/viagem')

    if s and m:
        placa_ok = s['placa'] == m['placa']
        cd_diff = diff_min(m['saida_cd'], s['saida_cd']) if isinstance(s['saida_cd'], time) and isinstance(m['saida_cd'], time) else None
        chd_diff = diff_min(m['chd'], s['chd']) if isinstance(s['chd'], time) and isinstance(m['chd'], time) else None
        sl_diff = diff_min(m['saida_loja'], s['saida_loja']) if isinstance(s['saida_loja'], time) and isinstance(m['saida_loja'], time) else None
        issues = []
        if not placa_ok:
            issues.append('PLACA ERRADA (sis:%s vs man:%s)' % (s['placa'], m['placa']))
        if cd_diff is not None and abs(cd_diff) > 10:
            issues.append('saida_cd diff=%+dmin' % cd_diff)
        if chd_diff is not None and abs(chd_diff) > 10:
            issues.append('CHD diff=%+dmin' % chd_diff)
        if sl_diff is not None and abs(sl_diff) > 10:
            issues.append('saida_loja diff=%+dmin' % sl_diff)
        if issues:
            print('  DIVERGE: %s' % ' | '.join(issues))
            divergem.append(loja)
        else:
            s_cd = '%+dmin' % cd_diff if cd_diff is not None else 'N/A'
            s_chd = '%+dmin' % chd_diff if chd_diff is not None else 'N/A'
            s_sl = '%+dmin' % sl_diff if sl_diff is not None else 'N/A'
            print('  OK: placa=%s | cd=%s | chd=%s | sl=%s' % (placa_ok, s_cd, s_chd, s_sl))
            batem.append(loja)
    elif s and not m:
        print('  INFO: sistema tem dados de horario diferente; manual nao registrou esta viagem')

print('\n' + '='*70)
print('RESUMO FINAL')
print('='*70)
print('Batem com manual: %s' % str(batem))
print('Divergem:         %s' % str(divergem))
