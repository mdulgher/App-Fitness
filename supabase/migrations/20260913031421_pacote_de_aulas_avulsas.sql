-- Pagamento avulso por aula, pré-pago: o aluno compra um pacote e vai
-- consumindo. Convive com a mensalidade; cada aluno é de um jeito só.
alter table public.students
  add column if not exists billing_type text not null default 'monthly',
  add column if not exists class_fee numeric(10,2);

alter table public.students drop constraint if exists students_billing_type_check;
alter table public.students add constraint students_billing_type_check
  check (billing_type in ('monthly', 'package'));

-- A aula presencial NÃO ganha tabela própria: ela é uma linha de frequência
-- como qualquer treino, com `workout_day_id` nulo. Assim ela conta na
-- frequência do aluno (ela é um treino de verdade) e não existe um segundo
-- lugar onde "o aluno treinou" possa divergir do primeiro.
--
-- O índice único (student_id, date, workout_day_id) NULLS NOT DISTINCT já
-- garante uma aula presencial por dia, e nunca colide com o treino que o aluno
-- marca sozinho, que sempre tem workout_day_id preenchido.
alter table public.attendance
  add column if not exists in_person boolean not null default false;

-- Aula presencial é aula paga: quem marca é só o professor. O aluno continua
-- registrando o treino que faz sozinho, mas não consegue criar nem alterar uma
-- linha presencial — nem para se dar uma aula, nem para apagar uma que teve.
drop policy if exists "aluno registra o proprio treino" on public.attendance;
create policy "aluno registra o proprio treino"
  on public.attendance for insert to authenticated
  with check (is_trainer() or (student_id = auth.uid() and in_person = false));

drop policy if exists "aluno conclui o proprio treino" on public.attendance;
create policy "aluno conclui o proprio treino"
  on public.attendance for update to authenticated
  using (is_trainer() or (student_id = auth.uid() and in_person = false))
  with check (is_trainer() or (student_id = auth.uid() and in_person = false));

create table if not exists public.class_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  classes_total integer not null check (classes_total > 0),
  price numeric(10,2) not null check (price >= 0),
  purchased_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  payment_id uuid references public.payments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists class_packages_student_idx
  on public.class_packages (student_id, purchased_on desc);

alter table public.class_packages enable row level security;

drop policy if exists "aluno le os proprios pacotes" on public.class_packages;
create policy "aluno le os proprios pacotes"
  on public.class_packages for select to authenticated
  using (is_trainer() or student_id = auth.uid());

-- Vender pacote é ato do professor. O aluno vê o saldo, não o cria.
drop policy if exists "so o professor vende pacote" on public.class_packages;
create policy "so o professor vende pacote"
  on public.class_packages for insert to authenticated
  with check (is_trainer());

drop policy if exists "so o professor edita pacote" on public.class_packages;
create policy "so o professor edita pacote"
  on public.class_packages for update to authenticated
  using (is_trainer()) with check (is_trainer());

drop policy if exists "so o professor apaga pacote" on public.class_packages;
create policy "so o professor apaga pacote"
  on public.class_packages for delete to authenticated
  using (is_trainer());
