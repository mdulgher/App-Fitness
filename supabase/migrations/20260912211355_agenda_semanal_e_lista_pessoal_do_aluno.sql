-- Agenda da divisão de treino: em quais dias da semana ela acontece.
-- 1 = segunda … 7 = domingo. A frequência ("vezes na semana") é a contagem
-- destes dias, então ela nunca diverge do que está marcado no calendário.
alter table public.workout_days
  add column if not exists weekdays smallint[] not null default '{}';

alter table public.workout_days
  drop constraint if exists workout_days_weekdays_validos;
alter table public.workout_days
  add constraint workout_days_weekdays_validos
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]);

-- Lista pessoal do aluno: separada da ficha do professor e escrita só por ele.
-- Os exercícios ainda vêm da biblioteca (FK), então continua sendo uma lista
-- fechada — o aluno escolhe entre os exercícios do professor, não inventa.
create table if not exists public.student_exercises (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  notes text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (student_id, exercise_id)
);

alter table public.student_exercises enable row level security;

drop policy if exists "aluno le a propria lista, professor le todas" on public.student_exercises;
create policy "aluno le a propria lista, professor le todas"
  on public.student_exercises for select
  using (is_trainer() or student_id = auth.uid());

-- Escrita só do dono: nem o professor mexe na lista pessoal do aluno, senão
-- ela deixa de ser "a lista dele".
drop policy if exists "aluno monta a propria lista" on public.student_exercises;
create policy "aluno monta a propria lista"
  on public.student_exercises for insert
  with check (student_id = auth.uid());

drop policy if exists "aluno edita a propria lista" on public.student_exercises;
create policy "aluno edita a propria lista"
  on public.student_exercises for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "aluno remove da propria lista" on public.student_exercises;
create policy "aluno remove da propria lista"
  on public.student_exercises for delete
  using (student_id = auth.uid());

create index if not exists student_exercises_student_idx
  on public.student_exercises (student_id, order_index);