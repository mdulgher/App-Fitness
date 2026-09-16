-- EXP-01 / M03 — integridade de carteira.
--
-- Fecha o EXP-01: chaves compostas, NOT NULL, imutabilidade e índices
-- tenant-first. Depois disso o banco **garante** que filho mora na carteira do
-- pai; antes, isso era só uma coluna preenchida com esperança.
--
-- ============ por que as FKs compostas entram SEM ON DELETE ================
--
-- O `02` §4 avisa: não criar `on delete set null` composto que tente anular um
-- `tenant_id` NOT NULL. `attendance.workout_day_id` e
-- `exercise_logs.workout_day_exercise_id` são `set null` hoje, e um composto
-- com a mesma ação anularia as duas colunas — estourando no NOT NULL.
--
-- O Postgres 15+ resolveria com `on delete set null (coluna)`, mas a versão de
-- produção não foi verificada (o ensaio roda 17.6), e o EXP-01 não é hora de
-- descobrir isso. Então: **as FKs simples existentes continuam mandando na
-- semântica de exclusão**, e as compostas entram só como asserção de
-- integridade, com `no action`. Quando a simples anula a coluna de ID, a
-- composta deixa de valer sozinha (`match simple` não exige par com nulo), e
-- quando ela cascateia, o filho já não existe na hora da checagem.
--
-- Resultado: INV-02 garantida sem tocar em nenhum comportamento de exclusão
-- que o AT-02 acabou de arrumar.

-- ================= UNIQUE(tenant_id,id) nos pais referenciados =============
do $$
declare t text;
begin
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','payments','class_packages'
  ] loop
    if not exists (select 1 from pg_constraint where conname = t || '_tenant_id_id_key') then
      execute format('alter table public.%I add constraint %I unique (tenant_id, id)', t, t || '_tenant_id_id_key');
    end if;
  end loop;
end $$;

-- ============================ NOT NULL =====================================
-- Só agora, depois de o M02 ter preenchido e validado. Ativar antes teria
-- quebrado a própria migration de backfill.
do $$
declare t text;
begin
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','exercise_logs','student_exercises','notes','payments',
    'class_packages','sale_requests'
  ] loop
    execute format('alter table public.%I alter column tenant_id set not null', t);
  end loop;
end $$;

-- O DEFAULT de compatibilidade NÃO sai aqui — ver a migration `m03b`, que é a
-- porta de corte e só pode ser aplicada depois que o cliente souber mandar
-- `tenant_id`. Removê-lo agora derrubaria todo insert do app atual.

-- ========================== FKs compostas ==================================
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('workout_plans',         'student_id',              'students'),
      ('workout_days',          'workout_plan_id',         'workout_plans'),
      ('workout_day_exercises', 'workout_day_id',          'workout_days'),
      ('workout_day_exercises', 'exercise_id',             'exercises'),
      ('attendance',            'student_id',              'students'),
      ('attendance',            'workout_day_id',          'workout_days'),
      ('exercise_logs',         'student_id',              'students'),
      ('exercise_logs',         'attendance_id',           'attendance'),
      ('exercise_logs',         'exercise_id',             'exercises'),
      ('exercise_logs',         'workout_day_exercise_id', 'workout_day_exercises'),
      ('student_exercises',     'student_id',              'students'),
      ('student_exercises',     'exercise_id',             'exercises'),
      ('notes',                 'student_id',              'students'),
      ('payments',              'student_id',              'students'),
      ('class_packages',        'student_id',              'students'),
      ('class_packages',        'payment_id',              'payments'),
      ('sale_requests',         'student_id',              'students'),
      ('sale_requests',         'package_id',              'class_packages'),
      ('sale_requests',         'payment_id',              'payments')
    ) as v(filho, coluna, pai)
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = format('%s_%s_mesma_carteira', r.filho, r.coluna)
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id, %I) references public.%I (tenant_id, id)',
        r.filho, format('%s_%s_mesma_carteira', r.filho, r.coluna), r.coluna, r.pai
      );
    end if;
  end loop;
end $$;

-- ===================== imutabilidade do vínculo ============================
-- INV-01 e INV-12: carteira de uma linha não muda, e não existe "transferir
-- por UPDATE". A allowlist da API ajuda, mas quem garante é o banco — o dossiê
-- é explícito em dizer que o trigger é a barreira efetiva, não a tela.
create or replace function public.impedir_troca_de_carteira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception using
      errcode = '42501',
      message = 'A carteira de um registro não muda. Não existe transferência entre professores.';
  end if;
  return new;
end;
$$;

revoke all on function public.impedir_troca_de_carteira() from public, anon;

do $$
declare t text;
begin
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','exercise_logs','student_exercises','notes','payments',
    'class_packages','sale_requests','trainer_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_carteira_imutavel', t);
    execute format(
      'create trigger %I before update of tenant_id on public.%I for each row execute function public.impedir_troca_de_carteira()',
      t || '_carteira_imutavel', t
    );
  end loop;
end $$;

-- O vínculo do professor com a carteira também não muda (INV-01).
drop trigger if exists trainers_carteira_imutavel on public.trainers;
create trigger trainers_carteira_imutavel
  before update of tenant_id on public.trainers
  for each row execute function public.impedir_troca_de_carteira();

-- ========================= índices tenant-first ============================
-- Compatíveis com os filtros reais das telas (`02` §7). Os índices antigos
-- continuam: eles servem às consultas por aluno, que não somem.
create index if not exists students_tenant_ativo_idx      on public.students (tenant_id, active, id);
create index if not exists attendance_tenant_aluno_idx    on public.attendance (tenant_id, student_id, date desc, id);
create index if not exists payments_tenant_mes_idx        on public.payments (tenant_id, reference_month desc, id);
create index if not exists exercises_tenant_nome_idx      on public.exercises (tenant_id, name, id);
create index if not exists exercise_logs_tenant_aluno_idx on public.exercise_logs (tenant_id, student_id, id);
create index if not exists workout_plans_tenant_idx       on public.workout_plans (tenant_id, student_id, id);
create index if not exists audit_tenant_data_idx          on public.admin_audit_events (tenant_id, ocorrido_em desc, id);
create index if not exists operacoes_tenant_data_idx      on public.account_operations (tenant_id, created_at desc, id);
