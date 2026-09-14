-- search_path fixo: sem isso, um schema malicioso no caminho de busca poderia
-- sequestrar o que a funcao resolve.
create or replace function public.hoje_br()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Funcao de gatilho: e disparada pelo banco no cadastro, nunca deve ser
-- chamavel pela API. Gatilhos nao dependem de EXECUTE do usuario.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Gatilho de evento do proprio Supabase: idem.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- is_trainer permanece executavel por quem esta logado DE PROPOSITO: as
-- politicas de RLS a chamam no contexto de quem consulta. Ela so revela se
-- voce mesmo e o professor, nada sobre terceiros. Mas ninguem deslogado
-- precisa dela.
revoke execute on function public.is_trainer() from anon, public;
grant execute on function public.is_trainer() to authenticated;