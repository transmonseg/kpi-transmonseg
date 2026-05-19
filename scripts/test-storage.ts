import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const svc = createClient(
  'https://luhwpsckvbctxynifryk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1aHdwc2NrdmJjdHh5bmlmcnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwMzE0MSwiZXhwIjoyMDk0Mjc5MTQxfQ.t4R0Rxs4l9VH6YoR-8aE6Bno7hRr86m6FQq35CaD6bQ'
)

;(async () => {
  // Listar buckets
  const { data: buckets, error: buckErr } = await svc.storage.listBuckets()
  if (buckErr) { console.log('ERRO listBuckets:', buckErr.message); return }
  console.log('Buckets:', buckets?.map(b => `${b.id} (public=${b.public})`).join(', '))

  // Tentar upload de arquivo teste no bucket escalas-raw
  const testBuf = Buffer.from('teste,arquivo,xlsx')
  const { data: up, error: upErr } = await svc.storage
    .from('escalas-raw')
    .upload('test/test-upload.txt', testBuf, { contentType: 'text/plain', upsert: true })

  if (upErr) console.log('ERRO storage upload:', upErr.message)
  else {
    console.log('Storage upload OK:', up.path)
    // Limpar
    await svc.storage.from('escalas-raw').remove(['test/test-upload.txt'])
    console.log('Arquivo de teste removido')
  }

  // Listar arquivos na pasta 2026-05-14
  const { data: files, error: listErr } = await svc.storage
    .from('escalas-raw')
    .list('2026-05-14')
  if (listErr) console.log('ERRO list:', listErr.message)
  else console.log('Arquivos em 2026-05-14:', files?.length, 'arquivos')
})().catch(console.error)
