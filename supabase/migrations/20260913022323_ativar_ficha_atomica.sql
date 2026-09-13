-- A chamada inteira roda em uma transação. Com SECURITY INVOKER, as políticas
-- RLS do usuário autenticado continuam valendo para leitura e atualização.
create or replace function public.ativar_ficha(p_ficha_id uuid)
returns public.workout_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  ficha public.workout_plans;
begin
  select * into ficha
  from public.workout_plans
  where id = p_ficha_id;

  if not found then
    raise exception 'Ficha não encontrada.';
  end if;

  update public.workout_plans
  set active = (id = p_ficha_id)
  where student_id = ficha.student_id
    and active is distinct from (id = p_ficha_id);

  select * into ficha
  from public.workout_plans
  where id = p_ficha_id;
  return ficha;
end;
$$;

revoke all on function public.ativar_ficha(uuid) from public, anon;
grant execute on function public.ativar_ficha(uuid) to authenticated;
