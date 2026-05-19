-- Permite que usuários autenticados façam upload nos buckets de escala e unitrac.
-- Sem essa policy, o cliente browser recebe 403 (RLS blocks INSERT on storage.objects).
-- O service role continua bypassando RLS para downloads e deletes internos.

CREATE POLICY "escalas_raw_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'escalas-raw');

CREATE POLICY "escalas_raw_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'escalas-raw');

CREATE POLICY "unitrac_raw_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'unitrac-raw');

CREATE POLICY "unitrac_raw_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'unitrac-raw');
