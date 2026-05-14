import { Uploaders } from './uploaders'

export const metadata = { title: 'Novo KPI — Transmonseg' }

export default function KpiNovoPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Upload de relatórios</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Envie as escalas e o relatório Unitrac para gerar o KPI diário.
        </p>
      </div>
      <Uploaders />
    </div>
  )
}
