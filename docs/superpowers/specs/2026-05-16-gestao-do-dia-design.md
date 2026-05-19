# Gestão do Dia — Design Spec

> **Para agentes:** Use `superpowers:subagent-driven-development` para implementar.

**Objetivo:** Substituir a tela `/painel/kpi/novo` por um fluxo "Gestão do Dia" — uma única tela onde o usuário vê, envia e gerencia as escalas de um dia específico, e gera KPIs com seleção de redes.

**Contexto:** Érica (TRANSMONSEG/BENASSI) hoje faz Ctrl+C/Ctrl+V manual. O sistema precisa ser simples o suficiente para ela usar sozinha, visualmente premium para transmitir confiança.

---

## 1. Arquitetura de Telas

### Tela principal: `/painel/kpi/novo` (renomear para `/painel/kpi/dia`)

A rota `/painel/kpi/novo` passa a redirecionar para `/painel/kpi/dia` (ou pode ser reaproveitada). A tela tem três zonas:

1. **Header de data** — navegação entre dias
2. **Zona de escalas** — drop zone + lista de escalas salvas para o dia
3. **Zona de geração** — aparece quando há ao menos 1 escala salva; sempre pede Unitrac antes de gerar

### Navegação existente

O link "KPI > Novo upload" na nav lateral já aponta para `/painel/kpi/novo`. Basta que a rota nova funcione lá.

---

## 2. Header de Data

```
[ ← 15/05 ]   16/05/2026 — hoje   [ 17/05 → ]   [campo date input]
```

- Fundo escuro (`bg-slate-800`), texto branco
- Botões prev/next avançam 1 dia
- Input date permite ir para qualquer data
- "hoje" aparece só quando a data selecionada for hoje
- Estado da URL: `?data=2026-05-16` (query param, não obrigatório — default = hoje)

---

## 3. Zona de Escalas

### Drop Zone

- Borda dashed `border-brand-400`, fundo `bg-brand-50`
- Texto: "Arraste ou clique para enviar escalas" + "XLSX ou PDF — detecta o tipo automaticamente"
- Ao fazer drop/select de múltiplos arquivos: processa cada um em paralelo
- Detecção automática do tipo pelo conteúdo (via API `/api/escalas/upload`) — o usuário NÃO escolhe o tipo manualmente
- Durante o upload: cada arquivo mostra um item inline com spinner + "Detectando tipo..."
- Após sucesso: item passa para a lista "Escalas salvas" com animação fade-in
- Após erro: item mostra mensagem de erro inline com botão "Tentar novamente"

### Lista de Escalas Salvas

Busca do banco: `escala_uploads` filtrado por `data_escala = data_selecionada`.

Tipos possíveis: `GERAL`, `ZONA_SUL`, `PAX`, `ARMAZEM_GRAO`, `GUANABARA`

**Item enviado (fundo verde suave):**
```
[ badge GERAL ]  87 linhas • 3 sem placa            ✓ 14:32  [↺ reenviar]
```

**Item não enviado (fundo cinza, borda dashed):**
```
[ badge PAX ]  não enviada                           [ + Enviar ]
```

- Badge colorido por tipo (cada tipo tem uma cor distinta dentro da paleta)
- "↺ reenviar" abre o file picker para substituir — usa upsert (Cenário A já implementado)
- "Empty state" quando nenhuma escala foi enviada para o dia: texto "Nenhuma escala para este dia. Arraste os arquivos acima."
- Botão "+ Enviar" nos itens pendentes: abre file picker direto para aquele tipo (sem precisar arrastar)

---

## 4. Zona de Geração

Aparece **sempre** — mesmo que não haja escalas ainda (fica com os controles desabilitados e mensagem "envie ao menos uma escala para gerar").

### Seleção de Redes

Lista de checkboxes, um por tipo de escala **que já foi enviada** para o dia:

```
[✓] GERAL        87 linhas
[✓] ZONA SUL     62 linhas
[ ] PAX          escala não enviada  ← desabilitado, sem check
[✓] GUANABARA    31 rotas
```

- Redes com escala enviada: habilitadas, marcadas por padrão
- Redes sem escala: desabilitadas, sem check, texto explicativo
- "Marcar todas" / "Desmarcar todas" (links pequenos no header da seção)

### Unitrac — Campo Obrigatório

Sempre presente, nunca pré-preenchido (não fica salvo no sistema entre sessões):

**Estado vazio:**
```
🛰️  Relatório Unitrac — obrigatório para gerar
[ clique para anexar o Unitrac de hoje ]
XLSX ou PDF • não fica salvo no sistema
```

**Estado preenchido:**
```
🛰️  relatorio_GPS_16052026.pdf      [✕ remover]
```

### Botão de Gerar

- **Desabilitado** se: nenhuma rede selecionada OU Unitrac não anexado
- **Habilitado:** "⚡ Gerar 3 KPIs selecionados"
- Durante geração: spinner + "Gerando GERAL..." (mostra progresso por rede)
- Após conclusão: lista de KPIs gerados com links de download inline

### Resultado Inline

Após gerar, na mesma tela (não redireciona):

```
✓ GERAL gerado     [↓ Baixar XLSX]
✓ ZONA SUL gerado  [↓ Baixar XLSX]
✓ GUANABARA gerado [↓ Baixar XLSX]
[Gerar novamente]
```

---

## 5. Design Premium — Diretrizes

Este é um cliente da Triforce Auto. **Não usar identidade visual da Triforce (laranja, neo-brutalist).**
Usar e elevar os tokens já existentes no projeto (`brand-*`, `ink-*`, `surface-*`).

### Tipografia
- Trocar para `Geist` ou `Outfit` (adicionar via `next/font/google`)
- Labels de seção: sentence case, sem all-caps genérico
- Números de métricas: `font-variant-numeric: tabular-nums`

### Cores e Superfícies
- Header de data: `bg-slate-800` com texto branco — âncora visual forte no topo
- Escalas enviadas: fundo `#f0fdf4` (verde suave), borda `#bbf7d0`
- Escalas pendentes: fundo `#f8fafc`, borda dashed `#cbd5e1`
- Zona de geração: fundo âmbar suave `#fffbeb`, borda `#fde68a`
- Sombras: `box-shadow` com cor tintada (não `rgba(0,0,0,0.1)` genérico)

### Interatividade
- Todas as transições: `transition-all duration-200`
- Botão gerar: `hover:scale-[1.01]`, `active:scale-[0.98]`
- Drop zone: `hover:border-brand-500 hover:bg-brand-100`
- File items que surgem: `animate-fade-in` (opacity 0→1 + translateY 4px→0)
- Botão desabilitado: `opacity-40 cursor-not-allowed` (não `opacity-50`)
- Loading: skeleton loader na lista de escalas durante fetch inicial

### Estados que não podem faltar
- **Empty state** da lista de escalas (dia sem nenhuma escala)
- **Loading state** enquanto busca escalas do dia no banco
- **Error state** se a API falhar ao enviar um arquivo
- **Success state** com contagem de linhas após upload
- **Progresso de geração** por rede (não só spinner global)

---

## 6. Fluxo de API

### Busca de escalas do dia

`GET /api/escalas/dia?data=2026-05-16`

- Nova rota — retorna lista de `escala_uploads` para a data
- Response: `{ escalas: [{ tipo, qtd_linhas, qtd_orfas, uploaded_at, id }] }`

### Upload de escala com detecção automática

`POST /api/escalas/upload` — estender para aceitar `tipo: 'auto'`

Quando `tipo === 'auto'`, o servidor tenta cada parser na ordem `GERAL → ZONA_SUL → PAX → ARMAZEM_GRAO → GUANABARA` e usa o primeiro que retorna linhas > 0. Se nenhum funcionar, retorna 400 com mensagem "Não foi possível detectar o tipo da escala. Verifique o arquivo."

O frontend envia sempre `tipo: 'auto'` — nunca pergunta o tipo ao usuário.

### Unitrac — fluxo de upload para geração

O Unitrac continua sendo salvo internamente em `unitrac_uploads` + `unitrac_paradas` para o cruzamento de dados (isso não muda). A diferença é **apenas no UX**: a tela nunca mostra "já existe um Unitrac salvo para hoje" — sempre pede o arquivo na hora de gerar. Isso garante que Érica use o relatório correto do dia sem precisar verificar o que estava salvo.

Fluxo: ao clicar "Gerar", o frontend faz primeiro `POST /api/unitrac/upload` (já existente), espera confirmação, depois dispara `POST /api/kpi/gerar` para cada rede selecionada. Reutiliza APIs existentes sem mudança.

### Download de KPI

URLs de download já existem via Supabase Storage — apenas linkar os `download_url` retornados.

---

## 7. Estrutura de Arquivos

```
src/app/painel/kpi/
  dia/
    page.tsx          ← Server Component: busca escalas do dia, passa para DiaPage
    DiaPage.tsx       ← Client Component: toda a interatividade
    EscalaItem.tsx    ← Componente para cada linha da lista de escalas
    DropZone.tsx      ← Zona de drop com multi-file
    UnitracPicker.tsx ← Campo de Unitrac obrigatório
    GerarSection.tsx  ← Checkboxes + Unitrac + botão gerar + resultado inline
  novo/
    page.tsx          ← redirect para /painel/kpi/dia (1 linha)
```

Rota `/api/escalas/dia` nova:
```
src/app/api/escalas/dia/route.ts
```

---

## 8. O que NÃO muda

- Parsers de escala (todos funcionando)
- API `/api/escalas/upload` (já tem upsert, suporta XLSX e PDF)
- API `/api/unitrac/upload` (já funciona)
- API `/api/kpi/processar` e `/api/kpi/gerar` (usados internamente)
- Tabelas do banco (`escala_uploads`, `escala_linhas`, etc.)
- Fluxo de geração (processar → gerar XLSX)
- Autenticação

---

## 9. Critérios de Aceitação

- [ ] Carregar `/painel/kpi/dia` mostra escalas do dia atual
- [ ] Navegar para outro dia atualiza a lista
- [ ] Arrastar 3 arquivos juntos: faz upload dos 3 em paralelo, detecta tipo de cada um
- [ ] Upload de arquivo já enviado substitui sem perguntar (upsert)
- [ ] Clicar "Gerar" com Unitrac não anexado: botão desabilitado com tooltip claro
- [ ] Clicar "Gerar" com 2 redes selecionadas: gera 2 KPIs, links de download aparecem inline
- [ ] Erro de upload: mensagem inline no item, não quebra outros uploads em andamento
- [ ] Tela funciona no mobile (min 375px) — Érica pode usar do celular
