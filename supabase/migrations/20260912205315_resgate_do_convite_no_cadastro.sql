-- O cadastro passa a resgatar o convite: se o email e o codigo informados
-- baterem com um convite aberto, o registro de aluno nasce ja com os dados que
-- o professor preencheu. Sem convite valido, cria-se apenas o perfil — a conta
-- existe mas nao esta vinculada, e o app diz isso em vez de falhar em silencio.
--
-- Continua valendo: o papel e sempre 'student'. Nao existe caminho de cadastro
-- que produza um professor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  codigo   text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
  convite  public.student_invites%rowtype;
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

  if codigo is null then
    return new;
  end if;

  select * into convite from public.student_invites
   where upper(code) = upper(codigo)
     and lower(email) = lower(new.email)
     and used_at is null
     and expires_at > now()
   limit 1;

  if not found then
    return new;
  end if;

  update public.profiles
     set full_name = convite.full_name,
         phone     = coalesce(convite.phone, phone)
   where id = new.id;

  insert into public.students (
    id, birth_date, goal, health_restrictions, weekly_target, monthly_fee, due_day, active
  ) values (
    new.id, convite.birth_date, convite.goal, convite.health_restrictions,
    convite.weekly_target, convite.monthly_fee, convite.due_day, true
  );

  update public.student_invites
     set used_at = now(), student_id = new.id
   where id = convite.id;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated, public;