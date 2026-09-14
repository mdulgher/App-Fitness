-- "Hoje" no fuso de Sao Paulo. Sem isso, um treino as 21h de segunda cai na
-- terca em UTC e desloca a frequencia do aluno.
create or replace function public.hoje_br()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Status derivado, nunca armazenado: guardado numa coluna, "vencido" apodrece
-- e uma cobranca vencida fica "pendente" para sempre.
-- security_invoker: a view respeita o RLS de quem consulta, em vez de rodar com
-- os privilegios do dono. Sem isso, o aluno enxergaria o financeiro dos outros.
create view public.payments_view
with (security_invoker = true) as
select
  p.*,
  case
    when p.paid_date is not null              then 'paid'
    when p.due_date >= public.hoje_br()       then 'pending'
    else                                           'overdue'
  end as status
from public.payments p;

grant select on public.payments_view to authenticated;