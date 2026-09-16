-- EXP-01 / M03b — remove o DEFAULT de compatibilidade de `tenant_id`.
--
-- ############################################################
-- #  NÃO APLIQUE ESTA MIGRATION EM PRODUÇÃO AINDA.           #
-- ############################################################
--
-- Ela está separada do M03 de propósito. O M01 pôs um DEFAULT apontando para a
-- carteira legada justamente para que o app de hoje — que não sabe o que é
-- carteira — continuasse gravando enquanto a expansão acontece. Tirar o DEFAULT
-- faz **todo insert do cliente atual falhar**: cadastro de aluno, abertura de
-- sessão, registro de carga, lançamento de cobrança. Não é degradação, é parada.
--
-- Esta é a porta de corte. Ela só pode ser aplicada em produção quando:
--
--   1. o cliente mandar `tenant_id` (ou o servidor inferir por pai/ator) em
--      todo caminho de escrita — EXP-04/EXP-05;
--   2. as policies novas estiverem no ar, porque até lá o isolamento não existe
--      de verdade e uma coluna obrigatória não substitui RLS — EXP-02/M04;
--   3. as Edge Functions estiverem adaptadas — EXP-03/M05.
--
-- No ambiente de ensaio ela roda junto com as outras, porque lá o objetivo é
-- provar o estado final. Em produção, ela fecha a expansão em vez de abri-la.
--
-- "Nunca manter fallback legado depois da expansão" (`04` M01) — mas também não
-- retirá-lo antes de existir quem ocupe o lugar dele.

do $$
declare t text;
begin
  foreach t in array array[
    'students','exercises','workout_plans','workout_days','workout_day_exercises',
    'attendance','exercise_logs','student_exercises','notes','payments',
    'class_packages','sale_requests'
  ] loop
    execute format('alter table public.%I alter column tenant_id drop default', t);
  end loop;
end $$;
