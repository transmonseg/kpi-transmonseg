import { createClient } from '@supabase/supabase-js'
const svc = createClient(
  'https://luhwpsckvbctxynifryk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'
);

(async () => {
  const { data, error } = await svc.from('escala_uploads').select('*').limit(1)
  if (error) console.log('ERRO:', error.message)
  else console.log('Colunas escala_uploads:', Object.keys(data?.[0] ?? {}))

  // Test insert with nome_arquivo
  const { error: e2 } = await svc.from('escala_uploads').insert({
    data_escala: '2026-01-01',
    tipo: 'TEST_SCHEMA',
    arquivo_path: 'test/test.xlsx',
    nome_arquivo: 'test.xlsx',
    qtd_linhas: 0,
    status: 'processado',
    uploaded_by: 'c76b6f16-a988-480b-84e9-3c2e9038559a',
  })
  if (e2) console.log('ERRO insert com nome_arquivo:', e2.message, e2.details, e2.code)
  else {
    console.log('OK - nome_arquivo aceita')
    await svc.from('escala_uploads').delete().eq('data_escala', '2026-01-01').eq('tipo', 'TEST_SCHEMA')
  }
})().catch(console.error)
