// Renderer — UI mínima. Toda a regra pesada roda no main (Node). Aqui só DOM + IPC.
const api = window.api

const state = { escalaPaths: [], unitracPaths: [] }

const $ = (id) => document.getElementById(id)

function baseName(p) {
  return p.split(/[\\/]/).pop()
}

function pintarArquivos() {
  $('files-escala').innerHTML = state.escalaPaths.length
    ? `<b>${state.escalaPaths.length}</b> escala(s): ${state.escalaPaths.map(baseName).join(', ')}`
    : 'Nenhuma escala selecionada.'
  $('files-unitrac').innerHTML = state.unitracPaths.length
    ? `<b>${state.unitracPaths.length}</b> Unitrac: ${state.unitracPaths.map(baseName).join(', ')}`
    : 'Nenhum Unitrac selecionado.'
  $('btn-gerar').disabled = !(state.escalaPaths.length && state.unitracPaths.length && $('data').value)
}

function classificar(paths) {
  // Heurística leve: escala normalmente é xlsx com "ESCALA" no nome; Unitrac tem
  // "relatorio"/"unitrac" ou é pdf. Mas o usuário escolhe explicitamente cada grupo,
  // então só guardamos o que ele apontou.
  return paths
}

$('btn-escala').onclick = async () => {
  const paths = await api.escolherArquivos()
  if (paths.length) { state.escalaPaths = classificar(paths); pintarArquivos() }
}
$('btn-unitrac').onclick = async () => {
  const paths = await api.escolherArquivos()
  if (paths.length) { state.unitracPaths = classificar(paths); pintarArquivos() }
}
$('data').onchange = pintarArquivos

$('btn-gerar').onclick = async () => {
  const btn = $('btn-gerar')
  btn.disabled = true
  $('msg').innerHTML = '<div class="msg muted">Gerando…</div>'
  $('resultado').innerHTML = ''
  const res = await api.gerar({
    escalaPaths: state.escalaPaths,
    unitracPaths: state.unitracPaths,
    data: $('data').value,
  })
  if (res.ok) {
    $('msg').innerHTML = `<div class="msg ok">✓ ${res.redes.length} rede(s) geradas e salvas em <b>${res.outDir}</b></div>`
    $('resultado').innerHTML = res.redes
      .map((r) => `<div class="rede"><span>${r.rede_nome}</span><span class="muted">${r.linhas} linha(s)</span></div>`)
      .join('')
    if (res.cadastro) pintarCadastro(res.cadastro)
    await atualizarFila()
  } else {
    $('msg').innerHTML = `<div class="msg err">✗ ${res.error}</div>`
  }
  pintarArquivos()
}

function pintarCadastro(c) {
  const quando = c.baixadoEm ? new Date(c.baixadoEm).toLocaleString('pt-BR') : 'nunca'
  $('cadastro-status').textContent = `cadastro: ${c.lojas} lojas · atualizado ${quando}`
}

async function atualizarFila() {
  const itens = await api.filaListar()
  if (!itens.length) { $('fila').innerHTML = '<li class="muted">Vazia.</li>'; return }
  $('fila').innerHTML = itens
    .map((i) => {
      const pill = i.status === 'enviado' ? '<span class="pill ok">enviado</span>' : '<span class="pill pend">pendente</span>'
      return `<li><span>${i.rede_nome} · ${i.data} · ${i.linhas} linha(s)</span>${pill}</li>`
    })
    .join('')
}

$('btn-sync').onclick = async () => {
  $('sync-msg').textContent = 'Sincronizando…'
  const r = await api.filaSincronizar()
  $('sync-msg').textContent = r.ok
    ? `✓ ${r.enviados} enviado(s), ${r.pendentes} pendente(s).`
    : `Não sincronizou: ${r.motivo} (${r.enviados} enviado(s))`
  await atualizarFila()
}

// Boot: data = hoje, status do cadastro e da fila.
;(async () => {
  const hoje = new Date()
  $('data').value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
  pintarArquivos()
  pintarCadastro(await api.cadastroStatus())
  await atualizarFila()
})()
