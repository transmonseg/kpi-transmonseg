// Loga no /painel com um usuário descartável e tira screenshot full-page.
// Sem MCP: dirige o Chrome headless via CDP usando WebSocket nativo do Node.
import { config } from 'dotenv'; config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const ORIGIN = process.env.PAINEL_ORIGIN || 'http://localhost:3100'
const PAINEL_PATH = process.env.PAINEL_PATH || '/painel'
const EMAIL = 'dash-preview@local.test'
const SENHA = 'Preview!2026xyz'
const OUT = process.env.OUT || 'C:/Users/media/Downloads/painel-preview.png'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1) usuário descartável ────────────────────────────────────────────────
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
let userId = null
{
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true })
  if (error && !/already|registered|exists/i.test(error.message)) throw error
  if (data?.user) userId = data.user.id
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
    userId = list?.users?.find((u) => u.email === EMAIL)?.id ?? null
  }
  console.log('user de teste:', EMAIL, userId ? '(ok)' : '(sem id)')
}

// ── 2) Chrome headless ─────────────────────────────────────────────────────
const profile = mkdtempSync(join(tmpdir(), 'painel-cdp-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1366,2000', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' })

async function browserWS() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch { /* ainda subindo */ }
    await sleep(250)
  }
  throw new Error('Chrome não abriu a porta de debug')
}

// cliente CDP minimalista (sessões flatten sobre 1 WebSocket)
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waits = new Map(); this.events = []
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.waits.has(m.id)) { const w = this.waits.get(m.id); this.waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result) }
      else if (m.method) this.events.push(m)
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((res, rej) => { this.waits.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
  }
}

function openWS(url) {
  return new Promise((res, rej) => { const ws = new WebSocket(url); ws.addEventListener('open', () => res(ws)); ws.addEventListener('error', rej) })
}

try {
  const bws = await openWS(await browserWS())
  const cdp = new CDP(bws)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const S = sessionId
  await cdp.send('Page.enable', {}, S)
  await cdp.send('Runtime.enable', {}, S)

  // emulação mobile opcional (MOBILE=1 → viewport de celular)
  if (process.env.MOBILE) {
    const mw = Number(process.env.MOBILE_W || 390)
    const mh = Number(process.env.MOBILE_H || 844)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: mw, height: mh, deviceScaleFactor: 2, mobile: true }, S)
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, S)
    console.log('emulação mobile:', mw, 'x', mh)
  }

  const evalJS = (expression, awaitPromise = false) =>
    cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, S).then((r) => r.result?.value)
  const goto = async (url) => { await cdp.send('Page.navigate', { url }, S); await sleep(1200) }

  // login
  await goto(`${ORIGIN}/login`)
  await evalJS(`try{localStorage.setItem('kpi-tutorial-v2','done')}catch(e){}`)
  await sleep(400)
  const filled = await evalJS(`(() => {
    const e = document.querySelector('input[name=email]');
    const s = document.querySelector('input[name=senha]') || document.querySelector('input[type=password]');
    const f = (e && e.form) || document.querySelector('form');
    if (!e || !s || !f) return 'no-form';
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; d.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    set(e, ${JSON.stringify(EMAIL)}); set(s, ${JSON.stringify(SENHA)});
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return 'ok';
  })()`)
  console.log('form:', filled)

  // espera ir pro /painel
  let url = ''
  for (let i = 0; i < 40; i++) { await sleep(400); url = await evalJS('location.href'); if (url && url.includes('/painel')) break }
  console.log('após login:', url)

  // garante painel + tour off, espera dados/charts
  await goto(`${ORIGIN}${PAINEL_PATH}`)
  await evalJS(`try{localStorage.setItem('kpi-tutorial-v2','done')}catch(e){}`)
  await goto(`${ORIGIN}${PAINEL_PATH}`)
  // espera o fetch /api/dashboard e os charts montarem
  for (let i = 0; i < 45; i++) {
    await sleep(600)
    const ready = await evalJS(`(() => {
      const t = document.body.innerText;
      if (t.includes('Não autenticado')) return false;
      // conteúdo carregado: gráfico/tabela (visão geral) OU faixas do painel do dia
      return !!document.querySelector('svg, table, ol') && (t.includes('Status do dia') || t.includes('Mix de status') || t.includes('Taxa de entrega') || t.includes('Rankings completos') || t.includes('Placas que mais param'));
    })()`)
    if (ready) break
  }
  await sleep(2000)
  // remove overlays do tour se existirem
  await evalJS(`document.querySelectorAll('.driver-overlay,.driver-popover,#driver-page-overlay,.driver-active-element').forEach(el=>el.remove())`)

  // clique opcional (valida interatividade: ⓘ explicações, etc.) + scroll até alvo
  if (process.env.PRE_CLICK) {
    const clicked = await evalJS(`(() => {
      const q = ${JSON.stringify(process.env.PRE_CLICK)};
      let el;
      if (q.startsWith('text:')) { const txt = q.slice(5); el = [...document.querySelectorAll('button,a,[role=button],[role=link]')].find(b => (b.textContent||'').trim().includes(txt)); }
      else { el = document.querySelector(q); }
      if (!el) return 'nao-achou';
      el.scrollIntoView({block:'center'}); el.click(); return 'ok';
    })()`)
    console.log('pre-click:', process.env.PRE_CLICK, '->', clicked)
    await sleep(Number(process.env.CLICK_WAIT) || 700)
    const abriu = await evalJS(`document.body.innerText.includes('Bem-vindo')`)
    console.log('tour abriu (passo 1):', abriu)
    if (process.env.ADVANCE_TO) {
      const alvo = process.env.ADVANCE_TO
      let achou = false
      for (let k = 0; k < 25; k++) {
        achou = await evalJS(`document.body.innerText.includes(${JSON.stringify(alvo)})`)
        if (achou) break
        await evalJS(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Próximo|Próxima tela/.test(x.textContent||'')); if (b) b.click(); return !!b; })()`)
        await sleep(560)
      }
      await sleep(500)
      console.log('chegou no passo alvo:', achou, '|', alvo)
    }
  }

  // clique secundário opcional (ex.: clicar numa linha de tabela e validar navegação)
  if (process.env.CLICK2) {
    const r = await evalJS(`(() => {
      const q = ${JSON.stringify(process.env.CLICK2)};
      let el;
      if (q.startsWith('text:')) { const txt = q.slice(5); el = [...document.querySelectorAll('*')].find(b => (b.textContent||'').trim().includes(txt) && (b.getAttribute('role')==='link' || b.tagName==='A')); }
      else { el = document.querySelector(q); }
      if (!el) return 'nao-achou';
      el.scrollIntoView({block:'center'}); el.click(); return 'ok';
    })()`)
    await sleep(Number(process.env.CLICK2_WAIT) || 1500)
    const dest = await evalJS('location.href')
    console.log('click2:', process.env.CLICK2, '->', r, '| url agora:', dest)
  }

  const title = await evalJS('document.title')
  const bodyLen = await evalJS('document.body.innerText.length')
  console.log('painel title:', title, '| texto chars:', bodyLen)

  // screenshot full-page
  const metrics = await cdp.send('Page.getLayoutMetrics', {}, S)
  const cs = metrics.cssContentSize || metrics.contentSize
  const width = Math.min(1366, Math.ceil(cs.width))
  const fullH = Math.ceil(cs.height)
  const scale = Number(process.env.SCALE || 1)
  const clipY = Number(process.env.CLIP_Y || 0)
  const height = process.env.CLIP_H ? Number(process.env.CLIP_H) : fullH
  console.log('content size:', width, 'x', fullH, '| capturando y=', clipY, 'h=', height, 'scale=', scale)
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: clipY, width, height, scale },
  }, S)
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('SCREENSHOT salvo em', OUT)
} finally {
  chrome.kill()
  if (userId) { try { await admin.auth.admin.deleteUser(userId); console.log('user de teste removido') } catch (e) { console.log('falha ao remover user:', e.message) } }
}
process.exit(0)
