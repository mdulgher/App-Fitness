-- EXP-01 / M01 — estruturas administrativas aditivas.
--
-- Primeiro passo da expansão para vários professores. **Aditivo de propósito:**
-- nada aqui tira poder de ninguém nem muda policy. O isolamento de verdade vem
-- no M04; uma coluna `tenant_id` não isola nada sozinha, e o dossiê é explícito
-- ao dizer que tratá-la como isolamento é erro (`02` §8).
--
-- O que este arquivo faz: cria a identidade de carteira, marca o estado das
-- contas existentes e abre `tenant_id` (ainda nulo) nas tabelas de negócio.
-- O preenchimento é do M02 e as amarras são do M03.
--
-- ATENÇÃO à ordem: rodar M01 → M02 → M03 na mesma janela. Entre eles o banco
-- fica num estado intermediário válido mas incompleto.

-- ---------------------------------------------------------------------------
-- O tenant legado tem ID fixo neste arquivo, não gerado em tempo de execução.
-- Três razões: o replay num ambiente novo precisa dar o mesmo resultado; o
-- DEFAULT de compatibilidade abaixo exige um literal; e comparar ensaio com
-- produção fica possível. Qualquer carteira criada depois desta usa
-- `gen_random_uuid()` normalmente.
-- ---------------------------------------------------------------------------

-- ============================ estado da conta ==============================
-- Global, do admin/provisionamento. NÃO se confunde com `students.access_blocked`
-- (bloqueio operacional que o professor aplica) nem com `students.active`
-- (estado comercial). Os três são intenções diferentes e não se fundem.
alter table public.profiles
  add column if not exists account_status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_status_check') then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('pending','active','blocked'));
  end if;
end $$;

-- ======================== identidade de carteira ===========================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

-- Um professor por carteira e uma carteira por professor. O UNIQUE em
-- `tenant_id` é o que impede um segundo titular; o UNIQUE(tenant_id,id) existe
-- para as FKs compostas do M03 poderem apontar para cá.
create table if not exists public.trainers (
  id uuid primary key references public.profiles(id) on delete restrict,
  tenant_id uuid not null unique references public.tenants(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (tenant_id, id)
);

create table if not exists public.trainer_public_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 100),
  title text,
  bio text,
  contact text,
  link text,
  logo_path text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- ===================== operações e auditoria (internas) ====================
-- Nenhuma das duas é falada pelo navegador. RLS ligada e SEM policy = negado
-- para todo mundo que não seja service_role. O revoke é cinto e suspensório:
-- a linha de base do Supabase concede tudo em `public` por default privileges.
create table if not exists public.account_operations (
  id uuid primary key,
  actor_id uuid references public.profiles(id),
  tipo text not null,
  tenant_id uuid references public.tenants(id),
  payload_hash text,
  alvo_auth uuid,
  alvo_cadastro uuid,
  estado text not null default 'pendente' check (estado in ('pendente','concluida','falhou')),
  codigo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  ocorrido_em timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  tenant_id uuid references public.tenants(id),
  acao text not null,
  alvo text,
  resultado text,
  request_id uuid,
  mudancas jsonb
);

alter table public.tenants                 enable row level security;
alter table public.trainers                enable row level security;
alter table public.trainer_public_profiles enable row level security;
alter table public.account_operations      enable row level security;
alter table public.admin_audit_events      enable row level security;

revoke all on public.account_operations from anon, authenticated;
revoke all on public.admin_audit_events  from anon, authenticated;

-- ================= a carteira legada, com dado verificado ==================
-- O dossiê proíbe escolher "o primeiro trainer da lista" ou casar por nome.
-- Se o inventário não for inequívoco, a migration PARA — dado ambíguo é erro
-- controlado, não palpite silencioso (critério de aceite do EXP-01).
do $$
declare
  v_qtd_trainer int;
  v_leo uuid;
  v_nome text;
begin
  select count(*) into v_qtd_trainer from public.profiles where role = 'trainer';
  if v_qtd_trainer <> 1 then
    raise exception 'M01 abortada: esperava exatamente 1 perfil com role=trainer, encontrei %. Backfill ambíguo exige decisão do dono.', v_qtd_trainer;
  end if;

  select id, full_name into v_leo, v_nome from public.profiles where role = 'trainer';

  insert into public.tenants (id, name, status, created_by)
  values ('87ea9c53-3e1c-41b2-8a30-4b53654179cb', coalesce(nullif(trim(v_nome), ''), 'Carteira legada'), 'active', v_leo)
  on conflict (id) do nothing;

  insert into public.trainers (id, tenant_id, created_by)
  values (v_leo, '87ea9c53-3e1c-41b2-8a30-4b53654179cb', v_leo)
  on conflict (id) do nothing;

  insert into public.trainer_public_profiles (tenant_id, display_name)
  values ('87ea9c53-3e1c-41b2-8a30-4b53654179cb', coalesce(nullif(trim(v_nome), ''), 'Professor'))
  on conflict (tenant_id) do nothing;
end $$;

-- ========================= estado das contas ===============================
-- `pending` é o default para conta NOVA em provisionamento. Aplicá-lo a todos
-- os alunos válidos os deixaria bloqueados depois do corte do M04 — o dossiê
-- avisa disso em M01. Ativa-se então quem o inventário validou: o professor, o
-- admin e todo perfil de aluno que tem cadastro em `students`.
--
-- Fica `pending` de propósito quem tem conta de acesso mas nenhum cadastro:
-- é o cadastro interrompido que o AT-06 aprendeu a retomar, e ele deve aparecer
-- no diagnóstico em vez de virar aluno ativo por descuido.
update public.profiles p
   set account_status = 'active'
 where p.role in ('trainer','admin')
    or exists (select 1 from public.students s where s.id = p.id);

-- ================== tenant_id nas tabelas de negócio =======================
-- Nulo agora; o M02 preenche e o M03 exige.
--
-- O DEFAULT é compatibilidade de curta validade, explicitamente permitida pelo
-- M01 do dossiê: entre esta migration e o M03 ainda existe app antigo gravando
-- sem saber o que é carteira, e linha nova sem tenant furaria o M02. Ele aponta
-- para o ÚNICO tenant legado e **é removido no M03**. Não existe fallback
-- legado depois da expansão.
do $$
declare
  t text;
begin
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','exercise_logs','student_exercises','notes','payments',
    'class_packages','sale_requests'
  ] loop
    execute format(
      'alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) default %L',
      t, '87ea9c53-3e1c-41b2-8a30-4b53654179cb'
    );
  end loop;
end $$;

-- `app_errors` é diferente: erro de admin ou de partida pode não ter carteira
-- verificável, e atribuir arbitrariamente seria inventar origem. Nullable, e
-- continua assim depois do M03.
alter table public.app_errors add column if not exists tenant_id uuid references public.tenants(id);
