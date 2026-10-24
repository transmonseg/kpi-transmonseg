// F3-04 (ACH-10) / F3-R07: gerar de novo um dia ja' fechado (fechamento das
// 00:30 ou geracao completa) exige motivo -- 20/10 teve 4 versoes e 21/10
// cinco, sem dizer por que. 428 = a tela abre o campo "Motivo" e reenvia.
// Vale para a Nutry e, desde o F3-01 (fechamento da RQ no Dashboard), para a RQ.
import { NextResponse } from 'next/server'
import { hojeBR } from '@/lib/data-br'
import { diaJaFechado, motivoValido, MOTIVO_MINIMO } from './versao-oficial'
import { fmtTaxa } from './fechamento-dashboard'

export async function motivoDoDiaFechado(cliente: 'nutrimax' | 'rioquality', data: string, form: FormData): Promise<{ motivo: string | null } | NextResponse> {
  const { fechado, fechamento, falhaLeitura } = await diaJaFechado(cliente, data, hojeBR())
  if (!fechado) return { motivo: null }
  const motivo = motivoValido(form.get('motivo'))
  if (motivo) return { motivo }
  const br = data.split('-').reverse().join('/')
  if (falhaLeitura) return new NextResponse(`Não consegui conferir se o KPI de ${br} já está fechado. Escreva o motivo para gerar de novo (pelo menos ${MOTIVO_MINIMO} letras).`, { status: 428 })
  const oficial = fechamento?.resumo.taxa != null ? ` (fechamento oficial: ${fmtTaxa(fechamento.resumo.taxa)})` : ''
  return new NextResponse(`O KPI de ${br} já está fechado${oficial}. Escreva o motivo para gerar de novo (pelo menos ${MOTIVO_MINIMO} letras).`, { status: 428 })
}

export const comMotivo = <R extends object>(resumo: R | null, motivo: string | null): R | null =>
  resumo && motivo ? { ...resumo, motivoRegeracao: motivo } : resumo
