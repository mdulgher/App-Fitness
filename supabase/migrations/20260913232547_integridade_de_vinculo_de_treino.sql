-- SEC-01: a FK garante que a divisão existe; não que ela é DESTE aluno. A
-- policy conferia o dono da presença e `in_person`, e parava aí: dava para
-- inserir uma presença sua apontando para a divisão de outro aluno, e uma carga
-- sua apontando para a prescrição dele. As duas voltaram 201 na auditoria.
--
-- A regra é de relacionamento multinível, coisa que policy não expressa bem e
-- FK simples não alcança. Fica em trigger, e a policy continua respondendo por
-- "quem é o ator". `security invoker` de propósito: a consulta aos pais roda sob
-- a RLS de quem chamou, então uma linha de outro aluno fica invisível e a
-- checagem falha fechada, sem precisar de privilégio elevado.

create or replace function public.checar_vinculo_de_presenca()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dono uuid;
begin
  if new.workout_day_id is not null then
    select p.student_id into v_dono
      from public.workout_days d
      join public.workout_plans p on p.id = d.workout_plan_id
     where d.id = new.workout_day_id;

    if v_dono is null or v_dono <> new.student_id then
      raise exception using
        errcode = '42501',
        message = 'Esta divisão de treino não é deste aluno.';
    end if;
  end if;

  -- Autoria é do servidor, não do corpo da requisição: o aluno mandava
  -- `marked_by: 'trainer'` e o banco acreditava.
  if auth.uid() is not null then
    new.marked_by := case when public.is_trainer() then 'trainer' else 'student' end;
  end if;

  return new;
end;
$$;

create or replace function public.checar_vinculo_de_carga()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_aluno_da_presenca uuid;
  v_dia_da_presenca   uuid;
  v_dia_do_item       uuid;
  v_exercicio_do_item uuid;
begin
  select a.student_id, a.workout_day_id
    into v_aluno_da_presenca, v_dia_da_presenca
    from public.attendance a
   where a.id = new.attendance_id;

  if v_aluno_da_presenca is null or v_aluno_da_presenca <> new.student_id then
    raise exception using
      errcode = '42501',
      message = 'Esta carga não pertence à sessão informada.';
  end if;

  -- `workout_day_exercise_id` nulo é o caminho legítimo da lista pessoal e da
  -- aula presencial: ali não há item prescrito para conferir, e a checagem de
  -- dono acima já foi feita. Só o fluxo prescrito segue a cadeia inteira.
  if new.workout_day_exercise_id is not null then
    select wde.workout_day_id, wde.exercise_id
      into v_dia_do_item, v_exercicio_do_item
      from public.workout_day_exercises wde
     where wde.id = new.workout_day_exercise_id;

    if v_dia_do_item is null or v_dia_do_item is distinct from v_dia_da_presenca then
      raise exception using
        errcode = '42501',
        message = 'Este exercício não faz parte do treino desta sessão.';
    end if;

    if v_exercicio_do_item is distinct from new.exercise_id then
      raise exception using
        errcode = '23514',
        message = 'O exercício informado não é o que está prescrito neste item.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.checar_vinculo_de_presenca() from public, anon;
revoke all on function public.checar_vinculo_de_carga() from public, anon;

-- UPDATE também: sem isso, bastava inserir uma linha válida e trocar o ID depois.
drop trigger if exists attendance_confere_vinculo on public.attendance;
create trigger attendance_confere_vinculo
  before insert or update on public.attendance
  for each row execute function public.checar_vinculo_de_presenca();

drop trigger if exists exercise_logs_confere_vinculo on public.exercise_logs;
create trigger exercise_logs_confere_vinculo
  before insert or update on public.exercise_logs
  for each row execute function public.checar_vinculo_de_carga();
