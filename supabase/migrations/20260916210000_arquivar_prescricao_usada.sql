-- AT-02: prescrição que já foi treinada se arquiva, não se apaga.
--
-- Dois defeitos provados no banco real em 16/09/2026, com dados fictícios
-- temporários e limpeza conferida:
--
-- 1. Excluir uma divisão que o aluno treinou era RECUSADO pelo banco. A FK de
--    `exercise_logs.workout_day_exercise_id` é `on delete set null`, e o índice
--    `exercise_logs_uma_por_serie` é `nulls not distinct`: duas cargas da mesma
--    sessão com o mesmo `set_number` viravam a mesma chave assim que os dois
--    itens prescritos saíam juntos. O erro que chegava à tela era
--    `duplicate key value violates unique constraint` — jargão de Postgres para
--    um professor de educação física. Duas divisões reais já estavam presas
--    nesse estado.
--
-- 2. Quando a exclusão passava, ela reescrevia a história. O `set null` é um
--    UPDATE, e o UPDATE dispara `checar_vinculo_de_presenca`, que regrava
--    `marked_by` conforme quem está logado. Sessão marcada pelo ALUNO passava a
--    constar como marcada pelo professor. Provado: antes `student`, depois
--    `trainer`.
--
-- A saída não é afrouxar o índice — ele existe para impedir a mesma série
-- registrada duas vezes. É parar de produzir o nulo: prescrição com histórico
-- ganha `archived_at`, some das telas e continua existindo para o histórico
-- apontar. De quebra, `historicoDeSessoes` passa a manter o rótulo da divisão
-- em vez de mostrar "sem divisão" depois de o professor reorganizar a ficha.

alter table public.workout_days add column if not exists archived_at timestamptz;
alter table public.workout_day_exercises add column if not exists archived_at timestamptz;

-- Rede de segurança do lado do servidor. O app arquiva em vez de excluir, mas
-- o app não é o único caminho: SQL no painel, uma tela futura ou um erro de
-- código chegariam ao mesmo `set null`. Aqui a recusa vem com frase legível.
--
-- `security invoker` de propósito, como nos triggers de vínculo: a consulta
-- roda sob a RLS de quem chamou. O professor enxerga as cargas e presenças dos
-- próprios alunos, então a checagem é real para ele; para quem não enxerga, o
-- pior caso é voltar ao comportamento antigo, nunca abrir acesso novo.
create or replace function public.impedir_exclusao_com_historico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'workout_day_exercises' then
    if exists (select 1 from public.exercise_logs l where l.workout_day_exercise_id = old.id) then
      raise exception using
        errcode = '23514',
        message = 'Este exercício já tem carga registrada pelo aluno. Arquive em vez de excluir.';
    end if;

  elsif tg_table_name = 'workout_days' then
    if exists (select 1 from public.attendance a where a.workout_day_id = old.id)
       or exists (
         select 1 from public.exercise_logs l
           join public.workout_day_exercises w on w.id = l.workout_day_exercise_id
          where w.workout_day_id = old.id
       ) then
      raise exception using
        errcode = '23514',
        message = 'Esta divisão já tem treino registrado. Arquive em vez de excluir.';
    end if;

  elsif tg_table_name = 'workout_plans' then
    if exists (
         select 1 from public.workout_days d
           join public.attendance a on a.workout_day_id = d.id
          where d.workout_plan_id = old.id
       )
       or exists (
         select 1 from public.workout_days d
           join public.workout_day_exercises w on w.workout_day_id = d.id
           join public.exercise_logs l on l.workout_day_exercise_id = w.id
          where d.workout_plan_id = old.id
       ) then
      raise exception using
        errcode = '23514',
        message = 'Esta ficha já tem treino registrado e faz parte do histórico do aluno. Ela fica como ficha anterior em vez de ser excluída.';
    end if;
  end if;

  return old;
end;
$$;

revoke all on function public.impedir_exclusao_com_historico() from public, anon;

drop trigger if exists workout_day_exercises_sem_exclusao_com_historico on public.workout_day_exercises;
create trigger workout_day_exercises_sem_exclusao_com_historico
  before delete on public.workout_day_exercises
  for each row execute function public.impedir_exclusao_com_historico();

drop trigger if exists workout_days_sem_exclusao_com_historico on public.workout_days;
create trigger workout_days_sem_exclusao_com_historico
  before delete on public.workout_days
  for each row execute function public.impedir_exclusao_com_historico();

drop trigger if exists workout_plans_sem_exclusao_com_historico on public.workout_plans;
create trigger workout_plans_sem_exclusao_com_historico
  before delete on public.workout_plans
  for each row execute function public.impedir_exclusao_com_historico();
