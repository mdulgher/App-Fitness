-- Papel 'admin': as mesmas permissões do professor, com identidade própria.
--
-- 29 políticas de RLS chamam is_trainer(). Criar um papel novo e escrever
-- políticas para ele seria reescrever as 29 e manter duas listas em sincronia
-- para sempre. Em vez disso, is_trainer() passa a responder "sim" também para
-- admin: toda política herda a mudança de uma vez só, e nenhum acesso que já
-- existia é retirado.
--
-- O nome da função continua is_trainer() de propósito: renomear obrigaria a
-- reescrever as mesmas 29 políticas sem ganho nenhum. Leia como "tem poderes de
-- professor", não como "é o professor".
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['trainer'::text, 'student'::text, 'admin'::text]));

create or replace function public.is_trainer()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('trainer', 'admin')
  );
$function$;

comment on function public.is_trainer() is
  'Tem poderes de professor: papel trainer ou admin. Usada por todas as políticas de RLS.';
