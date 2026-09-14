-- Leo Personal Trainning — papeis e regras de acesso

-- SECURITY DEFINER de proposito: le profiles ignorando RLS. Sem isso, uma
-- politica de profiles que consulta profiles entra em recursao infinita.
create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'trainer'
  );
$$;

-- Perfil criado automaticamente no cadastro, SEMPRE como aluno. Nao existe
-- caminho para alguem se cadastrar como professor: a promocao e manual, via
-- SQL. Sem isso, qualquer um viraria professor e abriria os dados e o
-- financeiro de todos.
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
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Toda tabela nasce com RLS ligado. O padrao e negar.
alter table public.profiles              enable row level security;
alter table public.students              enable row level security;
alter table public.student_invites       enable row level security;
alter table public.exercises             enable row level security;
alter table public.workout_plans         enable row level security;
alter table public.workout_days          enable row level security;
alter table public.workout_day_exercises enable row level security;
alter table public.attendance            enable row level security;
alter table public.exercise_logs         enable row level security;
alter table public.notes                 enable row level security;
alter table public.payments              enable row level security;

-- role fora do alcance de todo mundo pela API: permissao por COLUNA. Nem o
-- professor consegue promover alguem sem passar por SQL administrativo.
revoke update on public.profiles from authenticated;
grant update (full_name, email, phone, avatar_url) on public.profiles to authenticated;

-- ---------------- profiles ----------------
create policy "le o proprio perfil ou o professor le todos"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_trainer());

create policy "edita o proprio perfil ou o professor edita todos"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_trainer())
  with check (id = auth.uid() or public.is_trainer());

-- ---------------- students ----------------
create policy "aluno le o proprio cadastro, professor le todos"
  on public.students for select to authenticated
  using (id = auth.uid() or public.is_trainer());

create policy "so o professor cadastra alunos"
  on public.students for insert to authenticated
  with check (public.is_trainer());

create policy "so o professor edita alunos"
  on public.students for update to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

create policy "so o professor remove alunos"
  on public.students for delete to authenticated
  using (public.is_trainer());

-- ---------------- convites ----------------
create policy "convites so do professor"
  on public.student_invites for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

-- ---------------- exercicios ----------------
-- O aluno PRECISA ler todos: sem isso a ficha dele abre sem video, sem foto e
-- sem how-to. Ele le tudo, mas nao escreve nada.
create policy "todo usuario logado le a biblioteca"
  on public.exercises for select to authenticated
  using (true);

create policy "so o professor mantem a biblioteca"
  on public.exercises for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

-- ---------------- fichas ----------------
create policy "aluno le as proprias fichas, professor le todas"
  on public.workout_plans for select to authenticated
  using (public.is_trainer() or student_id = auth.uid());

create policy "so o professor monta fichas"
  on public.workout_plans for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

create policy "aluno le as divisoes das proprias fichas"
  on public.workout_days for select to authenticated
  using (
    public.is_trainer() or exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_id and p.student_id = auth.uid()
    )
  );

create policy "so o professor edita divisoes"
  on public.workout_days for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

create policy "aluno le os exercicios das proprias fichas"
  on public.workout_day_exercises for select to authenticated
  using (
    public.is_trainer() or exists (
      select 1 from public.workout_days d
      join public.workout_plans p on p.id = d.workout_plan_id
      where d.id = workout_day_id and p.student_id = auth.uid()
    )
  );

create policy "so o professor edita exercicios da ficha"
  on public.workout_day_exercises for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

-- ---------------- frequencia ----------------
create policy "aluno le a propria frequencia"
  on public.attendance for select to authenticated
  using (public.is_trainer() or student_id = auth.uid());

create policy "aluno registra o proprio treino"
  on public.attendance for insert to authenticated
  with check (public.is_trainer() or student_id = auth.uid());

create policy "aluno conclui o proprio treino"
  on public.attendance for update to authenticated
  using (public.is_trainer() or student_id = auth.uid())
  with check (public.is_trainer() or student_id = auth.uid());

create policy "so o professor apaga frequencia"
  on public.attendance for delete to authenticated
  using (public.is_trainer());

-- ---------------- cargas ----------------
create policy "aluno le as proprias cargas"
  on public.exercise_logs for select to authenticated
  using (public.is_trainer() or student_id = auth.uid());

create policy "aluno registra as proprias cargas"
  on public.exercise_logs for insert to authenticated
  with check (public.is_trainer() or student_id = auth.uid());

create policy "aluno corrige as proprias cargas"
  on public.exercise_logs for update to authenticated
  using (public.is_trainer() or student_id = auth.uid())
  with check (public.is_trainer() or student_id = auth.uid());

create policy "so o professor apaga cargas"
  on public.exercise_logs for delete to authenticated
  using (public.is_trainer());

-- ---------------- anotacoes ----------------
create policy "aluno le os proprios recados"
  on public.notes for select to authenticated
  using (public.is_trainer() or student_id = auth.uid());

create policy "so o professor escreve recados"
  on public.notes for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

-- ---------------- financeiro ----------------
-- O pedido original: visivel apenas ao aluno e ao professor.
create policy "aluno le o proprio financeiro"
  on public.payments for select to authenticated
  using (public.is_trainer() or student_id = auth.uid());

create policy "so o professor lanca e baixa cobrancas"
  on public.payments for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());