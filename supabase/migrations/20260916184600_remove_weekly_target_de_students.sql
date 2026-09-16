-- AT-12, passo 3: a meta semanal já é só de `workout_plans.weekly_target`
-- (ver 20260916... da tarde, commit cc84d11). A coluna em `students` ficou
-- sem leitor desde então — `criar-aluno` v4 não escreve mais nela e nenhuma
-- função, view ou policy referencia `students.weekly_target` (conferido no
-- catálogo em 16/09/2026).
alter table public.students drop column weekly_target;
