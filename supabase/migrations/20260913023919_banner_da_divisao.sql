-- Arte do cabeçalho de cada divisão de treino, escolhida pelo professor.
-- Guarda o slug do arquivo (ex.: 'costas'), não o caminho: se a pasta das
-- artes mudar, o banco não precisa ser reescrito. Nulo = cabeçalho sem arte.
-- Sem check constraint com a lista de slugs de propósito: acrescentar uma arte
-- nova viraria migration, e quem valida é o catálogo do app.
alter table public.workout_days
  add column if not exists banner text;
