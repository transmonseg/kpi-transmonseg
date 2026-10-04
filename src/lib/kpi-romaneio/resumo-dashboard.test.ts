import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { minutosDeDuracao, categoriaPendencia, extrairResumoKpiXlsx } from './resumo-dashboard'

describe('resumo do dashboard', () => {
  it('converte duracao do relatorio em minutos', () => {
    expect(minutosDeDuracao('10h38min')).toBe(638)
    expect(minutosDeDuracao('0h22min')).toBe(22)
    expect(minutosDeDuracao('')).toBeNull()
  })

  it('agrupa os rotulos de pendencia', () => {
    expect(categoriaPendencia('CADASTRO DO CLIENTE NA UNITRAC DIVERGE DO ENDEREÇO DO ROMANEIO (5,8 km) - CONFERIR CADASTRO')).toBe('Cadastro divergente')
    expect(categoriaPendencia('PAROU NO ENDEREÇO JUNTO COM OUTRO CLIENTE DA MESMA PLACA (23 MIN) - CONFERIR')).toBe('Passou sem registrar')
    expect(categoriaPendencia('SEM RASTREADOR - VEÍCULO SEM RASTREAMENTO NO DIA - NÃO CONTABILIZADO')).toBe('Sem rastreador')
    expect(categoriaPendencia('SEM CONFIRMAÇÃO')).toBe('Sem confirmação')
    expect(categoriaPendencia('AGUARDANDO - ROTA EM ANDAMENTO, DIA AINDA NÃO FINALIZADO')).toBe('Aguardando fim da rota')
    expect(categoriaPendencia('PARADA COMPARTILHADA - REVISAR')).toBe('Parada compartilhada (revisar)')
    expect(categoriaPendencia('VEÍCULO NÃO SAIU DA BASE')).toBe('Não saiu da base')
    expect(categoriaPendencia('COORDENADA APROXIMADA (RUA SEM NÚMERO) - CONFERIR')).toBe('Coordenada imprecisa')
    expect(categoriaPendencia('ENDEREÇO NÃO LOCALIZADO')).toBe('Endereço não localizado')
  })

  it('le a planilha: taxa, cargas com KM decimal e pendencias por motivo', async () => {
    const wb = new ExcelJS.Workbook()
    const p = wb.addWorksheet('KPI 2026-10-02')
    p.addRow(['RELATÓRIO KPI - NUTRY MAX'])
    p.addRow(['CARGA', 'PLACA', 'DESTINO', 'MOTORISTA', 'AJUDANTE 1', 'AJUDANTE 2', 'PESO (KG)', 'CLIENTES PLANEJADOS', 'NF PLANEJADO', 'NF CONFIRMADAS', 'PARADAS FORA DA BASE', 'KM PERCORRIDO', 'SAÍDA CD', 'CHEGADA CD', 'TEMPO OPERAÇÃO', 'TEMPO MÉDIO POR ENTREGA'])
    p.addRow(['99176', 'RQV6I51', 'NATIVIDADE', 'JOSE', '', '', 2252, 25, 31, 30, 22, 310.2, '07:18', '17:56', '10h38min', '0h22min'])
    p.addRow(['TAXA DE CONFIRMAÇÃO: 96,8% (30 de 31 NFs; 2 sem rastreador fora da conta)    |    TAXA APÓS CONFERÊNCIA DA OPERAÇÃO: 96,8% (30 de 31 NFs; 2 fora da conta)'])
    const a = wb.addWorksheet('RQV6I51')
    a.addRow(['RELATÓRIO']); a.addRow(['MOTORISTA']); a.addRow(['CARGA', 'NF', 'CLIENTE', 'ENDEREÇO', 'CHEGADA', 'SAÍDA', 'TEMPO', 'STATUS'])
    a.addRow(['99176', '1', 'A', 'X', '09:36', '10:16', '0h39min', 'ENTREGUE'])
    a.addRow(['99176', '2', 'B', 'Y', '', '', '', 'NÃO FOI AO CLIENTE (caminhão não esteve na região)'])
    wb.addWorksheet('Avisos').addRow(['CARGA', 'PLACA', 'PROBLEMA'])
    const buf = await wb.xlsx.writeBuffer()

    const r = await extrairResumoKpiXlsx(buf)
    expect(r.taxa).toBe(96.8)
    expect(r.entregues).toBe(30)
    expect(r.nfsNaConta).toBe(31)
    expect(r.pendentes).toBe(1)
    expect(r.foraDaConta).toBe(2)
    expect(r.cargas).toHaveLength(1)
    expect(r.cargas[0].km).toBe(310.2)
    expect(r.cargas[0].tempoOperacaoMin).toBe(638)
    expect(r.motivos).toEqual({ 'Não foi ao cliente': 1 })
  })
})
