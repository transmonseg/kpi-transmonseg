import { FileArrowDown } from '@phosphor-icons/react/dist/ssr'

/** Item 1 (auditoria 01/10): baixa o xlsx guardado da geracao (o mesmo
 *  arquivo entregue na hora), sem regenerar. So' renderizado quando a
 *  geracao tem arquivo_storage_path. */
export function BaixarXlsxSalvo({ geracaoId }: { geracaoId: string }) {
  return (
    <a
      href={`/api/kpi/historico/${geracaoId}/xlsx`}
      download
      title="Baixar o arquivo gerado nesta data (sem regenerar)"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
    >
      <FileArrowDown size={12} weight="bold" />
      Baixar salvo
    </a>
  )
}
