-- SEC-12: "desativar aluno" fazia uma coisa só — mudava `students.active`, que
-- tira o aluno da lista e da geração de mensalidade. O login continuava
-- funcionando e o aluno seguia lendo e escrevendo tudo. As duas intenções são
-- diferentes e agora são dois campos:
--
--   active         → situação comercial. Parar de cobrar não tira o acesso.
--   access_blocked → acesso. Bloquear não apaga nada nem cancela cobrança.
--
-- Quem decide qual usar é o professor; um não aciona o outro.
alter table public.students
  add column if not exists access_blocked boolean not null default false;

-- `security definer` pelo mesmo motivo de `is_trainer()`: esta função é usada
-- dentro da policy da própria `students`, e sob RLS ela se consultaria em
-- recursão infinita. O `search_path` vazio e os nomes qualificados são o que
-- torna isso seguro.
create or replace function public.acesso_bloqueado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
     where s.id = auth.uid() and s.access_blocked
  );
$$;

revoke all on function public.acesso_bloqueado() from public, anon;
grant execute on function public.acesso_bloqueado() to authenticated;

-- O bloqueio entra no ramo do ALUNO de cada policy. O ramo do professor fica
-- intacto de propósito: ele precisa continuar vendo o histórico e o financeiro
-- de quem bloqueou — bloquear não é apagar.
--
-- `profiles` fica de fora: sem ler o próprio nome, o app não consegue nem dizer
-- ao aluno por que ele não entra.

drop policy if exists "aluno le a propria frequencia" on public.attendance;
create policy "aluno le a propria frequencia"
  on public.attendance for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno registra o proprio treino" on public.attendance;
create policy "aluno registra o proprio treino"
  on public.attendance for insert to authenticated
  with check (public.is_trainer() or (student_id = auth.uid() and in_person = false and not public.acesso_bloqueado()));

drop policy if exists "aluno conclui o proprio treino" on public.attendance;
create policy "aluno conclui o proprio treino"
  on public.attendance for update to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and in_person = false and not public.acesso_bloqueado()))
  with check (public.is_trainer() or (student_id = auth.uid() and in_person = false and not public.acesso_bloqueado()));

drop policy if exists "aluno le as proprias cargas" on public.exercise_logs;
create policy "aluno le as proprias cargas"
  on public.exercise_logs for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno registra as proprias cargas" on public.exercise_logs;
create policy "aluno registra as proprias cargas"
  on public.exercise_logs for insert to authenticated
  with check (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno corrige as proprias cargas" on public.exercise_logs;
create policy "aluno corrige as proprias cargas"
  on public.exercise_logs for update to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()))
  with check (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno le os proprios recados" on public.notes;
create policy "aluno le os proprios recados"
  on public.notes for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno le o proprio financeiro" on public.payments;
create policy "aluno le o proprio financeiro"
  on public.payments for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno le os proprios pacotes" on public.class_packages;
create policy "aluno le os proprios pacotes"
  on public.class_packages for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno le as proprias fichas, professor le todas" on public.workout_plans;
create policy "aluno le as proprias fichas, professor le todas"
  on public.workout_plans for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno le as divisoes das proprias fichas" on public.workout_days;
create policy "aluno le as divisoes das proprias fichas"
  on public.workout_days for select to authenticated
  using (
    public.is_trainer() or (
      not public.acesso_bloqueado()
      and exists (
        select 1 from public.workout_plans p
         where p.id = workout_days.workout_plan_id and p.student_id = auth.uid()
      )
    )
  );

drop policy if exists "aluno le os exercicios das proprias fichas" on public.workout_day_exercises;
create policy "aluno le os exercicios das proprias fichas"
  on public.workout_day_exercises for select to authenticated
  using (
    public.is_trainer() or (
      not public.acesso_bloqueado()
      and exists (
        select 1 from public.workout_days d
          join public.workout_plans p on p.id = d.workout_plan_id
         where d.id = workout_day_exercises.workout_day_id and p.student_id = auth.uid()
      )
    )
  );

drop policy if exists "aluno le o proprio cadastro, professor le todos" on public.students;
create policy "aluno le o proprio cadastro, professor le todos"
  on public.students for select to authenticated
  using (public.is_trainer() or (id = auth.uid() and not public.acesso_bloqueado()));

-- De passagem: estas quatro estavam em `public`, que inclui `anon`. O filtro por
-- `auth.uid()` já segurava (anônimo não tem uid), mas a intenção fica explícita.
drop policy if exists "aluno le a propria lista, professor le todas" on public.student_exercises;
create policy "aluno le a propria lista, professor le todas"
  on public.student_exercises for select to authenticated
  using (public.is_trainer() or (student_id = auth.uid() and not public.acesso_bloqueado()));

drop policy if exists "aluno monta a propria lista" on public.student_exercises;
create policy "aluno monta a propria lista"
  on public.student_exercises for insert to authenticated
  with check (student_id = auth.uid() and not public.acesso_bloqueado());

drop policy if exists "aluno edita a propria lista" on public.student_exercises;
create policy "aluno edita a propria lista"
  on public.student_exercises for update to authenticated
  using (student_id = auth.uid() and not public.acesso_bloqueado())
  with check (student_id = auth.uid() and not public.acesso_bloqueado());

drop policy if exists "aluno remove da propria lista" on public.student_exercises;
create policy "aluno remove da propria lista"
  on public.student_exercises for delete to authenticated
  using (student_id = auth.uid() and not public.acesso_bloqueado());
