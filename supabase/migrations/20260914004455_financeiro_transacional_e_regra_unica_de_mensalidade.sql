-- ================== REL-03: uma regra só, para prévia e execução ==================
--
-- O JS decidia quem entra na prévia e o banco decidia quem entra no lançamento,
-- com critérios diferentes: a prévia ignorava `billing_type` e excluía
-- mensalidade zero; o banco filtrava `billing_type` e aceitava zero. Pior, a
-- consulta de "quem já tem cobrança" não filtrava `kind`, então um PACOTE
-- comprado no mês fazia a mensalidade do aluno sumir do lote sem aviso.
create or replace function public.previa_de_mensalidades(p_mes date)
returns table(student_id uuid, amount numeric, due_date date, situacao text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_trainer() then
    raise exception using errcode = '42501', message = 'Só o professor vê as cobranças do mês.';
  end if;
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception using errcode = '22023', message = 'Informe o primeiro dia do mês.';
  end if;

  return query
  select s.id,
         s.monthly_fee,
         make_date(
           extract(year from p_mes)::int,
           extract(month from p_mes)::int,
           coalesce(s.due_day, 5)
         ),
         case
           when s.billing_type <> 'monthly'
             or s.monthly_fee is null
             or s.monthly_fee <= 0 then 'fora'
           when exists (
             select 1 from public.payments p
              where p.student_id = s.id
                and p.reference_month = p_mes
                and p.kind = 'monthly'
           ) then 'ja_tem'
           else 'nova'
         end
    from public.students s
   where s.active;
end;
$$;

create or replace function public.gerar_mensalidades(p_mes date)
returns table(criadas integer, ja_existiam integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_criadas integer;
  v_ja integer;
begin
  if auth.uid() is null or not public.is_trainer() then
    raise exception using errcode = '42501', message = 'Só o professor lança cobranças.';
  end if;

  with elegiveis as (
    select * from public.previa_de_mensalidades(p_mes)
  ),
  novas as (
    insert into public.payments(student_id, reference_month, amount, due_date, kind)
    select e.student_id, p_mes, e.amount, e.due_date, 'monthly'
      from elegiveis e
     where e.situacao = 'nova'
    -- O índice é PARCIAL; o predicado aqui é o que permite inferi-lo. Numa
    -- corrida entre dois professores, o segundo pula só as linhas repetidas em
    -- vez de perder o lote inteiro — que era o `[]` silencioso de antes.
    on conflict (student_id, reference_month) where kind = 'monthly' do nothing
    returning 1
  )
  select (select count(*) from novas),
         (select count(*) from elegiveis where situacao = 'ja_tem')
    into v_criadas, v_ja;

  criadas := v_criadas;
  ja_existiam := v_ja;
  return next;
end;
$$;

revoke all on function public.previa_de_mensalidades(date) from public, anon;
revoke all on function public.gerar_mensalidades(date) from public, anon;
grant execute on function public.previa_de_mensalidades(date) to authenticated;
grant execute on function public.gerar_mensalidades(date) to authenticated;

-- A view não expunha `kind`, então a tela recebia pacote e mensalidade sem
-- conseguir distinguir. Coluna nova entra no fim para `create or replace`
-- aceitar; `security_invoker` continua, senão a view passaria por cima da RLS.
create or replace view public.payments_view
with (security_invoker = true) as
  select id, student_id, reference_month, amount, due_date, paid_date,
         payment_method, notes, created_at,
         case
           when paid_date is not null then 'paid'
           when due_date >= public.hoje_br() then 'pending'
           else 'overdue'
         end as status,
         kind
    from public.payments p;

-- ================== REL-02: venda de pacote em uma transação ==================
--
-- O app criava a cobrança, criava o pacote e, se o segundo passo falhasse,
-- apagava a cobrança sem conferir o resultado. Se o pacote tinha sido gravado e
-- só a RESPOSTA se perdeu, a compensação apagava uma cobrança válida e a FK
-- `on delete set null` deixava o pacote órfão.
create table if not exists public.sale_requests (
  request_id  uuid primary key,
  actor_id    uuid not null references auth.users(id),
  student_id  uuid not null references public.students(id) on delete cascade,
  classes     integer not null,
  amount      numeric(10,2) not null,
  package_id  uuid not null references public.class_packages(id) on delete cascade,
  payment_id  uuid not null references public.payments(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.sale_requests enable row level security;

drop policy if exists "so o professor ve as vendas" on public.sale_requests;
create policy "so o professor ve as vendas"
  on public.sale_requests for select to authenticated
  using (public.is_trainer());

create or replace function public.vender_pacote(
  p_request_id uuid,
  p_student_id uuid,
  p_classes    integer,
  p_amount     numeric,
  p_due_date   date,
  p_notes      text default null
)
returns table(package_id uuid, payment_id uuid, criada boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existente public.sale_requests%rowtype;
  v_payment uuid;
  v_package uuid;
begin
  if auth.uid() is null or not public.is_trainer() then
    raise exception using errcode = '42501', message = 'Só o professor vende pacote.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Venda sem identificador de operação.';
  end if;
  if p_classes is null or p_classes <= 0 then
    raise exception using errcode = '22023', message = 'A quantidade de aulas precisa ser maior que zero.';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception using errcode = '22023', message = 'Valor inválido.';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id) then
    raise exception using errcode = '23503', message = 'Aluno não encontrado.';
  end if;

  select * into v_existente from public.sale_requests where request_id = p_request_id;
  if found then
    -- Retransmissão: devolve a MESMA venda. Nunca cria a segunda.
    if v_existente.student_id <> p_student_id
       or v_existente.classes <> p_classes
       or v_existente.amount <> p_amount then
      raise exception using
        errcode = '22023',
        message = 'Esta operação já foi registrada com outros valores.';
    end if;
    return query select v_existente.package_id, v_existente.payment_id, false;
    return;
  end if;

  -- Daqui até o fim é tudo ou nada: a função é a transação.
  insert into public.payments(student_id, reference_month, amount, due_date, kind, notes)
  values (p_student_id, date_trunc('month', public.hoje_br())::date, p_amount,
          coalesce(p_due_date, public.hoje_br()), 'package',
          coalesce(p_notes, 'Pacote de ' || p_classes || case when p_classes = 1 then ' aula' else ' aulas' end))
  returning id into v_payment;

  insert into public.class_packages(student_id, classes_total, price, payment_id, notes)
  values (p_student_id, p_classes, p_amount, v_payment, p_notes)
  returning id into v_package;

  insert into public.sale_requests(request_id, actor_id, student_id, classes, amount, package_id, payment_id)
  values (p_request_id, auth.uid(), p_student_id, p_classes, p_amount, v_package, v_payment);

  return query select v_package, v_payment, true;
end;
$$;

-- Cancelar também é transacional, e recusa apagar pacote pago ou já consumido:
-- apagar os dois lados à mão era o caminho para saldo negativo e para sumir com
-- a explicação de um dinheiro que entrou.
create or replace function public.cancelar_pacote(p_package_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pacote public.class_packages%rowtype;
  v_pago date;
  v_usadas integer;
begin
  if auth.uid() is null or not public.is_trainer() then
    raise exception using errcode = '42501', message = 'Só o professor cancela pacote.';
  end if;

  select * into v_pacote from public.class_packages where id = p_package_id;
  if not found then
    raise exception using errcode = '23503', message = 'Pacote não encontrado.';
  end if;

  select p.paid_date into v_pago from public.payments p where p.id = v_pacote.payment_id;
  if v_pago is not null then
    raise exception using
      errcode = '42501',
      message = 'Este pacote já foi pago. Reabra a cobrança antes de cancelar.';
  end if;

  select count(*) into v_usadas
    from public.attendance a
   where a.student_id = v_pacote.student_id and a.in_person;
  if v_usadas > 0 then
    raise exception using
      errcode = '42501',
      message = 'Este aluno já teve aula presencial lançada. Cancelar apagaria o histórico dele.';
  end if;

  delete from public.sale_requests where package_id = p_package_id;
  delete from public.class_packages where id = p_package_id;
  if v_pacote.payment_id is not null then
    delete from public.payments where id = v_pacote.payment_id;
  end if;
end;
$$;

revoke all on function public.vender_pacote(uuid, uuid, integer, numeric, date, text) from public, anon;
revoke all on function public.cancelar_pacote(uuid) from public, anon;
grant execute on function public.vender_pacote(uuid, uuid, integer, numeric, date, text) to authenticated;
grant execute on function public.cancelar_pacote(uuid) to authenticated;
