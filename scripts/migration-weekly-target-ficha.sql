-- Migration: mover weekly_target de students para workout_plans
-- Aplicar no Supabase Dashboard > SQL Editor

-- 1. Adiciona a coluna na ficha (nullable: fichas sem meta definida são válidas)
alter table workout_plans
  add column if not exists weekly_target smallint check (weekly_target >= 1 and weekly_target <= 14);

-- 2. Copia o valor atual de cada aluno para a ficha ativa dele
update workout_plans wp
set    weekly_target = s.weekly_target
from   students s
where  wp.student_id = s.id
  and  wp.active = true
  and  s.weekly_target is not null;

-- 3. Remove a coluna de students
--    (só rodar depois de confirmar que o código novo está no ar)
-- alter table students drop column if exists weekly_target;
