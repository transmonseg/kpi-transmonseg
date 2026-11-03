# Ajustes grupo KPI 03/11 — romaneio sem número de NF

Origem: grupo KPI AJUSTES 03/11 (Ana). Romaneio Nutry 03/11, carga 101465 placa RBI1E10:
27 clientes vieram como `/ 2081 - ESTRELA DOS PAGOS` (campo NF vazio). KPI e monitoramento
descartam a linha → KPI 1.901 x escala 1.930, monitoramento "Sem romaneio hoje" pra RBI-1E10.

## Tarefas
1. KPI `parse-romaneio.ts`: aceitar NF vazia; NF vira `SEMNF-<carga>-<codigoCliente>` (único por
   carga, nunca colide com NF real). Teste com o texto real do PDF de 03/11.
2. KPI `resumo-dashboard.ts`: aceitar NF `SEMNF-…` (hoje filtra `^\d+$`).
3. Ao vivo: aviso "romaneio sem número de NF: placa X, N clientes" pra operação saber.
4. Monitoramento `romaneio.ts`: mesmo id `SEMNF-…`; teste.
5. Espelhar nos TEMPs (KPI TEMP, MONITORAMENTO TEMP); suítes verdes; push nos 4.
6. Deploy (janela 21:30–23:45 BRT, salvo OK do dono) + reprocessar 03/11 no Ao vivo e no
   monitoramento com o PDF guardado no storage.
7. Porte Frio 26/10: parser novo já no ar (d3d347f); falta senha Ravex (dono) e o PDF.
