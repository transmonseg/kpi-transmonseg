#!/usr/bin/env python3
"""Teste minimo de scripts/verificar-kpi-gabaritos.py (Task 2b).

Gera xlsx sinteticos com openpyxl em tmp e cobre:
  - nao_entregue que sai ENTREGUE no KPI -> falha (bloqueia, sai 1).
  - o mesmo caso listado como excecao conhecida -> nao falha (sai 0).
  - entregue que sai ENTREGUE -> conta como acerto (nao falha, taxa 100%).

Uso: python3 -m unittest scripts/test_verificar_kpi_gabaritos.py -v
(ou apenas `python3 scripts/test_verificar_kpi_gabaritos.py`)
"""
from __future__ import annotations

import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import openpyxl

SCRIPT_DIR = Path(__file__).resolve().parent
MODULO_PATH = SCRIPT_DIR / "verificar-kpi-gabaritos.py"

spec = importlib.util.spec_from_file_location("verificar_kpi_gabaritos", MODULO_PATH)
verificar_kpi_gabaritos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verificar_kpi_gabaritos)  # type: ignore[union-attr]


def _escrever_xlsx_kpi(
    caminho: Path, placas: dict[str, list[tuple]], com_confianca: bool = False
) -> None:
    """placas: {nome_placa: [(carga, nf, cliente, endereco, chegada, saida,
    tempo, status, resolucao_op, responsavel, evidencia, dist[, confianca]),
    ...]} -- `confianca` (Task 3, plano 2026-09-26) so' quando
    com_confianca=True, coluna extra no fim (mesmo lugar do xlsx real,
    MOTIVO/CONFIANÇA depois de EVIDÊNCIA/DIST. PARADA (m))."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nome_placa, linhas in placas.items():
        ws = wb.create_sheet(nome_placa)
        ws.append([f"RELATÓRIO KPI - NUTRY MAX - PLACA {nome_placa}"])
        ws.append(["MOTORISTA: TESTE"])
        header = [
            "CARGA",
            "NF",
            "CLIENTE",
            "ENDEREÇO",
            "CHEGADA NA LOJA",
            "SAÍDA DA LOJA",
            "TEMPO NA LOJA",
            "STATUS AUTOMÁTICO",
            "RESOLUÇÃO OPERAÇÃO",
            "RESPONSÁVEL",
            "EVIDÊNCIA",
            "DIST. PARADA (m)",
        ]
        if com_confianca:
            header += ["MOTIVO", "CONFIANÇA"]
        ws.append(header)
        for linha in linhas:
            ws.append(list(linha))
    wb.save(caminho)


def _escrever_csv_casos(caminho: Path, casos: list[tuple]) -> None:
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["data", "placa", "nf", "esperado", "fonte"])
        for row in casos:
            w.writerow(row)


def _escrever_csv_excecoes(caminho: Path, excecoes: list[tuple]) -> None:
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["data", "placa", "nf", "motivo", "desde"])
        for row in excecoes:
            w.writerow(row)


class TestVerificarKpiGabaritos(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self.tmpdir.name)

        # Um xlsx simples reaproveitado como "dia" 22, 23 e 24 -- os testes
        # so' usam o dia 24 (data dos casos), mas o script exige os 3.
        self.xlsx_vazio = self.tmp / "vazio.xlsx"
        _escrever_xlsx_kpi(self.xlsx_vazio, {"AAA0000": []})

    def tearDown(self):
        self.tmpdir.cleanup()

    def _rodar(self, xlsx_24: Path, casos: list[tuple], excecoes: list[tuple] | None = None):
        caminho_casos = self.tmp / "casos.csv"
        caminho_excecoes = self.tmp / "excecoes.csv"
        _escrever_csv_casos(caminho_casos, casos)
        _escrever_csv_excecoes(caminho_excecoes, excecoes or [])

        argv_original = sys.argv
        stdout_original = sys.stdout
        import io

        buffer = io.StringIO()
        sys.argv = [
            "verificar-kpi-gabaritos.py",
            str(self.xlsx_vazio),
            str(self.xlsx_vazio),
            str(xlsx_24),
            "--casos",
            str(caminho_casos),
            "--excecoes",
            str(caminho_excecoes),
        ]
        try:
            sys.stdout = buffer
            codigo = verificar_kpi_gabaritos.main()
        finally:
            sys.argv = argv_original
            sys.stdout = stdout_original
        return codigo, buffer.getvalue()

    def test_nao_entregue_saindo_entregue_falha(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "RQU3F71": [
                    (
                        "1",
                        "999001",
                        "CLIENTE X",
                        "ENDERECO X",
                        "10:00",
                        "10:10",
                        "0h10min",
                        "ENTREGUE",
                        "",
                        "",
                        "PARADA NO ENDEREÇO",
                        10,
                    )
                ]
            },
        )
        casos = [("2026-09-24", "RQU3F71", "999001", "nao_entregue", "teste")]
        codigo, saida = self._rodar(xlsx_24, casos)
        self.assertEqual(codigo, 1, saida)
        self.assertIn("FALHA CRITICA", saida)
        self.assertIn("999001", saida)

    def test_excecao_conhecida_nao_falha(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "RQU3F71": [
                    (
                        "1",
                        "999001",
                        "CLIENTE X",
                        "ENDERECO X",
                        "10:00",
                        "10:10",
                        "0h10min",
                        "ENTREGUE",
                        "",
                        "",
                        "PARADA NO ENDEREÇO",
                        10,
                    )
                ]
            },
        )
        casos = [("2026-09-24", "RQU3F71", "999001", "nao_entregue", "teste")]
        excecoes = [("2026-09-24", "RQU3F71", "999001", "falha conhecida de teste", "2026-09-25")]
        codigo, saida = self._rodar(xlsx_24, casos, excecoes)
        self.assertEqual(codigo, 0, saida)
        self.assertIn("conhecida", saida)

    def test_dia_extra_via_flag(self):
        """--dia AAAA-MM-DD=arquivo.xlsx deve funcionar junto com os 3
        posicionais antigos, cobrindo um 4o dia (ex.: 25/09)."""
        xlsx_24 = self.xlsx_vazio
        xlsx_25 = self.tmp / "dia25.xlsx"
        _escrever_xlsx_kpi(
            xlsx_25,
            {
                "RQV9D97": [
                    (
                        "1",
                        "2390611",
                        "CLIENTE Z",
                        "ENDERECO Z",
                        "08:50",
                        "09:13",
                        "0h23min",
                        "ENTREGUE - PARADA PROXIMA (500-800m) MAS DENTRO DA ROTA",
                        "",
                        "",
                        "Nao esteve no local",
                        700,
                    )
                ]
            },
        )
        caminho_casos = self.tmp / "casos.csv"
        caminho_excecoes = self.tmp / "excecoes.csv"
        _escrever_csv_casos(
            caminho_casos,
            [("2026-09-25", "RQV9D97", "2390611", "nao_entregue", "teste")],
        )
        _escrever_csv_excecoes(caminho_excecoes, [])

        argv_original = sys.argv
        stdout_original = sys.stdout
        import io

        buffer = io.StringIO()
        sys.argv = [
            "verificar-kpi-gabaritos.py",
            str(self.xlsx_vazio),
            str(self.xlsx_vazio),
            str(xlsx_24),
            "--casos",
            str(caminho_casos),
            "--excecoes",
            str(caminho_excecoes),
            "--dia",
            f"2026-09-25={xlsx_25}",
        ]
        try:
            sys.stdout = buffer
            codigo = verificar_kpi_gabaritos.main()
        finally:
            sys.argv = argv_original
            sys.stdout = stdout_original

        self.assertEqual(codigo, 1, buffer.getvalue())
        self.assertIn("FALHA CRITICA", buffer.getvalue())
        self.assertIn("2390611", buffer.getvalue())

    def test_entregue_conta_acerto(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "RQU3F71": [
                    (
                        "1",
                        "999002",
                        "CLIENTE Y",
                        "ENDERECO Y",
                        "11:00",
                        "11:10",
                        "0h10min",
                        "ENTREGUE",
                        "",
                        "",
                        "PARADA NO ENDEREÇO",
                        10,
                    )
                ]
            },
        )
        casos = [("2026-09-24", "RQU3F71", "999002", "entregue", "teste")]
        codigo, saida = self._rodar(xlsx_24, casos)
        self.assertEqual(codigo, 0, saida)
        self.assertIn("1/1", saida)
        self.assertIn("100.0%", saida)

    # Task 3 (plano 2026-09-26): rodizio de carga inteira sai "ROTA EXECUTADA
    # POR OUTRA PLACA (X)" -- nao comeca com "ENTREGUE", mas CONFIANÇA=
    # CONFIRMADA quando a coluna existe. Precisa contar como "entregue"
    # (acerto), igual qualquer outro status confirmado.
    def test_rota_executada_por_outra_placa_conta_como_entregue(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "TOS1H26": [
                    (
                        "1",
                        "999003",
                        "CLIENTE W",
                        "ENDERECO W",
                        "10:00",
                        "10:12",
                        "0h12min",
                        "ROTA EXECUTADA POR OUTRA PLACA (TOS1H26)",
                        "",
                        "",
                        "ROTA EXECUTADA POR OUTRA PLACA",
                        30,
                        "Rota executada pela TOS1H26 — parada de 12 min a 30 m",
                        "CONFIRMADA",
                    )
                ]
            },
            com_confianca=True,
        )
        casos = [("2026-09-24", "TOS1H26", "999003", "entregue", "teste")]
        codigo, saida = self._rodar(xlsx_24, casos)
        self.assertEqual(codigo, 0, saida)
        self.assertIn("1/1", saida)
        self.assertIn("100.0%", saida)

    # "nao_entregue" continua falhando para QUALQUER confirmado (rodizio
    # inclusive) -- CONFIANÇA=CONFIRMADA e' o mesmo veredito que "ENTREGUE",
    # so' com rotulo de texto diferente.
    def test_nao_entregue_com_rota_executada_por_outra_placa_ainda_falha(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "TOS1H26": [
                    (
                        "1",
                        "999004",
                        "CLIENTE V",
                        "ENDERECO V",
                        "10:00",
                        "10:12",
                        "0h12min",
                        "ROTA EXECUTADA POR OUTRA PLACA (TOS1H26)",
                        "",
                        "",
                        "ROTA EXECUTADA POR OUTRA PLACA",
                        30,
                        "Rota executada pela TOS1H26 — parada de 12 min a 30 m",
                        "CONFIRMADA",
                    )
                ]
            },
            com_confianca=True,
        )
        casos = [("2026-09-24", "TOS1H26", "999004", "nao_entregue", "teste")]
        codigo, saida = self._rodar(xlsx_24, casos)
        self.assertEqual(codigo, 1, saida)
        self.assertIn("FALHA CRITICA", saida)
        self.assertIn("999004", saida)

    # Fallback: xlsx SEM coluna CONFIANÇA (formato antigo) continua usando so'
    # o prefixo "ENTREGUE" -- "ROTA EXECUTADA POR OUTRA PLACA" sem a coluna
    # nao conta como entregue (comportamento de antes desta task, nunca
    # quebra quem regenerar um xlsx antigo).
    def test_rota_executada_por_outra_placa_sem_coluna_confianca_nao_conta(self):
        xlsx_24 = self.tmp / "dia24.xlsx"
        _escrever_xlsx_kpi(
            xlsx_24,
            {
                "TOS1H26": [
                    (
                        "1",
                        "999005",
                        "CLIENTE U",
                        "ENDERECO U",
                        "10:00",
                        "10:12",
                        "0h12min",
                        "ROTA EXECUTADA POR OUTRA PLACA (TOS1H26)",
                        "",
                        "",
                        "ROTA EXECUTADA POR OUTRA PLACA",
                        30,
                    )
                ]
            },
        )
        casos = [("2026-09-24", "TOS1H26", "999005", "entregue", "teste")]
        codigo, saida = self._rodar(xlsx_24, casos)
        self.assertEqual(codigo, 0, saida)
        self.assertIn("0/1", saida)
        self.assertIn("0.0%", saida)


if __name__ == "__main__":
    unittest.main()
