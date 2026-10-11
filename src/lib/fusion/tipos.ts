// src/lib/fusion/tipos.ts
export type RomaneioFusion = {
  t10_id: string; t05_nome: string; t06_placa: string; t06_descricao: string
  t10_carga_formada_erp: string; t10_destino: string
  peso_entregas: string; valor_entregas: string; qtd_entregas: string; qtd_clientes: string
}
export type EntregaFusionRaw = {
  t10_id: string; t32_id: string; t16_fantasia: string; t16_razSocial: string
  t32_seq_pedido_erp: string; t32_status: string
  t32_data_pedido?: string; t12_data_real_entrega?: string | null
  t32_cidade: string; t32_endereco: string; t32_valor: string; t22_nome?: string
  data_entrega: string | null; data_adiado: string | null; data_devolucao: string | null; data_chegada: string | null
}
