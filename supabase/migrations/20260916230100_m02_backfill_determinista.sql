-- EXP-01 / M02 — backfill determinístico da carteira legada.
--
-- Regra que manda aqui: **filho herda tenant do pai, nunca do operador da
-- migration.** Preencher com `auth.uid()` ou com uma constante em toda tabela
-- funcionaria hoje, com um professor só, e plantaria o erro que aparece no dia
-- em que existir o segundo — é exatamente o tipo de atalho que o `02` §8 lista
-- como "nunca aceito como isolamento".
--
-- O M01 deixou um DEFAULT de compatibilidade apontando para a carteira legada,
-- então as linhas de hoje já nasceram com tenant. Este arquivo **não confia
-- nisso**: recalcula a partir dos pais e só então valida. Se alguma linha
-- discordar do próprio pai, a migration para.

-- ======================= trainer_settings por carteira =====================
-- Era uma linha global com PK booleana `id=true` — o desenho de professor
-- único. Vira uma linha por carteira.
--
-- ATENÇÃO: a policy antiga "todo mundo logado le a chave de cobranca" continua
-- valendo com `using (true)`, o que significa que qualquer autenticado lê o Pix
-- de qualquer carteira. Isso é problema do M04, que substitui as policies em
-- bloco, e é a razão de o EXP-01 ter "não abrir acesso de segundo professor"
-- como restrição explícita. Enquanto só existir a carteira legada, não há
-- vazamento — mas criar o professor B antes do M04 abriria.
alter table public.trainer_settings
  add column if not exists tenant_id uuid references public.tenants(id);

update public.trainer_settings
   set tenant_id = '87ea9c53-3e1c-41b2-8a30-4b53654179cb'
 where tenant_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='trainer_settings' and column_name='id'
  ) then
    alter table public.trainer_settings drop constraint if exists trainer_settings_pkey;
    alter table public.trainer_settings alter column tenant_id set not null;
    alter table public.trainer_settings add primary key (tenant_id);
    alter table public.trainer_settings drop column id;
  end if;
end $$;

-- ============== identidade profissional que morava no código ===============
-- Nome, título e especializações do Leo estavam em `js/config.js` (const
-- PROFESSOR) — ou seja, no repositório público e iguais para quem abrisse o
-- app. Com várias carteiras isso passa a ser dado da carteira.
update public.trainer_public_profiles
   set title = coalesce(title, 'Treinador fitness e lifestyle'),
       bio = coalesce(bio, 'Treinamento avançado para hipertrofia. Atendimento personalizado online e presencial. LGTEAM.'),
       link = coalesce(link, 'https://instagram.com/treinador_leonardog'),
       contact = coalesce(contact, 'treinador_leonardog')
 where tenant_id = '87ea9c53-3e1c-41b2-8a30-4b53654179cb';

-- ====================== backfill: pais antes de filhos =====================
do $$
declare
  v_tenant uuid := '87ea9c53-3e1c-41b2-8a30-4b53654179cb';
begin
  -- Raízes da carteira: aluno e biblioteca pertencem ao professor titular.
  update public.students  set tenant_id = v_tenant where tenant_id is null;
  update public.exercises set tenant_id = v_tenant where tenant_id is null;

  -- Ficha herda do aluno. Modelo (`is_template`) não tem aluno e fica na
  -- carteira legada — a restrição `template_nao_tem_aluno` garante que os dois
  -- casos são mutuamente exclusivos.
  update public.workout_plans p
     set tenant_id = s.tenant_id
    from public.students s
   where p.student_id = s.id;
  update public.workout_plans set tenant_id = v_tenant where tenant_id is null and student_id is null;

  update public.workout_days d
     set tenant_id = p.tenant_id
    from public.workout_plans p
   where d.workout_plan_id = p.id;

  update public.workout_day_exercises i
     set tenant_id = d.tenant_id
    from public.workout_days d
   where i.workout_day_id = d.id;

  update public.attendance a
     set tenant_id = s.tenant_id
    from public.students s
   where a.student_id = s.id;

  update public.exercise_logs l
     set tenant_id = s.tenant_id
    from public.students s
   where l.student_id = s.id;

  update public.student_exercises e
     set tenant_id = s.tenant_id
    from public.students s
   where e.student_id = s.id;

  update public.notes n
     set tenant_id = s.tenant_id
    from public.students s
   where n.student_id = s.id;

  update public.payments pg
     set tenant_id = s.tenant_id
    from public.students s
   where pg.student_id = s.id;

  update public.class_packages c
     set tenant_id = s.tenant_id
    from public.students s
   where c.student_id = s.id;

  update public.sale_requests r
     set tenant_id = s.tenant_id
    from public.students s
   where r.student_id = s.id;
end $$;

-- ============================== validação ==================================
-- "Linhas sem pai, cruzamentos e inconsistências param a migração, não são
-- descartadas" (`04` M02). Cada checagem abaixo é uma frase que o dono
-- consegue ler no erro, não um número solto.
do $$
declare
  v_n bigint;
  t text;
begin
  -- 1. Nenhuma linha de negócio sem carteira.
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','exercise_logs','student_exercises','notes','payments',
    'class_packages','sale_requests'
  ] loop
    execute format('select count(*) from public.%I where tenant_id is null', t) into v_n;
    if v_n > 0 then
      raise exception 'M02 abortada: % linha(s) em %.tenant_id ficaram nulas — provável linha sem pai.', v_n, t;
    end if;
  end loop;

  -- 2. Nenhum filho fora da carteira do pai. É o critério de aceite do EXP-01,
  --    e é o que uma FK simples para UUID NÃO prova (INV-02).
  select count(*) into v_n from public.workout_plans p join public.students s on s.id = p.student_id
   where p.tenant_id is distinct from s.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % ficha(s) em carteira diferente do aluno.', v_n; end if;

  select count(*) into v_n from public.workout_days d join public.workout_plans p on p.id = d.workout_plan_id
   where d.tenant_id is distinct from p.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % divisão(ões) em carteira diferente da ficha.', v_n; end if;

  select count(*) into v_n from public.workout_day_exercises i join public.workout_days d on d.id = i.workout_day_id
   where i.tenant_id is distinct from d.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % item(ns) prescrito(s) em carteira diferente da divisão.', v_n; end if;

  select count(*) into v_n from public.workout_day_exercises i join public.exercises e on e.id = i.exercise_id
   where i.tenant_id is distinct from e.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % item(ns) usando exercício de outra carteira (INV-04).', v_n; end if;

  select count(*) into v_n from public.attendance a join public.students s on s.id = a.student_id
   where a.tenant_id is distinct from s.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % sessão(ões) em carteira diferente do aluno.', v_n; end if;

  select count(*) into v_n from public.attendance a join public.workout_days d on d.id = a.workout_day_id
   where a.tenant_id is distinct from d.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % sessão(ões) apontando divisão de outra carteira (INV-03).', v_n; end if;

  select count(*) into v_n from public.exercise_logs l join public.attendance a on a.id = l.attendance_id
   where l.tenant_id is distinct from a.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % carga(s) em carteira diferente da sessão.', v_n; end if;

  select count(*) into v_n from public.exercise_logs l join public.exercises e on e.id = l.exercise_id
   where l.tenant_id is distinct from e.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % carga(s) usando exercício de outra carteira.', v_n; end if;

  select count(*) into v_n from public.payments pg join public.students s on s.id = pg.student_id
   where pg.tenant_id is distinct from s.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % cobrança(s) em carteira diferente do aluno.', v_n; end if;

  select count(*) into v_n from public.class_packages c join public.students s on s.id = c.student_id
   where c.tenant_id is distinct from s.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % pacote(s) em carteira diferente do aluno.', v_n; end if;

  select count(*) into v_n from public.class_packages c join public.payments pg on pg.id = c.payment_id
   where c.tenant_id is distinct from pg.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % pacote(s) ligados a cobrança de outra carteira.', v_n; end if;

  select count(*) into v_n from public.sale_requests r join public.students s on s.id = r.student_id
   where r.tenant_id is distinct from s.tenant_id;
  if v_n > 0 then raise exception 'M02 abortada: % venda(s) em carteira diferente do aluno.', v_n; end if;

  -- 3. Exatamente uma carteira e um titular depois do backfill legado.
  select count(*) into v_n from public.tenants;
  if v_n <> 1 then
    raise exception 'M02 abortada: esperava 1 carteira legada, encontrei %. O EXP-01 não cria segundo professor.', v_n;
  end if;

  select count(*) into v_n from public.trainer_settings where tenant_id is null;
  if v_n > 0 then raise exception 'M02 abortada: configuração de cobrança sem carteira.'; end if;
end $$;
