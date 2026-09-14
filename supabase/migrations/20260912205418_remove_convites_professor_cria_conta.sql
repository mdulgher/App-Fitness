-- O professor passa a criar a conta do aluno diretamente, por Edge Function
-- com a chave service_role (que fica no servidor, nunca no navegador). O fluxo
-- de convite deixa de existir.

drop table if exists public.student_invites cascade;
drop function if exists public.gerar_codigo_convite();

-- Volta a versao simples: cria o perfil, sempre como aluno. O registro em
-- students e criado pela Edge Function, que sabe os dados que o professor
-- preencheu.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'student',
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;