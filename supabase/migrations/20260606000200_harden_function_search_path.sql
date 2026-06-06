-- Fixa search_path = public nas funções (corrige lint function_search_path_mutable).
-- Todas referenciam objetos do schema public (incl. unaccent/pg_trgm), então public
-- mantém o comportamento e remove a janela de search_path injection.
alter function public.set_updated_at() set search_path = public;
alter function public.bump_review_version() set search_path = public;
alter function public.normaliza_placa(p text) set search_path = public;
alter function public.unaccent_imut(t text) set search_path = public;
alter function public.batch_trgm_lookup(p_names text[], p_threshold double precision) set search_path = public;
alter function public.find_similar_pending(p_name text, p_row_id uuid, p_threshold double precision) set search_path = public;
alter function public.bulk_approve_rows(p_ids uuid[], p_resolved_name text, p_expected_version integer) set search_path = public;
