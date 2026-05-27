"""Extrai paradas do PDF Unitrac dia 19. Layout do pdfplumber:
- Cada parada gera ~4-5 linhas
- Padrao identificavel: linha com "0D HH:MM:SS  DIST  0D HH:MM:SS"
- Linha seguinte (ou anterior): "HH:MM   HH:MM" (chegada/saida)
- Classificacao: "BASE BENASSI" / "FORA DE BASE E LOCAL DE SERVIÇO" / "XX - REDE - NOME"
"""
import sys, io, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else 'docs/conversas-tia-erica/dia-19/unitrac/relatorio_9572.pdf'
OUT_MD = sys.argv[2] if len(sys.argv) > 2 else 'docs/conversas-tia-erica/dia-19/unitrac-pdf.md'

with pdfplumber.open(PDF) as pdf:
    txt = '\n'.join((p.extract_text() or '') for p in pdf.pages)

# Header de veiculo
PLACA_HDR = re.compile(r'\n([A-Z]{3}-?\d[A-Z0-9]\d{2})\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})')

# Acha posicoes dos headers
hdrs = list(PLACA_HDR.finditer(txt))
print(f"Headers de veiculos: {len(hdrs)}")

# Padrao da parada (linha de "duracao distancia tempo_ate_local"):
# Ex: "0D 02:24:32  0,0  0D 00:00:00"
DUR_RE = re.compile(r'0D\s+(\d{2}:\d{2}:\d{2})\s+([\d.,]+)?\s*0D\s+(\d{2}:\d{2}:\d{2})')

# Padrao HH:MM HH:MM (chegada saida) — aparece em linha proxima
HORAS_RE = re.compile(r'^\s*(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*$', re.MULTILINE)

def classifica(blob):
    blob_u = blob.upper()
    if 'BASE BENASSI' in blob_u:
        return ('BASE', '-', 'BASE BENASSI')
    # LOJA: padrao "XX - REDE - NOME" como linha
    # ou padrao "X PREZUNIC NOME"
    m = re.search(r'\b(\d{2,8})\s*-\s*([A-Z][A-ZÇÁÉÍÓÚÂÊÔ\s]{2,20})\s*-\s*([A-Z][A-ZÇÁÉÍÓÚÂÊÔ\s]{2,40})', blob)
    if m:
        return ('LOJA', m.group(1).strip(), f"{m.group(2).strip()} - {m.group(3).strip()[:30]}")
    # PREZUNIC, SENDAS, ASSAI etc no texto
    if any(r in blob_u for r in ['PREZUNIC', 'SENDAS', 'ASSAI', 'CARREFOUR', 'ZONA SUL', 'PRINCESA', 'ATACADAO', 'SUPERPRIX', 'ARMAZ', 'GUANABARA', 'PETIT', 'EMPORIO', 'VIANENSE', 'EMANUEL']):
        # procura nome da loja
        m2 = re.search(r'(PREZUNIC|SENDAS|ASSAI|CARREFOUR|ZONA SUL|PRINCESA|ATACADAO|SUPERPRIX|ARMAZ\w*|GUANABARA|PETIT|EMPORIO|VIANENSE|EMANUEL)[\s\-]+([A-ZÇÁÉÍÓÚÂÊÔ\s]{3,40})', blob, re.IGNORECASE)
        rede = m2.group(1) if m2 else 'REDE'
        nome = m2.group(2)[:30] if m2 else '?'
        return ('LOJA', '-', f"{rede} - {nome}".strip())
    if 'FORA DE BASE' in blob_u or 'FORA DE\nBASE' in blob_u:
        return ('FORA_BASE', '-', 'FORA DE BASE')
    return ('INDEF', '-', blob[:30].replace('\n', ' '))

# Pra cada placa, isolar bloco
paradas_por_placa = {}
for k, h in enumerate(hdrs):
    placa = h.group(1).replace('-', '')
    start = h.end()
    end = hdrs[k+1].start() if k+1 < len(hdrs) else len(txt)
    bloco = txt[start:end]

    # Acha cada DUR_RE no bloco
    paradas = []
    for m_dur in DUR_RE.finditer(bloco):
        dur = m_dur.group(1)  # HH:MM:SS
        dur_h, dur_m, dur_s = dur.split(':')
        dur_min = int(dur_h)*60 + int(dur_m) + (1 if int(dur_s) > 30 else 0)

        # Procura linha "HH:MM HH:MM" 100 chars antes ou 200 depois
        ctx_start = max(0, m_dur.start() - 50)
        ctx_end = min(len(bloco), m_dur.end() + 400)
        ctx = bloco[ctx_start:ctx_end]

        chd_sai = None
        for m_h in HORAS_RE.finditer(ctx):
            chd_sai = (m_h.group(1), m_h.group(2))
            break
        if not chd_sai:
            continue

        cls, cod, nome = classifica(ctx)
        paradas.append({
            'tipo': cls, 'chd': chd_sai[0], 'sai': chd_sai[1],
            'dur_min': dur_min, 'cod_loja': cod, 'nome': nome[:50],
        })

    paradas_por_placa[placa] = paradas

# Escrever MD
out = ['# Unitrac PDF — dia 19/05/2026', '', f'Total veiculos: {len(paradas_por_placa)}', '']
for placa, paradas in paradas_por_placa.items():
    out.append(f'## {placa}')
    out.append('')
    out.append(f'{len(paradas)} paradas')
    out.append('')
    out.append('| Tipo | Chegada-Saida | Duracao | cod_loja | Nome/Local |')
    out.append('|---|---|---|---|---|')
    for p in paradas:
        out.append(f"| {p['tipo']} | {p['chd']}-{p['sai']} | {p['dur_min']}min | {p['cod_loja']} | {p['nome']} |")
    out.append('')

with open(OUT_MD, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

with open(OUT_MD.replace('.md', '.json'), 'w', encoding='utf-8') as f:
    json.dump(paradas_por_placa, f, ensure_ascii=False, indent=2)

print(f">> {OUT_MD} salvo")
total = sum(len(p) for p in paradas_por_placa.values())
print(f"Total paradas extraidas: {total}")
print(f"Placas sem paradas: {sum(1 for p in paradas_por_placa.values() if not p)}")
print(f"\nAmostra 3 primeiras placas:")
for placa, paradas in list(paradas_por_placa.items())[:3]:
    print(f"\n  {placa}: {len(paradas)} paradas")
    for p in paradas[:5]:
        print(f"    {p['tipo']} {p['chd']}-{p['sai']} {p['dur_min']}min {p['cod_loja']} {p['nome'][:40]}")
