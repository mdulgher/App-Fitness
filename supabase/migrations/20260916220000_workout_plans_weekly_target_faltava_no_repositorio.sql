-- EXP-00: a coluna existia em produção e NENHUMA migration a criava.
--
-- Como apareceu: o replay das 26 migrations num projeto Supabase limpo
-- (16/09/2026) gerou um banco sem `workout_plans.weekly_target`. A comparação
-- coluna a coluna contra o snapshot de produção apontou essa e só essa
-- diferença. Ou seja: a coluna foi criada à mão no painel, em algum momento, e
-- o repositório nunca soube dela.
--
-- Por que é grave e não cosmético: é a coluna em que o AT-12 apoiou a decisão
-- "a meta semanal é da ficha, e só dela". `metaEfetiva()` lê exatamente ela.
-- Um banco reconstruído a partir deste repositório subiria com o app quebrado
-- na primeira tela que perguntasse a meta — e o EXP-01 tem "replay do zero"
-- como critério de aceite.
--
-- A forma foi confirmada sondando a produção com valores de teste em ficha
-- temporária de conta fictícia, apagada em seguida: 14 aceito, 15 recusado,
-- 0 recusado, nulo aceito. Portanto `int`, nulo permitido, faixa de 1 a 14 —
-- o mesmo desenho que `students.weekly_target` tinha. O nome da restrição
-- (`workout_plans_weekly_target_check`) veio da mensagem de erro do próprio
-- banco, para que produção e replay fiquem com o mesmo nome.
--
-- Em produção esta migration não faz nada: os dois `if not exists` a tornam
-- inócua onde a coluna já existe. Ela serve para o repositório voltar a
-- descrever o banco.

alter table public.workout_plans
  add column if not exists weekly_target int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_plans_weekly_target_check'
  ) then
    alter table public.workout_plans
      add constraint workout_plans_weekly_target_check
      check (weekly_target between 1 and 14);
  end if;
end $$;
