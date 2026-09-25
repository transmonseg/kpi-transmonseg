#!/usr/bin/env python3
"""Mede o KPI da Nutry Max contra o gabarito da Ana (Validacao_Romaneio_Paradas_KPI).

Task 2 (plano 2026-09-24, brief "parada curta compartilhada"): a Ana montou um
gabarito por NF (aba 'Conferencia por NF', cabecalho na linha 6) cruzando
codigo do cliente/endereco do romaneio contra a parada real (evidencia
independente, sem usar status/horario do KPI). O subconjunto mais confiavel
(vinculo por CODIGO DO CLIENTE NA MESMA PLACA -- Ana confirma que aquele
codigo de cliente so' aparece uma vez naquela placa, entao a parada dela e'
inequivocamente a entrega dessa NF) tem 1.185 NFs em 22/09; e' contra ele que
o plano exige medir toda mudanca de regra ANTES de subir pra producao (ver
Global Constraints do plano).

Uso:
    python3 medir-contra-gabarito-ana.py <xlsx_ana> <xlsx_kpi>

<xlsx_ana>: o gabarito da Ana (aba 'Conferencia por NF').
<xlsx_kpi>: um xlsx gerado pelo KPI (gerar-nutrimax-real-arquivo.ts) -- uma
aba por placa (CARGA, NF, CLIENTE, ENDERECO, CHEGADA NA LOJA, SAIDA DA LOJA,
TEMPO NA LOJA, STATUS a partir da linha 3/4), mais a aba resumo 'KPI <data>'
e (as vezes) 'Avisos', que sao ignoradas.

Imprime:
  - N do subconjunto CODIGO DO CLIENTE NA MESMA PLACA, e quantos o KPI
    confirma com chegada <=2min / <=10min da chegada real (evidencia da
    Ana), e quantos ficam sem horario nenhum no KPI.
  - Para o subconjunto STATUS ORIGINAL 'ENTREGUE' do KPI (TODAS as NFs, nao
    so' o subconjunto acima): quantas a Ana marca como 'SEM VINCULO
    INDEPENDENTE IDENTIFICADO' -- confirmacao do KPI que a Ana nao consegue
    sustentar de jeito nenhum.
"""
from __future__ import annotations

import sys
import datetime as dt
from collections import Counter

try:
    import openpyxl
except ImportError:
    print("Precisa de openpyxl (pip install openpyxl)", file=sys.stderr)
    raise

ABA_GABARITO = "Conferencia por NF"
LINHA_CABECALHO_GABARITO = 6
SUBSET_CONFIAVEL = "CÓDIGO DO CLIENTE NA MESMA PLACA"
SEM_VINCULO = "SEM VÍNCULO INDEPENDENTE IDENTIFICADO"

# Abas do xlsx do KPI que NAO sao placa (resumo geral + avisos).
ABAS_IGNORADAS_KPI = {"Avisos"}


def carregar_gabarito(caminho: str) -> dict[str, dict]:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb[ABA_GABARITO]
    hdr = [ws.cell(LINHA_CABECALHO_GABARITO, c).value for c in range(1, ws.max_column + 1)]
    idx = {h: i + 1 for i, h in enumerate(hdr)}

    por_nf: dict[str, dict] = {}
    for r in range(LINHA_CABECALHO_GABARITO + 1, ws.max_row + 1):
        nf = ws.cell(r, idx["NF"]).value
        if nf is None:
            continue
        nf = str(nf).strip()
        chegada_rel = ws.cell(r, idx["CHEGADA RELATÓRIO"]).value
        por_nf[nf] = {
            "evidencia": ws.cell(r, idx["EVIDÊNCIA INDEPENDENTE"]).value,
            "chegada_relatorio": chegada_rel if isinstance(chegada_rel, dt.time) else None,
        }
    return por_nf


def _parse_hora(valor) -> dt.time | None:
    """Coluna 'CHEGADA NA LOJA' do KPI vem como texto 'HH:MM' (ou vazio quando
    sem horario -- ver agregacao.ts, chegada fica null e o gerador-xlsx
    escreve string vazia)."""
    if valor is None:
        return None
    if isinstance(valor, dt.time):
        return valor
    if isinstance(valor, dt.datetime):
        return valor.time()
    texto = str(valor).strip()
    if not texto:
        return None
    try:
        partes = texto.split(":")
        return dt.time(int(partes[0]), int(partes[1]))
    except (ValueError, IndexError):
        return None


def carregar_kpi(caminho: str) -> dict[str, dict]:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    por_nf: dict[str, dict] = {}
    for nome_aba in wb.sheetnames:
        if nome_aba in ABAS_IGNORADAS_KPI:
            continue
        ws = wb[nome_aba]
        # Aba resumo 'KPI <data>' tem cabecalho diferente (uma linha por
        # carga, nao por NF) -- distingue pelo cabecalho da linha 3.
        cab3 = [ws.cell(3, c).value for c in range(1, ws.max_column + 1)]
        if cab3[:2] != ["CARGA", "NF"]:
            continue
        for r in range(4, ws.max_row + 1):
            nf = ws.cell(r, 2).value
            if nf is None:
                continue
            nf = str(nf).strip()
            chegada = _parse_hora(ws.cell(r, 5).value)
            status = ws.cell(r, 8).value
            # Duas placas nunca deveriam repetir a mesma NF -- se acontecer,
            # fica a ultima (nao esperado nos dados reais, so' guarda de tipo).
            por_nf[nf] = {"chegada": chegada, "status": status}
    return por_nf


def _diff_minutos(a: dt.time, b: dt.time) -> int:
    da = dt.datetime.combine(dt.date.today(), a)
    db = dt.datetime.combine(dt.date.today(), b)
    return abs(round((da - db).total_seconds() / 60))


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    caminho_ana, caminho_kpi = sys.argv[1], sys.argv[2]
    gabarito = carregar_gabarito(caminho_ana)
    kpi = carregar_kpi(caminho_kpi)

    subset = {nf: g for nf, g in gabarito.items() if g["evidencia"] == SUBSET_CONFIAVEL}
    n = len(subset)
    le2 = le10 = sem_horario = nao_achado_no_kpi = 0
    for nf, g in subset.items():
        info_kpi = kpi.get(nf)
        if info_kpi is None:
            nao_achado_no_kpi += 1
            continue
        chegada_kpi = info_kpi["chegada"]
        chegada_ana = g["chegada_relatorio"]
        if chegada_kpi is None or chegada_ana is None:
            sem_horario += 1
            continue
        diff = _diff_minutos(chegada_kpi, chegada_ana)
        if diff <= 2:
            le2 += 1
        if diff <= 10:
            le10 += 1

    print(f"Subconjunto '{SUBSET_CONFIAVEL}': N={n}")
    print(f"  chegada <=2min da evidencia da Ana: {le2} ({le2/n:.1%})")
    print(f"  chegada <=10min da evidencia da Ana: {le10} ({le10/n:.1%})")
    print(f"  sem horario no KPI (ou sem evidencia de horario da Ana): {sem_horario}")
    if nao_achado_no_kpi:
        print(f"  NF do gabarito nao encontrada no xlsx do KPI (removida/renumerada): {nao_achado_no_kpi}")

    # Passo 4 do brief: do universo 'ENTREGUE' do KPI (TODAS as NFs, nao so'
    # o subconjunto confiavel), quantas a Ana nao consegue vincular de jeito
    # nenhum -- confirmacao do KPI sem nenhum lastro independente.
    entregues_kpi = [nf for nf, info in kpi.items() if info["status"] == "ENTREGUE"]
    sem_vinculo_entre_entregues = sum(
        1 for nf in entregues_kpi
        if nf in gabarito and gabarito[nf]["evidencia"] == SEM_VINCULO
    )
    print(
        f"\nKPI status ENTREGUE: {len(entregues_kpi)} NFs; "
        f"Ana marca '{SEM_VINCULO}': {sem_vinculo_entre_entregues}"
    )

    # Diagnostico extra (Step 1 do brief, uso manual): status por NF do
    # subconjunto confiavel, pra cruzar rotulo do KPI com o "nao esteve no
    # local" da Ana.
    if "--status" in sys.argv:
        c = Counter(kpi[nf]["status"] for nf in subset if nf in kpi)
        print("\nStatus do KPI no subconjunto confiavel:")
        for status, qtd in c.most_common():
            print(f"  {status!r}: {qtd}")


if __name__ == "__main__":
    main()
