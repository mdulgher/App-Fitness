-- O convite guardava student_id, mas o aluno so pode existir depois que a conta
-- existe, e a conta so nasce no cadastro. Entao o convite passa a carregar os
-- dados pendentes, e o registro do aluno e criado no momento do resgate.

drop table if exists public.student_invites;

create table public.student_invites (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  email               text not null,
  full_name           text not null,
  phone               text,
  birth_date          date,
  goal                text,
  health_restrictions text,
  weekly_target       int not null default 3 check (weekly_target between 1 and 14),
  monthly_fee         numeric(10,2) check (monthly_fee >= 0),
  due_day             int check (due_day between 1 and 28),
  used_at             timestamptz,
  student_id          uuid references public.students(id) on delete set null,
  expires_at          timestamptz not null default (now() + interval '30 days'),
  created_at          timestamptz not null default now()
);

-- Um convite aberto por email: reenviar substitui, nao acumula.
create unique index convite_aberto_por_email
  on public.student_invites (lower(email)) where used_at is null;

alter table public.student_invites enable row level security;

create policy "convites so do professor"
  on public.student_invites for all to authenticated
  using (public.is_trainer()) with check (public.is_trainer());

-- Codigo curto e legivel ao telefone: sem I, O, 0 e 1, que se confundem.
create or replace function public.gerar_codigo_convite()
returns text
language plpgsql
volatile
set search_path = pg_catalog, public
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tentativa text;
begin
  loop
    tentativa := '';
    for i in 1..8 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    tentativa := substr(tentativa, 1, 4) || '-' || substr(tentativa, 5, 4);
    exit when not exists (select 1 from public.student_invites where code = tentativa);
  end loop;
  return tentativa;
end;
$$;

revoke execute on function public.gerar_codigo_convite() from anon, public;
grant execute on function public.gerar_codigo_convite() to authenticated;

alter table public.student_invites alter column code set default public.gerar_codigo_convite();