#!/usr/bin/env python3
"""Trava de regressão contra dias reais rotulados (Task 2b, plano
2026-09-25 "resolução automática 94").

Le `scripts/gabaritos/casos-rotulados.csv` (colunas
`data;placa;nf;esperado;fonte`, esperado em {entregue, nao_entregue,
sem_rastreador, desatualizado}) e confere cada caso contra o xlsx do KPI do
dia correspondente (formato: uma aba por placa, cabecalho com 'NF' e uma
coluna comecando por 'STATUS', ver `medir-contra-gabarito-ana.py`).

Criterios de falha:
  - nao_entregue que saiu no KPI com status comecando por 'ENTREGUE'
    -> FALHA CRITICA (falso positivo).
  - sem_rastreador que NAO saiu com o rotulo 'SEM RASTREADOR - VEICULO SEM
    RASTREAMENTO NO DIA - NAO CONTABILIZADO' (na coluna STATUS ou na
    observacao/EVIDENCIA) -> FALHA.
  - entregue que saiu 'ENTREGUE' -> acerto (só conta taxa, nunca falha).
  - desatualizado: so' e' reportado (nao tem regra de falha definida no
    brief); usado apenas para contexto.

Casos listados em `scripts/gabaritos/excecoes-conhecidas.csv`
(`data;placa;nf;motivo;desde`) sao falhas conhecidas/antigas: a trava NAO
falha por causa deles (mas ainda aparecem no relatorio como "conhecidos").
Qualquer falha que nao esteja na lista de excecoes e' uma regressao NOVA e
faz o script sair com codigo 1.

Tambem roda `scripts/medir-contra-gabarito-ana.py <gabarito_ana> <xlsx_22>`
quando um gabarito da Ana e' informado via --gabarito-ana, e falha se
<=2min < 988, <=10min < 1104 ou sem-horario > 29 (limiares do Task 2 /
2026-09-24).

Uso:
    python3 verificar-kpi-gabaritos.py <xlsx_22> <xlsx_23> <xlsx_24> \
        [--casos scripts/gabaritos/casos-rotulados.csv] \
        [--excecoes scripts/gabaritos/excecoes-conhecidas.csv] \
        [--gabarito-ana <xlsx_gabarito_ana>]

Sai com codigo 1 se houver qualquer falha NOVA (nao listada nas excecoes).
Sai com codigo 0 caso contrario (mesmo que existam excecoes conhecidas).
"""
from __future__ import annotations

import argparse
import csv
import subprocess
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Precisa de openpyxl (pip install openpyxl)", file=sys.stderr)
    raise

ESPERADOS_VALIDOS = {"entregue", "nao_entregue", "sem_rastreador", "desatualizado"}

ROTULO_SEM_RASTREADOR = (
    "SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO"
)

DATA_PARA_ARG = {
    # preenchido em main() a partir dos argumentos posicionais (22/23/24)
}

SCRIPT_DIR = Path(__file__).resolve().parent


def _norm(texto) -> str:
    if texto is None:
        return ""
    return str(texto).strip().upper()


def carregar_casos(caminho: Path) -> list[dict]:
    casos = []
    with open(caminho, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for linha in reader:
            esperado = linha["esperado"].strip()
            if esperado not in ESPERADOS_VALIDOS:
                raise ValueError(
                    f"esperado invalido em {caminho}: {esperado!r} "
                    f"(linha {linha})"
                )
            casos.append(
                {
                    "data": linha["data"].strip(),
                    "placa": linha["placa"].strip(),
                    "nf": linha["nf"].strip(),
                    "esperado": esperado,
                    "fonte": linha.get("fonte", "").strip(),
                }
            )
    return casos


def carregar_excecoes(caminho: Path) -> set[tuple[str, str, str]]:
    if not caminho.exists():
        return set()
    excecoes = set()
    with open(caminho, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for linha in reader:
            excecoes.add(
                (linha["data"].strip(), linha["placa"].strip(), linha["nf"].strip())
            )
    return excecoes


def _achar_linha_cabecalho(ws) -> tuple[int, dict[str, int]] | None:
    """Acha a linha de cabecalho de uma aba (uma placa): precisa ter uma
    coluna 'NF' e uma coluna comecando por 'STATUS'."""
    for r in range(1, min(ws.max_row, 6) + 1):
        valores = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
        idx = {}
        tem_nf = False
        tem_status = False
        for i, v in enumerate(valores, start=1):
            if v is None:
                continue
            texto = str(v).strip()
            if texto.upper() == "NF":
                idx["NF"] = i
                tem_nf = True
            elif texto.upper().startswith("STATUS"):
                idx["STATUS"] = i
                tem_status = True
            elif texto.upper().startswith("EVIDÊNCIA") or texto.upper().startswith(
                "EVIDENCIA"
            ):
                idx["EVIDENCIA"] = i
            elif texto.upper().startswith("RESOLU"):
                idx["RESOLUCAO"] = i
        if tem_nf and tem_status:
            return r, idx
    return None


def carregar_kpi_xlsx(caminho: Path) -> dict[str, dict]:
    """Le um xlsx do KPI (uma aba por placa) e retorna {nf: {status,
    observacao, placa}}. Ignora abas sem cabecalho reconhecivel (resumo,
    avisos etc.)."""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    por_nf: dict[str, dict] = {}
    for nome_aba in wb.sheetnames:
        ws = wb[nome_aba]
        achado = _achar_linha_cabecalho(ws)
        if achado is None:
            continue
        linha_hdr, idx = achado
        col_nf = idx["NF"]
        col_status = idx["STATUS"]
        col_evidencia = idx.get("EVIDENCIA")
        col_resolucao = idx.get("RESOLUCAO")
        for r in range(linha_hdr + 1, ws.max_row + 1):
            nf = ws.cell(r, col_nf).value
            if nf is None or str(nf).strip() == "":
                continue
            nf = str(nf).strip()
            status = ws.cell(r, col_status).value
            observacao_partes = []
            if col_evidencia:
                observacao_partes.append(ws.cell(r, col_evidencia).value)
            if col_resolucao:
                observacao_partes.append(ws.cell(r, col_resolucao).value)
            observacao = " ".join(str(p) for p in observacao_partes if p)
            por_nf[nf] = {
                "placa": nome_aba,
                "status": status,
                "observacao": observacao,
            }
    return por_nf


def verificar_caso(caso: dict, kpi_por_nf: dict[str, dict]) -> str | None:
    """Retorna None se o caso passa, ou uma string descrevendo a falha."""
    info = kpi_por_nf.get(caso["nf"])
    esperado = caso["esperado"]

    if info is None:
        if esperado in ("nao_entregue", "sem_rastreador"):
            return (
                f"NF {caso['nf']} (placa {caso['placa']}, {caso['data']}) nao "
                f"encontrada no xlsx do dia -- esperado={esperado}"
            )
        return None

    status = _norm(info["status"])
    observacao = _norm(info["observacao"])

    if esperado == "nao_entregue":
        if status.startswith("ENTREGUE"):
            return (
                f"FALHA CRITICA: NF {caso['nf']} (placa {caso['placa']}, "
                f"{caso['data']}) esperado=nao_entregue mas KPI status="
                f"{info['status']!r}"
            )
        return None

    if esperado == "sem_rastreador":
        rotulo = _norm(ROTULO_SEM_RASTREADOR)
        if rotulo not in status and rotulo not in observacao:
            return (
                f"FALHA: NF {caso['nf']} (placa {caso['placa']}, {caso['data']}) "
                f"esperado=sem_rastreador mas nao tem o rotulo "
                f"'{ROTULO_SEM_RASTREADOR}' (status={info['status']!r}, "
                f"observacao={info['observacao']!r})"
            )
        return None

    if esperado == "entregue":
        # Nunca falha -- so' conta acerto/erro na taxa.
        return None

    if esperado == "desatualizado":
        # Sem regra de falha definida no brief -- so' contexto.
        return None

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx_22")
    parser.add_argument("xlsx_23")
    parser.add_argument("xlsx_24")
    parser.add_argument(
        "--casos",
        default=str(SCRIPT_DIR / "gabaritos" / "casos-rotulados.csv"),
    )
    parser.add_argument(
        "--excecoes",
        default=str(SCRIPT_DIR / "gabaritos" / "excecoes-conhecidas.csv"),
    )
    parser.add_argument(
        "--gabarito-ana",
        default=None,
        help="xlsx do gabarito da Ana (Conferencia por NF) -- roda "
        "medir-contra-gabarito-ana.py contra o xlsx de 22/09 se informado.",
    )
    args = parser.parse_args()

    xlsx_por_data = {
        "2026-09-22": Path(args.xlsx_22),
        "2026-09-23": Path(args.xlsx_23),
        "2026-09-24": Path(args.xlsx_24),
    }

    casos = carregar_casos(Path(args.casos))
    excecoes = carregar_excecoes(Path(args.excecoes))

    kpi_cache: dict[str, dict[str, dict]] = {}

    falhas_novas: list[str] = []
    falhas_conhecidas: list[str] = []
    acertos_entregue = 0
    total_entregue = 0
    total_por_esperado: dict[str, int] = {}

    for caso in casos:
        data = caso["data"]
        total_por_esperado[caso["esperado"]] = (
            total_por_esperado.get(caso["esperado"], 0) + 1
        )
        if data not in xlsx_por_data:
            falhas_novas.append(
                f"data desconhecida no CSV de casos: {data!r} (caso {caso})"
            )
            continue
        caminho_xlsx = xlsx_por_data[data]
        if data not in kpi_cache:
            kpi_cache[data] = carregar_kpi_xlsx(caminho_xlsx)
        kpi_por_nf = kpi_cache[data]

        if caso["esperado"] == "entregue":
            total_entregue += 1
            info = kpi_por_nf.get(caso["nf"])
            if info is not None and _norm(info["status"]).startswith("ENTREGUE"):
                acertos_entregue += 1

        falha = verificar_caso(caso, kpi_por_nf)
        if falha is None:
            continue

        chave = (caso["data"], caso["placa"], caso["nf"])
        if chave in excecoes:
            falhas_conhecidas.append(falha)
        else:
            falhas_novas.append(falha)

    print(f"Casos rotulados: {len(casos)} ({total_por_esperado})")
    if total_entregue:
        taxa = acertos_entregue / total_entregue
        print(
            f"Taxa de acerto 'entregue': {acertos_entregue}/{total_entregue} "
            f"({taxa:.1%})"
        )

    if falhas_conhecidas:
        print(f"\nFalhas conhecidas (exceções, nao bloqueiam): {len(falhas_conhecidas)}")
        for f in falhas_conhecidas:
            print(f"  [conhecida] {f}")

    if falhas_novas:
        print(f"\nFALHAS NOVAS (bloqueiam a trava): {len(falhas_novas)}")
        for f in falhas_novas:
            print(f"  [NOVA] {f}")

    exit_code = 1 if falhas_novas else 0

    if args.gabarito_ana:
        print("\n--- medir-contra-gabarito-ana.py (limiares do dia 22/09) ---")
        script_ana = SCRIPT_DIR / "medir-contra-gabarito-ana.py"
        resultado = subprocess.run(
            [sys.executable, str(script_ana), args.gabarito_ana, args.xlsx_22],
            capture_output=True,
            text=True,
        )
        print(resultado.stdout)
        if resultado.stderr:
            print(resultado.stderr, file=sys.stderr)

        le2 = le10 = sem_horario = None
        for linha in resultado.stdout.splitlines():
            linha_l = linha.strip()
            if linha_l.startswith("chegada <=2min"):
                le2 = int(linha_l.split(":")[1].strip().split(" ")[0])
            elif linha_l.startswith("chegada <=10min"):
                le10 = int(linha_l.split(":")[1].strip().split(" ")[0])
            elif linha_l.startswith("sem horario"):
                sem_horario = int(linha_l.split(":")[1].strip())

        if le2 is not None and le2 < 988:
            print(f"FALHA CRITICA: <=2min = {le2} < 988")
            exit_code = 1
        if le10 is not None and le10 < 1104:
            print(f"FALHA CRITICA: <=10min = {le10} < 1104")
            exit_code = 1
        if sem_horario is not None and sem_horario > 29:
            print(f"FALHA CRITICA: sem horario = {sem_horario} > 29")
            exit_code = 1

    print(f"\nSaida: {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
