-- Permite que usuarios autenticados facam upload nos buckets de escala e unitrac.
-- Sem essa policy, o cliente browser recebe 403 (RLS blocks INSERT on storage.objects).
-- O service role continua bypassando RLS para downloads e deletes internos.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'escalas_raw_authenticated_insert' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "escalas_raw_authenticated_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'escalas-raw');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'escalas_raw_authenticated_update' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "escalas_raw_authenticated_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'escalas-raw');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'unitrac_raw_authenticated_insert' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "unitrac_raw_authenticated_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'unitrac-raw');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'unitrac_raw_authenticated_update' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "unitrac_raw_authenticated_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'unitrac-raw');
  END IF;
END $$;
