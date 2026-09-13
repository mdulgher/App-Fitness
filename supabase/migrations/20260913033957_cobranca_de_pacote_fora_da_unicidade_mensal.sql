-- `cobranca_unica_por_mes` existe para o "Lançar cobranças do mês" poder rodar
-- duas vezes sem duplicar nada: a idempotência vem do banco, não da sorte de
-- temporização. Mas ela também impedia vender dois pacotes de aulas no mesmo
-- mês — o segundo batia em "duplicate key" com a mensagem crua do Postgres.
-- Só apareceu ao semear dados de verdade; o schema local nunca tinha o índice.
--
-- A saída é dizer de que tipo é cada cobrança e aplicar a unicidade só à
-- mensalidade. Pacote não tem "um por mês": o aluno compra quando acaba.
--
-- CONSEQUÊNCIA que morde: índice **parcial** não serve para inferência de
-- `ON CONFLICT`. O `upsert(..., { onConflict: "student_id,reference_month" })`
-- que havia em `gerarCobrancasDoMes` passou a responder 400 "no unique or
-- exclusion constraint matching the ON CONFLICT specification". A função virou
-- INSERT simples que trata a violação — a garantia continua no banco.
alter table public.payments
  add column if not exists kind text not null default 'monthly';

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind in ('monthly', 'package'));

-- As cobranças de pacote já criadas passam a ser reconhecidas pelo vínculo em
-- class_packages, antes de o índice novo entrar.
update public.payments p
   set kind = 'package'
  from public.class_packages c
 where c.payment_id = p.id and p.kind <> 'package';

-- Era constraint, não só índice: soltar a constraint leva o índice junto.
alter table public.payments drop constraint if exists cobranca_unica_por_mes;
drop index if exists cobranca_unica_por_mes;

create unique index cobranca_unica_por_mes
  on public.payments (student_id, reference_month)
  where kind = 'monthly';
