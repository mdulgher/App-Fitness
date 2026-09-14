-- Leo Personal Trainning — schema inicial

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('trainer','student')),
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date,
  goal text,
  height_cm int,
  start_weight_kg numeric(5,2),
  health_restrictions text,
  weekly_target int not null default 3 check (weekly_target between 1 and 14),
  monthly_fee numeric(10,2) check (monthly_fee >= 0),
  due_day int check (due_day between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.student_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  email text not null,
  code text not null unique,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

-- Exercicio se arquiva, nunca se apaga: apagar o removeria de todas as fichas
-- antigas e levaria o historico de carga junto.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  equipment text,
  video_url text,
  photo_url text,
  how_to text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  is_template boolean not null default false,
  title text not null,
  description text,
  start_date date,
  end_date date,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint template_nao_tem_aluno check (
    (is_template and student_id is null) or (not is_template and student_id is not null)
  )
);

-- No maximo UMA ficha ativa por aluno; as antigas ficam como historico.
create unique index uma_ficha_ativa_por_aluno
  on public.workout_plans (student_id)
  where active and not is_template;

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  label text not null,
  order_index int not null default 0,
  weekday_suggestion text
);

create table public.workout_day_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  order_index int not null default 0,
  group_label text,
  sets int,
  reps text,
  rest_seconds int,
  load_notes text,
  trainer_notes text
);

-- Uma SESSAO de treino. So se registra treino feito: falta e a ausencia de
-- registro, nunca uma linha. Conta como presenca so quem tem completed_at.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  workout_day_id uuid references public.workout_days(id) on delete set null,
  date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  completed_at timestamptz,
  marked_by text not null default 'student' check (marked_by in ('student','trainer')),
  created_at timestamptz not null default now()
);

-- nulls not distinct: sem isso, sessao sem divisao poderia ser marcada N vezes.
create unique index attendance_uma_por_dia
  on public.attendance (student_id, date, workout_day_id) nulls not distinct;

-- exercise_id guardado alem de workout_day_exercise_id DE PROPOSITO: sem ele o
-- historico morre quando o professor troca a ficha, e "evolucao do supino nos
-- ultimos 6 meses" deixa de existir.
create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  workout_day_exercise_id uuid references public.workout_day_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  set_number int not null check (set_number > 0),
  weight_kg numeric(6,2) check (weight_kg >= 0),
  reps_done int check (reps_done >= 0),
  duration_seconds int check (duration_seconds >= 0),
  rpe int check (rpe between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

create unique index exercise_logs_uma_por_serie
  on public.exercise_logs (attendance_id, workout_day_exercise_id, set_number) nulls not distinct;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- O status NAO e coluna: e derivado (ver a view payments_view). Guardado,
-- "vencido" apodrece e uma cobranca vencida fica "pendente" para sempre.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  reference_month date not null,
  amount numeric(10,2) not null check (amount >= 0),
  due_date date not null,
  paid_date date,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  constraint referencia_e_dia_primeiro check (extract(day from reference_month) = 1),
  constraint cobranca_unica_por_mes unique (student_id, reference_month)
);

create index on public.workout_plans (student_id);
create index on public.workout_days (workout_plan_id, order_index);
create index on public.workout_day_exercises (workout_day_id, order_index);
create index on public.attendance (student_id, date desc);
create index on public.exercise_logs (student_id, exercise_id);
create index on public.exercise_logs (attendance_id);
create index on public.notes (student_id, created_at desc);
create index on public.payments (student_id, reference_month desc);